// ============================================================
// Service Worker — AMC অর্থনীতি হাজিরা সিস্টেম
// Version: v4.0 (CDN Cache — FOUC Fix)
// Updated: 2026-10-04
// ============================================================

// ⚠️ প্রতিবার update করলে version number বাড়ান (v4 → v5 → v6...)
const CACHE_NAME    = 'amc-attendance-v4';
const STATIC_CACHE  = 'amc-static-v4';
const DYNAMIC_CACHE = 'amc-dynamic-v4';
const CDN_CACHE     = 'amc-cdn-v4';

// নিজের ফাইল — install-এ precache হবে
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// ✅ CDN library গুলো — install-এ precache হবে (FOUC fix-এর মূল অংশ)
const cdnUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

// ============================================================
// Helper — CDN request কিনা?
// ============================================================
function isCDNRequest(url) {
  return url.includes('cdn.tailwindcss.com') ||
         url.includes('cdn.jsdelivr.net') ||
         url.includes('cdnjs.cloudflare.com') ||
         url.includes('fonts.googleapis.com') ||
         url.includes('fonts.gstatic.com');
}

// ============================================================
// INSTALL — সব cache প্রস্তুত করি
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Service Worker v4 installing...');

  event.waitUntil(
    Promise.all([
      // নিজের static ফাইল
      caches.open(CACHE_NAME).then(cache =>
        Promise.all(urlsToCache.map(url =>
          cache.add(url).catch(err => console.log('⚠️ Static cache fail:', url, err))
        ))
      ),
      // CDN library গুলো — FOUC fix-এর মূল অংশ
      caches.open(CDN_CACHE).then(cache =>
        Promise.all(cdnUrlsToCache.map(url =>
          cache.add(url).catch(err => console.log('⚠️ CDN cache fail:', url, err))
        ))
      )
    ])
    .then(() => {
      console.log('✅ Service Worker v4 installed');
      return self.skipWaiting();
    })
    .catch(err => console.log('❌ Install failed:', err))
  );
});

// ============================================================
// ACTIVATE — পুরনো cache মুছি
// ============================================================
self.addEventListener('activate', event => {
  console.log('🔧 Service Worker v4 activating...');

  const validCaches = [CACHE_NAME, STATIC_CACHE, DYNAMIC_CACHE, CDN_CACHE];

  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.map(name => {
          if (!validCaches.includes(name)) {
            console.log('🗑️ Removing old cache:', name);
            return caches.delete(name);
          }
        })
      ))
      .then(() => {
        console.log('✅ Service Worker v4 activated');
        return self.clients.claim();
      })
      .catch(err => console.log('❌ Activate failed:', err))
  );
});

// ============================================================
// FETCH — request ধরার মূল logic
// ============================================================
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // ❌ Supabase API calls — সবসময় live (cache করব না)
  if (url.includes('.supabase.co')) return;

  // ❌ Chrome extension
  if (url.startsWith('chrome-extension://')) return;

  // ✅ CDN — cache-first strategy (FOUC fix)
  if (isCDNRequest(url)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          // Background-এ নতুন version fetch করব
          const fetchPromise = fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached);

          // Cache-এ থাকলে সাথে সাথে দাও (FOUC হবে না)
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // ✅ বাকি সব — network-first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache =>
            cache.put(event.request, clone).catch(() => {})
          );
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;

          // HTML request হলে index.html fallback
          const accept = event.request.headers.get('accept') || '';
          if (accept.includes('text/html')) {
            return caches.match('./index.html');
          }

          return new Response('অফলাইন — ইন্টারনেট সংযোগ নেই', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
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
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
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

console.log('✅ Service Worker v4 loaded');
