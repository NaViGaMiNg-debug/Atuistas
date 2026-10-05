import { FastifyInstance, FastifyRequest } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import type { UploadFile } from "../services/multimedia.service.js";
import {
    crearEstadoMultimedia,
    crearPublicacionMultimedia
} from "../services/multimedia.service.js";
import {
    alternarCorazon,
    comentarEstado,
    comentarPublicacion,
    crearEstado,
    crearPublicacion,
    eliminarEstado,
    eliminarPublicacion,
    obtenerComentarios,
    obtenerComentariosEstado,
    obtenerEstados,
    obtenerPublicaciones
} from "../services/contenido.service.js";

type Seccion = "amigos" | "publica";
const limiteCuerpoMultimedia = 125 * 1024 * 1024;

function seccionValida(valor: string | undefined): Seccion {
    return valor === "publica" ? "publica" : "amigos";
}

async function leerFormularioMultimedia(request: FastifyRequest) {
    const files: UploadFile[] = [];
    const fields: Record<string, string> = {};
    for await (const part of request.parts({ limits: { files: 10, fields: 4, fileSize: 50 * 1024 * 1024 } })) {
        if (part.type === "file") {
            files.push({
                filename: part.filename,
                mimetype: part.mimetype,
                buffer: await part.toBuffer()
            });
        } else {
            fields[part.fieldname] = String(part.value);
        }
    }
    return { fields, files };
}

export async function contenidoRoutes(app: FastifyInstance) {
    app.post("/api/publicaciones/multimedia", { preHandler: autenticar, bodyLimit: limiteCuerpoMultimedia }, async (request, reply) => {
        try {
            const { fields, files } = await leerFormularioMultimedia(request);
            const mode = fields.tipo;
            if (mode !== "imagenes" && mode !== "video") {
                return reply.code(400).send({ error: "El modo multimedia no es válido" });
            }
            const publicacion = await crearPublicacionMultimedia(
                request.usuario!.id,
                seccionValida(fields.visibilidad),
                mode,
                files,
                fields.texto ?? ""
            );
            return reply.code(201).send({ publicacion });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo crear la publicación";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Querystring: { seccion?: string } }>("/api/publicaciones", { preHandler: autenticar }, async (request) => ({
        publicaciones: await obtenerPublicaciones(request.usuario!.id, seccionValida(request.query.seccion))
    }));

    app.post<{ Body: { texto?: string; visibilidad?: Seccion } }>("/api/publicaciones", { preHandler: autenticar }, async (request, reply) => {
        try {
            const publicacion = await crearPublicacion(
                request.usuario!.id,
                request.body.texto ?? "",
                request.body.visibilidad ?? "amigos"
            );
            return reply.code(201).send({ publicacion });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo publicar";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { publicacionId: string } }>("/api/publicaciones/:publicacionId/comentarios", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { comentarios: await obtenerComentarios(request.usuario!.id, request.params.publicacionId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los comentarios";
            return reply.code(403).send({ error: message });
        }
    });

    app.post<{ Params: { publicacionId: string }; Body: { texto?: string } }>("/api/publicaciones/:publicacionId/comentarios", { preHandler: autenticar }, async (request, reply) => {
        try {
            const comentario = await comentarPublicacion(
                request.usuario!.id,
                request.params.publicacionId,
                request.body.texto ?? ""
            );
            return reply.code(201).send({ comentario });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo comentar";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { publicacionId: string } }>("/api/publicaciones/:publicacionId/corazon", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await alternarCorazon(request.usuario!.id, request.params.publicacionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo actualizar la reacción";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { publicacionId: string } }>("/api/publicaciones/:publicacionId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarPublicacion(request.usuario!.id, request.params.publicacionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar la publicación";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Querystring: { seccion?: string } }>("/api/estados", { preHandler: autenticar }, async (request) => ({
        estados: await obtenerEstados(request.usuario!.id, seccionValida(request.query.seccion))
    }));

    app.post<{ Body: { texto?: string; visibilidad?: Seccion } }>("/api/estados", { preHandler: autenticar }, async (request, reply) => {
        try {
            const estado = await crearEstado(
                request.usuario!.id,
                request.body.texto ?? "",
                request.body.visibilidad ?? "amigos"
            );
            return reply.code(201).send({ estado });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo publicar el estado";
            return reply.code(400).send({ error: message });
        }
    });

    app.post("/api/estados/multimedia", { preHandler: autenticar, bodyLimit: limiteCuerpoMultimedia }, async (request, reply) => {
        try {
            const { fields, files } = await leerFormularioMultimedia(request);
            const mode = fields.tipo;
            if (mode !== "imagen" && mode !== "imagenes" && mode !== "video" && mode !== "audio") {
                return reply.code(400).send({ error: "El tipo de estado no es válido" });
            }
            const estado = await crearEstadoMultimedia(
                request.usuario!.id,
                seccionValida(fields.visibilidad),
                mode,
                files,
                fields.texto ?? ""
            );
            return reply.code(201).send({ estado });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo publicar el estado";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { estadoId: string } }>("/api/estados/:estadoId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarEstado(request.usuario!.id, request.params.estadoId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar el estado";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { estadoId: string } }>("/api/estados/:estadoId/comentarios", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { comentarios: await obtenerComentariosEstado(request.usuario!.id, request.params.estadoId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los comentarios";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { estadoId: string }; Body: { texto?: string } }>(
        "/api/estados/:estadoId/comentarios",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const comentario = await comentarEstado(
                    request.usuario!.id,
                    request.params.estadoId,
                    request.body.texto ?? ""
                );
                return reply.code(201).send({ comentario });
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo comentar";
                return reply.code(400).send({ error: message });
            }
        }
    );
}