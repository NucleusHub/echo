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

const userRoom = uid => `user:${uid}` // every socket joins its own user room
const chatRoom = cid => `chat:${cid}`

// Is this user actually a member of the chat? Used to gate every client-supplied
// chatId before joining its room or fanning out events — without it any socket
// could join an arbitrary chat and eavesdrop. A malformed chatId throws a
// CastError, which we treat as "not a member".
const isMember = (chatId, userId) =>
  Chat.exists({ _id: chatId, members: userId }).then(Boolean).catch(() => false)

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/api/echo/socket.io',
    cors: { origin: true, credentials: true },
  })

  // ── Auth: reuse the same JWT cookie the REST API uses ──────────────────────
  io.use((socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie || '')
      const profile = verifyToken(cookies.nucleus_token)
      // The Nucleus auth-server signs { profileId, name, role } — same field the
      // REST middleware and other apps (Orbit, Goals) read.
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

    // Auto-join rooms for every chat this user belongs to.
    const chats = await Chat.find({ members: userId }).select('_id')
    chats.forEach(c => socket.join(chatRoom(c._id)))

    const hb = setInterval(() => heartbeat(userId), 30_000)

    // ── Client → server events ───────────────────────────────────────────────
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

    // Typing indicators are ephemeral — published to Redis, never persisted.
    // Gate on membership so a non-member can't inject spoofed typing events
    // (userId is server-trusted) into a chat they don't belong to.
    socket.on('typing:start', async ({ chatId }) => {
      if (await isMember(chatId, userId)) publishEvent('typing', { chatId, userId, typing: true })
    })
    socket.on('typing:stop', async ({ chatId }) => {
      if (await isMember(chatId, userId)) publishEvent('typing', { chatId, userId, typing: false })
    })

    // Marking a chat read clears that user's unread counter.
    socket.on('chat:read', async ({ chatId }) => {
      await clearUnread(userId, chatId)
      io.to(userRoom(userId)).emit('unread:update', { chatId, count: 0 })
    })

    // Join a chat room mid-session (e.g. just added to a group). Only allow it
    // for chats the user is actually a member of — otherwise any authenticated
    // socket could join an arbitrary room and receive its live messages.
    socket.on('chat:join', async ({ chatId }) => {
      if (await isMember(chatId, userId)) socket.join(chatRoom(chatId))
    })
    // Leave a chat room (deleted, or removed from a group).
    socket.on('chat:leave', ({ chatId }) => socket.leave(chatRoom(chatId)))

    socket.on('disconnect', async () => {
      clearInterval(hb)
      const stillOnline = await markOffline(userId)
      if (!stillOnline) publishEvent('presence:update', { userId, online: false })
    })
  })

  // ── Redis → server: relay every published event to the right rooms ─────────
  // This is the multi-instance bridge: an event published by ANY Echo replica
  // (including this one) is delivered here and fanned out to local sockets.
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
        // Push live unread bumps to each recipient's personal room.
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
      // Chat created / renamed / membership changed — routed to each member's
      // personal room so their list updates even before they've joined the room.
      case 'chat:upsert':
        for (const uid of data.members) io.to(userRoom(uid)).emit('chat:upsert', data.chat)
        break
      // Chat deleted, or this user was removed from it.
      case 'chat:removed':
        for (const uid of data.members) io.to(userRoom(uid)).emit('chat:removed', { chatId: data.chatId })
        break
      default:
        break
    }
  })

  return io
}
