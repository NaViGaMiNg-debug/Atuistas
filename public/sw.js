/* SERVICE WORKER */

const VERSION = "v59";
const CACHE = `atuistas-${VERSION}`;

const RECURSOS = [
    "/",
    "/index.html",
    "/style.css?v=59",
    "/app.js?v=59",
    "/data/emojis.js",
    "/qratuistas.svg",
    "/app.webmanifest",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png"
];

function cachearTodo(cache) {
    return Promise.all(RECURSOS.map((recurso) =>
        cache.add(recurso).catch(() => null)
    ));
}

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then(cachearTodo));
    // Forzar activación inmediata para no quedarse atrapado detrás de un SW antiguo
    self.skipWaiting();
});

self.addEventListener("message", (event) => {
    if (!event.data || event.data.tipo !== "activar-version") return;

    event.waitUntil((async () => {
        await self.skipWaiting();
        const clientes = await self.clients.matchAll({ type: "window" });
        for (const cliente of clientes) {
            cliente.postMessage({ tipo: "version-aplicada" });
        }
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(
            nombres.filter((nombre) => nombre.startsWith("atuistas-") && nombre !== CACHE)
                .map((nombre) => caches.delete(nombre))
        );
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const solicitud = event.request;

    if (solicitud.method !== "GET") return;

    const url = new URL(solicitud.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/ws")) {
        return;
    }

    if (solicitud.mode === "navigate") {
        event.respondWith((async () => {
            try {
                return await fetch(solicitud);
            } catch (error) {
                const cache = await caches.open(CACHE);
                return (await cache.match("/index.html")) || Response.error();
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);

        try {
            const respuesta = await fetch(solicitud);
            if (respuesta && respuesta.ok) {
                cache.put(solicitud, respuesta.clone());
            }
            return respuesta;
        } catch (error) {
            return (await cache.match(solicitud)) || Response.error();
        }
    })());
});

/* NOTIFICACIONES PUSH */

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        const texto = event.data && typeof event.data.text === "function"
            ? event.data.text()
            : "Notificacion nueva.";
        data = { title: "Atuistas", body: texto };
    }

    event.waitUntil(self.registration.showNotification(data.title || "Atuistas", {
        body: data.body || "Tienes una notificación nueva.",
        tag: data.tag || undefined,
        renotify: false,
        data: data.data || {},
        icon: "/icon-192.png",
        badge: "/icon-192.png"
    }));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const destino = data.type === "mensaje_privado" && data.usuarioId
        ? `/?chat=${encodeURIComponent(data.usuarioId)}`
        : "/";
    event.waitUntil((async () => {
        const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clientsList) {
            if ("focus" in client) {
                await client.focus();
                client.postMessage({ tipo: "abrir-notificacion", data, destino });
                return;
            }
        }
        await self.clients.openWindow(destino);
    })());
});

