// ============================================================
// Service Worker — AMC অর্থনীতি হাজিরা সিস্টেম
// Version: v3.0 (Phase 3 + 4 Update)
// Updated: 2026-09-30
// ============================================================

// ⚠️ গুরুত্বপূর্ণ: প্রতিবার update করলে এই নাম পরিবর্তন করুন
// এতে সব user-এর browser-এ পুরনো cache auto-clear হবে
const CACHE_NAME = 'amc-attendance-v3';

// Static files cache
const STATIC_CACHE = 'amc-static-v3';
const DYNAMIC_CACHE = 'amc-dynamic-v3';

// এই ফাইলগুলো সবসময় cache-এ রাখা হবে
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// ============================================================
// INSTALL — প্রথমবার cache সেটআপ
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Service Worker v3 installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache opened:', CACHE_NAME);
        // একটা একটা করে যোগ করছি, যাতে একটা fail করলে সব fail না হয়
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => {
              console.log('⚠️ Cache add failed for:', url, err);
            });
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker v3 installed');
        return self.skipWaiting();
      })
      .catch(err => {
        console.log('❌ Install failed:', err);
      })
  );
});

// ============================================================
// ACTIVATE — পুরনো cache মুছুন
// ============================================================
self.addEventListener('activate', event => {
  console.log('🔧 Service Worker v3 activating...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // v3 ছাড়া সব পুরনো cache delete
            if (cacheName !== CACHE_NAME &&
                cacheName !== STATIC_CACHE &&
                cacheName !== DYNAMIC_CACHE) {
              console.log('🗑️ Removing old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker v3 activated');
        return self.clients.claim();
      })
      .catch(err => {
        console.log('❌ Activate failed:', err);
      })
  );
});

// ============================================================
// FETCH — Network-first, fallback to cache
// ============================================================
self.addEventListener('fetch', event => {
  // শুধু GET রিকোয়েস্ট handle করি
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // ❌ Supabase API call cache করব না (real-time data)
  if (url.includes('supabase.co')) return;

  // ❌ CDN (Tailwind, jsPDF, etc.) cache করব না
  if (url.includes('cdn.') ||
      url.includes('cdnjs.') ||
      url.includes('jsdelivr') ||
      url.includes('tailwindcss.com')) return;

  // ❌ Chrome extension-এর request handle করব না
  if (url.startsWith('chrome-extension://')) return;

  // ❌ অন্য origin-এর request (fonts.google.com বাদে)
  // Google Fonts cache করা যাবে, তাই filter করা হলো না

  // ✅ Network-first strategy
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // সফল হলে cache-এ কপি রাখি
        if (response && response.status === 200) {
          const responseClone = response.clone();

          // HTML/font → dynamic cache
          if (url.includes('fonts.g') ||
              url.endsWith('.ttf') ||
              url.endsWith('.woff') ||
              url.endsWith('.woff2')) {
            caches.open(DYNAMIC_CACHE)
              .then(cache => {
                cache.put(event.request, responseClone).catch(() => {});
              });
          } else {
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseClone).catch(() => {});
              });
          }
        }
        return response;
      })
      .catch(() => {
        // Network fail হলে cache থেকে দাও
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Cache-এও না থাকলে offline message
            // HTML request হলে index.html দাও
            if (event.request.headers.get('accept') &&
                event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            // অন্যথায় 503
            return new Response('অফলাইন — ইন্টারনেট সংযোগ নেই', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain; charset=utf-8'
              })
            });
          });
      })
  );
});

// ============================================================
// MESSAGE — Client থেকে message receive
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // নতুন version activate করার message
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
});

// ============================================================
// PUSH NOTIFICATION (ভবিষ্যতের জন্য, optional)
// ============================================================
self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'নতুন নোটিশ',
      icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991109.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/2991/2991109.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      }
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'AMC হাজিরা', options)
    );
  } catch (err) {
    console.log('Push error:', err);
  }
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // যদি already open window থাকে
        for (const client of clientList) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        // নাহলে নতুন window খুলি
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url || '/');
        }
      })
  );
});

console.log('✅ Service Worker v3 loaded');
