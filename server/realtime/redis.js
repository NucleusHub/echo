import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export const pub = new Redis(REDIS_URL, { lazyConnect: false })
// No ready check: INFO is rejected once the connection is in subscriber mode.
export const sub = new Redis(REDIS_URL, { lazyConnect: false, enableReadyCheck: false })

pub.on('error', e => console.error('[echo] redis pub error:', e.message))
sub.on('error', e => console.error('[echo] redis sub error:', e.message))

export const EVENT_CHANNEL = 'echo:events'

const kPresence = uid => `echo:presence:${uid}`
const kUnread = uid => `echo:unread:${uid}`
const ONLINE_SET = 'echo:online'

export function publishEvent(event, data) {
  return pub.publish(EVENT_CHANNEL, JSON.stringify({ event, data }))
}

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
    return false
  }
  return true
}

export async function heartbeat(userId) {
  await pub.expire(kPresence(userId), 60)
}

export function onlineUsers() {
  return pub.smembers(ONLINE_SET)
}

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

export async function purgeUserRedis(userId) {
  await Promise.all([
    pub.del(kPresence(userId)),
    pub.del(kUnread(userId)),
    pub.srem(ONLINE_SET, String(userId)),
  ])
}
