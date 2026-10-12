import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import {
    denunciarCuenta,
    bloquearCuenta,
    eliminarCuentaPorRol,
    obtenerTumba,
    silenciarCuenta,
    desilenciarCuenta
} from "../services/moderacion.service.js";

export async function moderacionRoutes(app: FastifyInstance) {
    app.post("/api/silencios", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const body = request.body as {
                silenciadoId?: string;
            };
            if (!body.silenciadoId) {
                return reply.status(400).send({
                    error: "La cuenta es obligatoria"
                });
            }
            const resultado = await silenciarCuenta(
                request.usuario!.id,
                body.silenciadoId
            );
            return reply.status(201).send(resultado);
        } catch (error) {
            const mensaje = error instanceof Error
                ? error.message
                : "No se pudo silenciar la cuenta";
            return reply.status(400).send({ error: mensaje });
        }
    });

    app.delete<{ Params: { usuarioId: string } }>("/api/silencios/:usuarioId", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const resultado = await desilenciarCuenta(
                request.usuario!.id,
                request.params.usuarioId
            );
            return reply.send(resultado);
        } catch (error) {
            const mensaje = error instanceof Error
                ? error.message
                : "No se pudo quitar el silencio";
            return reply.status(400).send({ error: mensaje });
        }
    });

    app.post("/api/denuncias/cuentas", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const body = request.body as {
                denunciadoId?: string;
                motivo?: string;
            };
            if (!body.denunciadoId) {
                return reply.status(400).send({
                    error: "La cuenta es obligatoria"
                });
            }
            const resultado = await denunciarCuenta(
                request.usuario!.id,
                body.denunciadoId,
                body.motivo ?? ""
            );
            return reply.status(201).send(resultado);
        } catch (error) {
            const mensaje = error instanceof Error
                ? error.message
                : "No se pudo denunciar la cuenta";
            const codigo = mensaje === "Ya has denunciado a esta cuenta"
                ? 409
                : 400;
            return reply.status(codigo).send({ error: mensaje });
        }
    });

    app.post("/api/bloqueos", {
        preHandler: autenticar
    }, async (request, reply) => {
        try {
            const body = request.body as {
                bloqueadoId?: string;
            };
            if (!body.bloqueadoId) {
                return reply.status(400).send({
                    error: "La cuenta es obligatoria"
                });
            }
            const resultado = await bloquearCuenta(
                request.usuario!.id,
                body.bloqueadoId
            );
            return reply.status(201).send(resultado);
        } catch (error) {
            const mensaje = error instanceof Error
                ? error.message
                : "No se pudo bloquear la cuenta";
            return reply.status(400).send({ error: mensaje });
        }
    });

    app.delete<{ Params: { usuarioId: string } }>(
        "/api/admin/usuarios/:usuarioId",
        { preHandler: autenticar },
        async (request, reply) => {
            try {
                const resultado = await eliminarCuentaPorRol(
                    request.usuario!.id,
                    request.params.usuarioId
                );
                return reply.send(resultado);
            } catch (error) {
                const mensaje = error instanceof Error
                    ? error.message
                    : "No se pudo eliminar la cuenta";
                const codigo = mensaje.includes("Solo Creador")
                    || mensaje.includes("Nadie puede")
                    ? 403
                    : 400;
                return reply.status(codigo).send({ error: mensaje });
            }
        }
    );

    app.get<{ Params: { usuarioId: string } }>(
        "/api/tumbas/:usuarioId",
        async (request, reply) => {
            const tumba = await obtenerTumba(request.params.usuarioId);
            if (!tumba) {
                return reply.status(404).send({
                    error: "No hay aviso de borrado"
                });
            }
            return { tumba };
        }
    );
}
