import { Router } from 'express'
import Chat from '../models/Chat.js'
import Message from '../models/Message.js'
import { requireAuth } from '../middleware/auth.js'
import { unreadCounts, clearUnread, publishEvent } from '../realtime/redis.js'
import { createMessage } from '../services/messageService.js'

const router = Router()
router.use(requireAuth)

const me = req => req.profile.profileId
const isAdmin = req => req.profile.role === 'admin'

function canManage(chat, req) {
  return isAdmin(req) || (chat.createdBy && chat.createdBy.equals(me(req)))
}
const isMember = (chat, req) => chat.members.some(m => m.equals(me(req)))

function serializeChat(c, unread = 0) {
  return {
    id: String(c._id),
    kind: c.kind,
    title: c.title,
    members: c.members.map(String),
    createdBy: c.createdBy ? String(c.createdBy) : null,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    unread,
  }
}

const broadcastUpsert = chat =>
  publishEvent('chat:upsert', { chat: serializeChat(chat), members: chat.members.map(String) })

const systemNotice = (chatId, text) =>
  createMessage({ chatId, senderId: null, type: 'system', payload: { text } })

router.get('/', async (req, res) => {
  const userId = me(req)
  const [chats, unread] = await Promise.all([
    Chat.find({ members: userId }).sort({ lastMessageAt: -1, updatedAt: -1 }),
    unreadCounts(userId),
  ])
  res.json(chats.map(c => serializeChat(c, unread[String(c._id)] || 0)))
})

router.post('/', async (req, res) => {
  const userId = me(req)
  const { kind = 'dm', title = '', members = [] } = req.body
  const memberSet = [...new Set([userId, ...members].map(String))]

  if (kind === 'dm' && memberSet.length === 2) {
    const existing = await Chat.findOne({ kind: 'dm', members: { $all: memberSet, $size: 2 } })
    if (existing) return res.json({ id: String(existing._id) })
  }

  const chat = await Chat.create({ kind, title, members: memberSet, createdBy: userId })
  broadcastUpsert(chat)
  res.status(201).json({ id: String(chat._id) })
})

router.patch('/:id', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  if (!isMember(chat, req)) return res.status(403).json({ error: 'Not a member of this chat' })
  if (chat.kind !== 'group') return res.status(400).json({ error: 'Only group chats can be renamed' })
  if (!canManage(chat, req)) return res.status(403).json({ error: 'Only the group creator or an admin can rename it' })

  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: 'Title is required' })

  chat.title = title
  await chat.save()
  broadcastUpsert(chat)
  await systemNotice(chat._id, `${req.profile.name} renamed the group to “${title}”`)
  res.json(serializeChat(chat))
})

router.post('/:id/members', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  if (!isMember(chat, req)) return res.status(403).json({ error: 'Not a member of this chat' })
  if (chat.kind !== 'group') return res.status(400).json({ error: 'Can only add people to group chats' })

  const toAdd = [...new Set((req.body.members || []).map(String))].filter(
    id => !chat.members.some(m => m.equals(id))
  )
  if (!toAdd.length) return res.json(serializeChat(chat))

  chat.members.push(...toAdd)
  await chat.save()
  broadcastUpsert(chat)
  const noun = toAdd.length === 1 ? 'person' : 'people'
  await systemNotice(chat._id, `${req.profile.name} added ${toAdd.length} ${noun}`)
  res.json(serializeChat(chat))
})

router.delete('/:id/members/:memberId', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  if (!isMember(chat, req)) return res.status(403).json({ error: 'Not a member of this chat' })
  if (chat.kind !== 'group') return res.status(400).json({ error: 'Not a group chat' })
  if (!canManage(chat, req)) return res.status(403).json({ error: 'Only the group creator or an admin can remove members' })

  const target = String(req.params.memberId)
  if (!chat.members.some(m => m.equals(target))) return res.json(serializeChat(chat))

  chat.members = chat.members.filter(m => !m.equals(target))
  await chat.save()
  await clearUnread(target, chat._id)
  broadcastUpsert(chat)
  publishEvent('chat:removed', { chatId: String(chat._id), members: [target] })
  await systemNotice(chat._id, `${req.profile.name} removed a member`)
  res.json(serializeChat(chat))
})

router.post('/:id/owner', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  if (!isMember(chat, req)) return res.status(403).json({ error: 'Not a member of this chat' })
  if (chat.kind !== 'group') return res.status(400).json({ error: 'Not a group chat' })
  if (!canManage(chat, req)) return res.status(403).json({ error: 'Only the group admin or a Nucleus admin can transfer it' })

  const { ownerId, ownerName } = req.body || {}
  const target = ownerId && chat.members.find(m => m.equals(String(ownerId)))
  if (!target) return res.status(400).json({ error: 'Pick a member of this group' })

  chat.createdBy = target
  await chat.save()
  broadcastUpsert(chat)
  await systemNotice(chat._id, `${req.profile.name} made ${ownerName || 'someone'} the group admin`)
  res.json(serializeChat(chat))
})

router.post('/:id/leave', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  if (!isMember(chat, req)) return res.status(403).json({ error: 'Not a member of this chat' })
  if (chat.kind !== 'group') return res.status(400).json({ error: 'Can only leave group chats' })

  const meId = me(req)
  chat.members = chat.members.filter(m => !m.equals(meId))
  await clearUnread(meId, chat._id)

  if (!chat.members.length) {
    await Message.deleteMany({ chatId: chat._id })
    await chat.deleteOne()
    publishEvent('chat:removed', { chatId: String(chat._id), members: [String(meId)] })
    return res.json({ ok: true })
  }

  let transferred = false
  if (chat.createdBy && chat.createdBy.equals(meId)) {
    const { newOwnerId } = req.body || {}
    const chosen = newOwnerId && chat.members.find(m => m.equals(String(newOwnerId)))
    chat.createdBy = chosen || chat.members[0]
    transferred = true
  }
  await chat.save()
  broadcastUpsert(chat)
  publishEvent('chat:removed', { chatId: String(chat._id), members: [String(meId)] })
  await systemNotice(chat._id, `${req.profile.name} left the group`)
  if (transferred) {
    const { newOwnerName } = req.body || {}
    await systemNotice(chat._id, `${newOwnerName || 'A member'} is now the group admin`)
  }
  res.json({ ok: true })
})

router.delete('/:id', async (req, res) => {
  const chat = await Chat.findById(req.params.id)
  if (!chat) return res.status(404).json({ error: 'Chat not found' })
  if (!isMember(chat, req)) return res.status(403).json({ error: 'Not a member of this chat' })
  if (chat.kind === 'group' && !canManage(chat, req)) {
    return res.status(403).json({ error: 'Only the group creator or an admin can delete it' })
  }

  const members = chat.members.map(String)
  await Promise.all([
    Message.deleteMany({ chatId: chat._id }),
    ...members.map(uid => clearUnread(uid, chat._id)),
  ])
  await chat.deleteOne()
  publishEvent('chat:removed', { chatId: String(req.params.id), members })
  res.json({ ok: true })
})

export default router
