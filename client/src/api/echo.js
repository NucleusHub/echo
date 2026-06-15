const BASE = '/api/echo'

async function req(method, path, body) {
  const opts = { method, credentials: 'include', headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    let data = {}
    try { data = await res.json() } catch {}
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export const api = {
  // Unified registry snapshot assembled from every app's manifest.echo.json.
  registry: () => req('GET', '/registry'),
  // Nucleus profiles (auth-server) — used to pick someone to start a chat with.
  profiles: async () => {
    const res = await fetch('/api/auth/profiles', { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
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
