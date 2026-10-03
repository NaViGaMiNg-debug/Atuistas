import { rm } from "node:fs/promises";
import path from "node:path";
import { db } from "../db/database.js";
import { guardarArchivoSubido } from "./archivos.service.js";
import { validarArchivos, type UploadFile } from "./multimedia.service.js";
import { crearNotificacion } from "./notificaciones.service.js";

type Visibilidad = "amigos" | "publica";

// Campos que se devuelven siempre: el visor de reels los necesita para pintar
// el vídeo, el autor, el corazón y los contadores sin pedir nada más.
const CAMPOS_REEL = `
    r.id, r.autor_id, (r.autor_id = $1::uuid) AS es_mio,
    r.titulo, r.visibilidad, r.creado_en,
    u.nombre AS autor_nombre, u.color_nombre,
    CASE WHEN ar.ruta IS NULL THEN NULL ELSE REPLACE(ar.ruta, '\', '/') END AS avatar_url,
    REPLACE(v.ruta, '\', '/') AS video_url,
    (SELECT COUNT(*)::int FROM reels_likes l WHERE l.reel_id = r.id) AS likes,
    EXISTS (
        SELECT 1 FROM reels_likes l WHERE l.reel_id = r.id AND l.usuario_id = $1
    ) AS me_gusta,
    (SELECT COUNT(*)::int FROM reels_comentarios c WHERE c.reel_id = r.id) AS comentarios
`;

// Visibilidad: en "publica" solo lo público; en "amigos" lo público, lo propio
// y lo de los amigos.
const VISIBILIDAD_REEL = `
    (
        ($2 = 'publica' AND r.visibilidad = 'publica')
        OR
        ($2 = 'amigos' AND (
            r.visibilidad = 'publica'
            OR r.autor_id = $1
            OR (r.visibilidad = 'amigos' AND EXISTS (
                SELECT 1 FROM amistades a
                WHERE a.usuario_a_id = LEAST(r.autor_id, $1::uuid)
                  AND a.usuario_b_id = GREATEST(r.autor_id, $1::uuid)
            ))
        ))
    )
`;

async function puedeVerReel(usuarioId: string, reelId: string) {
    const resultado = await db.query(
        `
        SELECT r.id
        FROM reels r
        WHERE r.id = $2
          AND (
              r.visibilidad = 'publica'
              OR r.autor_id = $1
              OR (
                  r.visibilidad = 'amigos'
                  AND EXISTS (
                      SELECT 1 FROM amistades a
                      WHERE a.usuario_a_id = LEAST(r.autor_id, $1::uuid)
                        AND a.usuario_b_id = GREATEST(r.autor_id, $1::uuid)
                  )
              )
          )
        `,
        [usuarioId, reelId]
    );
    if (resultado.rowCount !== 1) throw new Error("Reel no disponible");
}

export async function crearReel(
    usuarioId: string,
    titulo: string,
    visibilidad: Visibilidad,
    rawFiles: UploadFile[]
) {
    const nombre = titulo.trim();
    if (!nombre || nombre.length > 100) {
        throw new Error("El reel necesita un título de entre 1 y 100 caracteres");
    }
    if (visibilidad !== "amigos" && visibilidad !== "publica") {
        throw new Error("La visibilidad no es válida");
    }

    const files = await validarArchivos(rawFiles, "reel");

    const guardado = await guardarArchivoSubido({
        propietarioId: usuarioId,
        tipo: "reel_video",
        mimeType: files[0].mimetype,
        nombreOriginal: files[0].filename,
        buffer: files[0].buffer,
        carpeta: "reels"
    });

    try {
        const resultado = await db.query(
            `INSERT INTO reels (autor_id, archivo_id, titulo, visibilidad)
             VALUES ($1, $2, $3, $4)
             RETURNING id, titulo, visibilidad, creado_en`,
            [usuarioId, guardado.id, nombre, visibilidad]
        );
        return resultado.rows[0];
    } catch (error) {
        // Si el reel no llega a crearse, el vídeo no se queda huérfano.
        await db.query(`DELETE FROM archivos WHERE id = $1`, [guardado.id]);
        await rm(path.join(process.cwd(), guardado.ruta), { force: true });
        throw error;
    }
}
export async function obtenerReels(usuarioId: string, seccion: Visibilidad, limite = 30) {
    const resultado = await db.query(
        `
        SELECT ${CAMPOS_REEL}
        FROM reels r
        INNER JOIN usuarios u ON u.id = r.autor_id AND u.activo = TRUE
        INNER JOIN archivos v ON v.id = r.archivo_id
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        WHERE ${VISIBILIDAD_REEL}
        ORDER BY r.creado_en DESC
        LIMIT $3
        `,
        [usuarioId, seccion, limite]
    );
    return resultado.rows;
}

export async function obtenerMisReels(usuarioId: string, limite = 50) {
    const resultado = await db.query(
        `
        SELECT ${CAMPOS_REEL}
        FROM reels r
        INNER JOIN usuarios u ON u.id = r.autor_id AND u.activo = TRUE
        INNER JOIN archivos v ON v.id = r.archivo_id
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        WHERE r.autor_id = $1
        ORDER BY r.creado_en DESC
        LIMIT $2
        `,
        [usuarioId, limite]
    );
    return resultado.rows;
}

// Reels de otro usuario para su perfil: solo los que puede ver quien mira.
export async function obtenerReelsDeUsuario(visorId: string, autorId: string, limite = 30) {
    const resultado = await db.query(
        `
        SELECT ${CAMPOS_REEL}
        FROM reels r
        INNER JOIN usuarios u ON u.id = r.autor_id AND u.activo = TRUE
        INNER JOIN archivos v ON v.id = r.archivo_id
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        WHERE r.autor_id = $2
          AND (
              r.visibilidad = 'publica'
              OR r.autor_id = $1
              OR (r.visibilidad = 'amigos' AND EXISTS (
                  SELECT 1 FROM amistades a
                  WHERE a.usuario_a_id = LEAST(r.autor_id, $1::uuid)
                    AND a.usuario_b_id = GREATEST(r.autor_id, $1::uuid)
              ))
          )
        ORDER BY r.creado_en DESC
        LIMIT $3
        `,
        [visorId, autorId, limite]
    );
    return resultado.rows;
}
export async function obtenerReel(usuarioId: string, reelId: string) {
    await puedeVerReel(usuarioId, reelId);
    const resultado = await db.query(
        `
        SELECT ${CAMPOS_REEL}
        FROM reels r
        INNER JOIN usuarios u ON u.id = r.autor_id AND u.activo = TRUE
        INNER JOIN archivos v ON v.id = r.archivo_id
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        WHERE r.id = $2
        `,
        [usuarioId, reelId]
    );
    if (resultado.rowCount !== 1) throw new Error("Reel no disponible");
    return resultado.rows[0];
}

export async function alternarLikeReel(usuarioId: string, reelId: string) {
    await puedeVerReel(usuarioId, reelId);
    const eliminado = await db.query(
        `DELETE FROM reels_likes WHERE reel_id = $1 AND usuario_id = $2`,
        [reelId, usuarioId]
    );

    if (eliminado.rowCount !== 1) {
        await db.query(
            `INSERT INTO reels_likes (reel_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [reelId, usuarioId]
        );
        const autor = await db.query(`SELECT autor_id FROM reels WHERE id = $1`, [reelId]);
        const autorId = autor.rows[0]?.autor_id as string | undefined;
        if (autorId && autorId !== usuarioId) {
            await crearNotificacion(
                autorId,
                "corazones",
                "corazon_reel",
                "Nuevo corazón",
                "A alguien le ha gustado tu reel.",
                { reelId },
                usuarioId
            );
        }
    }

    const cuenta = await db.query(
        `SELECT COUNT(*)::int AS likes FROM reels_likes WHERE reel_id = $1`,
        [reelId]
    );
    return { me_gusta: eliminado.rowCount !== 1, likes: cuenta.rows[0].likes };
}

export async function obtenerComentariosReel(usuarioId: string, reelId: string) {
    await puedeVerReel(usuarioId, reelId);
    const resultado = await db.query(
        `
        SELECT c.id, c.autor_id, c.texto, c.creado_en,
               u.nombre AS autor_nombre, u.color_nombre
        FROM reels_comentarios c
        INNER JOIN usuarios u ON u.id = c.autor_id AND u.activo = TRUE
        WHERE c.reel_id = $1
        ORDER BY c.creado_en ASC
        LIMIT 100
        `,
        [reelId]
    );
    return resultado.rows;
}
export async function comentarReel(usuarioId: string, reelId: string, texto: string) {
    await puedeVerReel(usuarioId, reelId);
    const contenido = texto.trim();
    if (!contenido || contenido.length > 1000) {
        throw new Error("El comentario debe tener entre 1 y 1000 caracteres");
    }

    const resultado = await db.query(
        `INSERT INTO reels_comentarios (reel_id, autor_id, texto)
         VALUES ($1, $2, $3)
         RETURNING id, autor_id, texto, creado_en`,
        [reelId, usuarioId, contenido]
    );

    const reel = await db.query(`SELECT autor_id FROM reels WHERE id = $1`, [reelId]);
    const autorId = reel.rows[0]?.autor_id as string | undefined;
    if (autorId && autorId !== usuarioId) {
        await crearNotificacion(
            autorId,
            "comentarios",
            "comentario_reel",
            "Nuevo comentario",
            contenido.length > 120 ? `${contenido.slice(0, 117)}...` : contenido,
            { reelId, comentarioId: resultado.rows[0].id },
            usuarioId
        );
    }

    return resultado.rows[0];
}

export async function eliminarReel(usuarioId: string, reelId: string) {
    const resultado = await db.query(
        `DELETE FROM reels
         WHERE id = $1 AND autor_id = $2
         RETURNING id, archivo_id`,
        [reelId, usuarioId]
    );
    if (resultado.rowCount !== 1) {
        throw new Error("Solo el autor puede eliminar el reel");
    }

    const archivoId = resultado.rows[0].archivo_id as string;
    const archivo = await db.query(
        `DELETE FROM archivos WHERE id = $1 RETURNING ruta`,
        [archivoId]
    );
    const ruta = archivo.rows[0]?.ruta as string | undefined;
    if (ruta) await rm(path.join(process.cwd(), ruta), { force: true });

    return { mensaje: "Reel eliminado" };
}