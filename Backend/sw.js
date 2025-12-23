// Service Worker para La Casa Dark Core PWA
const CACHE_NAME = 'la-casa-dark-core-v1';
const RUNTIME_CACHE = 'la-casa-dark-core-runtime-v1';

// Arquivos estáticos para cache
const STATIC_ASSETS = [
  '/',
  '/la-casa-dark-core-auth.html',
  '/dashboard.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacheando arquivos estáticos');
        // Cachear apenas arquivos locais
        const localAssets = STATIC_ASSETS.filter(url => !url.startsWith('http'));
        return cache.addAll(localAssets).catch((error) => {
          console.warn('[Service Worker] Alguns arquivos não puderam ser cacheados:', error);
        });
      })
      .then(() => {
        console.log('[Service Worker] Instalação concluída');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Erro na instalação:', error);
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE;
          })
          .map((cacheName) => {
            console.log('[Service Worker] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
    .then(() => {
      console.log('[Service Worker] Ativação concluída');
      return self.clients.claim();
    })
  );
});

// Estratégia de cache: Network First, depois Cache
self.addEventListener('fetch', (event) => {
  // Ignorar requisições não-GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Ignorar requisições de API (sempre buscar do servidor)
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) => {
      return fetch(event.request)
        .then((response) => {
          // Cachear apenas respostas válidas
          if (response && response.status === 200) {
            // Clonar a resposta antes de cachear
            const responseToCache = response.clone();
            cache.put(event.request, responseToCache);
          }
          return response;
        })
        .catch(() => {
          // Se a rede falhar, tentar buscar do cache
          return cache.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Se não houver no cache, retornar página offline básica
            if (event.request.destination === 'document') {
              return caches.match('/la-casa-dark-core-auth.html');
            }
          });
        });
    })
  );
});

// Mensagens do cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notificações (para uso futuro)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

