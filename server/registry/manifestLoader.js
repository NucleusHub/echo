import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const APPS_DIR = process.env.APPS_DIR || resolve(__dirname, '../../..')

const MANIFEST_PATH = ['echo', 'manifest.echo.json']

function normalizeManifest(raw, appDir) {
  if (!raw || typeof raw.app !== 'string') {
    throw new Error('manifest missing required "app" field')
  }
  return {
    app: raw.app,
    label: raw.label || raw.app,
    version: raw.version || '0.0.0',
    features: Array.isArray(raw.features) ? raw.features : [],
    messageTypes: Array.isArray(raw.message_types) ? raw.message_types : [],
    composerActions: Array.isArray(raw.composer_actions) ? raw.composer_actions : [],
    contextActions: Array.isArray(raw.context_actions) ? raw.context_actions : [],
    _dir: appDir,
  }
}

export function loadManifests(appsDir = APPS_DIR) {
  if (!existsSync(appsDir)) {
    console.warn(`[echo] apps dir not found: ${appsDir}`)
    return []
  }
  return readdirSync(appsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .flatMap(dir => {
      const path = join(appsDir, dir.name, ...MANIFEST_PATH)
      if (!existsSync(path)) return []
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'))
        const manifest = normalizeManifest(raw, join(appsDir, dir.name))
        console.log(`[echo] loaded manifest: ${manifest.app} v${manifest.version} (${manifest.messageTypes.length} types)`)
        return [manifest]
      } catch (err) {
        console.warn(`[echo] skipping ${path}: ${err.message}`)
        return []
      }
    })
}
