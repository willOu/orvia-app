const CACHE_VERSION = 'orvia-v2.1.3';
const CACHE_NAME = CACHE_VERSION;
const ASSETS_TO_CACHE = [
'.',
'./index.html',
'./manifest.webmanifest',
'./icon-192.png',
'./icon-512.png'
];

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

self.addEventListener('fetch', event => {
const req = event.request;
if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

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
