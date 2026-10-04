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
    logger: true
});

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
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 10
    }
});

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
    decorateReply: false
});

app.get("/", async (_request, reply) => {
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