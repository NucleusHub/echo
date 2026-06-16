import { Router } from 'express'
import { registry } from '../registry/echoRegistry.js'

const router = Router()

// The unified registry snapshot — the frontend fetches this once on load to
// learn every message type and the composer/context actions contributed by the
// installed apps. No app is hard-coded here. (Renderer components are discovered
// client-side from each app's integration module, not via this snapshot.)
router.get('/', (_req, res) => res.json(registry.toJSON()))

// Just the parts the composer needs, for convenience.
router.get('/composer-actions', (_req, res) => res.json(registry.composerActions))

export default router
