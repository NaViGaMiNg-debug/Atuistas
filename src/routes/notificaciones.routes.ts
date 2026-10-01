import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import {
    listarNotificaciones,
    marcarNotificacionLeida,
    marcarTodasLeidas,
    obtenerConfiguracionNotificaciones,
    actualizarConfiguracionNotificaciones
} from "../services/notificaciones.service.js";
import {
    borrarSuscripcionPush,
    guardarSuscripcionPush,
    obtenerClavePublicaPush
} from "../services/push.service.js";

export async function notificacionesRoutes(app: FastifyInstance) {
    app.get("/api/push/clave-publica", async (_request, reply) => {
        try {
            return { clavePublica: await obtenerClavePublicaPush() };
        } catch {
            return reply.code(503).send({ error: "Las notificaciones del dispositivo no están disponibles" });
        }
    });

    app.post<{ Body: { dispositivoId?: string; suscripcion?: { endpoint: string; keys: { p256dh: string; auth: string } } } }>("/api/push/suscripcion", { preHandler: autenticar }, async (request, reply) => {
        try {
            if (!request.body.dispositivoId || !request.body.suscripcion) {
                return reply.code(400).send({ error: "Faltan datos de la suscripción" });
            }
            return await guardarSuscripcionPush(
                request.usuario!.id,
                request.body.dispositivoId,
                request.body.suscripcion
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo activar Push";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Body: { dispositivoId?: string } }>("/api/push/suscripcion", { preHandler: autenticar }, async (request) =>
        borrarSuscripcionPush(request.usuario!.id, request.body?.dispositivoId ?? "")
    );

    app.get("/api/notificaciones/configuracion", { preHandler: autenticar }, async (request) => ({
        configuracion: await obtenerConfiguracionNotificaciones(request.usuario!.id)
    }));

    app.put<{ Body: Record<string, unknown> }>("/api/notificaciones/configuracion", { preHandler: autenticar }, async (request, reply) => {
        try {
            const configuracion = await actualizarConfiguracionNotificaciones(
                request.usuario!.id,
                request.body
            );
            return { configuracion };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo guardar la configuración";
            return reply.code(400).send({ error: message });
        }
    });

    app.get("/api/notificaciones", { preHandler: autenticar }, async (request) =>
        listarNotificaciones(request.usuario!.id)
    );

    app.post("/api/notificaciones/leer-todas", { preHandler: autenticar }, async (request) =>
        marcarTodasLeidas(request.usuario!.id)
    );

    app.post<{ Params: { notificacionId: string } }>("/api/notificaciones/:notificacionId/leer", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await marcarNotificacionLeida(request.usuario!.id, request.params.notificacionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo actualizar la notificación";
            return reply.code(404).send({ error: message });
        }
    });
}