import { Router } from 'express'
import Chat from '../models/Chat.js'
import { requireAuth } from '../middleware/auth.js'
import { history, createMessage, MessageError } from '../services/messageService.js'

const router = Router()
router.use(requireAuth)

const me = req => req.profile.profileId

async function assertMember(req, res, chatId) {
  const chat = await Chat.findById(chatId).select('members')
  if (!chat) {
    res.status(404).json({ error: 'Chat not found' })
    return false
  }
  if (!chat.members.some(m => m.equals(me(req)))) {
    res.status(403).json({ error: 'Not a member of this chat' })
    return false
  }
  return true
}

// Paginated history (cursor = `before` ISO timestamp).
router.get('/:chatId', async (req, res) => {
  if (!(await assertMember(req, res, req.params.chatId))) return
  const { before, limit } = req.query
  res.json(await history(req.params.chatId, { before, limit: Number(limit) || 50 }))
})

// REST send path — the realtime path is preferred (Socket.IO message:send) but
// this lets other Nucleus apps post messages server-to-server (e.g. Goals
// announcing a completed task) using the same persist→publish→fan-out flow.
router.post('/:chatId', async (req, res) => {
  if (!(await assertMember(req, res, req.params.chatId))) return
  try {
    const msg = await createMessage({
      chatId: req.params.chatId,
      senderId: me(req),
      type: req.body.type || 'text',
      payload: req.body.payload || {},
    })
    res.status(201).json(msg)
  } catch (err) {
    const status = err instanceof MessageError ? err.status : 500
    res.status(status).json({ error: err.message })
  }
})

export default router
