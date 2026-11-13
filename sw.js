/* Ludoteca – service worker: funciona sin conexión y guarda las portadas. */
const VERSION = 'ludoteca-v6';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const COVERS = 'ludo-covers';
const FONTS = 'ludo-fonts';
const COVER_HOSTS = ['images.launchbox-app.com', 'upload.wikimedia.org', 'art.gametdb.com', 'image.tmdb.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('ludoteca-') && k !== VERSION).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Portadas: primero lo guardado (las cajas de tu colección), si no, la red
  if (COVER_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(COVERS).then((c) => c.match(req.url)).then((hit) => hit || fetch(req)));
    return;
  }

  // Tipografías
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // Catálogo de juegos: lo guardado al momento y se actualiza por detrás
  if (url.pathname.includes('/data/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // La app: red primero para estar al día, y si no hay conexión, lo guardado
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
