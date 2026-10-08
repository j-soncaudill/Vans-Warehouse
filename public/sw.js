// Floorcast service worker:
//   • keeps the app's own files so Floorcast opens with no signal (offline mode)
//   • shows admin alerts (Web Push)
// It only ever touches this site's own files. Database and photo requests go
// straight to Supabase; the app keeps its own offline copy of the list.

const CACHE = "floorcast-app-v1";
const SHELL = ["/", "/index.html", "/app.js", "/app.css", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("floorcast-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so an update shows up as soon as there's signal; the saved copy when there isn't.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req.mode === "navigate" ? "/index.html" : req, res.clone()).catch(() => undefined);
        return res;
      } catch (err) {
        const hit = req.mode === "navigate" ? await cache.match("/index.html") : await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "Floorcast", {
      body: msg.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: msg.tag || "floorcast",
      data: { url: msg.url || "/reports" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/reports", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of open) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
