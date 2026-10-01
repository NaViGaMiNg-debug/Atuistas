import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import {
    obtenerAmigosPerfil,
    obtenerEstadosPerfil,
    obtenerPerfilVisible,
    obtenerPublicacionesPerfil
} from "../services/perfil.service.js";

export async function perfilRoutes(app: FastifyInstance) {
    app.get<{ Params: { usuarioId: string } }>("/api/perfil/:usuarioId", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            return await obtenerPerfilVisible(request.usuario!.id, request.params.usuarioId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar el perfil";
            return reply.code(404).send({ error: message });
        }
    });

    app.get<{ Params: { usuarioId: string } }>("/api/perfil/:usuarioId/publicaciones", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            return { publicaciones: await obtenerPublicacionesPerfil(request.usuario!.id, request.params.usuarioId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar las publicaciones";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { usuarioId: string } }>("/api/perfil/:usuarioId/estados", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            return { estados: await obtenerEstadosPerfil(request.usuario!.id, request.params.usuarioId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los estados";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { usuarioId: string } }>("/api/perfil/:usuarioId/amigos", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            return { amigos: await obtenerAmigosPerfil(request.usuario!.id, request.params.usuarioId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar la lista de amigos";
            return reply.code(400).send({ error: message });
        }
    });
}
