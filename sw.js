// Caches the app itself so it opens with no signal. Data always goes to the network (and the
// phone queue in app.js covers writes while offline).
const CACHE = 'declan-app-2026.11.04.0847'; // stamped by release.sh
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'deductions.js', 'statement.js', 'ship-guide.html', 'guide/box-small.jpg', 'guides.html', 'guide-start.html', 'guide-getin.html', 'guide-inspect.html', 'guide-safety.html', 'guide-meetup.html', 'guide-mint.html', 'guide-help.html', 'guide.css', 'guide-kit.js', 'config.js', 'manifest.webmanifest', 'vendor/supabase.min.js', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/logo.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase calls pass straight through
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('./'))));
});

// Push notifications (meetup booked / one hour to go).
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Cash for Phones', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag, data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
