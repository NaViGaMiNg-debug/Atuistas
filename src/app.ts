import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { db } from "./db/database.js";
import { authRoutes } from "./routes/auth.routes.js";
import { amigosRoutes } from "./routes/amigos.routes.js";
import { mensajesRoutes } from "./routes/mensajes.routes.js";
import { gruposRoutes } from "./routes/grupos.routes.js";
import { contenidoRoutes } from "./routes/contenido.routes.js";
import { reelsRoutes } from "./routes/reels.routes.js";
import { historiasRoutes } from "./routes/historias.routes.js";
import { perfilRoutes } from "./routes/perfil.routes.js";
import { desarrolladorRoutes } from "./routes/desarrollador.routes.js";
import { apodosRoutes } from "./routes/apodos.routes.js";
import { mediosRoutes } from "./routes/medios.routes.js";
import { migrarEsquema } from "./db/migrations.js";
import { notificacionesRoutes } from "./routes/notificaciones.routes.js";
import { wsRoutes } from "./routes/ws.routes.js";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const app = Fastify({
    logger: true,
    // Detras del tunel de Cloudflare: respeta X-Forwarded-Proto/Host para
    // que la app vea https://atuistas.com aunque escuche en http local.
    trustProxy: true
});

// Limpieza de lo que caduca: estados, servidores temporales y mensajes viejos
// de los canales que tienen retencion. Va una vez al arrancar y luego cada hora.
async function limpiarContenidoExpirado() {
    await db.query("DELETE FROM estados WHERE expira_en <= NOW()");
    await db.query("DELETE FROM grupos WHERE desaparece_en <= NOW()");

    // Cada canal aplica su propia retención; NULL significa que no se borra nunca.
    await db.query(`
        DELETE FROM mensajes_grupo mg
        USING canales_grupo c
        WHERE mg.canal_id = c.id
          AND c.retencion_horas IS NOT NULL
          AND mg.creado_en <= NOW() - make_interval(hours => c.retencion_horas)
    `);
}

await app.register(cors, {
    origin: true,
    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],
    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ]
});

await app.register(multipart, {
    // Fotos y videos: 50MB por archivo y 10 como mucho de una vez, que si no
    // se llena el disco en dos dias.
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 10
    }
});

// Las fotos y videos subidos se sirven tal cual desde uploads/.
await app.register(fastifyStatic, {
    root: path.join(
        process.cwd(),
        "uploads"
    ),
    prefix: "/uploads/"
});

await app.register(fastifyStatic, {
    root: path.join(
        process.cwd(),
        "public"
    ),
    prefix: "/",
    decorateReply: false,
    // El HTML y el service worker siempre frescos: si el navegador cachea el
    // index o el sw viejos, la app instalada no ve nunca la version nueva.
    // El JS/CSS con ?v= llevan su propia firma, esos si se pueden cachear.
    setHeaders: (respuesta, ruta) => {
        if (/(index\.html|sw\.js|app\.webmanifest)$/.test(ruta)) {
            respuesta.header("Cache-Control", "no-store");
        }
    }
});

app.get("/", async (_request, reply) => {
    // Sin cache: es la puerta de entrada y si se cachea, la app instalada
    // no ve nunca el HTML nuevo (y con el, ni el JS nuevo).
    reply.header("Cache-Control", "no-store");
    return reply.sendFile(
        "index.html",
        path.join(process.cwd(), "public")
    );
});

await app.register(websocket);
await app.register(authRoutes);
await app.register(amigosRoutes);
await app.register(mensajesRoutes);
await app.register(gruposRoutes);
await app.register(contenidoRoutes);
await app.register(reelsRoutes);
await app.register(historiasRoutes);
await app.register(perfilRoutes);
await app.register(desarrolladorRoutes);
await app.register(apodosRoutes);
await app.register(mediosRoutes);
await app.register(notificacionesRoutes);
await app.register(wsRoutes);

const start = async () => {
    try {
        await db.query("SELECT 1");
        await migrarEsquema();

        await limpiarContenidoExpirado();
        const intervaloLimpieza = setInterval(() => {
            limpiarContenidoExpirado().catch((error) => {
                app.log.error(error, "No se pudo limpiar el contenido expirado");
            });
        }, 60 * 60 * 1000);
        intervaloLimpieza.unref();

        console.log("Conexión con PostgreSQL correcta");

        await app.listen({
            port: env.port,
            host: env.host
        });

        console.log(
            `Atuistas escuchando en http://${env.host}:${env.port}`
        );

    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

start();