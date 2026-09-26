const modules = import.meta.glob('../apps/*/echo/integration.echo.js', { eager: true, import: 'default' })

const integrations = Object.values(modules)

export const RENDERERS_BY_TYPE = {}

export const COMPOSER_HANDLERS = {}

for (const integ of integrations) {
  if (!integ?.app) continue
  for (const [type, component] of Object.entries(integ.renderers || {})) {
    RENDERERS_BY_TYPE[type] = component
  }
  for (const [actionId, def] of Object.entries(integ.composerActions || {})) {
    COMPOSER_HANDLERS[`${integ.app}:${actionId}`] = def
  }
}
