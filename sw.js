// ============================================================
// Service Worker — AMC অর্থনীতি হাজিরা সিস্টেম
// ============================================================
const CACHE_NAME = 'amc-attendance-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ইনস্টলেশনের সময় ক্যাশে সংরক্ষণ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// অ্যাক্টিভেশনের সময় পুরনো ক্যাশে মুছুন
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ফেচ ইভেন্ট — অফলাইন ক্যাশিং
self.addEventListener('fetch', event => {
  // শুধু GET রিকোয়েস্ট ক্যাশে করব
  if (event.request.method !== 'GET') return;
  
  // Supabase API কল ক্যাশে করব না
  if (event.request.url.includes('supabase.co')) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // সফল হলে ক্যাশে কপি রাখি
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // নেটওয়ার্ক ফেইল হলে ক্যাশে থেকে দাও
        return caches.match(event.request);
      })
  );
});