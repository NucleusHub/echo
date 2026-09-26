import { loadManifests } from './manifestLoader.js'

const BUILTIN_TYPES = ['text', 'system']

class EchoRegistry {
  constructor() {
    this.manifests = []
    this.messageTypes = new Map()
    this.composerActions = []
    this.contextActions = []
    for (const t of BUILTIN_TYPES) this.messageTypes.set(t, { app: null })
  }

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
