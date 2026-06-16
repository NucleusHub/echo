import { loadManifests } from './manifestLoader.js'

// Built-in message types Echo always understands, independent of any app.
const BUILTIN_TYPES = ['text', 'system']

// The unified registry: the single source of truth assembled from every app's
// manifest.echo.json at startup. Both the backend (type validation) and the
// frontend (renderer/action resolution) read from this — there is no manual
// registration anywhere.
class EchoRegistry {
  constructor() {
    this.manifests = []
    this.messageTypes = new Map() // type -> { app }
    this.composerActions = []
    this.contextActions = []
    for (const t of BUILTIN_TYPES) this.messageTypes.set(t, { app: null })
  }

  // (Re)build the registry from disk. Called once on boot; safe to call again
  // to hot-reload manifests without restarting the process.
  load() {
    this.manifests = loadManifests()
    this.messageTypes = new Map(BUILTIN_TYPES.map(t => [t, { app: null }]))
    this.composerActions = []
    this.contextActions = []

    for (const m of this.manifests) {
      for (const type of m.messageTypes) {
        if (this.messageTypes.has(type) && this.messageTypes.get(type).app !== m.app) {
          console.warn(`[echo] message type "${type}" already registered — ${m.app} overrides`)
        }
        this.messageTypes.set(type, { app: m.app })
      }
      this.composerActions.push(...m.composerActions.map(a => ({ ...a, app: m.app })))
      this.contextActions.push(...m.contextActions.map(a => ({ ...a, app: m.app })))
    }

    console.log(`[echo] registry ready: ${this.manifests.length} apps, ${this.messageTypes.size} message types`)
    return this
  }

  isKnownType(type) {
    return this.messageTypes.has(type)
  }

  appForType(type) {
    return this.messageTypes.get(type)?.app ?? null
  }

  // Serialisable snapshot served to the frontend (routes/registry.js). Maps are
  // flattened to plain objects/arrays for JSON transport.
  toJSON() {
    return {
      apps: this.manifests.map(m => ({
        app: m.app,
        label: m.label,
        version: m.version,
        features: m.features,
      })),
      messageTypes: Object.fromEntries(this.messageTypes),
      composerActions: this.composerActions,
      contextActions: this.contextActions,
      builtinTypes: BUILTIN_TYPES,
    }
  }
}

export const registry = new EchoRegistry()
export { BUILTIN_TYPES }
