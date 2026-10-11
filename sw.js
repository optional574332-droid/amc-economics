// ============================================================
// Service Worker — AMC অর্থনীতি হাজিরা সিস্টেম
// Version: v5.0 (Confirmation Screen + Tracking)
// Updated: 2026-10-11
// ============================================================

const CACHE_NAME    = 'amc-attendance-v5';
const STATIC_CACHE  = 'amc-static-v5';
const DYNAMIC_CACHE = 'amc-dynamic-v5';
const CDN_CACHE     = 'amc-cdn-v5';

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

self.addEventListener('install', event => {
  console.log('🔧 Service Worker v5 installing...');
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
      console.log('✅ Service Worker v5 installed');
      return self.skipWaiting();
    })
    .catch(err => console.log('❌ Install failed:', err))
  );
});

self.addEventListener('activate', event => {
  console.log('🔧 Service Worker v5 activating...');
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
        console.log('✅ Service Worker v5 activated');
        return self.clients.claim();
      })
      .catch(err => console.log('❌ Activate failed:', err))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  if (url.includes('.supabase.co')) return;
  if (url.startsWith('chrome-extension://')) return;

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

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
  }
});

console.log('✅ Service Worker v5 loaded');
