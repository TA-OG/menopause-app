/**
 * Service worker — required for web push to function at all.
 *
 * Registered by src/app/layout.tsx, which called navigator.serviceWorker
 * .register('/sw.js') with no file at that path to serve — every push
 * subscription attempt failed silently. This is that file.
 *
 * Deliberately minimal: this app has no other offline/caching needs, so the
 * only jobs here are receiving a push event and turning it into a
 * notification, and routing a click on that notification back into the app.
 */

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
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
