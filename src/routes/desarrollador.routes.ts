import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import {
    editarUsuarioComoDesarrollador,
    esDesarrollador
} from "../services/desarrollador.service.js";

export async function desarrolladorRoutes(app: FastifyInstance) {
    // El cliente consulta esto al entrar para saber si enseña las herramientas
    // de desarrollador (pulsación larga para borrar, edición de perfiles).
    app.get("/api/desarrollador/estado", { preHandler: autenticar }, async (request) => ({
        es_desarrollador: await esDesarrollador(request.usuario!.id)
    }));

    // Nombre, descripción y etiqueta de cualquier cuenta. Los tres campos son
    // opcionales: si no se manda alguno, ese dato se queda como estaba.
    app.put<{ Params: { usuarioId: string }; Body: { nombre?: string; descripcion?: string; etiqueta?: string } }>(
        "/api/desarrollador/usuarios/:usuarioId",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const usuario = await editarUsuarioComoDesarrollador(
                    request.usuario!.id,
                    request.params.usuarioId,
                    request.body ?? {}
                );
                return { usuario };
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo editar el usuario";
                return reply.code(400).send({ error: message });
            }
        }
    );
}