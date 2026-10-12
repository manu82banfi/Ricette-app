/* ========================================================================
   SERVICE WORKER - Ricette PWA
   - Mette in cache i file statici (HTML, CSS, JS, icone)
   - NON mette in cache le chiamate a JSONBin (dati sempre freschi)
   - Funziona offline per le pagine già visitate
   ======================================================================== */

const CACHE_NAME = 'ricette-pwa-v9';

const PRECACHE_URLS = [
  './',
  './index.html',
  './index2.html',
  './ricetta.html',
  './modifica-ricetta.html',
  './ingredienti.html',
  './modifica-ingrediente.html',
  './preparazioni-base.html',
  './modifica-preparazione-base.html',
  './planner.html',
  './modifica-ordine.html',
  './impostazioni.html',
  './css/style.css',
  './js/script.js',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png'
];

/* INSTALL: mette in cache i file base */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('SW: alcuni file non sono stati messi in cache', err);
      }))
      .then(() => self.skipWaiting())
  );
});

/* ACTIVATE: elimina cache vecchie */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* FETCH: strategia mista */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  /* 1) NON toccare JSONBin (dati sempre live) */
  if (url.hostname.includes('jsonbin.io')) {
    return;
  }

  /* 1b) jsPDF: cache-first (una volta scaricato, resta offline) */
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return resp;
        });
      })
    );
    return;
  }

  /* 2) NON toccare richieste non-GET */
  if (req.method !== 'GET') {
    return;
  }

  /* 3) HTML: network-first (pagina sempre aggiornata se online) */
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* 4) Tutto il resto (CSS, JS, immagini): cache-first */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return resp;
      });
    })
  );
});