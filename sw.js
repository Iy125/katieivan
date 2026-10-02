// Service worker: makes launches after the first near-instant and lets the app shell open offline.
// VERSION must be bumped when icons, manifest or the SDK version change (index.html itself is network-first).
const VERSION = 'v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
const SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(['./', './index.html', './manifest.webmanifest']);   // must succeed
    // Icons and SDK are best-effort: a missing icon must not break install. SDK fetched with CORS → non-opaque, cacheable.
    const optional = [...SHELL.filter(u => u.includes('icon')), ...SDK];
    await Promise.all(optional.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && !r.redirected && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Never touch Firestore / Auth traffic, including Firebase Hosting's reserved /__/ auth handler on this origin.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('firebaseapp.com') || url.hostname.endsWith('google.com') || url.pathname.startsWith('/__/')) return;

  const isShellPage = e.request.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));
  if (isShellPage) {
    // Network-first so a new deploy shows up on next launch; fall back to cache when offline.
    // Never cache a redirected response: serving one to a navigation is a network error.
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try { const r = await fetch(e.request); if (r.ok && !r.redirected) c.put('./index.html', r.clone()); return r; }
      catch { return (await c.match('./index.html', { ignoreVary: true })) || Response.error(); }
    })());
    return;
  }
  if (url.origin === location.origin || url.hostname === 'www.gstatic.com') {
    // Cache-first for static assets and the SDK.
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(e.request, { ignoreVary: true }); if (hit) return hit;
      const r = await fetch(e.request); if (r.ok && !r.redirected) c.put(e.request, r.clone()); return r;
    })());
  }
});
