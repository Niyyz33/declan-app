// Caches the app itself so it opens with no signal. Data always goes to the network (and the
// phone queue in app.js covers writes while offline).
const CACHE = 'declan-app-2026.11.03.1914'; // stamped by release.sh
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'deductions.js', 'config.js', 'manifest.webmanifest', 'vendor/supabase.min.js', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/logo.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase calls pass straight through
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('./'))));
});
