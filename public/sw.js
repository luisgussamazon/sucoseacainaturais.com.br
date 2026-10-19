/* Only explicitly public assets may enter CacheStorage. Never cache user pages or API/RSC responses. */
const CACHE_NAME = "amazonitos-public-v3";
const PUBLIC_ASSETS = [
  "/offline.html",
  "/brand.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const path of PUBLIC_ASSETS) {
        const response = await fetch(path, {
          credentials: "omit",
          cache: "no-store",
        });
        if (!response.ok || response.redirected)
          throw new Error("Public resource unavailable");
        await cache.put(path, response);
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("amazonitos-public-") && key !== CACHE_NAME)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(async () => {
        const response = await (
          await caches.open(CACHE_NAME)
        ).match("/offline.html");
        return (
          response ||
          new Response("Sem conexão. Reconecte-se para acessar o SSD VBJ2.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          })
        );
      }),
    );
    return;
  }
  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await (
          await caches.open(CACHE_NAME)
        ).match(url.pathname);
        return (
          cached || fetch(request, { credentials: "omit", cache: "no-store" })
        );
      })(),
    );
    return;
  }
  if (
    url.pathname.startsWith("/api/") ||
    request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc")
  ) {
    event.respondWith(fetch(request, { cache: "no-store" }));
  }
});
