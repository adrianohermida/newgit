self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("hmadv-portal-")).map((key) => caches.delete(key)));
      await self.registration.unregister();
      await self.clients.claim();
    })().catch(() => null)
  );
});

self.addEventListener("fetch", () => {
  // noop cleanup worker: nao intercepta requests.
});
