import { FastifyInstance, FastifyRequest } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { consumirTicket, crearTicket, suscribir } from "../ws/tiempo-real.js";

export async function wsRoutes(app: FastifyInstance) {
    // El token de sesion nunca viaja por la URL: se cambia por un ticket de un solo uso.
    // Se acepta GET y POST: el navegador pide GET y si solo hay POST devuelve 404
    // y el tiempo real no conecta nunca. El ticket dura 60 segundos y solo vale una vez.
    const entregarTicket = async (request: FastifyRequest) => ({
        ticket: crearTicket(request.usuario!.id),
        expira_en: 60
    });
    app.get("/api/ws/ticket", { preHandler: autenticar }, entregarTicket);
    app.post("/api/ws/ticket", { preHandler: autenticar }, entregarTicket);

    // El enchufe de tiempo real: con el ticket se sabe quien es y se le apunta
    // en su lista. Al cerrar o fallar se desapunta solo.
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
