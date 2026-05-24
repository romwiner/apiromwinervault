var CACHE = 'apiromwiner-v6'; // ✅ NUEVA VERSIÓN: fuerza limpieza de cache viejo

// 📦 INSTALL: Solo iconos, NO HTML/JS (evita CSP viejo en caché)
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE).then(function(cache) {
            return cache.addAll([
                '/icon-192.png',
                '/icon-512.png'
                // ✅ NO agregamos '/', '/index.html', '/manifest.json' aquí
            ]);
        })
    );
    self.skipWaiting();
});

// 🔄 ACTIVATE: Limpia caches anteriores
self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE; })
                .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

// 🌐 FETCH: Estrategia inteligente
self.addEventListener('fetch', function(e) {
    var url = e.request.url;

    // 🔐 API CALLS: Nunca cachear, siempre red
    if (url.includes('/api/') || url.includes('/login') || url.includes('/register') ||
        url.includes('/vault') || url.includes('/wallet') || url.includes('/identity') ||
        url.includes('/promo') || url.includes('/affiliates')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // 🖼️ QR EXTERNO: Permitir sin cachear
    if (url.includes('api.qrserver.com')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // 🚫 Evitar esquemas no soportados (chrome-extension, etc.)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        e.respondWith(new Response('', { status: 400 }));
        return;
    }

    // 📱 HTML/JS: NETWORK-FIRST (crítico para CSP nuevo)
    if (url.endsWith('.html') || url.endsWith('.js') || url === '/' || url.includes('/index')) {
        e.respondWith(
            fetch(e.request).catch(function() {
                // Fallback solo si offline total
                return caches.match('/index.html');
            })
        );
        return;
    }

    // 🖼️ CSS/Imágenes/Fuentes: CACHE-FIRST (performance)
    e.respondWith(
        caches.match(e.request).then(function(r) {
            return r || fetch(e.request).then(function(response) {
                if (e.request.method === 'GET' && response && response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
                }
                return response;
            });
        })
    );
});