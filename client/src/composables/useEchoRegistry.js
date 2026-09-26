import { ref, computed } from 'vue'
import { api } from '@/api/echo.js'
import { useRegistry } from '@core/useRegistry.js'

const registry = ref({
  apps: [],
  messageTypes: {},
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
  const { disabledAppIds } = useRegistry()
  const gate = (list) => (list || []).filter(a => !disabledAppIds.value.has(a.app))
  const composerActions = computed(() => gate(registry.value.composerActions))
  const contextActions = computed(() => gate(registry.value.contextActions))
  return { registry, loaded, load, composerActions, contextActions }
}
