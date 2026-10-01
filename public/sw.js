self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "Atuistas", body: event.data?.text() || "Tienes una notificación nueva." };
    }

    event.waitUntil(self.registration.showNotification(data.title || "Atuistas", {
        body: data.body || "Tienes una notificación nueva.",
        tag: data.tag || undefined,
        data: data.data || {},
        icon: "/icon.svg",
        badge: "/icon.svg"
    }));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil((async () => {
        const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clientsList) {
            if ("focus" in client) {
                await client.focus();
                return;
            }
        }
        await self.clients.openWindow("/");
    })());
});
