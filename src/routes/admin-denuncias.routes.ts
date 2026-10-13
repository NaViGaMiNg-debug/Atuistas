import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import {
    actualizarEtiquetasAdmin,
    borrarContenidoDenunciado,
    contarDenunciasPendientes,
    esAdminEtiqueta,
    listarDenuncias,
    marcarDenunciaRevisada,
    obtenerEtiquetasAdmin
} from "../services/admin-denuncias.service.js";

const tiposValidos = ["cuentas", "reels", "estados", "publicaciones"] as const;
type TipoDenuncia = (typeof tiposValidos)[number];

function esTipo(valor: string): valor is TipoDenuncia {
    return (tiposValidos as readonly string[]).includes(valor);
}

export async function adminDenunciasRoutes(app: FastifyInstance) {
    app.get("/api/admin/estado", { preHandler: autenticar }, async (request) => {
        const usuarioId = request.usuario!.id;
        const esAdmin = await esAdminEtiqueta(usuarioId);
        return {
            es_admin: esAdmin,
            pendientes: esAdmin ? await contarDenunciasPendientes() : 0
        };
    });

    app.get<{ Params: { tipo: string } }>(
        "/api/admin/denuncias/:tipo",
        { preHandler: autenticar },
        async (request, reply) => {
            if (!esTipo(request.params.tipo)) {
                return reply.status(400).send({ error: "Tipo no válido" });
            }
            try {
                const elementos = await listarDenuncias(request.usuario!.id, request.params.tipo);
                return { elementos };
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : "No se pudieron cargar las denuncias";
                const codigo = mensaje.includes("Solo") ? 403 : 400;
                return reply.status(codigo).send({ error: mensaje });
            }
        }
    );

    app.get("/api/admin/denuncias-pendientes", { preHandler: autenticar }, async (request, reply) => {
        try {
            const pendientes = await contarDenunciasPendientes(request.usuario!.id);
            return { pendientes };
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : "No se pudo contar";
            return reply.status(403).send({ error: mensaje });
        }
    });

    app.patch<{ Params: { tipo: string; objetoId: string } }>(
        "/api/admin/denuncias/:tipo/:objetoId/revisado",
        { preHandler: autenticar },
        async (request, reply) => {
            if (!esTipo(request.params.tipo)) {
                return reply.status(400).send({ error: "Tipo no válido" });
            }
            try {
                const cuerpo = (request.body ?? {}) as { revisado?: boolean };
                const resultado = await marcarDenunciaRevisada(
                    request.usuario!.id,
                    request.params.tipo,
                    request.params.objetoId,
                    cuerpo.revisado !== false
                );
                return resultado;
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : "No se pudo marcar";
                const codigo = mensaje.includes("Solo") ? 403 : 400;
                return reply.status(codigo).send({ error: mensaje });
            }
        }
    );

    app.delete<{ Params: { tipo: string; objetoId: string } }>(
        "/api/admin/denuncias/:tipo/:objetoId",
        { preHandler: autenticar },
        async (request, reply) => {
            if (!esTipo(request.params.tipo)) {
                return reply.status(400).send({ error: "Tipo no válido" });
            }
            try {
                const resultado = await borrarContenidoDenunciado(
                    request.usuario!.id,
                    request.params.tipo,
                    request.params.objetoId
                );
                return resultado;
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : "No se pudo borrar";
                const codigo = mensaje.includes("Solo") || mensaje.includes("Nadie") ? 403 : 400;
                return reply.status(codigo).send({ error: mensaje });
            }
        }
    );

    app.get("/api/admin/etiquetas", { preHandler: autenticar }, async (request, reply) => {
        try {
            return { etiquetas: await obtenerEtiquetasAdmin(request.usuario!.id) };
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : "No se pudo cargar";
            return reply.status(403).send({ error: mensaje });
        }
    });

    app.put<{ Body: { etiquetas?: Array<{ nombre?: string; color?: string }> } }>(
        "/api/admin/etiquetas",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const etiquetas = await actualizarEtiquetasAdmin(
                    request.usuario!.id,
                    request.body?.etiquetas ?? []
                );
                return { etiquetas };
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : "No se pudo guardar";
                const codigo = mensaje.includes("Solo") ? 403 : 400;
                return reply.status(codigo).send({ error: mensaje });
            }
        }
    );
}
