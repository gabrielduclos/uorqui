const CACHE = 'uorqui-v1.0.0-pages';
const CORE = ['/', '/index.html', '/styles.css', '/firebase-config.js', '/api-config.js', '/app.js', '/assets/uorqui-logo-light.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // O Pages só faz cache dos próprios arquivos estáticos. API e Firebase ficam fora.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
