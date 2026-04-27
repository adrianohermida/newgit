const STATIC_CACHE = "hmadv-static-v2";
const DYNAMIC_CACHE = "hmadv-dynamic-v2";
const DATA_CACHE = "hmadv-data-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  "/",
  OFFLINE_URL,
  "/manifest.json",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i.test(url.pathname)
  );
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone()).catch(() => null);
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackToOffline = false) {
  const url = new URL(request.url);
  const timeoutMs = 8000; // 8 segundo timeout
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => null);
    }
    return response;
  } catch (error) {
    // Tentar servir do cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    if (fallbackToOffline) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) {
        return offline;
      }
    }

    // Responder com erro apropriado
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/data/')) {
      return Response.error();
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: false, error: 'offline_or_network_failure' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response('Service unavailable', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, DYNAMIC_CACHE, DATA_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE, true));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DATA_CACHE, false));
    return;
  }

  if (url.pathname.startsWith('/_next/data/')) {
    event.respondWith(networkFirst(request, DATA_CACHE, false));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(networkFirst(request, STATIC_CACHE, false));
    return;
  }

  if (isStaticAsset(url) || url.pathname === "/manifest.json" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, DYNAMIC_CACHE, false));
});
