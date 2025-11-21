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

// Helper function to broadcast logs to Debug Console
function broadcastLog(message) {
  try {
    const channel = new BroadcastChannel('sw-logs');
    channel.postMessage(message);
    channel.close();
  } catch (e) {
    // BroadcastChannel might not be available
    console.log('Could not broadcast log:', e);
  }
}

// Push notification support - iOS compatible
self.addEventListener('push', (event) => {
  console.log('========================================');
  console.log('🔔 [SW] PUSH EVENT RECEIVED FROM BACKEND!');
  console.log('🔔 [SW] Timestamp:', new Date().toISOString());
  console.log('🔔 [SW] Event data exists:', !!event.data);
  console.log('========================================');
  
  // Broadcast to Debug Console
  broadcastLog('🔔 PUSH EVENT RECEIVED FROM BACKEND!');
  broadcastLog('⏰ Timestamp: ' + new Date().toISOString());
  broadcastLog('📦 Has data: ' + (event.data ? 'Yes' : 'No'));
  
  let notificationData = {
    title: 'SWUMKT Portal',
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: 'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png',
    badge: 'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png',
    vibrate: [200, 100, 200],
    data: { url: '/' },
    tag: 'swumkt-notification',
    // iOS requires this for notifications to show
    requireInteraction: true,
    // iOS specific
    silent: false,
    renotify: true
  };

  // Parse push data if available
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('🔔 [SW] Parsed payload:', payload);
      broadcastLog('📋 Parsed payload: ' + JSON.stringify(payload).substring(0, 100) + '...');
      
      notificationData = {
        ...notificationData,
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        data: payload.data || notificationData.data,
        tag: payload.tag || notificationData.tag,
        requireInteraction: payload.requireInteraction !== undefined ? payload.requireInteraction : true
      };
      
      broadcastLog('📝 Title: ' + notificationData.title);
      broadcastLog('📝 Body: ' + notificationData.body);
    } catch (e) {
      console.error('🔔 [SW] Error parsing push data:', e);
      broadcastLog('❌ Error parsing data: ' + e.message);
      try {
        notificationData.body = event.data.text();
        broadcastLog('📝 Using text data: ' + notificationData.body);
      } catch (textError) {
        console.error('🔔 [SW] Error getting text:', textError);
        broadcastLog('❌ Error getting text: ' + textError.message);
      }
    }
  } else {
    console.warn('🔔 [SW] No data in push event');
    broadcastLog('⚠️ No data in push event - using defaults');
  }

  console.log('🔔 [SW] Showing notification:', notificationData.title);
  broadcastLog('🔔 Attempting to show notification...');

  const promise = self.registration.showNotification(notificationData.title, {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: notificationData.vibrate,
    data: notificationData.data,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    silent: notificationData.silent,
    renotify: notificationData.renotify,
    // iOS specific options
    actions: [] // Empty actions array for iOS compatibility
  }).then(() => {
    console.log('✅ [SW] Notification shown successfully');
    broadcastLog('✅ Notification shown successfully!');
  }).catch((error) => {
    console.error('❌ [SW] Error showing notification:', error);
    broadcastLog('❌ ERROR showing notification: ' + error.message);
  });

  event.waitUntil(promise);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(client => {
              // Navigate to the notification URL
              if (client.navigate) {
                return client.navigate(urlToOpen);
              }
            });
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync for badge counter
self.addEventListener('sync', (event) => {
  if (event.tag === 'update-badge') {
    event.waitUntil(updateBadgeCount());
  }
});

async function updateBadgeCount() {
  try {
    // Get unread count from server or local storage
    const badge = await getUnreadCount();
    if ('setAppBadge' in navigator) {
      if (badge > 0) {
        navigator.setAppBadge(badge);
      } else {
        navigator.clearAppBadge();
      }
    }
  } catch (error) {
    console.log('Error updating badge:', error);
  }
}

async function getUnreadCount() {
  // This will be implemented with IndexedDB or fetch from server
  return 0;
}