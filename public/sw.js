const CACHE_NAME = 'link-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Установка SW — кэшируем статику
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Активация — удаляем старые кэши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — Network First для API, Cache First для статики
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API-запросы — только сеть, без кэша
  if (url.hostname.includes('functions.poehali.dev')) {
    return;
  }

  // Навигация — отдаём index.html (SPA)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html')
      )
    );
    return;
  }

  // Статика — Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// Push-уведомления (будущее)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'Link', {
    body: data.body || 'Новое сообщение',
    icon: 'https://cdn.poehali.dev/projects/fbc019b6-e074-4ec4-8ec0-9ecf64c38e80/files/967c26eb-7f20-4ce3-9ca9-d1b0725114be.jpg',
    badge: 'https://cdn.poehali.dev/projects/fbc019b6-e074-4ec4-8ec0-9ecf64c38e80/files/967c26eb-7f20-4ce3-9ca9-d1b0725114be.jpg',
    vibrate: [200, 100, 200],
    tag: 'link-message',
    renotify: true,
    data: { url: '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
