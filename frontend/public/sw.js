/* FinFlow service worker — makes the app installable and lets it open without a connection.
 *
 * What it caches: the app shell (index.html), every hashed build file under /assets/, and the icons.
 * What it NEVER caches: anything under /api/. Those requests are not intercepted at all, so no
 * financial data is ever stored on the device by this worker, and a signed-out phone keeps nothing.
 *
 * __BUILD_ID__ is replaced at build time (vite.config.ts), so every deploy gets a fresh cache and
 * the previous one is deleted on activate.
 */
const CACHE = 'finflow-__BUILD_ID__'
const SHELL = '/index.html'
// Every built JS/CSS file (filled in at build time). Saved up front so a page never opened online still opens offline.
const PRECACHE = __PRECACHE__

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll([SHELL, ...PRECACHE])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('finflow-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // fonts etc. go straight to the network
  if (url.pathname.startsWith('/api/')) return              // live data only — never cached

  // Page loads: network first so a deploy shows up straight away; the saved shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(SHELL, copy)) }
          return res
        })
        .catch(() => caches.match(SHELL, { ignoreVary: true })),
    )
    return
  }

  // Hashed build files never change under the same name, so the cached copy is always right.
  // ignoreVary: module imports send an Origin header and servers may answer `Vary: Origin`, which made the
  // copies saved at install (fetched without Origin) never match — every lazy page failed to load offline.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
        return res
      })),
    )
  }
})
