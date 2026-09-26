import { ref, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'

let socket = null
const connected = ref(false)
const typingByChat = ref({})
const unread = ref({})

const messageHandlers = new Set()
const chatUpsertHandlers = new Set()
const chatRemovedHandlers = new Set()

function ensureSocket() {
  if (socket) return socket
  socket = io({
    path: '/api/echo/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => { connected.value = true })
  socket.on('disconnect', () => { connected.value = false })

  socket.on('message:new', msg => {
    for (const h of messageHandlers) h(msg)
  })

  socket.on('chat:upsert', chat => {
    for (const h of chatUpsertHandlers) h(chat)
  })
  socket.on('chat:removed', ({ chatId }) => {
    for (const h of chatRemovedHandlers) h(chatId)
  })

  socket.on('typing', ({ chatId, userId, typing }) => {
    const map = { ...typingByChat.value }
    const set = new Set(map[chatId] || [])
    typing ? set.add(userId) : set.delete(userId)
    map[chatId] = set
    typingByChat.value = map
  })

  socket.on('unread:bump', ({ chatId }) => {
    unread.value = { ...unread.value, [chatId]: (unread.value[chatId] || 0) + 1 }
  })
  socket.on('unread:update', ({ chatId, count }) => {
    unread.value = { ...unread.value, [chatId]: count }
  })

  return socket
}

export function useEchoSocket() {
  onMounted(ensureSocket)

  function send(chatId, { type = 'text', payload = {} }) {
    return new Promise((resolve, reject) => {
      ensureSocket().emit('message:send', { chatId, type, payload }, res => {
        res?.ok ? resolve(res.message) : reject(new Error(res?.error || 'send failed'))
      })
    })
  }

  function onMessage(handler) {
    messageHandlers.add(handler)
    onUnmounted(() => messageHandlers.delete(handler))
  }
  function onChatUpsert(handler) {
    chatUpsertHandlers.add(handler)
    onUnmounted(() => chatUpsertHandlers.delete(handler))
  }
  function onChatRemoved(handler) {
    chatRemovedHandlers.add(handler)
    onUnmounted(() => chatRemovedHandlers.delete(handler))
  }

  const markRead = chatId => ensureSocket().emit('chat:read', { chatId })
  const startTyping = chatId => ensureSocket().emit('typing:start', { chatId })
  const stopTyping = chatId => ensureSocket().emit('typing:stop', { chatId })
  const joinChat = chatId => ensureSocket().emit('chat:join', { chatId })
  const leaveChat = chatId => ensureSocket().emit('chat:leave', { chatId })

  return {
    connected,
    typingByChat,
    unread,
    send,
    onMessage,
    onChatUpsert,
    onChatRemoved,
    markRead,
    startTyping,
    stopTyping,
    joinChat,
    leaveChat,
  }
}
