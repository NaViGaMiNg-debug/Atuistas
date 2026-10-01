import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { consumirTicket, crearTicket, suscribir } from "../ws/tiempo-real.js";

export async function wsRoutes(app: FastifyInstance) {
    // El token de sesión nunca viaja por la URL: se cambia por un ticket de un solo uso.
    app.post("/api/ws/ticket", { preHandler: autenticar }, async (request) => ({
        ticket: crearTicket(request.usuario!.id),
        expira_en: 60
    }));

    app.get<{ Querystring: { ticket?: string } }>("/ws", { websocket: true }, (socket, request) => {
        const usuarioId = consumirTicket(request.query.ticket ?? "");

        if (!usuarioId) {
            socket.close(4001, "Ticket no válido");
            return;
        }

        const desuscribir = suscribir(usuarioId, socket);
        socket.on("close", desuscribir);
        socket.on("error", desuscribir);
        socket.send(JSON.stringify({ tipo: "conexion_establecida" }));
    });
}
