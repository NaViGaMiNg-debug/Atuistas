import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { detectarTipoArchivo, guardarArchivoSubido, limiteParaTipo } from "../services/archivos.service.js";
import {
    activarCanales,
    actualizarCanal,
    actualizarDescripcionGrupo,
    actualizarImagenGrupo,
    bloquearAutorDeMensaje,
    bloquearMiembro,
    buscarGrupos,
    cambiarEscrituraMiembro,
    cambiarRolMiembro,
    comprobarMiembro,
    crearCanal,
    crearGrupo,
    descubrirGrupos,
    deshabilitarCodigoInvitacion,
    desbloquearMiembro,
    editarMensajeGrupo,
    eliminarCanal,
    eliminarGrupo,
    eliminarMensajesGrupo,
    enviarMensajeGrupo,
    expulsarMiembro,
    generarCodigoInvitacion,
    listarBloqueadosGrupo,
    listarCanales,
    listarGrupos,
    listarMiembrosGrupo,
    marcarLectura,
    obtenerGrupo,
    obtenerMensajesGrupo,
    previsualizarInvitacion,
    quitarRestriccionesOcultas,
    restringirOcultosDeMensaje,
    salirDeGrupo,
    silenciarGrupo,
    traspasarPropiedad,
    unirseAGrupo,
    unirsePorCodigo
} from "../services/grupos.service.js";

export async function gruposRoutes(app: FastifyInstance) {
    app.get("/api/grupos", { preHandler: autenticar }, async (request) => ({
        grupos: await listarGrupos(request.usuario!.id)
    }));

    app.get<{ Querystring: { texto?: string } }>("/api/grupos/buscar", { preHandler: autenticar }, async (request) => ({
        grupos: await buscarGrupos(request.query.texto ?? "", request.usuario!.id)
    }));

    app.post<{
        Body: {
            nombre?: string;
            descripcion?: string;
            tipo?: "normal" | "amistades";
            modelo?: "chat_unico" | "canales";
            retencion_horas?: number | null;
            permite_ocultos?: boolean;
        }
    }>("/api/grupos", { preHandler: autenticar }, async (request, reply) => {
        try {
            const grupo = await crearGrupo(request.usuario!.id, {
                nombre: request.body.nombre ?? "",
                descripcion: request.body.descripcion ?? "",
                tipo: request.body.tipo ?? "normal",
                modelo: request.body.modelo ?? "chat_unico",
                retencionHoras:
                    request.body.retencion_horas === undefined ? 48 : request.body.retencion_horas,
                permiteOcultos: request.body.permite_ocultos ?? false
            });
            return reply.code(201).send({ grupo });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo crear el servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/unirse", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await unirseAGrupo(request.usuario!.id, request.params.grupoId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo entrar al servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/salir", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await salirDeGrupo(request.usuario!.id, request.params.grupoId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo salir del servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string } }>("/api/grupos/:grupoId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarGrupo(request.usuario!.id, request.params.grupoId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar el servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { grupoId: string }; Querystring: { canalId?: string; antesDe?: string } }>("/api/grupos/:grupoId/mensajes", { preHandler: autenticar }, async (request, reply) => {
        try {
            const mensajes = await obtenerMensajesGrupo(
                request.usuario!.id,
                request.params.grupoId,
                request.query.canalId,
                request.query.antesDe
            );
            return { mensajes };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los mensajes";
            return reply.code(403).send({ error: message });
        }
    });

    // Subida de adjuntos para los mensajes de servidor. Sigue el mismo
    // patrón que el avatar: validar MIME, limitar tamaño y guardar en disco.
    app.post<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/adjuntos", { preHandler: autenticar }, async (request, reply) => {
        try {
            await comprobarMiembro(request.usuario!.id, request.params.grupoId);

            const archivo = await request.file();
            if (!archivo) {
                return reply.code(400).send({ error: "No se ha enviado ningún archivo" });
            }

            const tipo = detectarTipoArchivo(archivo.mimetype);
            if (!tipo) {
                return reply.code(400).send({ error: "Solo se admiten imágenes, audio o vídeo" });
            }

            const buffer = await archivo.toBuffer();
            const limite = limiteParaTipo(tipo);
            if (buffer.length > limite) {
                return reply.code(400).send({
                    error: `El archivo no puede superar los ${Math.round(limite / (1024 * 1024))} MB`
                });
            }

            // El nombre y la extensión salen del tipo real del archivo, no del cliente.
            const guardado = await guardarArchivoSubido({
                propietarioId: request.usuario!.id,
                tipo: `mensaje_${tipo}`,
                mimeType: archivo.mimetype,
                nombreOriginal: archivo.filename,
                buffer,
                carpeta: "grupo_mensajes"
            });

            return reply.code(201).send({
                archivo_id: guardado.id,
                tipo,
                ruta: guardado.ruta
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo subir el archivo";
            return reply.code(400).send({ error: message });
        }
    });

    // Foto del servidor: la eligen el creador o un moderador. Sirve igual para
    // los servidores con canales y para los de chat único.
    app.post<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/imagen", { preHandler: autenticar }, async (request, reply) => {
        try {
            // El permiso se comprueba antes de escribir nada en disco.
            await comprobarMiembro(request.usuario!.id, request.params.grupoId);

            const archivo = await request.file();
            if (!archivo) {
                return reply.code(400).send({ error: "No se ha enviado ninguna imagen" });
            }

            if (detectarTipoArchivo(archivo.mimetype) !== "imagen") {
                return reply.code(400).send({ error: "La foto del servidor debe ser una imagen" });
            }

            const buffer = await archivo.toBuffer();
            const limite = limiteParaTipo("imagen");
            if (buffer.length > limite) {
                return reply.code(400).send({
                    error: `La imagen no puede superar los ${Math.round(limite / (1024 * 1024))} MB`
                });
            }

            const guardado = await guardarArchivoSubido({
                propietarioId: request.usuario!.id,
                tipo: "grupo_imagen",
                mimeType: archivo.mimetype,
                nombreOriginal: archivo.filename,
                buffer,
                carpeta: "grupo_imagenes"
            });

            return reply.code(201).send(
                await actualizarImagenGrupo(request.usuario!.id, request.params.grupoId, guardado.id)
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo guardar la foto del servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/imagen", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await actualizarImagenGrupo(request.usuario!.id, request.params.grupoId, null);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo quitar la foto del servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.put<{ Params: { grupoId: string }; Body: { descripcion?: string } }>(
        "/api/grupos/:grupoId/descripcion",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                return await actualizarDescripcionGrupo(
                    request.usuario!.id,
                    request.params.grupoId,
                    request.body.descripcion
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo actualizar la descripción";
                return reply.code(400).send({ error: message });
            }
        }
    );

    app.post<{
        Params: { grupoId: string };
        Body: { contenido?: string; canalId?: string; respuestaId?: string; oculto?: boolean; tipo?: string; archivoId?: string }
    }>("/api/grupos/:grupoId/mensajes", { preHandler: autenticar }, async (request, reply) => {
        try {
            const mensaje = await enviarMensajeGrupo(
                request.usuario!.id,
                request.params.grupoId,
                request.body.contenido ?? "",
                {
                    canalId: request.body.canalId,
                    respuestaId: request.body.respuestaId,
                    oculto: request.body.oculto,
                    tipo: request.body.tipo as "texto" | "imagen" | "audio" | "video" | undefined,
                    archivoId: request.body.archivoId
                }
            );
            return reply.code(201).send({ mensaje });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo enviar el mensaje";
            return reply.code(400).send({ error: message });
        }
    });

    // Descubrimiento: búsqueda ya cubierta arriba; aquí, los diez servidores recientes.
    app.get("/api/grupos/descubrir", { preHandler: autenticar }, async (request) => ({
        grupos: await descubrirGrupos(request.usuario!.id)
    }));

    app.get<{ Params: { grupoId: string } }>("/api/grupos/:grupoId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { grupo: await obtenerGrupo(request.usuario!.id, request.params.grupoId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar el servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/activar-canales", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await activarCanales(request.usuario!.id, request.params.grupoId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron activar los canales";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/canales", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { canales: await listarCanales(request.usuario!.id, request.params.grupoId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los canales";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string };
        Body: { nombre?: string; descripcion?: string; retencion_horas?: number | null; permite_ocultos?: boolean }
    }>("/api/grupos/:grupoId/canales", { preHandler: autenticar }, async (request, reply) => {
        try {
            const canal = await crearCanal(
                request.usuario!.id,
                request.params.grupoId,
                request.body.nombre ?? "",
                {
                    descripcion: request.body.descripcion,
                    retencionHoras: request.body.retencion_horas,
                    permiteOcultos: request.body.permite_ocultos
                }
            );
            return reply.code(201).send({ canal });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo crear el canal";
            return reply.code(400).send({ error: message });
        }
    });

    app.patch<{
        Params: { grupoId: string; canalId: string };
        Body: { nombre?: string; descripcion?: string | null; retencion_horas?: number | null; permite_ocultos?: boolean }
    }>("/api/grupos/:grupoId/canales/:canalId", { preHandler: autenticar }, async (request, reply) => {
        try {
            const canal = await actualizarCanal(
                request.usuario!.id,
                request.params.grupoId,
                request.params.canalId,
                {
                    nombre: request.body.nombre,
                    descripcion: request.body.descripcion,
                    retencionHoras: request.body.retencion_horas,
                    permiteOcultos: request.body.permite_ocultos
                }
            );
            return { canal };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo actualizar el canal";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string; canalId: string } }>("/api/grupos/:grupoId/canales/:canalId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarCanal(
                request.usuario!.id,
                request.params.grupoId,
                request.params.canalId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar el canal";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/miembros", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { miembros: await listarMiembrosGrupo(request.usuario!.id, request.params.grupoId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron cargar los miembros";
            return reply.code(400).send({ error: message });
        }
    });

    app.patch<{
        Params: { grupoId: string; usuarioId: string };
        Body: { rol?: string }
    }>("/api/grupos/:grupoId/miembros/:usuarioId/rol", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await cambiarRolMiembro(
                request.usuario!.id,
                request.params.grupoId,
                request.params.usuarioId,
                request.body.rol ?? ""
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cambiar el rol";
            return reply.code(400).send({ error: message });
        }
    });

    app.patch<{
        Params: { grupoId: string; usuarioId: string };
        Body: { puede_escribir?: boolean }
    }>("/api/grupos/:grupoId/miembros/:usuarioId/escritura", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await cambiarEscrituraMiembro(
                request.usuario!.id,
                request.params.grupoId,
                request.params.usuarioId,
                request.body.puede_escribir ?? true
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cambiar el permiso";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string; usuarioId: string } }>("/api/grupos/:grupoId/miembros/:usuarioId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await expulsarMiembro(
                request.usuario!.id,
                request.params.grupoId,
                request.params.usuarioId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo expulsar al miembro";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string; usuarioId: string };
        Body: { oculto?: boolean; motivo?: string }
    }>("/api/grupos/:grupoId/miembros/:usuarioId/bloquear", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await bloquearMiembro(
                request.usuario!.id,
                request.params.grupoId,
                request.params.usuarioId,
                { oculto: request.body.oculto, motivo: request.body.motivo }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo bloquear al miembro";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/bloqueados", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { bloqueados: await listarBloqueadosGrupo(request.usuario!.id, request.params.grupoId) };
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar la lista de bloqueos";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string; usuarioId: string } }>("/api/grupos/:grupoId/bloqueados/:usuarioId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await desbloquearMiembro(
                request.usuario!.id,
                request.params.grupoId,
                request.params.usuarioId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo desbloquear al usuario";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string };
        Body: { usuarioId?: string }
    }>("/api/grupos/:grupoId/propiedad", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await traspasarPropiedad(
                request.usuario!.id,
                request.params.grupoId,
                request.body.usuarioId ?? ""
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo traspasar el servidor";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string };
        Body: { silenciado?: boolean }
    }>("/api/grupos/:grupoId/silenciar", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await silenciarGrupo(
                request.usuario!.id,
                request.params.grupoId,
                request.body.silenciado ?? true
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cambiar el silencio";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string };
        Body: { canalId?: string }
    }>("/api/grupos/:grupoId/lectura", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await marcarLectura(
                request.usuario!.id,
                request.params.grupoId,
                request.body.canalId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo marcar como leído";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/invitacion", { preHandler: autenticar }, async (request, reply) => {
        try {
            const invitacion = await generarCodigoInvitacion(request.usuario!.id, request.params.grupoId);
            return reply.code(201).send({ invitacion });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo generar la invitación";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string } }>("/api/grupos/:grupoId/invitacion", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await deshabilitarCodigoInvitacion(request.usuario!.id, request.params.grupoId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron desactivar las invitaciones";
            return reply.code(400).send({ error: message });
        }
    });

    app.get<{ Params: { codigo: string } }>("/api/grupos/invitacion/:codigo", { preHandler: autenticar }, async (request, reply) => {
        try {
            const invitacion = await previsualizarInvitacion(request.usuario!.id, request.params.codigo);
            return { invitacion };
        } catch (error) {
            const message = error instanceof Error ? error.message : "La invitación no existe";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { codigo: string } }>("/api/grupos/invitacion/:codigo/unirse", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await unirsePorCodigo(request.usuario!.id, request.params.codigo);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo aceptar la invitación";
            return reply.code(400).send({ error: message });
        }
    });

    app.patch<{
        Params: { grupoId: string; mensajeId: string };
        Body: { contenido?: string }
    }>("/api/grupos/:grupoId/mensajes/:mensajeId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await editarMensajeGrupo(
                request.usuario!.id,
                request.params.grupoId,
                request.params.mensajeId,
                request.body.contenido ?? ""
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo editar el mensaje";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string };
        Body: { mensajeIds?: string[] }
    }>("/api/grupos/:grupoId/mensajes/eliminar", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarMensajesGrupo(
                request.usuario!.id,
                request.params.grupoId,
                request.body.mensajeIds ?? []
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron eliminar los mensajes";
            return reply.code(400).send({ error: message });
        }
    });

    app.delete<{ Params: { grupoId: string; mensajeId: string } }>("/api/grupos/:grupoId/mensajes/:mensajeId", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await eliminarMensajesGrupo(
                request.usuario!.id,
                request.params.grupoId,
                [request.params.mensajeId]
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar el mensaje";
            return reply.code(400).send({ error: message });
        }
    });

    // Moderación ciega: respuestas sin identidades.
    app.post<{ Params: { grupoId: string; mensajeId: string } }>("/api/grupos/:grupoId/mensajes/:mensajeId/bloquear-autor", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await bloquearAutorDeMensaje(
                request.usuario!.id,
                request.params.grupoId,
                request.params.mensajeId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo aplicar el bloqueo";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{ Params: { grupoId: string; mensajeId: string } }>("/api/grupos/:grupoId/mensajes/:mensajeId/restringir-ocultos", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await restringirOcultosDeMensaje(
                request.usuario!.id,
                request.params.grupoId,
                request.params.mensajeId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo restringir el envío de ocultos";
            return reply.code(400).send({ error: message });
        }
    });

    app.post<{
        Params: { grupoId: string };
        Body: { usuarioId?: string }
    }>("/api/grupos/:grupoId/ocultos/restricciones/quitar", { preHandler: autenticar }, async (request, reply) => {
        try {
            return await quitarRestriccionesOcultas(
                request.usuario!.id,
                request.params.grupoId,
                request.body.usuarioId
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudieron quitar las restricciones";
            return reply.code(400).send({ error: message });
        }
    });
}