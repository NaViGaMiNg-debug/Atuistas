import { db } from "../db/database.js";
import { crearNotificacion } from "./notificaciones.service.js";

export async function buscarUsuarios(
    texto: string,
    usuarioId: string
) {
    const textoLimpio = texto.trim();

    if (!textoLimpio) {
        return [];
    }

    const resultado = await db.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.descripcion,
            u.avatar_archivo_id,
            u.color_nombre,

            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM amistades am
                    WHERE am.usuario_a_id = LEAST(u.id, $1::uuid)
                    AND am.usuario_b_id = GREATEST(u.id, $1::uuid)
                )
                THEN 'amigo'

                WHEN EXISTS (
                    SELECT 1
                    FROM solicitudes_amistad s
                    WHERE s.emisor_id = $1::uuid
                    AND s.receptor_id = u.id
                    AND s.estado = 'pendiente'
                )
                THEN 'solicitud_enviada'

                WHEN EXISTS (
                    SELECT 1
                    FROM solicitudes_amistad s
                    WHERE s.emisor_id = u.id
                    AND s.receptor_id = $1::uuid
                    AND s.estado = 'pendiente'
                )
                THEN 'solicitud_recibida'

                ELSE 'ninguno'
            END AS estado_amistad,

            CASE
                WHEN a.ruta IS NOT NULL
                THEN REPLACE(a.ruta, '\', '/')
                ELSE NULL
            END AS avatar_url

        FROM usuarios u

        LEFT JOIN archivos a
            ON a.id = u.avatar_archivo_id

        WHERE u.activo = TRUE
        AND u.id <> $1
        AND u.nombre ILIKE $2

        ORDER BY u.nombre

        LIMIT 20
        `,
        [
            usuarioId,
            `%${textoLimpio}%`
        ]
    );

    return resultado.rows;
}

export async function enviarSolicitudAmistad(
    usuarioId: string,
    destinatarioId: string
) {
    // No puedes enviarte una solicitud a ti mismo
    if (usuarioId === destinatarioId) {
        throw new Error("No puedes enviarte una solicitud a ti mismo");
    }

    // Comprobar que el destinatario existe y está activo
    const usuario = await db.query(
        `
        SELECT id
        FROM usuarios
        WHERE id = $1
          AND activo = TRUE
        `,
        [destinatarioId]
    );

    if (usuario.rowCount === 0) {
        throw new Error("El usuario no existe");
    }

    // Comprobar si existe un bloqueo en cualquier dirección
    const bloqueo = await db.query(
        `
        SELECT bloqueador_id
        FROM bloqueos
        WHERE (bloqueador_id = $1 AND bloqueado_id = $2)
           OR (bloqueador_id = $2 AND bloqueado_id = $1)
        LIMIT 1
        `,
        [usuarioId, destinatarioId]
    );

    if ((bloqueo.rowCount ?? 0) > 0) {
        throw new Error("No puedes enviar una solicitud a este usuario");
    }

    // Comprobar si ya son amigos
    const amistad = await db.query(
        `
        SELECT usuario_a_id
        FROM amistades
        WHERE usuario_a_id = LEAST($1::uuid, $2::uuid)
          AND usuario_b_id = GREATEST($1::uuid, $2::uuid)
        LIMIT 1
        `,
        [usuarioId, destinatarioId]
    );

    if ((amistad.rowCount ?? 0) > 0) {
        throw new Error("Ya sois amigos");
    }

    // Comprobar si ya existe una solicitud pendiente
    const pendiente = await db.query(
        `
        SELECT
            emisor_id,
            receptor_id
        FROM solicitudes_amistad
        WHERE (
            (emisor_id = $1 AND receptor_id = $2)
            OR
            (emisor_id = $2 AND receptor_id = $1)
        )
        AND estado = 'pendiente'
        LIMIT 1
        `,
        [usuarioId, destinatarioId]
    );

    if ((pendiente.rowCount ?? 0) > 0) {
        throw new Error(
            "Ya existe una solicitud de amistad pendiente entre vosotros"
        );
    }

    // Comprobar si el usuario rechazó una solicitud anteriormente
    const rechazo = await db.query(
        `
        SELECT respondido_en
        FROM solicitudes_amistad
        WHERE emisor_id = $1
          AND receptor_id = $2
          AND estado = 'rechazada'
        ORDER BY respondido_en DESC
        LIMIT 1
        `,
        [usuarioId, destinatarioId]
    );

    if (
        (rechazo.rowCount ?? 0) > 0 &&
        rechazo.rows[0].respondido_en
    ) {
        const fechaRechazo = new Date(
            rechazo.rows[0].respondido_en
        );

        const cincoDias = 5 * 24 * 60 * 60 * 1000;
        const tiempoTranscurrido =
            Date.now() - fechaRechazo.getTime();

        if (tiempoTranscurrido < cincoDias) {
            throw new Error(
                "Debes esperar 5 días antes de volver a enviar una solicitud"
            );
        }
    }

    // Crear la nueva solicitud
    await db.query(
        `
        INSERT INTO solicitudes_amistad (
            emisor_id,
            receptor_id,
            estado
        )
        VALUES ($1, $2, 'pendiente')
        `,
        [usuarioId, destinatarioId]
    );

    await crearNotificacion(
        destinatarioId,
        "solicitudes_amistad",
        "solicitud_amistad",
        "Nueva solicitud de amistad",
        "Tienes una nueva solicitud de amistad.",
        { usuarioId },
        usuarioId
    );

    return {
        mensaje: "Solicitud de amistad enviada"
    };
}

export async function obtenerSolicitudesRecibidas(
    usuarioId: string
) {
    const resultado = await db.query(
        `
        SELECT
            s.id,
            s.emisor_id,
            s.creado_en,
            u.nombre,
            u.descripcion,
            u.avatar_archivo_id,
            u.color_nombre,
            CASE
                WHEN a.ruta IS NOT NULL
                THEN REPLACE(a.ruta, '\', '/')
                ELSE NULL
            END AS avatar_url
        FROM solicitudes_amistad s
        INNER JOIN usuarios u
            ON u.id = s.emisor_id
        LEFT JOIN archivos a
            ON a.id = u.avatar_archivo_id
        WHERE s.receptor_id = $1
          AND s.estado = 'pendiente'
          AND u.activo = TRUE
        ORDER BY s.creado_en DESC
        `,
        [usuarioId]
    );

    return resultado.rows;
}

export async function aceptarSolicitudAmistad(
    usuarioId: string,
    solicitudId: string
) {
    const solicitud = await db.query(
        `
        SELECT
            id,
            emisor_id,
            receptor_id
        FROM solicitudes_amistad
        WHERE id = $1
          AND receptor_id = $2
          AND estado = 'pendiente'
        LIMIT 1
        `,
        [solicitudId, usuarioId]
    );

    if ((solicitud.rowCount ?? 0) === 0) {
        throw new Error("La solicitud no existe o ya no está pendiente");
    }

    const emisorId = solicitud.rows[0].emisor_id;
    const receptorId = solicitud.rows[0].receptor_id;

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `
            INSERT INTO amistades (
                usuario_a_id,
                usuario_b_id
            )
            VALUES (
                LEAST($1::uuid, $2::uuid),
                GREATEST($1::uuid, $2::uuid)
            )
            `,
            [emisorId, receptorId]
        );

        await client.query(
            `
            UPDATE solicitudes_amistad
            SET
                estado = 'aceptada',
                respondido_en = NOW()
            WHERE id = $1
            `,
            [solicitudId]
        );

        await client.query(
            `
            INSERT INTO miembros_grupo (grupo_id, usuario_id, origen, rol)
            SELECT id, $1, 'amistad', 'miembro'
            FROM grupos
            WHERE creador_id = $2 AND tipo = 'amistades'
            ON CONFLICT (grupo_id, usuario_id) DO NOTHING
            `,
            [emisorId, receptorId]
        );
        await client.query(
            `
            INSERT INTO miembros_grupo (grupo_id, usuario_id, origen, rol)
            SELECT id, $1, 'amistad', 'miembro'
            FROM grupos
            WHERE creador_id = $2 AND tipo = 'amistades'
            ON CONFLICT (grupo_id, usuario_id) DO NOTHING
            `,
            [receptorId, emisorId]
        );

        await client.query("COMMIT");

        await crearNotificacion(
            emisorId,
            "amistades_aceptadas",
            "amistad_aceptada",
            "Solicitud aceptada",
            "Han aceptado tu solicitud de amistad.",
            { usuarioId: receptorId },
            receptorId
        );

        return {
            mensaje: "Solicitud aceptada"
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function rechazarSolicitudAmistad(
    usuarioId: string,
    solicitudId: string
) {
    const resultado = await db.query(
        `
        UPDATE solicitudes_amistad
        SET
            estado = 'rechazada',
            respondido_en = NOW()
        WHERE id = $1
          AND receptor_id = $2
          AND estado = 'pendiente'
        RETURNING id
        `,
        [solicitudId, usuarioId]
    );

    if ((resultado.rowCount ?? 0) === 0) {
        throw new Error("La solicitud no existe o ya no está pendiente");
    }

    return {
        mensaje: "Solicitud rechazada"
    };
}

export async function obtenerAmigos(usuarioId: string) {
    const resultado = await db.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.descripcion,
            u.avatar_archivo_id,
            u.color_nombre,
            CASE
                WHEN ar.ruta IS NOT NULL
                THEN REPLACE(ar.ruta, '\', '/')
                ELSE NULL
            END AS avatar_url,
            -- Mensajes suyos que aún no se han abierto el chat: alimenta el
            -- punto rojo de la tarjeta.
            (
                SELECT COUNT(*)::int
                FROM mensajes_privados mp
                INNER JOIN conversaciones_privadas cp ON cp.id = mp.conversacion_id
                WHERE mp.autor_id = u.id
                  AND mp.leido_en IS NULL
                  AND cp.usuario_a_id = LEAST($1::uuid, u.id)
                  AND cp.usuario_b_id = GREATEST($1::uuid, u.id)
            ) AS mensajes_sin_leer
        FROM amistades a
        INNER JOIN usuarios u
            ON (
                a.usuario_a_id = $1::uuid
                AND u.id = a.usuario_b_id
            )
            OR (
                a.usuario_b_id = $1::uuid
                AND u.id = a.usuario_a_id
            )
        LEFT JOIN archivos ar
            ON ar.id = u.avatar_archivo_id
        WHERE u.activo = TRUE
        ORDER BY u.nombre
        `,
        [usuarioId]
    );

    return resultado.rows;
}