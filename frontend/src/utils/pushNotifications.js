import axios from 'axios';
import { API } from '@/App';

// URL Base64 to Uint8Array conversion
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const pushNotifications = {
  // Detect iOS
  isIOS: () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  },

  // Detect if running as standalone PWA
  isStandalone: () => {
    // Check multiple conditions for PWA
    const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isNavigatorStandalone = window.navigator.standalone === true;
    const isAndroidApp = document.referrer.includes('android-app://');
    
    // iOS specific: check if there's no Safari UI
    const isIOSStandalone = pushNotifications.isIOS() && 
                           (isNavigatorStandalone || 
                            isDisplayStandalone ||
                            !window.navigator.standalone === false); // explicit check
    
    return isDisplayStandalone || isNavigatorStandalone || isAndroidApp || isIOSStandalone;
  },

  // Check if push notifications are supported
  isSupported: () => {
    const hasServiceWorker = 'serviceWorker' in navigator;
    const hasPushManager = 'PushManager' in window;
    
    // On iOS, only supported if installed as PWA
    if (pushNotifications.isIOS()) {
      return hasServiceWorker && hasPushManager && pushNotifications.isStandalone();
    }
    
    return hasServiceWorker && hasPushManager;
  },

  // Get notification permission status
  getPermissionStatus: () => {
    if (!('Notification' in window)) {
      return 'unsupported';
    }
    
    // iOS Safari (not PWA) doesn't support notifications
    if (pushNotifications.isIOS() && !pushNotifications.isStandalone()) {
      return 'ios-not-installed';
    }
    
    return Notification.permission;
  },

  // Request notification permission
  requestPermission: async () => {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications');
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  // Subscribe to push notifications
  subscribe: async (token) => {
    try {
      if (!pushNotifications.isSupported()) {
        throw new Error('Push notifications are not supported');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const { data } = await axios.get(`${API}/notifications/vapid-public-key`);
      const vapidPublicKey = data.public_key;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // Send subscription to backend
      await axios.post(
        `${API}/notifications/subscribe`,
        { subscription_info: subscription.toJSON() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return true;
    } catch (error) {
      console.error('Push subscription error:', error);
      throw error;
    }
  },

  // Unsubscribe from push notifications
  unsubscribe: async (token) => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        
        // Notify backend
        await axios.delete(
          `${API}/notifications/unsubscribe`,
          {
            params: { endpoint: subscription.endpoint },
            headers: { Authorization: `Bearer ${token}` }
          }
        );
      }

      return true;
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      throw error;
    }
  },

  // Check if already subscribed
  isSubscribed: async () => {
    try {
      if (!pushNotifications.isSupported()) {
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      return subscription !== null;
    } catch (error) {
      console.error('Check subscription error:', error);
      return false;
    }
  },

  // Show notification (for testing/in-app)
  showNotification: (title, options = {}) => {
    if (pushNotifications.getPermissionStatus() === 'granted') {
      new Notification(title, {
        icon: 'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png',
        badge: 'https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png',
        ...options
      });
    }
  }
};
