import { db } from "../db/database.js";
import { crearNotificacion } from "./notificaciones.service.js";

async function comprobarAmistad(
    usuarioId: string,
    otroUsuarioId: string
) {
    const resultado = await db.query(
        `
        SELECT 1
        FROM amistades
        WHERE
            (
                usuario_a_id = $1::uuid
                AND usuario_b_id = $2::uuid
            )
            OR
            (
                usuario_a_id = $2::uuid
                AND usuario_b_id = $1::uuid
            )
        LIMIT 1
        `,
        [usuarioId, otroUsuarioId]
    );

    return resultado.rowCount === 1;
}

async function comprobarBloqueo(
    usuarioId: string,
    otroUsuarioId: string
) {
    const resultado = await db.query(
        `
        SELECT 1
        FROM bloqueos
        WHERE
            (
                bloqueador_id = $1::uuid
                AND bloqueado_id = $2::uuid
            )
            OR
            (
                bloqueador_id = $2::uuid
                AND bloqueado_id = $1::uuid
            )
        LIMIT 1
        `,
        [usuarioId, otroUsuarioId]
    );

    return resultado.rowCount === 1;
}

export async function obtenerOCrearConversacion(
    usuarioId: string,
    otroUsuarioId: string
) {
    if (usuarioId === otroUsuarioId) {
        throw new Error("No puedes crear una conversación contigo mismo");
    }

    const sonAmigos = await comprobarAmistad(
        usuarioId,
        otroUsuarioId
    );

    if (!sonAmigos) {
        throw new Error("Solo puedes hablar con tus amigos");
    }

    const hayBloqueo = await comprobarBloqueo(
        usuarioId,
        otroUsuarioId
    );

    if (hayBloqueo) {
        throw new Error("No puedes hablar con este usuario");
    }

    const resultado = await db.query(
        `
        INSERT INTO conversaciones_privadas (
            usuario_a_id,
            usuario_b_id
        )
        VALUES (
            LEAST($1::uuid, $2::uuid),
            GREATEST($1::uuid, $2::uuid)
        )
        ON CONFLICT (usuario_a_id, usuario_b_id)
        DO NOTHING
        RETURNING id
        `,
        [usuarioId, otroUsuarioId]
    );

    if (resultado.rowCount === 1) {
        return resultado.rows[0].id;
    }

    const conversacion = await db.query(
        `
        SELECT id
        FROM conversaciones_privadas
        WHERE
            usuario_a_id = LEAST($1::uuid, $2::uuid)
            AND usuario_b_id = GREATEST($1::uuid, $2::uuid)
        LIMIT 1
        `,
        [usuarioId, otroUsuarioId]
    );

    if (conversacion.rowCount !== 1) {
        throw new Error("No se pudo obtener la conversación");
    }

    return conversacion.rows[0].id;
}

export async function obtenerMensajesConversacion(
    usuarioId: string,
    otroUsuarioId: string
) {
    const sonAmigos = await comprobarAmistad(
        usuarioId,
        otroUsuarioId
    );

    if (!sonAmigos) {
        throw new Error("Solo puedes ver conversaciones con tus amigos");
    }

    const hayBloqueo = await comprobarBloqueo(
        usuarioId,
        otroUsuarioId
    );

    if (hayBloqueo) {
        throw new Error("No puedes ver esta conversación");
    }

    const resultado = await db.query(
        `
        SELECT
            mp.id,
            mp.autor_id,
            (mp.autor_id = $3::uuid) AS es_mio,
            mp.tipo,
            mp.contenido,
            mp.archivo_id,
            a.ruta AS archivo_ruta,
            mp.mensaje_respondiendo_id,
            respuesta.contenido AS mensaje_respuesta_contenido,
            mp.creado_en,
            mp.editado_en,
            mp.datos
        FROM mensajes_privados mp
        INNER JOIN conversaciones_privadas cp
            ON cp.id = mp.conversacion_id
        LEFT JOIN archivos a ON a.id = mp.archivo_id
        LEFT JOIN mensajes_privados respuesta
            ON respuesta.id = mp.mensaje_respondiendo_id
        WHERE
            cp.usuario_a_id = LEAST($1::uuid, $2::uuid)
            AND cp.usuario_b_id = GREATEST($1::uuid, $2::uuid)
        ORDER BY mp.creado_en ASC
        `,
        [usuarioId, otroUsuarioId, usuarioId]
    );

    // Quien abre el chat da por leídos los mensajes que le escribieron: así la
    // lista de amigos solo enseña punto rojo con lo que no se ha visto aún.
    await db.query(
        `
        UPDATE mensajes_privados mp
        SET leido_en = NOW()
        FROM conversaciones_privadas cp
        WHERE mp.conversacion_id = cp.id
          AND mp.autor_id = $2::uuid
          AND mp.leido_en IS NULL
          AND cp.usuario_a_id = LEAST($1::uuid, $2::uuid)
          AND cp.usuario_b_id = GREATEST($1::uuid, $2::uuid)
        `,
        [usuarioId, otroUsuarioId]
    );

    return resultado.rows;
}

export async function enviarMensajeTexto(
    usuarioId: string,
    otroUsuarioId: string,
    contenido: string,
    respuestaId?: string
) {
    if (usuarioId === otroUsuarioId) {
        throw new Error("No puedes enviarte mensajes a ti mismo");
    }

    const texto = contenido.trim();

    if (!texto || texto.length > 5000) {
        throw new Error("El mensaje debe tener entre 1 y 5000 caracteres");
    }

    const sonAmigos = await comprobarAmistad(
        usuarioId,
        otroUsuarioId
    );

    if (!sonAmigos) {
        throw new Error("Solo puedes enviar mensajes a tus amigos");
    }

    const hayBloqueo = await comprobarBloqueo(
        usuarioId,
        otroUsuarioId
    );

    if (hayBloqueo) {
        throw new Error("No puedes enviar mensajes a este usuario");
    }

    const conversacionId = await obtenerOCrearConversacion(
        usuarioId,
        otroUsuarioId
    );

    if (respuestaId) {
        const referencia = await db.query(
            `SELECT id FROM mensajes_privados
             WHERE id = $1 AND conversacion_id = $2`,
            [respuestaId, conversacionId]
        );
        if (referencia.rowCount !== 1) {
            throw new Error("El mensaje al que respondes no existe en esta conversación");
        }
    }

    const resultado = await db.query(
        `
        INSERT INTO mensajes_privados (
            conversacion_id,
            autor_id,
            tipo,
            contenido,
            mensaje_respondiendo_id
        )
        VALUES (
            $1,
            $2,
            'texto',
            $3,
            $4
        )
        RETURNING
            id,
            autor_id,
            tipo,
            contenido,
            archivo_id,
            mensaje_respondiendo_id,
            creado_en,
            editado_en
        `,
        [
            conversacionId,
            usuarioId,
            texto,
            respuestaId ?? null
        ]
    );

    await crearNotificacion(
        otroUsuarioId,
        "mensajes_privados",
        "mensaje_privado",
        "Nuevo mensaje",
        texto.length > 120 ? `${texto.slice(0, 117)}...` : texto,
        { usuarioId, mensajeId: resultado.rows[0].id },
        usuarioId
    );

    return resultado.rows[0];
}

// Comprobaciones comunes antes de tocar una conversación privada. Se usan
// tanto al enviar un mensaje como al subir un adjunto.
export async function comprobarConversacionPermitida(
    usuarioId: string,
    otroUsuarioId: string
) {
    if (usuarioId === otroUsuarioId) {
        throw new Error("No puedes enviarte mensajes a ti mismo");
    }

    const sonAmigos = await comprobarAmistad(usuarioId, otroUsuarioId);
    if (!sonAmigos) {
        throw new Error("Solo puedes enviar mensajes a tus amigos");
    }

    const hayBloqueo = await comprobarBloqueo(usuarioId, otroUsuarioId);
    if (hayBloqueo) {
        throw new Error("No puedes enviar mensajes a este usuario");
    }
}

const TIPOS_ADJUNTO = ["imagen", "audio", "video"] as const;

const RESUMEN_ADJUNTO: Record<string, string> = {
    imagen: "Te ha enviado una foto",
    audio: "Te ha enviado un audio",
    video: "Te ha enviado un vídeo"
};

// Mensajes con foto, audio o vídeo: el archivo ya está subido y solo hay que
// enlazarlo a la conversación.
export async function enviarMensajeAdjunto(
    usuarioId: string,
    otroUsuarioId: string,
    opciones: {
        tipo?: string;
        archivoId?: string;
        contenido?: string;
        respuestaId?: string;
    }
) {
    await comprobarConversacionPermitida(usuarioId, otroUsuarioId);

    const tipo = opciones.tipo as (typeof TIPOS_ADJUNTO)[number];
    if (!TIPOS_ADJUNTO.includes(tipo)) {
        throw new Error("El tipo de adjunto no es válido");
    }

    if (!opciones.archivoId) {
        throw new Error("El mensaje con archivo necesita un archivo adjunto");
    }

    const conversacionId = await obtenerOCrearConversacion(usuarioId, otroUsuarioId);

    // El archivo debe ser de quien envía y coincidir con el tipo del mensaje.
    const archivo = await db.query(
        `SELECT 1 FROM archivos WHERE id = $1 AND propietario_id = $2 AND tipo = $3`,
        [opciones.archivoId, usuarioId, `mensaje_${tipo}`]
    );
    if (archivo.rowCount !== 1) {
        throw new Error("El archivo adjunto no es válido");
    }

    const texto = (opciones.contenido ?? "").trim();
    if (texto.length > 5000) {
        throw new Error("El mensaje no puede superar los 5000 caracteres");
    }

    if (opciones.respuestaId) {
        const referencia = await db.query(
            `SELECT id FROM mensajes_privados
             WHERE id = $1 AND conversacion_id = $2`,
            [opciones.respuestaId, conversacionId]
        );
        if (referencia.rowCount !== 1) {
            throw new Error("El mensaje al que respondes no existe en esta conversación");
        }
    }

    const resultado = await db.query(
        `
        INSERT INTO mensajes_privados (
            conversacion_id,
            autor_id,
            tipo,
            contenido,
            archivo_id,
            mensaje_respondiendo_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
            id,
            autor_id,
            tipo,
            contenido,
            archivo_id,
            mensaje_respondiendo_id,
            creado_en,
            editado_en
        `,
        [
            conversacionId,
            usuarioId,
            tipo,
            texto || null,
            opciones.archivoId,
            opciones.respuestaId ?? null
        ]
    );

    await crearNotificacion(
        otroUsuarioId,
        "mensajes_privados",
        "mensaje_privado",
        "Nuevo mensaje",
        texto || RESUMEN_ADJUNTO[tipo],
        { usuarioId, mensajeId: resultado.rows[0].id },
        usuarioId
    );

    return resultado.rows[0];
}

// ============================================================
// UBICACIÓN EN DIRECTO
// Un mensaje de texto normal cuyo campo datos trae la posición. Mientras la
// persona comparte, la misma fila se va actualizando: no se crea un mensaje
// nuevo por cada movimiento ni se ensucia el chat.
// ============================================================

export const MINUTOS_UBICACION_MINIMO = 15;
export const MINUTOS_UBICACION_MAXIMO = 480;

export function prepararDatosUbicacion(cuerpo: any) {
    const lat = Number(cuerpo?.lat);
    const lon = Number(cuerpo?.lon);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error("La latitud no es válida");
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw new Error("La longitud no es válida");
    }

    const precision = Math.min(
        5000,
        Math.max(0, Math.round(Number(cuerpo?.precision) || 0))
    );

    const minutos = Math.min(
        MINUTOS_UBICACION_MAXIMO,
        Math.max(
            MINUTOS_UBICACION_MINIMO,
            Math.round(Number(cuerpo?.minutos) || MINUTOS_UBICACION_MAXIMO)
        )
    );

    const nombre = String(cuerpo?.nombre ?? "").trim().slice(0, 80);

    return {
        ubicacion: {
            lat,
            lon,
            precision,
            enVivo: true,
            expiraEn: new Date(Date.now() + minutos * 60 * 1000).toISOString(),
            nombre: nombre || "Ubicación en directo"
        }
    };
}

// Compartir por primera vez: crea el mensaje que luego se va actualizando.
export async function enviarUbicacion(
    usuarioId: string,
    otroUsuarioId: string,
    cuerpo: any
) {
    await comprobarConversacionPermitida(usuarioId, otroUsuarioId);

    const datos = prepararDatosUbicacion(cuerpo);
    const conversacionId = await obtenerOCrearConversacion(usuarioId, otroUsuarioId);

    const resultado = await db.query(
        `
        INSERT INTO mensajes_privados (
            conversacion_id,
            autor_id,
            tipo,
            contenido,
            datos
        )
        VALUES ($1, $2, 'texto', $3, $4::jsonb)
        RETURNING
            id,
            autor_id,
            tipo,
            contenido,
            archivo_id,
            mensaje_respondiendo_id,
            creado_en,
            editado_en,
            datos
        `,
        [
            conversacionId,
            usuarioId,
            `📍 ${datos.ubicacion.nombre}`,
            JSON.stringify(datos)
        ]
    );

    await crearNotificacion(
        otroUsuarioId,
        "mensajes_privados",
        "mensaje_privado",
        "Nuevo mensaje",
        "📍 Está compartiendo su ubicación",
        { usuarioId, mensajeId: resultado.rows[0].id },
        usuarioId
    );

    return resultado.rows[0];
}

// Movimiento: solo la persona que lo comparten puede moverlo, y solo si sigue
// en vivo y sin caducar.
export async function actualizarUbicacion(
    usuarioId: string,
    mensajeId: string,
    cuerpo: any
) {
    const lat = Number(cuerpo?.lat);
    const lon = Number(cuerpo?.lon);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error("La latitud no es válida");
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw new Error("La longitud no es válida");
    }

    const precision = Math.min(
        5000,
        Math.max(0, Math.round(Number(cuerpo?.precision) || 0))
    );

    const resultado = await db.query(
        `
        UPDATE mensajes_privados mp
        SET datos = jsonb_set(
            jsonb_set(
                jsonb_set(
                    mp.datos,
                    '{ubicacion,lat}',
                    to_jsonb($2::double precision)
                ),
                '{ubicacion,lon}',
                to_jsonb($3::double precision)
            ),
            '{ubicacion,precision}',
            to_jsonb($4::double precision)
        )
        WHERE
            mp.id = $1::uuid
            AND mp.autor_id = $5::uuid
            AND (mp.datos->'ubicacion'->>'enVivo')::boolean IS TRUE
            AND (mp.datos->'ubicacion'->>'expiraEn')::timestamptz > NOW()
        RETURNING mp.id, mp.autor_id, mp.datos, mp.creado_en
        `,
        [mensajeId, lat, lon, precision, usuarioId]
    );

    if (resultado.rowCount !== 1) {
        throw new Error("Esta ubicación ya no está en directo");
    }

    return resultado.rows[0];
}

// Parar: solo quien la comparte puede hacerlo, y el resto lo ve al instante.
export async function detenerUbicacion(
    usuarioId: string,
    mensajeId: string
) {
    const resultado = await db.query(
        `
        UPDATE mensajes_privados mp
        SET datos = jsonb_set(
                mp.datos,
                '{ubicacion,enVivo}',
                'false'::jsonb
            )
        WHERE
            mp.id = $1::uuid
            AND mp.autor_id = $2::uuid
            AND (mp.datos->'ubicacion'->>'enVivo')::boolean IS TRUE
        RETURNING mp.id, mp.autor_id, mp.datos, mp.creado_en
        `,
        [mensajeId, usuarioId]
    );

    if (resultado.rowCount !== 1) {
        throw new Error("Esta ubicación ya no está en directo");
    }

    return resultado.rows[0];
}

export async function editarMensajeTexto(
    usuarioId: string,
    mensajeId: string,
    contenido: string
) {
    const texto = contenido.trim();

    if (!texto || texto.length > 5000) {
        throw new Error("El mensaje debe tener entre 1 y 5000 caracteres");
    }

    const resultado = await db.query(
        `
        UPDATE mensajes_privados mp
        SET
            contenido = $1,
            editado_en = NOW()
        FROM conversaciones_privadas cp
        WHERE
            mp.id = $2::uuid
            AND mp.conversacion_id = cp.id
            AND mp.autor_id = $3::uuid
            AND mp.tipo = 'texto'
            AND (
                cp.usuario_a_id = $3::uuid
                OR cp.usuario_b_id = $3::uuid
            )
            AND EXISTS (
                SELECT 1
                FROM amistades a
                WHERE
                    (
                        a.usuario_a_id = $3::uuid
                        AND a.usuario_b_id =
                            CASE
                                WHEN cp.usuario_a_id = $3::uuid
                                THEN cp.usuario_b_id
                                ELSE cp.usuario_a_id
                            END
                    )
                    OR
                    (
                        a.usuario_b_id = $3::uuid
                        AND a.usuario_a_id =
                            CASE
                                WHEN cp.usuario_a_id = $3::uuid
                                THEN cp.usuario_b_id
                                ELSE cp.usuario_a_id
                            END
                    )
            )
                AND NOT EXISTS (
                    SELECT 1
                    FROM bloqueos b
                    WHERE
                        (b.bloqueador_id = $3::uuid AND b.bloqueado_id =
                            CASE WHEN cp.usuario_a_id = $3::uuid THEN cp.usuario_b_id ELSE cp.usuario_a_id END)
                        OR
                        (b.bloqueador_id = CASE WHEN cp.usuario_a_id = $3::uuid THEN cp.usuario_b_id ELSE cp.usuario_a_id END
                            AND b.bloqueado_id = $3::uuid)
                )
        RETURNING
            mp.id,
            mp.autor_id,
            mp.tipo,
            mp.contenido,
            mp.archivo_id,
            mp.mensaje_respondiendo_id,
            mp.creado_en,
            mp.editado_en
        `,
        [
            texto,
            mensajeId,
            usuarioId
        ]
    );

    if (resultado.rowCount !== 1) {
        throw new Error(
            "No se pudo editar el mensaje"
        );
    }

    return resultado.rows[0];
}

export async function eliminarMensajesTexto(usuarioId: string, mensajeIds: string[]) {
    const ids = [...new Set((mensajeIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (ids.length === 0 || ids.length > 50) {
        throw new Error("Selecciona entre 1 y 50 mensajes para eliminar");
    }
    const resultado = await db.query(
        `
        DELETE FROM mensajes_privados mp
        USING conversaciones_privadas cp
        WHERE mp.id = ANY($1::uuid[])
          AND mp.conversacion_id = cp.id
          AND mp.autor_id = $2::uuid
          AND mp.tipo = 'texto'
          AND (cp.usuario_a_id = $2::uuid OR cp.usuario_b_id = $2::uuid)
                    AND EXISTS (
                            SELECT 1 FROM amistades a
                            WHERE a.usuario_a_id = LEAST(cp.usuario_a_id, cp.usuario_b_id)
                                AND a.usuario_b_id = GREATEST(cp.usuario_a_id, cp.usuario_b_id)
                    )
                    AND NOT EXISTS (
                            SELECT 1 FROM bloqueos b
                            WHERE (b.bloqueador_id = cp.usuario_a_id AND b.bloqueado_id = cp.usuario_b_id)
                                 OR (b.bloqueador_id = cp.usuario_b_id AND b.bloqueado_id = cp.usuario_a_id)
                    )
        RETURNING mp.id
        `,
        [ids, usuarioId]
    );
    if ((resultado.rowCount ?? 0) !== ids.length) {
        throw new Error("Solo puedes eliminar tus mensajes de texto");
    }
    return { mensaje: ids.length === 1 ? "Mensaje eliminado" : `${ids.length} mensajes eliminados` };
}