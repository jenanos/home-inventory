// Minimal service worker. The fetch listener is required for Chrome to
// consider the site installable; it intentionally does no caching so the
// app always reflects the latest server state. Add a caching strategy
// later if offline support is desired.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", () => {
  // Pass-through; not calling event.respondWith() lets the browser handle it.
})
