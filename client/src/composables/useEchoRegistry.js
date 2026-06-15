import { ref } from 'vue'
import { api } from '@/api/echo.js'

// Loads the unified Echo registry once and shares it app-wide. This is the
// frontend half of the auto-discovery system: composer actions, context actions
// and the message-type → renderer mapping all come from here, populated entirely
// from the apps' manifests with zero hard-coding.
const registry = ref({
  apps: [],
  messageTypes: {},
  renderers: [],
  composerActions: [],
  contextActions: [],
  builtinTypes: [],
})
const loaded = ref(false)
let inflight = null

async function load() {
  if (loaded.value) return registry.value
  if (!inflight) {
    inflight = api.registry()
      .then(data => {
        registry.value = data
        loaded.value = true
        return data
      })
      .catch(() => registry.value)
      .finally(() => { inflight = null })
  }
  return inflight
}

export function useEchoRegistry() {
  return { registry, loaded, load }
}
