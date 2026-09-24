// ============================================================
// Service Worker — AMC অর্থনীতি হাজিরা সিস্টেম
// Version: v2.0 (Stable)
// ============================================================

const CACHE_NAME = 'amc-attendance-v2';

// শুধু এই ফাইলগুলো cache করব — অবশ্যই বিদ্যমান থাকতে হবে
const urlsToCache = [
  './',
  './index.html'
];

// ============================================================
// INSTALL — প্রথমবার cache সেটআপ
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache opened:', CACHE_NAME);
        // addAll এর বদলে একটা একটা করে যোগ করছি, যাতে একটা fail করলে সব fail না হয়
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => {
              console.log('⚠️ Cache add failed for:', url, err);
            });
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker installed');
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
  console.log('🔧 Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Removing old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker activated');
        return self.clients.claim();
      })
      .catch(err => {
        console.log('❌ Activate failed:', err);
      })
  );
});

// ============================================================
// FETCH — নেটওয়ার্ক থেকে লোড, fallback হিসাবে cache
// ============================================================
self.addEventListener('fetch', event => {
  // শুধু GET রিকোয়েস্ট
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  
  // Supabase API কল cache করব না
  if (url.includes('supabase.co')) return;
  
  // CDN (Tailwind, jsPDF, etc.) cache করব না
  if (url.includes('cdn.') || url.includes('cdnjs.') || url.includes('jsdelivr')) return;
  
  // Network-first strategy: আগে নেটওয়ার্ক চেষ্টা, fail হলে cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // সফল হলে cache-এ কপি রাখি
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseClone).catch(() => {});
            });
        }
        return response;
      })
      .catch(() => {
        // নেটওয়ার্ক fail হলে cache থেকে দাও
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // cache-এও না থাকলে offline page
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
// MESSAGE — ক্লায়েন্ট থেকে মেসেজ রিসিভ
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ Service Worker script loaded');