var CACHE = 'apiromwiner-v1';

// 📦 PRE-CACHE: Assets esenciales + iconos (obligatorio para PWA install)
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE).then(function(cache) {
            return cache.addAll([
                '/',
                '/index.html',
                '/manifest.json',
                '/icon-192.png',
                '/icon-512.png'
            ]);
        })
    );
    self.skipWaiting();
});

// 🔄 ACTIVATE: Limpia caches viejos
self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

// 🌐 FETCH: Estrategia híbrida (seguridad + performance)
self.addEventListener('fetch', function(e) {
    var url = e.request.url;

    // 🔐 RUTAS SENSIBLES: No cachear, solo fetch en tiempo real
    if (url.includes('/vault') || url.includes('/login') || url.includes('/register') ||
        url.includes('/identity') || url.includes('/my-audit') || url.includes('/api/')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // 📱 STATIC ASSETS: Cache-first, network-fallback
    e.respondWith(
        caches.match(e.request).then(function(r) {
            return r || fetch(e.request).then(function(response) {
                // Solo cachea si es GET y respuesta válida
                if (e.request.method === 'GET' && response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
                }
                return response;
            });
        })
    );
});