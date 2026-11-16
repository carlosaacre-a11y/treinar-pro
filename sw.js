self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Receber notificações enviadas pelo servidor
self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: "Treinar Pro",
      body: event.data ? event.data.text() : "Está na hora da sua refeição!"
    };
  }

  const title = data.title || "Treinar Pro";

  const options = {
    body: data.body || "Está na hora da sua refeição!",
    icon: "./logo.png.jpg",
    badge: "./logo.png.jpg",
    tag: data.tag || "treinar-pro-refeicao",
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || "./"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Abrir o Treinar Pro ao tocar na notificação
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url = event.notification.data?.url || "./";

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    })
  );
});
