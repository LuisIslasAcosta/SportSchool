// Service Worker de SportSchool
const VERSION = 'v1.2.0';
const CACHE = `sportschool-${VERSION}`;

// Recursos principales (App Shell) que se precargan en la instalación
const RECURSOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/api.js',
  './js/notify.js',
  './js/geo.js',
  './icons/favicon.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(RECURSOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c.startsWith('sportschool-') && c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

// Intercepción de solicitudes
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;                       // POST/PUT van directo a la red
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // API externa: sin caché

  // Navegación: red primero, con respaldo en caché para funcionar offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Recursos estáticos: caché primero y actualización en segundo plano
  event.respondWith(
    caches.match(request).then((enCache) => {
      const desdeRed = fetch(request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
          }
          return resp;
        })
        .catch(() => enCache);
      return enCache || desdeRed;
    })
  );
});

// Al tocar la notificación se abre (o enfoca) la app en el historial
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          v.navigate('./index.html#historial');
          return v.focus();
        }
      }
      return self.clients.openWindow('./index.html#historial');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source.postMessage({ version: VERSION });
});
