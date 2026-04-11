// Minimal service worker — network-first for HTML/JS/CSS, cache fallback.
const CACHE = "crm-v74";
const SHELL = ["/", "/app.js", "/app.css", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Don't cache API calls — they need to be live
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/messages") ||
      url.pathname.startsWith("/folders") || url.pathname.startsWith("/me") ||
      url.pathname.startsWith("/admin/") || url.pathname.startsWith("/attachments") ||
      url.pathname.startsWith("/mailboxes")) {
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
