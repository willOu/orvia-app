const CACHE_VERSION = 'orvia-v1.9.6';
const CACHE_NAME = CACHE_VERSION;
const ASSETS_TO_CACHE = [
  '.',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// Ressources dont le contenu ne change jamais de nom de fichier une fois
// déployées (icônes, manifest) : on peut se fier au cache sans re-vérifier
// le réseau à chaque fois, ce qui accélère le chargement hors-ligne et sur
// connexion lente. index.html est volontairement exclu de cette liste (voir
// stratégie network-first ci-dessous) car il change de contenu à chaque
// déploiement sans changer d'URL.
const CACHE_FIRST_PATHS = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') self.skipWaiting();
});

function isHtmlRequest(req, url) {
  return req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
}

function isCacheFirstAsset(url) {
  return CACHE_FIRST_PATHS.some(p => url.pathname.endsWith(p));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Ne prendre en charge que les requêtes GET vers notre propre origine.
  // Les appels externes (reverse-géocodage Nominatim, liens Google Maps, etc.)
  // ne doivent pas transiter par ce cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // index.html (et la navigation racine) : network-first. On veut toujours
  // la dernière version du HTML/JS après un déploiement ; le cache ne sert
  // que de secours si le réseau est indisponible (mode hors-ligne).
  if (isHtmlRequest(req, url)) {
    event.respondWith(
      fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Icônes et manifest : cache-first, ces fichiers ne changent jamais de nom
  // d'une version à l'autre donc pas besoin de revalider à chaque requête.
  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkResponse;
      }))
    );
    return;
  }

  // Tout le reste : stale-while-revalidate (comportement d'origine).
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
