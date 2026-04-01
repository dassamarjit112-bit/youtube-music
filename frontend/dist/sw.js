const CACHE_NAME = 'musictube-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/logo.png',
  '/favicon.png',
  // Vite assets are usually hashed, so we rely on run-time caching for them
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        // Don't cache API or large media
        if (event.request.url.includes('/api/')) return fetchRes;
        
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    }).catch(() => {
      // Fallback for offline if possible
    })
  );
});

// Handle notification interaction
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  
  // Close the notification
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // If no action clicked, just focus existing window or open new
      if (!action) {
        if (clientList.length > 0) return clientList[0].focus();
        return clients.openWindow('/');
      }

      // If action clicked (play, pause, next, prev), tell the client
      if (clientList.length > 0) {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'notification-action',
            action: action
          });
        });
      }
    })
  );
});
