import { Server } from 'socket.io'
import { parse as parseCookie } from 'cookie'
import { verifyToken } from '../middleware/auth.js'
import Chat from '../models/Chat.js'
import { createMessage, MessageError } from '../services/messageService.js'
import {
  sub,
  EVENT_CHANNEL,
  publishEvent,
  markOnline,
  markOffline,
  heartbeat,
  clearUnread,
} from './redis.js'

const userRoom = uid => `user:${uid}`
const chatRoom = cid => `chat:${cid}`

// Gates every client-supplied chatId; a malformed id counts as not a member.
const isMember = (chatId, userId) =>
  Chat.exists({ _id: chatId, members: userId }).then(Boolean).catch(() => false)

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/api/echo/socket.io',
    cors: { origin: true, credentials: true },
  })

  io.use((socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie || '')
      const profile = verifyToken(cookies.nucleus_token)
      socket.data.userId = profile.profileId
      if (!socket.data.userId) throw new Error('no id in token')
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', async socket => {
    const userId = String(socket.data.userId)
    socket.join(userRoom(userId))

    const firstConnection = (await markOnline(userId)) === 1
    if (firstConnection) publishEvent('presence:update', { userId, online: true })

    const chats = await Chat.find({ members: userId }).select('_id')
    chats.forEach(c => socket.join(chatRoom(c._id)))

    const hb = setInterval(() => heartbeat(userId), 30_000)

    socket.on('message:send', async (payload, ack) => {
      try {
        const msg = await createMessage({
          chatId: payload.chatId,
          senderId: userId,
          type: payload.type || 'text',
          payload: payload.payload || {},
        })
        ack?.({ ok: true, message: msg })
      } catch (err) {
        const status = err instanceof MessageError ? err.status : 500
        ack?.({ ok: false, error: err.message, status })
      }
    })

    // Gate on membership so non-members can't inject spoofed typing events.
    socket.on('typing:start', async ({ chatId }) => {
      if (await isMember(chatId, userId)) publishEvent('typing', { chatId, userId, typing: true })
    })
    socket.on('typing:stop', async ({ chatId }) => {
      if (await isMember(chatId, userId)) publishEvent('typing', { chatId, userId, typing: false })
    })

    socket.on('chat:read', async ({ chatId }) => {
      await clearUnread(userId, chatId)
      io.to(userRoom(userId)).emit('unread:update', { chatId, count: 0 })
    })

    // Membership check: otherwise any socket could join an arbitrary room.
    socket.on('chat:join', async ({ chatId }) => {
      if (await isMember(chatId, userId)) socket.join(chatRoom(chatId))
    })
    socket.on('chat:leave', ({ chatId }) => socket.leave(chatRoom(chatId)))

    socket.on('disconnect', async () => {
      clearInterval(hb)
      const stillOnline = await markOffline(userId)
      if (!stillOnline) publishEvent('presence:update', { userId, online: false })
    })
  })

  sub.subscribe(EVENT_CHANNEL, err => {
    if (err) console.error('[echo] failed to subscribe:', err.message)
  })
  sub.on('message', (channel, raw) => {
    if (channel !== EVENT_CHANNEL) return
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const { event, data } = parsed
    switch (event) {
      case 'message:new':
        io.to(chatRoom(data.chatId)).emit('message:new', data.message)
        for (const uid of data.members) {
          if (data.message.senderId && uid === data.message.senderId) continue
          io.to(userRoom(uid)).emit('unread:bump', { chatId: data.chatId })
        }
        break
      case 'typing':
        io.to(chatRoom(data.chatId)).emit('typing', data)
        break
      case 'presence:update':
        io.emit('presence:update', data)
        break
      case 'chat:upsert':
        for (const uid of data.members) io.to(userRoom(uid)).emit('chat:upsert', data.chat)
        break
      case 'chat:removed':
        for (const uid of data.members) io.to(userRoom(uid)).emit('chat:removed', { chatId: data.chatId })
        break
      default:
        break
    }
  })

  return io
}
