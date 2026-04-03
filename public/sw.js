const SHELL_CACHE = "hmadv-portal-shell-v1";
const DATA_CACHE = "hmadv-portal-data-v1";
const MANIFEST_URLS = ["/manifest.json", "/manifest.webmanifest"];
const FALLBACK_MANIFEST = {
  name: "Portal do Cliente | Hermida Maia",
  short_name: "Portal HM",
  start_url: "/portal",
  scope: "/",
  display: "standalone",
  background_color: "#07110E",
  theme_color: "#07110E",
  icons: [
    {
      src: "/images/OIP.webp",
      sizes: "192x192",
      type: "image/webp",
    },
  ],
};
const SHELL_ASSETS = ["/portal", "/portal/login", "/manifest.json"];

function manifestResponse() {
  return new Response(JSON.stringify(FALLBACK_MANIFEST), {
    status: 200,
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, DATA_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca interceptar chunks do Next para evitar mismatch de MIME por cache stale.
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith("/images/") || MANIFEST_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        if (MANIFEST_URLS.includes(url.pathname)) {
          return fetch(request)
            .then((response) => {
              if (!response.ok) {
                return manifestResponse();
              }
              const clone = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone)).catch(() => null);
              return response;
            })
            .catch(() => manifestResponse());
        }

        return fetch(request).then((response) => {
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && !contentType.includes("text/html")) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone)).catch(() => null);
          }
          return response;
        });
      })
    );
    return;
  }

  if (url.pathname.startsWith("/api/client-")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(request, clone)).catch(() => null);
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.pathname.startsWith("/portal")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone)).catch(() => null);
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
