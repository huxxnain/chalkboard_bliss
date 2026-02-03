// Service Worker Install Event
self.addEventListener("install", function (event) {
  console.log("Service Worker installing...");
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Service Worker Activate Event
self.addEventListener("activate", function (event) {
  console.log("Service Worker activating...");
  // Take control of all pages immediately
  event.waitUntil(self.clients.claim());
  console.log("Service Worker activated and controlling clients");
});

// Push Event Listener
self.addEventListener("push", function (event) {
  console.log("Push event received!", event);
  console.log("Push data:", event.data ? "Present" : "Not present");
  
  let data = {};
  if (event.data) {
    try {
      const text = event.data.text();
      console.log("Push data text:", text);
      data = JSON.parse(text);
      console.log("Push event with parsed data: ", data);
    } catch (e) {
      console.error("Error parsing push data:", e);
      const text = event.data.text();
      data = {
        title: "Notification",
        body: text || "You have a new notification",
        icon: "/web-app-manifest-192x192.png",
      };
    }
  } else {
    console.log("No push data, using defaults");
    data = {
      title: "Notification",
      body: "You have a new notification",
      icon: "/web-app-manifest-192x192.png",
    };
  }

  const options = {
    body: data.body || "You have a new notification",
    icon: data.icon || "/web-app-manifest-192x192.png",
    badge: data.icon || "/web-app-manifest-192x192.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: "2",
      url: data.url || "/",
    },
    requireInteraction: false,
    tag: "notification",
    silent: false,
  };
  
  console.log("Showing notification with options:", options);
  
  event.waitUntil(
    self.registration.showNotification(data.title || "Notification", options)
      .then(() => {
        console.log("Notification shown successfully");
      })
      .catch((error) => {
        console.error("Error showing notification:", error);
      })
  );
});

self.addEventListener("notificationclick", function (event) {
  console.log("Notification click received.", event);
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || "/";
  
  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Check if there's already a window/tab open with the target URL
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        // If no existing window, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
