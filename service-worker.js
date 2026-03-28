/**
 * ╔══════════════════════════════════════════════════════╗
 * ║         NOTEBOOK PWA — SERVICE WORKER               ║
 * ║  Estratégia: Cache-first para assets estáticos,     ║
 * ║              Network-first para conteúdo GitHub.    ║
 * ╚══════════════════════════════════════════════════════╝
 */

const CACHE_NAME   = "notebook-v1";
const CONTENT_CACHE = "notebook-content-v1";

// Assets do shell da aplicação — sempre em cache
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/config.js",
  "/manifest.json",
  "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js",
];

// ─── Install: pre-cache do shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── Activate: limpa caches antigos ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== CONTENT_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: lógica de cache por tipo de requisição ────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignorar extensões de browser e requests não-GET
  if (event.request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  // Conteúdo do GitHub (raw) → Network-first, fallback para cache
  if (
    url.hostname === "raw.githubusercontent.com" ||
    (url.hostname === "api.github.com" && url.pathname.includes("/contents/"))
  ) {
    event.respondWith(networkFirstWithCache(event.request, CONTENT_CACHE));
    return;
  }

  // Assets do shell → Cache-first
  event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
});

// ─── Estratégia: Cache-first ──────────────────────────────────────────────────
async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Conteúdo não disponível offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

// ─── Estratégia: Network-first (com fallback para cache) ──────────────────────
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: "offline", message: "Sem conexão e conteúdo não cacheado." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ─── Mensagens do cliente ─────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();

  // Permite que o app force limpeza de cache de conteúdo
  if (event.data === "CLEAR_CONTENT_CACHE") {
    caches.delete(CONTENT_CACHE);
  }
});
