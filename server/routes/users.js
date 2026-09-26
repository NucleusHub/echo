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

router.post('/:userId/teardown', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params

    const dms = await Chat.find({ kind: 'dm', members: userId }).select('_id')
    const dmIds = dms.map(d => d._id)
    if (dmIds.length) {
      await Message.deleteMany({ chatId: { $in: dmIds } })
      await Chat.deleteMany({ _id: { $in: dmIds } })
    }

    await Chat.updateMany({ members: userId }, { $pull: { members: userId } })
    await Message.deleteMany({ senderId: userId })

    const empty = await Chat.find({ members: { $size: 0 } }).select('_id')
    const emptyIds = empty.map(c => c._id)
    if (emptyIds.length) {
      await Message.deleteMany({ chatId: { $in: emptyIds } })
      await Chat.deleteMany({ _id: { $in: emptyIds } })
    }

    await purgeUserRedis(userId).catch(() => {})

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
