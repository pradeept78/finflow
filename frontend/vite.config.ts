import { defineConfig, type Plugin } from 'vite'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

// The app calls the API with a RELATIVE base url (`baseURL: '/api'` in src/api/axios.ts).
// In Docker that works because nginx.conf proxies /api/ -> backend:8080. The dev server had no
// equivalent, so `npm run dev` served the UI perfectly and then 404'd every single API call —
// the page rendered, nothing loaded, and nothing in the console said why.
//
// The proxy below is that missing half. Note there is no path rewrite: the backend sets
// `server.servlet.context-path: /api`, so /api/loans must arrive as /api/loans, not /loans.
// 8080 is the LOCAL backend (`mvn spring-boot:run`). The Docker stack is offset to 8180 so the two
// never collide, which is why plain `npm run dev` needs no flags. Point this elsewhere to aim the
// dev frontend at a different backend — `npm run dev:docker-api` does exactly that for Docker's.
const DEFAULT_TARGET = 'http://localhost:8080'
const API_TARGET = process.env.VITE_API_TARGET || DEFAULT_TARGET

/**
 * Dev-only badge naming which backend this page is talking to.
 *
 * With the Docker stack and a local dev server both up there are two copies of this app running
 * against two different databases. They look identical, so a loan entered in one simply is not in
 * the other — which has already cost an evening once. The badge makes the answer visible instead of
 * something you have to remember.
 *
 * Orange means the default local backend; blue means the target was overridden (e.g. Docker's on
 * 8180). `apply: 'serve'` means this never runs during `vite build`, so it cannot reach production —
 * so the absence of a badge is itself how you know you are on the container build.
 */
function stackBadge(): Plugin {
  return {
    name: 'finflow-stack-badge',
    apply: 'serve',
    transformIndexHtml(_html, ctx) {
      const port = ctx.server?.config.server.port ?? '?'
      const docker = API_TARGET !== DEFAULT_TARGET
      return [{
        tag: 'div',
        injectTo: 'body',
        attrs: {
          // pointer-events:none so it can never intercept a click on the app underneath.
          style: [
            'position:fixed', 'bottom:6px', 'left:6px', 'z-index:2147483647',
            'pointer-events:none', 'user-select:none',
            'font:600 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
            'padding:3px 7px', 'border-radius:5px', 'letter-spacing:.02em',
            `background:${docker ? 'rgba(56,189,248,.16)' : 'rgba(249,115,22,.18)'}`,
            `color:${docker ? '#7dd3fc' : '#fdba74'}`,
            `border:1px solid ${docker ? 'rgba(56,189,248,.35)' : 'rgba(249,115,22,.4)'}`,
          ].join(';'),
        },
        children: `dev :${port} → api ${API_TARGET.replace(/^https?:\/\//, '')}`,
      }]
    },
  }
}

/**
 * Stamps public/sw.js once it has been copied to dist/: a per-build id (each deploy gets its own offline
 * cache and drops the previous one) and the list of built files to save on install. Every page is its own
 * lazy chunk, so without the list a page never opened online could not open offline. Build-only.
 */
function stampServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'finflow-sw-build-id',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    closeBundle() {
      const file = resolve(outDir, 'sw.js')
      const assets = readdirSync(resolve(outDir, 'assets')).map(f => `/assets/${f}`)
      writeFileSync(file, readFileSync(file, 'utf8')
        .replace(/__BUILD_ID__/g, Date.now().toString(36))
        .replace('__PRECACHE__', JSON.stringify(assets)))
    },
  }
}

export default defineConfig({
  plugins: [react(), stackBadge(), stampServiceWorker()],
  server: {
    // Docker publishes its frontend on 3100, so 3000 belongs to local dev and stays free.
    // strictPort still matters: without it vite silently moves to the next free port when something
    // stale is squatting on 3000, and you end up staring at the wrong app wondering why your edits
    // do nothing. A loud failure tells you to go look with:  lsof -nP -iTCP:3000 -sTCP:LISTEN
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        if (warning.code === 'CIRCULAR_DEPENDENCY') {
          console.error('CIRCULAR:', warning.message)
        }
        warn(warning)
      }
    }
  }
})
