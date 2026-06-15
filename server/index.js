import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'
import { registry } from './registry/echoRegistry.js'
import { initSocket } from './realtime/socket.js'
import registryRouter from './routes/registry.js'
import chatsRouter from './routes/chats.js'
import messagesRouter from './routes/messages.js'

const app = express()
const PORT = process.env.PORT || 3006

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.get('/api/echo/health', (_req, res) =>
  res.json({ status: 'ok', apps: registry.manifests.length })
)
app.use('/api/echo/registry', registryRouter)
app.use('/api/echo/chats', chatsRouter)
app.use('/api/echo/messages', messagesRouter)

const server = http.createServer(app)

async function start() {
  // 1. Auto-discover app capabilities BEFORE accepting traffic — the registry
  //    must be populated so message-type validation works on the first request.
  registry.load()

  // 2. Persistence.
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('[echo] connected to MongoDB')

  // 3. Realtime layer (Socket.IO + Redis bridge).
  initSocket(server)

  server.listen(PORT, () => console.log(`[echo] server on port ${PORT}`))
}

start().catch(err => {
  console.error('[echo] failed to start:', err)
  process.exit(1)
})
