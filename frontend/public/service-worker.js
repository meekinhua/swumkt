/* eslint-disable no-restricted-globals */

// Service Worker version - bump this to force cache refresh
const CACHE_VERSION = 'v3';
const CACHE_NAME = `swumkt-cache-${CACHE_VERSION}`;

// Only cache truly static assets (logo)
const urlsToCache = [
  'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png'
];

// Install event - cache static assets only
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
  // Activate immediately, don't wait for old SW to stop
  self.skipWaiting();
});

// Activate event - clean up ALL old caches and take control
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
    }).then(() => {
      // Take control of all open tabs immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - strategy depends on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) API calls → network-only, never cache
  if (url.pathname.startsWith('/api')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2) Navigation requests (HTML pages) → network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh HTML for offline fallback
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Offline → serve cached HTML
          return caches.match(event.request).then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // 3) Static assets (JS/CSS/images with hash in filename) → stale-while-revalidate
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        // Return cached immediately if available, otherwise wait for network
        return cached || networkFetch;
      })
    );
    return;
  }

  // 4) Everything else → network-first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
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
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
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