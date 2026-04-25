// Minimal service worker — network-first for HTML/JS/CSS, cache fallback.
const CACHE = "crm-v189";
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

self.addEventListener("push", (e) => {
  let data = { title: "CRM", body: "Новое уведомление", url: "/", tag: undefined };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (_) {
    try { data.body = e.data ? e.data.text() : data.body; } catch (_e) {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.focus(); if ("navigate" in c) c.navigate(url).catch(() => {}); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
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
