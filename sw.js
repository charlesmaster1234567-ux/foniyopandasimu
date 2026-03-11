/**
 * HeartSpace - Unified Service Worker
 * Handles Voice Calls, Live Video, and Landing Page
 * Version: 1.0.0
 */

const VERSION = '1.0.0';
const STATIC_CACHE_VOICE = 'heartspace-voice-v1';
const STATIC_CACHE_LIVE = 'heartspace-live-v1';
const STATIC_CACHE_HOME = 'heartspace-home-v1';
const DYNAMIC_CACHE = 'heartspace-dynamic-v1';
const MAX_DYNAMIC_ITEMS = 50;

// Landing page assets
const HOME_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/preview.jpeg'
];

// Voice app assets
const VOICE_ASSETS = [
  '/voice/',
  '/voice/index.html',
  '/voice/app.js',
  '/voice/styles.css',
  '/voice/manifest.json'
];

// Live app assets
const LIVE_ASSETS = [
  '/live/',
  '/live/index.html',
  '/live/app.js',
  '/live/styles.css',
  '/live/manifest.json'
];

// ============================================================================
// INSTALL EVENT
// ============================================================================
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${VERSION}...`);
  
  event.waitUntil(
    Promise.all([
      // Cache home page
      caches.open(STATIC_CACHE_HOME).then(cache => {
        console.log('[SW] Caching home assets');
        return cache.addAll(HOME_ASSETS).catch(err => {
          console.warn('[SW] Some home assets failed to cache:', err);
        });
      }),
      
      // Cache voice app
      caches.open(STATIC_CACHE_VOICE).then(cache => {
        console.log('[SW] Caching voice app assets');
        return cache.addAll(VOICE_ASSETS).catch(err => {
          console.warn('[SW] Some voice assets failed to cache:', err);
        });
      }),
      
      // Cache live app
      caches.open(STATIC_CACHE_LIVE).then(cache => {
        console.log('[SW] Caching live app assets');
        return cache.addAll(LIVE_ASSETS).catch(err => {
          console.warn('[SW] Some live assets failed to cache:', err);
        });
      })
    ])
    .then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
    .catch(error => {
      console.error('[SW] Installation failed:', error);
    })
  );
});

// ============================================================================
// ACTIVATE EVENT
// ============================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  const validCaches = [
    STATIC_CACHE_HOME,
    STATIC_CACHE_VOICE, 
    STATIC_CACHE_LIVE, 
    DYNAMIC_CACHE
  ];
  
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter(name => !validCaches.includes(name))
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
        
        await self.clients.claim();
        console.log('[SW] Activation complete');
        
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: VERSION
          });
        });
      } catch (error) {
        console.error('[SW] Activation failed:', error);
      }
    })()
  );
});

// ============================================================================
// FETCH EVENT
// ============================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip WebSocket and real-time connections
  if (shouldSkipRequest(url)) return;
  
  // Choose strategy based on resource type
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function shouldSkipRequest(url) {
  return (
    url.href.includes('socket.io') ||
    url.href.includes('/socket.io/') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('stun') ||
    url.hostname.includes('turn')
  );
}

function isStaticAsset(pathname) {
  const allAssets = [...HOME_ASSETS, ...VOICE_ASSETS, ...LIVE_ASSETS];
  
  // Normalize pathname
  const normalized = pathname.endsWith('/') && pathname !== '/' 
    ? pathname.slice(0, -1) 
    : pathname;
  
  // Check if in static assets
  if (allAssets.some(asset => {
    const normalizedAsset = asset.endsWith('/') && asset !== '/' 
      ? asset.slice(0, -1) 
      : asset;
    return normalized === normalizedAsset;
  })) {
    return true;
  }
  
  // Check file extension
  return pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|json|woff2?|ttf|eot|webp)$/i);
}

function getCacheName(pathname) {
  if (pathname.startsWith('/voice')) {
    return STATIC_CACHE_VOICE;
  } else if (pathname.startsWith('/live')) {
    return STATIC_CACHE_LIVE;
  } else {
    return STATIC_CACHE_HOME;
  }
}

async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) {
      fetchAndCache(request);
      return cached;
    }
    
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      const cacheName = getCacheName(new URL(request.url).pathname);
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    
    const cached = await caches.match(request);
    if (cached) return cached;
    
    if (request.mode === 'navigate') {
      return caches.match('/index.html') || 
             new Response('Offline', { status: 503 });
    }
    
    return new Response('Offline', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
    }
    
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }
    
    if (request.mode === 'navigate') {
      return caches.match('/index.html') ||
             new Response('Offline', { status: 503 });
    }
    
    return new Response('Offline', { 
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cacheName = getCacheName(new URL(request.url).pathname);
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
  } catch (error) {
    // Silent fail for background updates
  }
}

async function limitCacheSize(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
      await limitCacheSize(cacheName, maxItems);
    }
  } catch (error) {
    console.error('[SW] Cache size limit failed:', error);
  }
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const data = event.data ? event.data.json() : {};
  
  const isVideoCall = data.type === 'video' || data.app === 'live';
  const isVoiceCall = data.type === 'voice' || data.app === 'voice';
  
  const title = data.title || (isVideoCall ? 'HeartSpace Video' : 'HeartSpace Voice');
  const body = data.body || (isVideoCall ? 'Incoming video call' : 'Incoming voice call');
  
  const options = {
    body: body,
    icon: isVideoCall ? '/live/icons/icon-192.png' : '/voice/icons/icon-192.png',
    badge: isVideoCall ? '/live/icons/badge-72.png' : '/voice/icons/badge-72.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: `heartspace-${isVideoCall ? 'video' : 'voice'}-${Date.now()}`,
    actions: [
      { action: 'join', title: 'Join Call' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: {
      url: data.url || (isVideoCall ? '/live' : '/voice'),
      timestamp: Date.now(),
      roomId: data.roomId,
      appType: isVideoCall ? 'live' : 'voice'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ============================================================================
// NOTIFICATION CLICK
// ============================================================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') return;
  
  const notificationData = event.notification.data || {};
  const url = notificationData.url || '/';
  
  event.waitUntil(
    (async () => {
      try {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });
        
        for (const client of clients) {
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(url, self.location.origin);
          
          if (clientUrl.pathname.startsWith(targetUrl.pathname.split('/')[1]) && 'focus' in client) {
            await client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              action: event.action,
              data: notificationData
            });
            return;
          }
        }
        
        if (self.clients.openWindow) {
          const newClient = await self.clients.openWindow(url);
          setTimeout(() => {
            newClient.postMessage({
              type: 'NOTIFICATION_CLICKED',
              action: event.action,
              data: notificationData
            });
          }, 1000);
        }
      } catch (error) {
        console.error('[SW] Notification click failed:', error);
      }
    })()
  );
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then(names => {
          return Promise.all(names.map(name => caches.delete(name)));
        }).then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
      );
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: VERSION });
      break;
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================
self.addEventListener('error', (event) => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

console.log(`[SW] HeartSpace Service Worker loaded - Version ${VERSION}`);