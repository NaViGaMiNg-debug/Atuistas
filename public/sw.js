/* ========================================
   SERVICE WORKER
   Dos funciones: avisar de las notificaciones Push y mantener al dÃ­a la
   instalacion de la PWA.

   La version se sube a mano (VERSION) al desplegar cambios: el navegador
   compara los ficheros con esta version, borra la cache antigua y descarga
   lo nuevo. Asi la app instalada se actualiza sola, sin reinstalarla.
   ======================================== */

const VERSION = "v17";
const CACHE = `atuistas-${VERSION}`;

// Solo se cachean estos ficheros. Todo lo demas (API, subidas) va directo a
// la red, porque los datos de los usuarios no se pueden quedar guardados.
const RECURSOS = [
    "/",
    "/index.html",
    "/style.css",
    "/app.js",
    "/data/emojis.js",
    "/qratuistas.png",
    "/app.webmanifest",
    "/icon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // addAll falla entero si un recurso falla; se cachea uno a uno para que
        // un icono ausente no impida instalar el service worker entero.
        await Promise.allSettled(RECURSOS.map((recurso) => cache.add(recurso)));
    })());
});

// La pagina avisa que ya se puede aplicar la version nueva. Se responde a
// los clientes que siguen con la version antigua y se toma el control, de
// modo que recarguen y yaSirvan los ficheros nuevos.
self.addEventListener("message", (event) => {
    if (event.data?.tipo !== "activar-version") return;

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

    // API y subidas: siempre desde la red. Si no hay conexion, la app avisa
    // con su propio mensaje de error en vez de mostrar datos rancios.
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/ws")) {
        return;
    }

    // Navegacion: primero la red para traer el HTML al dia, y si no hay
    // conexion se sirve el guardado para que la app abra al menos.
    if (solicitud.mode === "navigate") {
        event.respondWith((async () => {
            try {
                return await fetch(solicitud);
            } catch {
                const cache = await caches.open(CACHE);
                return (await cache.match("/index.html")) || Response.error();
            }
        })());
        return;
    }

    // Ficheros del programa (app.js, style.css...): primero la red y la cache
    // solo hace de copia de seguridad. Servirlos desde cache primero hacia
    // que la app instalada se quedara eternamente en una version vieja.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);

        try {
            const respuesta = await fetch(solicitud);
            if (respuesta && respuesta.ok) {
                cache.put(solicitud, respuesta.clone());
            }
            return respuesta;
        } catch {
            // Sin conexion se sirve la ultima copia buena.
            return (await cache.match(solicitud)) || Response.error();
        }
    })());
});

/* ========================================
   NOTIFICACIONES PUSH
   ======================================== */

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: "Atuistas", body: event.data?.text() || "Tienes una notificaciÃ³n nueva." };
    }

    event.waitUntil(self.registration.showNotification(data.title || "Atuistas", {
        body: data.body || "Tienes una notificaciÃ³n nueva.",
        // El tag viene por persona: al llegar otro aviso del mismo chat se
        // sustituye este en vez de apilar una notificaciÃ³n nueva.
        tag: data.tag || undefined,
        renotify: false,
        data: data.data || {},
        icon: "/icon-192.png",
        badge: "/icon-192.png"
    }));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    // data trae el tipo y los ids del aviso: un mensaje privado abre el chat
    // de quien lo escribiÃ³, el resto lleva a la pantalla principal.
    const data = event.notification.data || {};
    const destino = data.type === "mensaje_privado" && data.usuarioId
        ? `/?chat=${encodeURIComponent(data.usuarioId)}`
        : "/";
    event.waitUntil((async () => {
        const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clientsList) {
            if ("focus" in client) {
                await client.focus();
                // Con la app ya abierta le decimos a quÃ© chat saltar.
                client.postMessage({ tipo: "abrir-notificacion", data, destino });
                return;
            }
        }
        await self.clients.openWindow(destino);
    })());
});

