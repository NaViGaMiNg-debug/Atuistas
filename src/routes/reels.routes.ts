import { FastifyInstance, FastifyRequest } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import type { UploadFile } from "../services/multimedia.service.js";
import {
    alternarLikeReel,
    comentarReel,
    crearReel,
    eliminarReel,
    obtenerComentariosReel,
    obtenerMisReels,
    obtenerReel,
    obtenerReels,
    obtenerReelsDeUsuario
} from "../services/reels.service.js";

type Seccion = "amigos" | "publica";
const limiteCuerpoReel = 125 * 1024 * 1024;

function seccionValida(valor: string | undefined): Seccion {
    return valor === "publica" ? "publica" : "amigos";
}

// Un reel es un único vídeo, así que aquí solo se acepta un archivo.
async function leerFormularioReel(request: FastifyRequest) {
    const files: UploadFile[] = [];
    const fields: Record<string, string> = {};
    for await (const part of request.parts({ limits: { files: 1, fields: 3, fileSize: 50 * 1024 * 1024 } })) {
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

export async function reelsRoutes(app: FastifyInstance) {
    // Subir un reel: título obligatorio y un vídeo de 90 segundos como mucho.
    app.post("/api/reels", { preHandler: autenticar, bodyLimit: limiteCuerpoReel }, async (request, reply) => {
        try {
            const { fields, files } = await leerFormularioReel(request);
            const reel = await crearReel(
                request.usuario!.id,
                fields.titulo ?? "",
                seccionValida(fields.visibilidad),
                files
            );
            return reply.code(201).send({ reel });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo subir el reel";
            return reply.code(400).send({ error: message });
        }
    });

    // Feed horizontal: en "publica" solo lo público, en "amigos" también el
    // propio y el de los amigos.
    app.get<{ Querystring: { seccion?: string } }>("/api/reels", { preHandler: autenticar }, async (request) => ({
        reels: await obtenerReels(request.usuario!.id, seccionValida(request.query.seccion))
    }));

    // Los reels de la cuenta, para la tira de Cuenta > Publicaciones.
    // Reels de un usuario concreto, para su perfil.
    app.get<{ Params: { usuarioId: string } }>("/api/usuarios/:usuarioId/reels", { preHandler: autenticar }, async (request) => ({
        reels: await obtenerReelsDeUsuario(request.usuario!.id, request.params.usuarioId)
    }));
    app.get("/api/reels/mios", { preHandler: autenticar }, async (request) => ({
        reels: await obtenerMisReels(request.usuario!.id)
    }));

    app.get<{ Params: { reelId: string } }>("/api/reels/:reelId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { reel: await obtenerReel(request.usuario!.id, request.params.reelId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar el reel";
            return reply.code(403).send({ error: message });
        }
    });

    app.post<{ Params: { reelId: string } }>("/api/reels/:reelId/like", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await alternarLikeReel(request.usuario!.id, request.params.reelId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo guardar el corazón";
            return reply.code(403).send({ error: message });
        }
    });

    app.get<{ Params: { reelId: string } }>("/api/reels/:reelId/comentarios", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { comentarios: await obtenerComentariosReel(request.usuario!.id, request.params.reelId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los comentarios";
            return reply.code(403).send({ error: message });
        }
    });

    app.post<{ Params: { reelId: string }; Body: { texto?: string } }>(
        "/api/reels/:reelId/comentarios",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const comentario = await comentarReel(
                    request.usuario!.id,
                    request.params.reelId,
                    request.body.texto ?? ""
                );
                return reply.code(201).send({ comentario });
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo comentar";
                return reply.code(400).send({ error: message });
            }
        }
    );

    app.delete<{ Params: { reelId: string } }>("/api/reels/:reelId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarReel(request.usuario!.id, request.params.reelId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar el reel";
            return reply.code(400).send({ error: message });
        }
    });
}