/* Balcony Hydra — Service Worker (PWA shell)
 *
 * Stratégies :
 *  - Shell statique (HTML/CSS/JS/icons/fonts) → cache-first avec fallback réseau
 *  - API REST (`/api/...` du master) → network-first avec fallback cache (offline tolerance)
 *  - MQTT n'est PAS interceptable (WebSocket out-of-scope SW) — gestion côté client
 *
 * Cache versioning : bump CACHE_VERSION à chaque release pour invalider le shell.
 */

const CACHE_VERSION = 'v4.2.1';
const SHELL_CACHE   = `hydra-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hydra-runtime-${CACHE_VERSION}`;

// Shell minimal : les fichiers fondamentaux du proto + icônes + manifest
const SHELL_ASSETS = [
  './',
  './balcony-hydra-mobile.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

// ─── INSTALL : pre-cache du shell ─────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // Best-effort : si un asset échoue (réseau), on ne bloque pas l'install
      return Promise.allSettled(
        SHELL_ASSETS.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] shell precache miss', url, err.message);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE : nettoyage des anciens caches ──────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('hydra-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH : routing par stratégie ────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;  // POST/PUT/DELETE passent direct au réseau

  const url = new URL(req.url);

  // Stratégie 1 : API REST du master → network-first avec fallback cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Stratégie 2 : shell statique → cache-first avec mise à jour en arrière-plan
  if (req.mode === 'navigate' || SHELL_ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '')))) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Stratégie 3 : fonts Google + assets externes → cache-first long TTL
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Défaut : passthrough réseau
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

// ─── Stratégie network-first (API) ────────────────────────────
async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Pas de cache → renvoie un 503 explicite que le client peut gérer
    return new Response(
      JSON.stringify({ message: 'Master hors-ligne · pas de cache disponible', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Stratégie cache-first (shell) ────────────────────────────
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // Stale-while-revalidate : on rafraîchit en arrière-plan
    fetch(req).then((fresh) => {
      if (fresh && fresh.ok) {
        caches.open(SHELL_CACHE).then((cache) => cache.put(req, fresh));
      }
    }).catch(() => {/* silent */});
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    // Si shell HTML demandé et indispo, renvoie une page minimale offline
    if (req.mode === 'navigate') {
      return new Response(
        '<!doctype html><meta charset=utf-8><title>Hydra · hors ligne</title>' +
        '<body style="background:#0b0b0b;color:#fff;font-family:system-ui;padding:24px;">' +
        '<h1>Hydra est hors ligne</h1><p>Vérifie le WiFi et recharge la page.</p></body>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return Response.error();
  }
}

// ─── MESSAGE : commandes depuis le client ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_RUNTIME_CACHE') {
    caches.delete(RUNTIME_CACHE).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
