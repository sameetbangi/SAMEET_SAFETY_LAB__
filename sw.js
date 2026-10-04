const CACHE = 'sameet-safety-lab-v4';
const ASSETS = [
  './', './index.html', './404.html', './style.css', './learning.css',
  './script.js', './data/lessons.js', './assets/circuit-profile.png',
  './manifest.webmanifest'
];

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
});
