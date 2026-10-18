// ============================================================
// Service Worker — AMC অর্থনীতি হাজিরা সিস্টেম
// Version: v8.0 (Session Filter + Exact Match + PWA + Academic)
// Updated: 2026-10-17
// ============================================================

const CACHE_NAME    = 'amc-attendance-v8';
const STATIC_CACHE  = 'amc-static-v8';
const DYNAMIC_CACHE = 'amc-dynamic-v8';
const CDN_CACHE     = 'amc-cdn-v8';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

const cdnUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

function isCDNRequest(url) {
  return url.includes('cdn.tailwindcss.com') ||
         url.includes('cdn.jsdelivr.net') ||
         url.includes('cdnjs.cloudflare.com') ||
         url.includes('fonts.googleapis.com') ||
         url.includes('fonts.gstatic.com');
}

// ============================================================
// INSTALL
// ============================================================
self.addEventListener('install', event => {
  console.log('🔧 Service Worker v8 installing...');
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache =>
        Promise.all(urlsToCache.map(url =>
          cache.add(url).catch(err => console.log('⚠️ Static cache fail:', url, err))
        ))
      ),
      caches.open(CDN_CACHE).then(cache =>
        Promise.all(cdnUrlsToCache.map(url =>
          cache.add(url).catch(err => console.log('⚠️ CDN cache fail:', url, err))
        ))
      )
    ])
    .then(() => {
      console.log('✅ Service Worker v8 installed');
      return self.skipWaiting();
    })
    .catch(err => console.log('❌ Install failed:', err))
  );
});

// ============================================================
// ACTIVATE — পুরোনো ক্যাশ মুছে ফেলা
// ============================================================
self.addEventListener('activate', event => {
  console.log('🔧 Service Worker v8 activating...');
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
        console.log('✅ Service Worker v8 activated');
        return self.clients.claim();
      })
      .catch(err => console.log('❌ Activate failed:', err))
  );
});

// ============================================================
// FETCH — Network First with Cache Fallback
// ============================================================
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  
  // Supabase API কল ক্যাশ করা যাবে না
  if (url.includes('.supabase.co')) return;
  
  // Chrome extension বাদ
  if (url.startsWith('chrome-extension://')) return;

  // CDN রিকোয়েস্ট — Cache First
  if (isCDNRequest(url)) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // বাকি সব রিকোয়েস্ট — Network First with Cache Fallback
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
// MESSAGE — ক্যাশ ক্লিয়ার
// ============================================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
  }
});

console.log('✅ Service Worker v8 loaded');
