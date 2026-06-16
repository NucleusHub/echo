// Auto-discovery of every app's Echo client integration. This glob is the ONLY
// place that knows app integrations exist — each app ships exactly one
// `apps/<app>/echo/integration.echo.js` (next to its manifest.echo.json) and it
// is picked up here. Drop a new file in and it just works; no edit to Echo
// (here, ChatView, the composer or the renderer) is ever needed.
//
// `../apps` is the apps/ root, reached the same way `@core` reaches core/: via a
// sibling symlink (client/apps -> repo apps/) on the host, and the matching
// read-only bind mount (/app/apps) inside the dev container. So this one relative
// path resolves identically for local dev, the docker dev server, and the
// production build.
const modules = import.meta.glob('../apps/*/echo/integration.echo.js', { eager: true, import: 'default' })

const integrations = Object.values(modules)

// message type -> renderer component (consumed by EchoCardRenderer via provide).
export const RENDERERS_BY_TYPE = {}

// "app:actionId" -> composer-action definition (consumed by ChatView.handleAction).
// A definition is either { source } (Echo's generic list/grid picker) or
// { picker, toMessage } (the app's own picker component).
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
