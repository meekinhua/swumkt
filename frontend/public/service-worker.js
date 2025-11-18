/* eslint-disable no-restricted-globals */

// Service Worker version
const CACHE_VERSION = 'v2';
const CACHE_NAME = `swumkt-cache-${CACHE_VERSION}`;

// Assets to cache on install
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('Cache install error:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the new response
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch((error) => {
          console.log('Fetch error:', error);
          // Return offline page if available
          return caches.match('/index.html');
        });
      })
  );
});

// Push notification support
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from SWUMKT',
    icon: 'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png',
    badge: 'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png',
    vibrate: [200, 100, 200],
    tag: 'swumkt-notification',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification('SWUMKT Portal', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});