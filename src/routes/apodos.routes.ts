import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";

import {
    guardarApodo,
    listarApodos,
    quitarApodo
} from "../services/apodos.service.js";


export async function apodosRoutes(app: FastifyInstance) {
    // Todos los apodos que he puesto: el cliente los guarda en memoria y los
    // aplica al pintar cualquier nombre de la app.
    app.get("/api/apodos", { preHandler: autenticar }, async (request) => ({
        apodos: await listarApodos(request.usuario!.id)
    }));

    // Poner o cambiar el apodo de una persona. Con el apodo vacio se quita.
    app.put<{ Params: { usuarioId: string }; Body: { apodo?: string } }>(
        "/api/apodos/:usuarioId",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const apodo = await guardarApodo(
                    request.usuario!.id,
                    request.params.usuarioId,
                    request.body?.apodo ?? ""
                );
                return { apodo };
            } catch (error) {
                const message = error instanceof Error ? error.message : "No se pudo guardar el apodo";
                return reply.code(400).send({ error: message });
            }
        }
    );

    app.delete<{ Params: { usuarioId: string } }>(
        "/api/apodos/:usuarioId",
        { preHandler: autenticar },
        async (request) => quitarApodo(request.usuario!.id, request.params.usuarioId)
    );
}
