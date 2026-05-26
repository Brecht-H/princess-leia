/* ==========================================================================
   Princess Leia Boat Companion — Service Worker
   Offline-first PWA. On the water in Jersey there is no data connection,
   so the full app shell + all flipbook plates are precached on install.
   ========================================================================== */

const CACHE_VERSION = 'leia-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  // NOTE: the app is fully self-contained in index.html (all data + logic
  // inlined in <script> blocks). There are no external JS modules to cache.
  // Branding + ship schematic
  './assets/princess_leia_deck.svg',
  './assets/princess_leia_illustration.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  // Flipbook plates (full-res nautical encyclopedia illustrations).
  // Names verified against actual image content 2026-05-24 (see PLATES.md).
  './assets/flipbook/sail_handling.jpg',
  './assets/flipbook/cockpit_helm.jpg',
  './assets/flipbook/navigation_seamanship.jpg',
  './assets/flipbook/systems_overview.jpg',
  './assets/flipbook/reefing_system.jpg',
  './assets/flipbook/winch_technique.jpg',
  './assets/flipbook/running_rigging.jpg',
  './assets/flipbook/essential_knots.jpg',
  './assets/flipbook/essential_knots_2.jpg',
  './assets/flipbook/cabin_interior.jpg',
  './assets/flipbook/man_overboard.jpg',
  './assets/flipbook/points_of_sail.jpg',
  './assets/flipbook/docklines_springs.jpg',
  // Day-at-sea storyboard frames
  './assets/day_at_sea/frame_001.png',
  './assets/day_at_sea/frame_002.png',
  './assets/day_at_sea/frame_003.png',
  './assets/day_at_sea/frame_004.png',
  './assets/day_at_sea/frame_005.png',
  './assets/day_at_sea/frame_006.png',
  './assets/day_at_sea/frame_007.png',
  './assets/day_at_sea/frame_008.png',
  './assets/day_at_sea/frame_009.png',
  './assets/day_at_sea/frame_010.png',
];

// Precache the app shell. Individual asset failures must not abort the whole
// install (a missing icon should not break offline mode), so each entry is
// fetched independently and failures are logged rather than thrown.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            console.warn('[sw] precache miss:', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

// Drop stale caches from previous versions on activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Strategy:
//  - Navigations: network-first, fall back to cached index.html (offline shell).
//  - Same-origin GET: cache-first, then network (and cache the result).
//  - Cross-origin (Google Fonts, etc.): stale-while-revalidate, best-effort.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
          return await fetch(request);
        } catch {
          // Offline standalone launch: iOS may request '/', '/index.html', or
          // the bare start_url. Fall back to the cached shell for any of them.
          return (
            (await cache.match('./index.html')) ||
            (await cache.match('./')) ||
            (await cache.match(request)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  if (sameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const resp = await fetch(request);
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        } catch (err) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Cross-origin: stale-while-revalidate, never block on it.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((resp) => {
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
