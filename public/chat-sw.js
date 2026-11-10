// Driven Chat service worker: shows pushes and opens the right room on tap.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // If the app is open and in front, it plays its own sound and pop-up.
      if (list.some((c) => c.visibilityState === "visible" && c.focused)) return;
      return self.registration.showNotification(data.title || "Driven Chat", {
        body: data.body || "New message",
        tag: data.tag || "driven-chat",
        icon: "/favicon-driven.png",
        badge: "/favicon-driven.png",
        renotify: true,
        data: { roomId: data.roomId || "" },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const roomId = (event.notification.data && event.notification.data.roomId) || "";
  const url = "/?chat=" + encodeURIComponent(roomId);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.postMessage({ type: "open-room", roomId });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
