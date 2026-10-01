import { db } from "../db/database.js";
import { enviarPush } from "./push.service.js";

const preferencias = {
    solicitudes_amistad: "solicitudes_amistad",
    amistades_aceptadas: "amistades_aceptadas",
    mensajes_privados: "mensajes_privados",
    mensajes_grupo: "mensajes_grupo",
    respuestas: "respuestas",
    corazones: "corazones",
    comentarios: "comentarios"
} as const;

type Preferencia = keyof typeof preferencias;

const valoresPredeterminados = {
    solicitudes_amistad: true,
    amistades_aceptadas: true,
    mensajes_privados: true,
    mensajes_grupo: true,
    respuestas: true,
    corazones: true,
    comentarios: true
};

export async function obtenerConfiguracionNotificaciones(usuarioId: string) {
    const resultado = await db.query(
        `SELECT solicitudes_amistad, amistades_aceptadas, mensajes_privados,
                mensajes_grupo, respuestas, corazones, comentarios
         FROM configuracion_notificaciones WHERE usuario_id = $1`,
        [usuarioId]
    );
    return resultado.rows[0] ?? valoresPredeterminados;
}

export async function actualizarConfiguracionNotificaciones(
    usuarioId: string,
    configuracion: Record<string, unknown>
) {
    for (const clave of Object.keys(valoresPredeterminados)) {
        if (typeof configuracion[clave] !== "boolean") {
            throw new Error(`La preferencia ${clave} debe ser booleana`);
        }
    }

    const valores = Object.keys(valoresPredeterminados).map((clave) => configuracion[clave]);
    const creada = await db.query(
        `
        INSERT INTO configuracion_notificaciones (
            usuario_id, solicitudes_amistad, amistades_aceptadas,
            mensajes_privados, mensajes_grupo, respuestas, corazones,
            comentarios
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (usuario_id) DO UPDATE SET
            solicitudes_amistad = EXCLUDED.solicitudes_amistad,
            amistades_aceptadas = EXCLUDED.amistades_aceptadas,
            mensajes_privados = EXCLUDED.mensajes_privados,
            mensajes_grupo = EXCLUDED.mensajes_grupo,
            respuestas = EXCLUDED.respuestas,
            corazones = EXCLUDED.corazones,
            comentarios = EXCLUDED.comentarios
        `,
        [usuarioId, ...valores]
    );
    return obtenerConfiguracionNotificaciones(usuarioId);
}

export async function crearNotificacion(
    usuarioId: string,
    preferencia: Preferencia,
    tipo: string,
    titulo: string,
    contenido: string,
    datos: Record<string, string>
) {
    if (titulo.length > 150 || contenido.length > 500) return;
    const columna = preferencias[preferencia];

    const creada = await db.query(
        `
        INSERT INTO notificaciones (usuario_id, tipo, titulo, contenido, datos)
        SELECT $1, $2, $3, $4, $5::jsonb
        WHERE NOT EXISTS (
            SELECT 1 FROM configuracion_notificaciones
            WHERE usuario_id = $1 AND ${columna} = FALSE
        )
        RETURNING id, tipo, titulo, contenido
        `,
        [usuarioId, tipo, titulo, contenido, JSON.stringify(datos)]
    );
    if (creada.rowCount === 1) {
        void enviarPush(usuarioId, creada.rows[0]);
    }
}

export async function listarNotificaciones(usuarioId: string) {
    const resultado = await db.query(
        `
        SELECT id, tipo, titulo, contenido, datos, leida, creada_en
        FROM notificaciones
        WHERE usuario_id = $1
        ORDER BY creada_en DESC
        LIMIT 50
        `,
        [usuarioId]
    );
    const noLeidas = await db.query(
        `SELECT COUNT(*)::int AS cantidad FROM notificaciones WHERE usuario_id = $1 AND leida = FALSE`,
        [usuarioId]
    );
    return { notificaciones: resultado.rows, no_leidas: noLeidas.rows[0].cantidad };
}

export async function marcarNotificacionLeida(usuarioId: string, notificacionId: string) {
    const resultado = await db.query(
        `UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2 RETURNING id`,
        [notificacionId, usuarioId]
    );
    if (resultado.rowCount !== 1) throw new Error("Notificación no encontrada");
    return { mensaje: "Notificación marcada como leída" };
}

export async function marcarTodasLeidas(usuarioId: string) {
    await db.query(`UPDATE notificaciones SET leida = TRUE WHERE usuario_id = $1 AND leida = FALSE`, [usuarioId]);
    return { mensaje: "Notificaciones marcadas como leídas" };
}