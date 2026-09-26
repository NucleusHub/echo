import Message from '../models/Message.js'
import Chat from '../models/Chat.js'
import { registry } from '../registry/echoRegistry.js'
import { publishEvent, incrUnread } from '../realtime/redis.js'

export class MessageError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

function preview(type, payload) {
  if (type === 'text' || type === 'system') return String(payload?.text ?? '').slice(0, 120)
  return `[${type}]`
}

export async function createMessage({ chatId, senderId, type = 'text', payload = {} }) {
  if (!registry.isKnownType(type)) {
    throw new MessageError(`Unknown message type "${type}" — no app registered it`, 422)
  }

  const chat = await Chat.findById(chatId)
  if (!chat) throw new MessageError('Chat not found', 404)
  if (senderId && !chat.members.some(m => m.equals(senderId))) {
    throw new MessageError('Not a member of this chat', 403)
  }

  const message = await Message.create({
    chatId,
    senderId: senderId || null,
    type,
    payload,
    sourceApp: registry.appForType(type),
  })

  chat.lastMessageAt = message.createdAt
  chat.lastMessagePreview = preview(type, payload)
  await chat.save()

  await Promise.all(
    chat.members
      .filter(m => !senderId || !m.equals(senderId))
      .map(m => incrUnread(m.toString(), chatId))
  )

  const dto = serialize(message)
  await publishEvent('message:new', { chatId: String(chatId), members: chat.members.map(String), message: dto })
  return dto
}

export function serialize(m) {
  return {
    id: String(m._id),
    chatId: String(m.chatId),
    senderId: m.senderId ? String(m.senderId) : null,
    type: m.type,
    payload: m.payload,
    sourceApp: m.sourceApp,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
  }
}

export async function history(chatId, { before, limit = 50 } = {}) {
  const q = { chatId, deletedAt: null }
  if (before) q.createdAt = { $lt: new Date(before) }
  const docs = await Message.find(q).sort({ createdAt: -1 }).limit(Math.min(limit, 100))
  return docs.reverse().map(serialize)
}
