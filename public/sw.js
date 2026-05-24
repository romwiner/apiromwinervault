var CACHE = 'apiromwiner-v1';

self.addEventListener('install', function(e) {
    e.waitUntil(caches.open(CACHE).then(function(cache) {
        return cache.addAll(['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png']);
    }));
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    var url = e.request.url;

    // 🔐 API CALLS: Nunca cachear
    if (url.includes('/api/') || url.includes('/login') || url.includes('/register') ||
        url.includes('/vault') || url.includes('/wallet') || url.includes('/identity') ||
        url.includes('/promo') || url.includes('/affiliates')) {
        e.respondWith(fetch(e.request).catch(function() {
            return new Response(JSON.stringify({ error: 'Offline' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
        }));
        return;
    }

    // 🖼️ QR EXTERNO: Permitir sin cachear
    if (url.includes('api.qrserver.com')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // 🚫 Evitar esquemas no soportados
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        e.respondWith(new Response('', { status: 400 }));
        return;
    }

    // 📱 Assets estáticos: Cache-first
    e.respondWith(
        caches.match(e.request).then(function(r) {
            return r || fetch(e.request).then(function(response) {
                if (e.request.method === 'GET' && response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
                }
                return response;
            }).catch(function() { return caches.match('/index.html'); });
        })
    );
});