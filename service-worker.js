self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: "防災Sowingからのお知らせ",
        body: event.data.text()
      };
    }
  }

  const title = data.title || "防災Sowingからのお知らせ";

  const options = {
    body: data.body || "新しいお知らせがあります。",
    icon: "/bousai-sowing-app/logo.jpeg",
    badge: "/bousai-sowing-app/logo.jpeg",
    data: {
      url: data.url || "/bousai-sowing-app/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ||
    "/bousai-sowing-app/";

  event.waitUntil(
    clients.openWindow(url)
  );
});
