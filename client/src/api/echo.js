import { createApiClient } from '@core/createApiClient.js'

const { req } = createApiClient('/api/echo')
const auth = createApiClient('/api/auth')

export const api = {
  // Unified registry snapshot assembled from every app's manifest.echo.json.
  registry: () => req('GET', '/registry'),
  // Nucleus profiles (auth-server) — used to pick someone to start a chat with.
  profiles: () => auth.get('/profiles'),
  chats: () => req('GET', '/chats'),
  createChat: (payload) => req('POST', '/chats', payload),
  renameChat: (id, title) => req('PATCH', `/chats/${id}`, { title }),
  addMembers: (id, members) => req('POST', `/chats/${id}/members`, { members }),
  removeMember: (id, memberId) => req('DELETE', `/chats/${id}/members/${memberId}`),
  leaveGroup: (id, newOwnerId, newOwnerName) =>
    req('POST', `/chats/${id}/leave`, newOwnerId ? { newOwnerId, newOwnerName } : {}),
  transferOwner: (id, ownerId, ownerName) => req('POST', `/chats/${id}/owner`, { ownerId, ownerName }),
  deleteChat: (id) => req('DELETE', `/chats/${id}`),
  history: (chatId, before) =>
    req('GET', `/messages/${chatId}${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  // REST send fallback; the socket path (useEchoSocket.send) is preferred.
  send: (chatId, message) => req('POST', `/messages/${chatId}`, message),
}
