var CACHE = 'vault-v2';
self.addEventListener('install', function(e) { e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(['/', '/manifest.json', '/index.html']) })); });
self.addEventListener('fetch', function(e) {
    if (e.request.url.includes('/vault') || e.request.url.includes('/login') || e.request.url.includes('/register') || e.request.url.includes('/identity') || e.request.url.includes('/my-audit')) return;
    e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request); }));
});