import jwt from 'jsonwebtoken'

const secret = () => process.env.JWT_SECRET || 'nucleus-jwt-secret'

// Shared with the Socket.IO handshake (realtime/socket.js) so REST and WS use
// one identical verification path. Returns the decoded profile or throws.
export function verifyToken(token) {
  return jwt.verify(token, secret())
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.nucleus_token
  if (!token) return res.status(401).json({ error: 'Unauthenticated' })
  try {
    req.profile = verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
