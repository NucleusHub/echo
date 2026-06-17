import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  base: '/echo/',
  plugins: [vue(), mode !== 'production' && vueDevTools(), tailwindcss()].filter(Boolean),
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5179,
    // apps/ is bind-mounted only so the integration glob can resolve at build time.
    // Keep the dev watcher out of it: don't follow symlinks (the client/apps
    // host-build helper symlink points back into apps/ → infinite recursion /
    // ELOOP), and don't watch other apps' client/server source or node_modules.
    // Each app's echo/ folder stays watched, so integration edits still hot-reload.
    watch: {
      followSymlinks: false,
      ignored: ['**/apps/*/client/**', '**/apps/*/server/**', '**/apps/**/node_modules/**'],
    },
    proxy: {
      // REST + the Socket.IO endpoint share the /api/echo prefix; ws:true lets
      // the WebSocket upgrade for Socket.IO pass through in dev.
      '/api/echo': {
        target: process.env.API_TARGET || 'http://localhost:3006',
        changeOrigin: true,
        ws: true,
      },
    },
    allowedHosts: [process.env.NUCLEUS_HOST || 'nucleus.olm-altair.ts.net'],
  },
}))
