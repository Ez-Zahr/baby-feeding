// Network-only service worker. It caches nothing; it exists only so that
// Android Chrome treats the site as an installable app (WebAPK) and
// places it in the app drawer, not just as a home-screen shortcut.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
