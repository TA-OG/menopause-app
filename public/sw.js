/**
 * Service worker — required for web push to function at all.
 *
 * Registered by src/app/layout.tsx, which called navigator.serviceWorker
 * .register('/sw.js') with no file at that path to serve — every push
 * subscription attempt failed silently. This is that file.
 *
 * Deliberately minimal. Jobs: receive a push event and turn it into a
 * notification; route a click on that notification back into the app; and
 * show the /offline page when a page navigation fails for lack of a network.
 *
 * Nothing else is cached. Pages hold personal health data and must always
 * come from the server, so the only response ever served from cache is the
 * offline fallback itself, and only when the network request has failed.
 */

const OFFLINE_CACHE = 'aunty-mel-offline-v1'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // A failed pre-cache must not block the worker; push still has to work.
      .catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // Page navigations only — never API calls, assets or non-GET requests.
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || Response.error())
    )
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    // A malformed or non-JSON push payload shouldn't crash the worker —
    // fall back to a generic notification rather than showing nothing.
    payload = { title: 'Aunty Mel', body: event.data.text() || 'You have a new notification.' }
  }

  const title = payload.title || 'Aunty Mel'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    data: { url: payload.url || '/dashboard' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on this origin rather than always opening a new
      // one — most users will already have the app open somewhere.
      for (const client of clientList) {
        if ('focus' in client) {
          // includeUncontrolled can hand back a client this service worker
          // doesn't control, and navigate() rejects on those — chain it
          // (rather than fire-and-forget) and fall back to opening a new
          // window if either focus or navigate fails, so the click always
          // lands somewhere instead of silently going nowhere.
          return client
            .focus()
            .then(() => client.navigate(targetUrl))
            .catch(() => self.clients.openWindow(targetUrl))
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
