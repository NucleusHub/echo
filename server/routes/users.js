import express from 'express'
import Chat from '../models/Chat.js'
import Message from '../models/Message.js'
import { requireAuth } from '../middleware/auth.js'
import { purgeUserRedis } from '../realtime/redis.js'

const router = express.Router()
router.use(requireAuth)

function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin required' })
  next()
}

// Called by the admin panel when a user is deleted, to remove their Echo data:
//  - DMs they were part of are deleted outright (a 1:1 chat is meaningless once
//    one side is gone), along with their messages.
//  - In group chats they're dropped from the member list and their messages are
//    deleted; any chat left with no members is removed entirely.
//  - Redis presence/unread/online state is purged.
//   POST /api/echo/users/:userId/teardown
router.post('/:userId/teardown', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params

    // 1. DMs involving the user → delete the chat and its messages.
    const dms = await Chat.find({ kind: 'dm', members: userId }).select('_id')
    const dmIds = dms.map(d => d._id)
    if (dmIds.length) {
      await Message.deleteMany({ chatId: { $in: dmIds } })
      await Chat.deleteMany({ _id: { $in: dmIds } })
    }

    // 2. Group chats → drop membership and delete the user's own messages.
    await Chat.updateMany({ members: userId }, { $pull: { members: userId } })
    await Message.deleteMany({ senderId: userId })

    // 3. Remove any chat that no longer has members, plus its messages.
    const empty = await Chat.find({ members: { $size: 0 } }).select('_id')
    const emptyIds = empty.map(c => c._id)
    if (emptyIds.length) {
      await Message.deleteMany({ chatId: { $in: emptyIds } })
      await Chat.deleteMany({ _id: { $in: emptyIds } })
    }

    // 4. Ephemeral Redis state.
    await purgeUserRedis(userId).catch(() => {})

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
