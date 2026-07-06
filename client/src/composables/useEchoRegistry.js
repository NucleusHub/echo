import { ref, computed } from 'vue'
import { api } from '@/api/echo.js'
import { useRegistry } from '@core/useRegistry.js'

// Loads the unified Echo registry once and shares it app-wide. This is the
// frontend half of the auto-discovery system: the composer/context actions and
// the known message types all come from here, populated entirely from the apps'
// manifests with zero hard-coding. (Renderer components are discovered
// separately, client-side, from each app's integration — see echo-integrations.js.)
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
  // Echo discovers app actions from the filesystem, so its snapshot includes
  // apps an admin disabled (globally / by group / per-user). Intersect with the
  // Nucleus registry so a disabled app (e.g. Goals) contributes NO composer or
  // context actions — the client half of the same gate the app servers enforce.
  const { disabledAppIds } = useRegistry()
  const gate = (list) => (list || []).filter(a => !disabledAppIds.value.has(a.app))
  const composerActions = computed(() => gate(registry.value.composerActions))
  const contextActions = computed(() => gate(registry.value.contextActions))
  return { registry, loaded, load, composerActions, contextActions }
}
