// BAKUDI NI STORY — Service Worker
// Cache-first strategy for offline support

const CACHE_NAME = 'bakudi-v1';

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './lock.html',
  './index.html',
  './gallery.html',
  './timeline.html',
  './letters.html',
  './music.html',
  './about.html',
  './playful.html',
  './dreams.html',
  './settings.html',
  './final.html',
  './rejected.html',
  './assets/css/shared.css',
  './assets/css/transitions.css',
  './assets/js/theme.js',
  './assets/js/nav.js',
  './assets/js/sounds.js',
  './assets/js/media-data.js',
  './assets/js/letters-data.js',
  './assets/images/main.jpeg',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/landing_bg.png',
  './assets/images/landing_bg_couple.png',
  './assets/images/timeline_bg.png',
  './manifest.json'
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for local assets, network-first for external
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // For same-origin requests: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Return cache immediately, but also update cache in background
          const fetchPromise = fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          }).catch(() => {});
          return cached;
        }

        // Not in cache — fetch from network and cache it
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
  }
  // External resources (fonts, CDN): network-first with cache fallback
  else {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});
