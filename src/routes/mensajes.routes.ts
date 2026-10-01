import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { detectarTipoArchivo, guardarArchivoSubido, limiteParaTipo } from "../services/archivos.service.js";
import {
    comprobarConversacionPermitida,
    obtenerOCrearConversacion,
    obtenerMensajesConversacion,
    enviarMensajeTexto,
    enviarMensajeAdjunto,
    editarMensajeTexto,
    eliminarMensajesTexto
} from "../services/mensajes.service.js";

export async function mensajesRoutes(app: FastifyInstance) {

    // Crear u obtener una conversación con un amigo
    app.post("/api/mensajes/conversacion", {
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

            const conversacionId =
                await obtenerOCrearConversacion(
                    request.usuario!.id,
                    body.destinatarioId
                );

            return {
                conversacionId
            };

        } catch (error) {
            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al obtener la conversación";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    // Obtener mensajes de una conversación
    app.get("/api/mensajes/conversacion/:usuarioId", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const params = request.params as {
                usuarioId: string;
            };

            if (!params.usuarioId) {
                return reply.status(400).send({
                    error: "El usuario es obligatorio"
                });
            }

            const mensajes =
                await obtenerMensajesConversacion(
                    request.usuario!.id,
                    params.usuarioId
                );

            return {
                mensajes
            };

        } catch (error) {
            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al obtener los mensajes";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    // Subida de adjuntos del chat privado: fotos, vídeos y audios. El archivo
    // solo se guarda si de verdad se puede escribir a esa persona.
    app.post<{ Params: { usuarioId: string } }>("/api/mensajes/conversacion/:usuarioId/adjuntos", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const otroUsuarioId = request.params.usuarioId;

            if (!otroUsuarioId) {
                return reply.status(400).send({
                    error: "El usuario es obligatorio"
                });
            }

            await comprobarConversacionPermitida(request.usuario!.id, otroUsuarioId);

            const archivo = await request.file();
            if (!archivo) {
                return reply.status(400).send({
                    error: "No se ha enviado ningún archivo"
                });
            }

            const tipo = detectarTipoArchivo(archivo.mimetype);
            if (!tipo) {
                return reply.status(400).send({
                    error: "Solo se admiten imágenes, audio o vídeo"
                });
            }

            const buffer = await archivo.toBuffer();
            const limite = limiteParaTipo(tipo);
            if (buffer.length > limite) {
                return reply.status(400).send({
                    error: `El archivo no puede superar los ${Math.round(limite / (1024 * 1024))} MB`
                });
            }

            const guardado = await guardarArchivoSubido({
                propietarioId: request.usuario!.id,
                tipo: `mensaje_${tipo}`,
                mimeType: archivo.mimetype,
                nombreOriginal: archivo.filename,
                buffer,
                carpeta: "mensajes_privados"
            });

            return reply.status(201).send({
                archivo_id: guardado.id,
                tipo,
                ruta: guardado.ruta
            });

        } catch (error) {
            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al subir el archivo";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    // Enviar mensaje de texto o un adjunto ya subido
    app.post("/api/mensajes/conversacion/:usuarioId", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const params = request.params as {
                usuarioId: string;
            };

            const body = request.body as {
                contenido?: string;
                respuestaId?: string;
                tipo?: string;
                archivoId?: string;
            };

            if (!params.usuarioId) {
                return reply.status(400).send({
                    error: "El usuario es obligatorio"
                });
            }

            // Con adjunto el texto es opcional; sin adjunto es obligatorio.
            if (body.archivoId) {
                const mensaje = await enviarMensajeAdjunto(
                    request.usuario!.id,
                    params.usuarioId,
                    {
                        tipo: body.tipo,
                        archivoId: body.archivoId,
                        contenido: body.contenido,
                        respuestaId: body.respuestaId
                    }
                );

                return reply.status(201).send({
                    mensaje
                });
            }

            if (!body.contenido) {
                return reply.status(400).send({
                    error: "El contenido es obligatorio"
                });
            }

            const mensaje =
                await enviarMensajeTexto(
                    request.usuario!.id,
                    params.usuarioId,
                    body.contenido,
                    body.respuestaId
                );

            return reply.status(201).send({
                mensaje
            });

        } catch (error) {
            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al enviar el mensaje";

            return reply.status(400).send({
                error: mensaje
            });
        }
    });

    app.patch<{ Params: { mensajeId: string }; Body: { contenido?: string } }>("/api/mensajes/:mensajeId", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const mensaje = await editarMensajeTexto(
                request.usuario!.id,
                request.params.mensajeId,
                request.body.contenido ?? ""
            );
            return { mensaje };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo editar el mensaje";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { mensajeId: string } }>("/api/mensajes/:mensajeId", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            return await eliminarMensajesTexto(request.usuario!.id, [request.params.mensajeId]);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar el mensaje";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Body: { mensajeIds?: string[] } }>("/api/mensajes/eliminar", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            return await eliminarMensajesTexto(request.usuario!.id, request.body.mensajeIds ?? []);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron eliminar los mensajes";
            return reply.code(400).send({ error: message });
        }
    });
}