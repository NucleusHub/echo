import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Three connections by design:
//  - `pub`  : general commands + publishing events (presence/unread live here too)
//  - `sub`  : dedicated subscriber — once a connection SUBSCRIBEs it can't run
//             normal commands, so it must be separate
// A single Echo instance publishes every realtime event to Redis and consumes
// it back through `sub`; this is what lets multiple Echo replicas stay in sync.
export const pub = new Redis(REDIS_URL, { lazyConnect: false })
// `enableReadyCheck: false` stops ioredis from issuing its internal `INFO`
// command on (re)connect — once this connection is in subscriber mode that
// command is rejected ("only subscriber commands may be used"), which is just
// noise. The subscription itself is unaffected.
export const sub = new Redis(REDIS_URL, { lazyConnect: false, enableReadyCheck: false })

pub.on('error', e => console.error('[echo] redis pub error:', e.message))
sub.on('error', e => console.error('[echo] redis sub error:', e.message))

// Single fan-out channel for chat events; payload carries its own chatId so the
// socket layer can route to the right room.
export const EVENT_CHANNEL = 'echo:events'

// ── Keys ─────────────────────────────────────────────────────────────────────
const kPresence = uid => `echo:presence:${uid}` // ref-count of live sockets (TTL guarded)
const kUnread = uid => `echo:unread:${uid}` // hash chatId -> count
const ONLINE_SET = 'echo:online' // set of currently-online userIds

// ── Pub/Sub ──────────────────────────────────────────────────────────────────
export function publishEvent(event, data) {
  return pub.publish(EVENT_CHANNEL, JSON.stringify({ event, data }))
}

// ── Presence ─────────────────────────────────────────────────────────────────
// Ref-counted so multiple tabs/devices per user collapse to one "online" state.
export async function markOnline(userId) {
  const n = await pub.incr(kPresence(userId))
  await pub.expire(kPresence(userId), 60) // self-heals if a socket dies uncleanly
  await pub.sadd(ONLINE_SET, userId)
  return n
}

export async function markOffline(userId) {
  const n = await pub.decr(kPresence(userId))
  if (n <= 0) {
    await pub.del(kPresence(userId))
    await pub.srem(ONLINE_SET, userId)
    return false // now offline
  }
  return true // still online elsewhere
}

export async function heartbeat(userId) {
  await pub.expire(kPresence(userId), 60)
}

export function onlineUsers() {
  return pub.smembers(ONLINE_SET)
}

// ── Unread counters ────────────────────────────────────────────────────────
export function incrUnread(userId, chatId) {
  return pub.hincrby(kUnread(userId), String(chatId), 1)
}

export function clearUnread(userId, chatId) {
  return pub.hdel(kUnread(userId), String(chatId))
}

export async function unreadCounts(userId) {
  const raw = await pub.hgetall(kUnread(userId))
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]))
}

// Wipe every Redis trace of a user (used when their account is deleted).
export async function purgeUserRedis(userId) {
  await Promise.all([
    pub.del(kPresence(userId)),
    pub.del(kUnread(userId)),
    pub.srem(ONLINE_SET, String(userId)),
  ])
}
