import { db } from "../db/database.js";
import { esDesarrollador } from "./desarrollador.service.js";

export async function obtenerPerfilVisible(
    visitanteId: string,
    perfilId: string
) {
    const usuario = await db.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.descripcion,
            u.color_nombre,
            u.etiqueta,
            (u.es_desarrollador) AS es_desarrollador,
            u.creado_en,
            CASE
                WHEN ar.ruta IS NOT NULL
                THEN REPLACE(ar.ruta, '\\', '/')
                ELSE NULL
            END AS avatar_url,
            CASE
                WHEN fr.ruta IS NOT NULL
                THEN REPLACE(fr.ruta, '\\', '/')
                ELSE NULL
            END AS fondo_url,
            (u.id = $1::uuid) AS es_mio,
            EXISTS (
                SELECT 1 FROM amistades am
                WHERE am.usuario_a_id = LEAST(u.id, $1::uuid)
                  AND am.usuario_b_id = GREATEST(u.id, $1::uuid)
            ) AS es_amigo,
            EXISTS (
                SELECT 1 FROM bloqueos b
                WHERE (b.bloqueador_id = $1::uuid AND b.bloqueado_id = u.id)
                   OR (b.bloqueador_id = u.id AND b.bloqueado_id = $1::uuid)
            ) AS hay_bloqueo
        FROM usuarios u
        LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
        LEFT JOIN archivos fr ON fr.id = u.fondo_archivo_id
        WHERE u.id = $2::uuid AND u.activo = TRUE
        LIMIT 1
        `,
        [visitanteId, perfilId]
    );

    if (usuario.rowCount !== 1) {
        throw new Error("Perfil no disponible");
    }

    const perfil = usuario.rows[0] as {
        id: string;
        nombre: string;
        descripcion: string | null;
        color_nombre: string;
        etiqueta: string | null;
        es_desarrollador: boolean;
        creado_en: string;
        avatar_url: string | null;
        fondo_url: string | null;
        es_mio: boolean;
        es_amigo: boolean;
        hay_bloqueo: boolean;
    };

    const esPropio = perfil.es_mio === true;
    const esAmigo = perfil.es_amigo === true;

    // Quien mira decide si tiene herramientas de desarrollador: la cuenta con
    // poderes (la de "Creador") puede meterse a ver cualquier perfil aunque no
    // sea amiga o haya bloqueo.
    const soyDesarrollador = await esDesarrollador(visitanteId);
    const puedeVerPrivado =
        esPropio || perfil.es_amigo === true || soyDesarrollador;

    if (!esPropio && !soyDesarrollador && perfil.hay_bloqueo === true) {
        throw new Error("Perfil no disponible");
    }

    const conteos = await db.query(
        `
        SELECT
            (SELECT COUNT(*)::int FROM amistades a
              WHERE a.usuario_a_id = $1::uuid OR a.usuario_b_id = $1::uuid) AS amigos,
            (SELECT COUNT(*)::int FROM solicitudes_amistad s
              WHERE s.receptor_id = $1::uuid AND s.estado = 'pendiente') AS recibidas,
            (SELECT COUNT(*)::int FROM solicitudes_amistad s
              WHERE s.emisor_id = $1::uuid AND s.estado = 'pendiente') AS enviadas,
            (SELECT COUNT(*)::int FROM publicaciones p
              WHERE p.autor_id = $1::uuid
                AND (p.visibilidad = 'publica'
                     OR $2::boolean
                     OR ($3::boolean AND p.visibilidad = 'amigos'))) AS publicaciones,
            (SELECT COUNT(*)::int FROM estados s
              WHERE s.autor_id = $1::uuid AND s.expira_en > NOW()
                AND (s.visibilidad = 'publica'
                     OR $2::boolean
                     OR ($3::boolean AND s.visibilidad = 'amigos'))) AS estados
        `,
        [perfilId, esPropio, puedeVerPrivado]
    );

    const fila = conteos.rows[0] as {
        amigos: number;
        recibidas: number;
        enviadas: number;
        publicaciones: number;
        estados: number;
    };

    return {
        perfil: {
            id: perfil.id,
            nombre: perfil.nombre,
            descripcion: perfil.descripcion,
            color_nombre: perfil.color_nombre,
            // El texto corto va entre el nombre y la descripción.
            etiqueta: perfil.etiqueta,
            es_desarrollador: perfil.es_desarrollador === true,
            soy_desarrollador: soyDesarrollador,
            avatar_url: perfil.avatar_url,
            fondo_url: perfil.fondo_url,
            creado_en: perfil.creado_en,
            es_mio: esPropio,
            es_amigo: perfil.es_amigo === true,
            tiene_estados: Number(fila.estados ?? 0) > 0
        },
        conteos: {
            amigos: Number(fila.amigos ?? 0),
            solicitudes_recibidas: Number(fila.recibidas ?? 0),
            solicitudes_enviadas: Number(fila.enviadas ?? 0),
            solicitudes_recibidas_visible: true,
            solicitudes_enviadas_visible: true,
            publicaciones: Number(fila.publicaciones ?? 0)
        },
        puede_ver_amigos: true
    };
}

export async function comprobarAccesoPerfil(
    visitanteId: string,
    perfilId: string
) {
    const acceso = await db.query(
        `
        SELECT
            (u.id = $1::uuid) AS es_mio,
            EXISTS (
                SELECT 1 FROM amistades am
                WHERE am.usuario_a_id = LEAST(u.id, $1::uuid)
                  AND am.usuario_b_id = GREATEST(u.id, $1::uuid)
            ) AS es_amigo,
            EXISTS (
                SELECT 1 FROM bloqueos b
                WHERE (b.bloqueador_id = $1::uuid AND b.bloqueado_id = u.id)
                   OR (b.bloqueador_id = u.id AND b.bloqueado_id = $1::uuid)
            ) AS hay_bloqueo
        FROM usuarios u
        WHERE u.id = $2::uuid AND u.activo = TRUE
        LIMIT 1
        `,
        [visitanteId, perfilId]
    );

    if (acceso.rowCount !== 1) {
        throw new Error("Perfil no disponible");
    }

    const fila = acceso.rows[0] as { es_mio: boolean; es_amigo: boolean; hay_bloqueo: boolean };
    const esPropio = fila.es_mio === true || visitanteId === perfilId;
    const esAmigo = fila.es_amigo === true;
    const hayBloqueo = fila.hay_bloqueo === true;

    // La cuenta con poderes (la de "Creador") puede meterse a ver cualquier
    // cuenta desde el buscador, aunque no sea amiga o haya bloqueo.
    const soyDesarrollador = await esDesarrollador(visitanteId);
    if (!esPropio && !soyDesarrollador && hayBloqueo) {
        throw new Error("Perfil no disponible");
    }

    return { esPropio, esAmigo, soyDesarrollador };
}

export async function obtenerPublicacionesPerfil(
    visitanteId: string,
    perfilId: string
) {
    const { esPropio, esAmigo, soyDesarrollador } = await comprobarAccesoPerfil(visitanteId, perfilId);
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
        WHERE p.autor_id = $2::uuid
          AND (p.visibilidad = 'publica'
               OR $3::boolean
               OR ($4::boolean AND p.visibilidad = 'amigos'))
        ORDER BY p.creada_en DESC
        LIMIT 50
        `,
        // El Creador (soyDesarrollador) ve todo lo que vería el propio autor.
        [visitanteId, perfilId, esPropio || soyDesarrollador, esPropio || esAmigo || soyDesarrollador]
    );

    return resultado.rows;
}

export async function obtenerEstadosPerfil(
    visitanteId: string,
    perfilId: string
) {
    const { esPropio, esAmigo, soyDesarrollador } = await comprobarAccesoPerfil(visitanteId, perfilId);
    const resultado = await db.query(
        `
         SELECT s.id, s.autor_id, (s.autor_id = $1::uuid) AS es_mio,
             s.texto, s.visibilidad, s.creado_en, s.expira_en,
               u.nombre AS autor_nombre, u.color_nombre,
               CASE WHEN ar.ruta IS NULL THEN NULL ELSE REPLACE(ar.ruta, '\\', '/') END AS avatar_url,
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
        WHERE s.autor_id = $2::uuid
          AND s.expira_en > NOW()
          AND (s.visibilidad = 'publica'
               OR $3::boolean
               OR ($4::boolean AND s.visibilidad = 'amigos'))
        ORDER BY s.creado_en DESC
        LIMIT 50
        `,
        // Igual que las publicaciones: el Creador ve los estados como su autor.
        [visitanteId, perfilId, esPropio || soyDesarrollador, esPropio || esAmigo || soyDesarrollador]
    );

    return resultado.rows;
}

export async function obtenerAmigosPerfil(
    visitanteId: string,
    perfilId: string
) {
    // comprobarAccesoPerfil valida que el perfil exista, esté activo y que no haya bloqueo.
    // Cualquier persona que pueda ver el perfil puede consultar su lista de amistades.
    await comprobarAccesoPerfil(visitanteId, perfilId);
    const resultado = await db.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.descripcion,
            u.color_nombre,
            CASE
                WHEN ar.ruta IS NOT NULL
                THEN REPLACE(ar.ruta, '\\', '/')
                ELSE NULL
            END AS avatar_url
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
        [perfilId]
    );

    return resultado.rows;
}

