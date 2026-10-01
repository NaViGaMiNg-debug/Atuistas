import crypto from "node:crypto";
import argon2 from "argon2";
import { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/database.js";

export interface UsuarioAutenticado {
    id: string;
    nombre: string;
}

declare module "fastify" {
    interface FastifyRequest {
        usuario?: UsuarioAutenticado;
    }
}

export async function autenticar(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const autorizacion = request.headers.authorization;

    if (!autorizacion) {
        return reply.status(401).send({
            error: "No autenticado"
        });
    }

    const partes = autorizacion.split(" ");

    if (
        partes.length !== 2 ||
        partes[0] !== "Bearer" ||
        !partes[1]
    ) {
        return reply.status(401).send({
            error: "Token de autenticación inválido"
        });
    }

    const token = partes[1];

    const partesToken = token.split(".");

    if (
        partesToken.length !== 2 ||
        !partesToken[0] ||
        !partesToken[1]
    ) {
        return reply.status(401).send({
            error: "Token de autenticación inválido"
        });
    }

    const identificadorSesion = partesToken[0];
    const secretoSesion = partesToken[1];

    const resultado = await db.query(
        `
        SELECT
            s.id,
            s.usuario_id,
            s.token_hash,
            s.expira_en,
            u.nombre
        FROM sesiones s
        INNER JOIN usuarios u
            ON u.id = s.usuario_id
        WHERE s.identificador = $1
        AND s.revocado_en IS NULL
        AND s.expira_en > NOW()
        AND u.activo = TRUE
        `,
        [identificadorSesion]
    );

    if (resultado.rowCount === 1) {
        const sesion = resultado.rows[0];

        const coincide = await argon2.verify(
            sesion.token_hash,
            secretoSesion
        );

        if (coincide) {
            await db.query(
                `
                UPDATE sesiones
                SET ultimo_uso = NOW()
                WHERE id = $1
                `,
                [sesion.id]
            );

            request.usuario = {
                id: sesion.usuario_id,
                nombre: sesion.nombre
            };

            return;
        }
    }

    return reply.status(401).send({
        error: "Sesión inválida o expirada"
    });
}