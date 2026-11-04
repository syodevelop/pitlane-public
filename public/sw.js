// Navigation fallback only. Never cache applications, API responses or form data.
const CACHE = "pitlane-offline-v3";
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.add("/offline.html")).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("pitlane-offline-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) || new Response("Pitlane is offline. Reconnect and try again.", {status:503,headers:{"Content-Type":"text/plain"}})));
});
