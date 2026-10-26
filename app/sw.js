// Offline support for the app files only. Requests to the Google Sheet are never cached,
// so financial data never sits in Cache Storage (the app keeps its own cache in localStorage).
const CACHE = "money-plan-shell-v1";
const SHELL = ["./", "index.html", "css/app.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "js/main.js", "js/app.js", "js/api.js", "js/store.js", "js/calc.js", "js/format.js", "js/motion.js", "js/charts.js", "js/forms.js", "js/actions.js",
  "js/views/common.js", "js/views/payday.js", "js/views/month.js", "js/views/funds.js", "js/views/trends.js"];
const CDN = ["https://cdnjs.cloudflare.com/", "https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === location.origin) {
    // network first so a new deploy shows up right away; the cache is the offline fallback
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
  } else if (CDN.some(p => req.url.startsWith(p))) {
    // versioned CDN files never change: cache first
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});
