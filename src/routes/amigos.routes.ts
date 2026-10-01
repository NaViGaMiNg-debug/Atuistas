import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import {
    buscarUsuarios,
    enviarSolicitudAmistad,
    obtenerSolicitudesRecibidas,
    aceptarSolicitudAmistad,
    rechazarSolicitudAmistad,
    obtenerAmigos
} from "../services/amigos.service.js";

export async function amigosRoutes(app: FastifyInstance) {

    app.get("/api/amigos/buscar", {
        preHandler: autenticar
    }, async (request, reply) => {

        const query = request.query as {
            texto?: string;
        };

        if (!query.texto) {
            return reply.status(400).send({
                error: "El texto de búsqueda es obligatorio"
            });
        }

        const usuarios = await buscarUsuarios(
            query.texto,
            request.usuario!.id
        );

        return {
            usuarios
        };
    });

    app.post("/api/amigos/solicitud", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {
            const body = request.body as {
                destinatarioId?: string;
            };

            if (!body.destinatarioId) {
                return reply.status(400).send({
                    error: "El destinatario es obligatorio"
                });
            }

            const resultado = await enviarSolicitudAmistad(
                request.usuario!.id,
                body.destinatarioId
            );

            return reply.status(201).send(resultado);

        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al enviar la solicitud";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    app.get("/api/amigos/solicitudes/recibidas", {
        preHandler: autenticar
    }, async (request) => {

        const solicitudes = await obtenerSolicitudesRecibidas(
            request.usuario!.id
        );

        return {
            solicitudes
        };
    });
    
    app.post("/api/amigos/solicitudes/aceptar", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const body = request.body as {
                solicitudId?: string;
            };

            if (!body.solicitudId) {
                return reply.status(400).send({
                    error: "El ID de la solicitud es obligatorio"
                });
            }

            const resultado = await aceptarSolicitudAmistad(
                request.usuario!.id,
                body.solicitudId
            );

            return reply.send(resultado);
        } catch (error) {
            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al aceptar la solicitud";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    app.post("/api/amigos/solicitudes/rechazar", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const body = request.body as {
                solicitudId?: string;
            };

            if (!body.solicitudId) {
                return reply.status(400).send({
                    error: "El ID de la solicitud es obligatorio"
                });
            }

            const resultado = await rechazarSolicitudAmistad(
                request.usuario!.id,
                body.solicitudId
            );

            return reply.send(resultado);
        } catch (error) {
            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al rechazar la solicitud";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    app.get("/api/amigos", {
        preHandler: autenticar
    }, async (request) => {
        const amigos = await obtenerAmigos(
            request.usuario!.id
        );

        return {
            amigos
        };
    });

}