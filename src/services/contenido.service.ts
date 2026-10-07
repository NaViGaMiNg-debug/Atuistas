import { db } from "../db/database.js";
import { crearNotificacion } from "./notificaciones.service.js";
import { puedeEditarComoDesarrollador } from "./desarrollador.service.js";

// Lo publico lo ve todo el mundo, lo de amigos solo los amigos y lo mio siempre.
// Si no cumple nada de eso la publicacion es como si no existiera.
async function puedeVerPublicacion(usuarioId: string, publicacionId: string) {
    const resultado = await db.query(
        `
        SELECT p.id
        FROM publicaciones p
        WHERE p.id = $2
          AND (
              p.visibilidad = 'publica'
              OR p.autor_id = $1
              OR (
                  p.visibilidad = 'amigos'
                  AND EXISTS (
                      SELECT 1 FROM amistades a
                      WHERE a.usuario_a_id = LEAST(p.autor_id, $1::uuid)
                        AND a.usuario_b_id = GREATEST(p.autor_id, $1::uuid)
                  )
              )
          )
        `,
        [usuarioId, publicacionId]
    );
    if (resultado.rowCount !== 1) throw new Error("Publicación no disponible");
}

export async function obtenerPublicaciones(usuarioId: string, seccion: "amigos" | "publica") {
    const resultado = await db.query(
        `
         SELECT p.id, p.autor_id, (p.autor_id = $1::uuid) AS es_mia,
             p.texto, p.visibilidad, p.creada_en,
               u.nombre AS autor_nombre, u.color_nombre,
               CASE WHEN ar.ruta IS NULL THEN NULL ELSE REPLACE(ar.ruta, '\\', '/') END AS avatar_url,
               (SELECT COUNT(*)::int FROM corazones_publicacion c WHERE c.publicacion_id = p.id) AS corazones,
               EXISTS (SELECT 1 FROM corazones_publicacion c
                       WHERE c.publicacion_id = p.id AND c.usuario_id = $1) AS me_gusta,
               (SELECT COUNT(*)::int FROM comentarios co WHERE co.publicacion_id = p.id) AS comentarios,
               COALESCE((
                   SELECT json_agg(json_build_object(
                       'tipo', mp.tipo,
                       'url', REPLACE(a.ruta, '\\', '/'),
                       'mime_type', a.mime_type
                   ) ORDER BY mp.orden)
                   FROM multimedia_publicacion mp
                   INNER JOIN archivos a ON a.id = mp.archivo_id
                   WHERE mp.publicacion_id = p.id
               ), '[]'::json) AS multimedia
        FROM publicaciones p
        INNER JOIN usuarios u ON u.id = p.autor_id AND u.activo = TRUE
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        WHERE (
            ($2 = 'publica' AND p.visibilidad = 'publica')
            OR
            ($2 = 'amigos' AND (
                p.visibilidad = 'publica'
                OR p.autor_id = $1
                OR (p.visibilidad = 'amigos' AND EXISTS (
                    SELECT 1 FROM amistades a
                    WHERE a.usuario_a_id = LEAST(p.autor_id, $1::uuid)
                      AND a.usuario_b_id = GREATEST(p.autor_id, $1::uuid)
                ))
            ))
        )
        ORDER BY p.creada_en DESC
        LIMIT 50
        `,
        [usuarioId, seccion]
    );
    return resultado.rows;
}

export async function crearPublicacion(usuarioId: string, texto: string, visibilidad: "amigos" | "publica") {
    const contenido = texto.trim();
    if (!contenido || contenido.length > 5000) {
        throw new Error("La publicación debe tener entre 1 y 5000 caracteres");
    }
    if (visibilidad !== "amigos" && visibilidad !== "publica") {
        throw new Error("La visibilidad no es válida");
    }
    const resultado = await db.query(
        `INSERT INTO publicaciones (autor_id, texto, visibilidad)
         VALUES ($1, $2, $3)
         RETURNING id, autor_id, texto, visibilidad, creada_en`,
        [usuarioId, contenido, visibilidad]
    );
    return resultado.rows[0];
}

export async function obtenerComentarios(usuarioId: string, publicacionId: string) {
    await puedeVerPublicacion(usuarioId, publicacionId);
    const resultado = await db.query(
        `
        SELECT c.id, c.autor_id, c.texto, c.creado_en,
               u.nombre AS autor_nombre, u.color_nombre
        FROM comentarios c
        INNER JOIN usuarios u ON u.id = c.autor_id AND u.activo = TRUE
        WHERE c.publicacion_id = $1
        ORDER BY c.creado_en ASC
        LIMIT 100
        `,
        [publicacionId]
    );
    return resultado.rows;
}

export async function comentarPublicacion(usuarioId: string, publicacionId: string, texto: string) {
    await puedeVerPublicacion(usuarioId, publicacionId);
    const contenido = texto.trim();
    if (!contenido || contenido.length > 1000) {
        throw new Error("El comentario debe tener entre 1 y 1000 caracteres");
    }
    const resultado = await db.query(
        `INSERT INTO comentarios (publicacion_id, autor_id, texto)
         VALUES ($1, $2, $3)
         RETURNING id, autor_id, texto, creado_en`,
        [publicacionId, usuarioId, contenido]
    );
    const autor = await db.query(`SELECT autor_id FROM publicaciones WHERE id = $1`, [publicacionId]);
    const autorId = autor.rows[0]?.autor_id as string | undefined;
    if (autorId && autorId !== usuarioId) {
        await crearNotificacion(
            autorId,
            "comentarios",
            "comentario_publicacion",
            "Nuevo comentario",
            contenido.length > 120 ? `${contenido.slice(0, 117)}...` : contenido,
            { publicacionId, comentarioId: resultado.rows[0].id },
            usuarioId
        );
    }
    return resultado.rows[0];
}

export async function alternarCorazon(usuarioId: string, publicacionId: string) {
    await puedeVerPublicacion(usuarioId, publicacionId);
    const eliminado = await db.query(
        `DELETE FROM corazones_publicacion
         WHERE publicacion_id = $1 AND usuario_id = $2`,
        [publicacionId, usuarioId]
    );
    if (eliminado.rowCount === 1) return { me_gusta: false };

    await db.query(
        `INSERT INTO corazones_publicacion (publicacion_id, usuario_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [publicacionId, usuarioId]
    );

    const autor = await db.query(`SELECT autor_id FROM publicaciones WHERE id = $1`, [publicacionId]);
    const autorId = autor.rows[0]?.autor_id as string | undefined;
    if (autorId && autorId !== usuarioId) {
        await crearNotificacion(
            autorId,
            "corazones",
            "corazon_publicacion",
            "Nuevo corazón",
            "A alguien le ha gustado tu publicación.",
            { publicacionId },
            usuarioId
        );
    }
    return { me_gusta: true };
}

export async function eliminarPublicacion(usuarioId: string, publicacionId: string) {
    // El autor borra lo suyo; el desarrollador borra lo de cualquiera.
    const puedeBorrar = await puedeEditarComoDesarrollador(usuarioId, null);
    const resultado = await db.query(
        `DELETE FROM publicaciones
         WHERE id = $1 AND (autor_id = $2 OR $3::boolean)
         RETURNING id`,
        [publicacionId, usuarioId, puedeBorrar]
    );
    if (resultado.rowCount !== 1) throw new Error("Solo el autor puede eliminar la publicación");
    return { mensaje: "Publicación eliminada" };
}

export async function obtenerEstados(usuarioId: string, seccion: "amigos" | "publica") {
    const resultado = await db.query(
        `
         SELECT s.id, s.autor_id, (s.autor_id = $1::uuid) AS es_mio,
             s.texto, s.visibilidad, s.creado_en, s.expira_en,
               u.nombre AS autor_nombre, u.color_nombre,
               CASE WHEN ar.ruta IS NULL THEN NULL ELSE REPLACE(ar.ruta, '\\', '/') END AS avatar_url,
               (SELECT COUNT(*)::int FROM estados_comentarios c WHERE c.estado_id = s.id) AS comentarios,
               (SELECT COUNT(*)::int FROM estados_likes l WHERE l.estado_id = s.id) AS likes,
               EXISTS (
                   SELECT 1 FROM estados_likes l
                   WHERE l.estado_id = s.id AND l.usuario_id = $1::uuid
               ) AS me_gusta,
               COALESCE((
                   SELECT json_agg(json_build_object(
                       'tipo', me.tipo,
                       'url', REPLACE(a.ruta, '\\', '/'),
                       'mime_type', a.mime_type
                   ) ORDER BY me.orden)
                   FROM multimedia_estado me
                   INNER JOIN archivos a ON a.id = me.archivo_id
                   WHERE me.estado_id = s.id
               ), '[]'::json) AS multimedia
        FROM estados s
        INNER JOIN usuarios u ON u.id = s.autor_id AND u.activo = TRUE
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        WHERE s.expira_en > NOW()
          AND (
              ($2 = 'publica' AND s.visibilidad = 'publica')
              OR
              ($2 = 'amigos' AND (
                  s.autor_id = $1 OR s.visibilidad = 'publica' OR
                  (s.visibilidad = 'amigos' AND EXISTS (
                      SELECT 1 FROM amistades a
                      WHERE a.usuario_a_id = LEAST(s.autor_id, $1::uuid)
                        AND a.usuario_b_id = GREATEST(s.autor_id, $1::uuid)
                  ))
              ))
          )
        ORDER BY s.creado_en DESC
        LIMIT 50
        `,
        [usuarioId, seccion]
    );
    return resultado.rows;
}

export async function crearEstado(usuarioId: string, texto: string, visibilidad: "amigos" | "publica") {
    const contenido = texto.trim();
    if (!contenido || contenido.length > 500) {
        throw new Error("El estado debe tener entre 1 y 500 caracteres");
    }
    if (visibilidad !== "amigos" && visibilidad !== "publica") {
        throw new Error("La visibilidad no es válida");
    }
    const resultado = await db.query(
        `INSERT INTO estados (autor_id, texto, visibilidad, expira_en)
         VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
         RETURNING id, autor_id, texto, visibilidad, creado_en, expira_en`,
        [usuarioId, contenido, visibilidad]
    );
    return resultado.rows[0];
}

export async function eliminarEstado(usuarioId: string, estadoId: string) {
    const puedeBorrar = await puedeEditarComoDesarrollador(usuarioId, null);
    const resultado = await db.query(
        `DELETE FROM estados
         WHERE id = $1 AND (autor_id = $2 OR $3::boolean)
         RETURNING id`,
        [estadoId, usuarioId, puedeBorrar]
    );
    if (resultado.rowCount !== 1) throw new Error("Solo puedes eliminar tus propios estados");
    return { mensaje: "Estado eliminado" };
}

// Quien ve el estado puede comentarlo: mismas reglas que para leerlo.
async function puedeVerEstado(usuarioId: string, estadoId: string) {
    const resultado = await db.query(
        `
        SELECT s.id
        FROM estados s
        WHERE s.id = $2
          AND s.expira_en > NOW()
          AND (
              s.visibilidad = 'publica'
              OR s.autor_id = $1
              OR (
                  s.visibilidad = 'amigos'
                  AND EXISTS (
                      SELECT 1 FROM amistades a
                      WHERE a.usuario_a_id = LEAST(s.autor_id, $1::uuid)
                        AND a.usuario_b_id = GREATEST(s.autor_id, $1::uuid)
                  )
              )
          )
        `,
        [usuarioId, estadoId]
    );
    if (resultado.rowCount !== 1) throw new Error("Estado no disponible");
}

export async function obtenerComentariosEstado(usuarioId: string, estadoId: string) {
    await puedeVerEstado(usuarioId, estadoId);
    const resultado = await db.query(
        `
        SELECT c.id, c.autor_id, c.texto, c.creado_en,
               u.nombre AS autor_nombre, u.color_nombre
        FROM estados_comentarios c
        INNER JOIN usuarios u ON u.id = c.autor_id AND u.activo = TRUE
        WHERE c.estado_id = $1
        ORDER BY c.creado_en ASC
        LIMIT 100
        `,
        [estadoId]
    );
    return resultado.rows;
}

export async function comentarEstado(usuarioId: string, estadoId: string, texto: string) {
    await puedeVerEstado(usuarioId, estadoId);
    const contenido = texto.trim();
    if (!contenido || contenido.length > 1000) {
        throw new Error("El comentario debe tener entre 1 y 1000 caracteres");
    }
    const resultado = await db.query(
        `INSERT INTO estados_comentarios (estado_id, autor_id, texto)
         VALUES ($1, $2, $3)
         RETURNING id, autor_id, texto, creado_en`,
        [estadoId, usuarioId, contenido]
    );
    const autor = await db.query(`SELECT autor_id FROM estados WHERE id = $1`, [estadoId]);
    const autorId = autor.rows[0]?.autor_id as string | undefined;
    if (autorId && autorId !== usuarioId) {
        await crearNotificacion(
            autorId,
            "comentarios",
            "comentario_estado",
            "Nuevo comentario",
            contenido.length > 120 ? `${contenido.slice(0, 117)}...` : contenido,
            { estadoId, comentarioId: resultado.rows[0].id },
            usuarioId
        );
    }
    return resultado.rows[0];
}

// Un corazón por persona y estado, con las mismas reglas de visibilidad que
// leerlo: pulsar una vez lo pone, otra vez lo quita (igual que en los reels).
export async function alternarLikeEstado(usuarioId: string, estadoId: string) {
    await puedeVerEstado(usuarioId, estadoId);
    const quitado = await db.query(
        `DELETE FROM estados_likes WHERE estado_id = $1 AND usuario_id = $2`,
        [estadoId, usuarioId]
    );
    if (quitado.rowCount !== 1) {
        await db.query(
            `INSERT INTO estados_likes (estado_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [estadoId, usuarioId]
        );
    }
    const cuenta = await db.query(
        `SELECT COUNT(*)::int AS likes FROM estados_likes WHERE estado_id = $1`,
        [estadoId]
    );
    return { me_gusta: quitado.rowCount !== 1, likes: cuenta.rows[0].likes };
}