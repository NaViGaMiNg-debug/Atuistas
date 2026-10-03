import { FastifyInstance, FastifyRequest } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import type { UploadFile } from "../services/multimedia.service.js";
import {
    anadirItemHistoria,
    crearHistoria,
    eliminarHistoria,
    eliminarItemHistoria,
    obtenerHistoria,
    obtenerHistoriasUsuario,
    obtenerMisHistorias,
    renombrarHistoria,
    type TipoItem
} from "../services/historias.service.js";

const limiteCuerpoHistoria = 125 * 1024 * 1024;

// Elementos de una historia: texto o archivos, igual que los estados.
async function leerFormularioItem(request: FastifyRequest) {
    const files: UploadFile[] = [];
    const fields: Record<string, string> = {};
    for await (const part of request.parts({ limits: { files: 10, fields: 3, fileSize: 50 * 1024 * 1024 } })) {
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

function tipoValido(valor: string | undefined): TipoItem {
    return valor === "video" || valor === "audio" ? valor : valor === "texto" ? "texto" : "imagen";
}

export async function historiasRoutes(app: FastifyInstance) {
    // Crear la carpeta vacía con su nombre; los elementos se añaden después.
    app.post<{ Body: { nombre?: string } }>("/api/historias", { preHandler: autenticar }, async (request, reply) => {
        try {
            const historia = await crearHistoria(request.usuario!.id, request.body.nombre ?? "");
            return reply.code(201).send({ historia });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo crear la historia";
            return reply.code(400).send({ error: message });
        }
    });

    app.get("/api/historias/mias", { preHandler: autenticar }, async (request) => ({
        historias: await obtenerMisHistorias(request.usuario!.id)
    }));

    // Historias de otro usuario, para verlas en su perfil.
    app.get<{ Params: { usuarioId: string } }>("/api/usuarios/:usuarioId/historias", { preHandler: autenticar }, async (request) => ({
        historias: await obtenerHistoriasUsuario(request.params.usuarioId)
    }));

    app.get<{ Params: { historiaId: string } }>("/api/historias/:historiaId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { historia: await obtenerHistoria(request.usuario!.id, request.params.historiaId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar la historia";
            return reply.code(404).send({ error: message });
        }
    });

    app.put<{ Params: { historiaId: string }; Body: { nombre?: string } }>(
        "/api/historias/:historiaId",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const historia = await renombrarHistoria(
                    request.usuario!.id,
                    request.params.historiaId,
                    request.body.nombre ?? ""
                );
                return { historia };
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo renombrar la historia";
                return reply.code(400).send({ error: message });
            }
        }
    );

    // Añadir un elemento (texto, fotos, vídeo o audio) a la carpeta.
    app.post<{ Params: { historiaId: string } }>(
        "/api/historias/:historiaId/items",
        { preHandler: autenticar, bodyLimit: limiteCuerpoHistoria },
        async (request, reply) => {
            try {
                const { fields, files } = await leerFormularioItem(request);
                const items = await anadirItemHistoria(
                    request.usuario!.id,
                    request.params.historiaId,
                    tipoValido(fields.tipo),
                    fields.texto ?? "",
                    files
                );
                return reply.code(201).send({ items });
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo añadir el elemento";
                return reply.code(400).send({ error: message });
            }
        }
    );

    app.delete<{ Params: { historiaId: string; itemId: string } }>(
        "/api/historias/:historiaId/items/:itemId",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                return await eliminarItemHistoria(
                    request.usuario!.id,
                    request.params.historiaId,
                    request.params.itemId
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo eliminar el elemento";
                return reply.code(400).send({ error: message });
            }
        }
    );

    app.delete<{ Params: { historiaId: string } }>("/api/historias/:historiaId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarHistoria(request.usuario!.id, request.params.historiaId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar la historia";
            return reply.code(400).send({ error: message });
        }
    });
}