import { Router } from 'express'
import { registry } from '../registry/echoRegistry.js'

const router = Router()

router.get('/', (_req, res) => res.json(registry.toJSON()))

router.get('/composer-actions', (_req, res) => res.json(registry.composerActions))

export default router
