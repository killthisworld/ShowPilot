// Show Pilot service worker (job 73, "On the road" stage 9).
//
// Only one job: let the app open with no signal. Pages load from the
// network first and fall back to the last copy of the app; the built files
// under /assets/ (their names change on every deploy) are kept once fetched.
// Nothing else is touched: no API calls, no Supabase, no other sites. The
// app keeps its own copy of the day sheet, contacts and guest list.

const VERSION = "sp-shell-v2";
const SHELL = ["/", "/index.html", "/site.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Pages: the network, else the last copy of the app.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put("/index.html", res.clone()));
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Built files: keep them once fetched.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});

// Lock-screen alerts (job 305): show what send-push sent. The payload is
// { title, body, url, tag }; the same tag replaces an older alert.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Show Pilot", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Show Pilot", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: d.url || "/" },
  }));
});

// Tapping an alert (or a reminder) opens Show Pilot at its page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      if (open) return open.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : c)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    })
  );
});
