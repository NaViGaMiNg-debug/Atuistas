import { rm } from "node:fs/promises";
import path from "node:path";
import { db } from "../db/database.js";
import { guardarArchivoSubido } from "./archivos.service.js";
import { validarArchivos, type UploadFile } from "./multimedia.service.js";
import { puedeEditarComoDesarrollador } from "./desarrollador.service.js";

export type TipoItem = "texto" | "imagen" | "video" | "audio";

// Tipo que recibe cada archivo en la tabla comun "archivos".
const TIPO_ARCHIVO: Record<string, string> = {
    imagen: "historia_imagen",
    video: "historia_video",
    audio: "historia_audio"
};

// Como en los estados, un elemento puede traer varios archivos (hasta 10 fotos).
const MODO_VALIDACION: Record<string, "imagenes" | "video" | "audio"> = {
    imagen: "imagenes",
    video: "video",
    audio: "audio"
};

const CAMPOS_HISTORIA = `
    h.id, h.autor_id, h.nombre, h.creado_en, h.actualizado_en,
    (SELECT COUNT(*)::int FROM historias_items i WHERE i.historia_id = h.id) AS elementos,
    (
        SELECT REPLACE(a.ruta, '\', '/')
        FROM historias_items i
        INNER JOIN archivos a ON a.id = i.archivo_id
        WHERE i.historia_id = h.id
        ORDER BY i.orden
        LIMIT 1
    ) AS portada
`;

const ITEMS_HISTORIA = `
    COALESCE((
        SELECT json_agg(json_build_object(
            'id', i.id,
            'tipo', i.tipo,
            'texto', i.texto,
            'url', REPLACE(a.ruta, '\', '/'),
            'mime_type', a.mime_type
        ) ORDER BY i.orden)
        FROM historias_items i
        LEFT JOIN archivos a ON a.id = i.archivo_id
        WHERE i.historia_id = h.id
    ), '[]'::json) AS items
`;

// Una historia solo se toca por quien la creó. El desarrollador puede tocarlas
// todas: por eso la pregunta ya no es solo por el autor.
async function historiaDelAutor(usuarioId: string, historiaId: string) {
    const resultado = await db.query(
        `SELECT id, nombre, autor_id FROM historias WHERE id = $1`,
        [historiaId]
    );
    if (resultado.rowCount !== 1) throw new Error("Esa historia no existe");
    if (!(await puedeEditarComoDesarrollador(usuarioId, resultado.rows[0].autor_id))) {
        throw new Error("Esa historia no es tuya");
    }
    return resultado.rows[0];
}

export async function crearHistoria(usuarioId: string, nombre: string) {
    const titulo = nombre.trim();
    if (!titulo || titulo.length > 60) {
        throw new Error("La historia necesita un nombre de entre 1 y 60 caracteres");
    }
    const resultado = await db.query(
        `INSERT INTO historias (autor_id, nombre) VALUES ($1, $2)
         RETURNING id, nombre, creado_en, actualizado_en`,
        [usuarioId, titulo]
    );
    return resultado.rows[0];
}

export async function renombrarHistoria(usuarioId: string, historiaId: string, nombre: string) {
    await historiaDelAutor(usuarioId, historiaId);
    const titulo = nombre.trim();
    if (!titulo || titulo.length > 60) {
        throw new Error("La historia necesita un nombre de entre 1 y 60 caracteres");
    }
    const resultado = await db.query(
        `UPDATE historias SET nombre = $3, actualizado_en = NOW() WHERE id = $1 AND autor_id = $2
         RETURNING id, nombre`,
        [historiaId, usuarioId, titulo]
    );
    return resultado.rows[0];
}
export async function anadirItemHistoria(
    usuarioId: string,
    historiaId: string,
    tipo: TipoItem,
    texto: string,
    rawFiles: UploadFile[]
) {
    await historiaDelAutor(usuarioId, historiaId);

    const cliente = await db.connect();
    const guardados: string[] = [];
    try {
        await cliente.query("BEGIN");

        const siguiente = await cliente.query(
            `SELECT COALESCE(MAX(orden) + 1, 0) AS orden FROM historias_items WHERE historia_id = $1`,
            [historiaId]
        );
        let orden = siguiente.rows[0].orden as number;
        const creados: unknown[] = [];

        if (tipo === "texto") {
            const contenido = texto.trim();
            if (!contenido || contenido.length > 500) {
                throw new Error("El texto de la historia debe tener entre 1 y 500 caracteres");
            }
            const creado = await cliente.query(
                `INSERT INTO historias_items (historia_id, texto, tipo, orden)
                 VALUES ($1, $2, 'texto', $3) RETURNING id, tipo, texto, orden`,
                [historiaId, contenido, orden]
            );
            creados.push(creado.rows[0]);
        } else {
            const files = await validarArchivos(rawFiles, MODO_VALIDACION[tipo]);
            for (const file of files) {
                const guardado = await guardarArchivoSubido({
                    propietarioId: usuarioId,
                    tipo: TIPO_ARCHIVO[file.type],
                    mimeType: file.mimetype,
                    nombreOriginal: file.filename,
                    buffer: file.buffer,
                    carpeta: "historias"
                });
                guardados.push(guardado.ruta);
                const creado = await cliente.query(
                    `INSERT INTO historias_items (historia_id, archivo_id, tipo, orden)
                     VALUES ($1, $2, $3, $4) RETURNING id, tipo, orden`,
                    [historiaId, guardado.id, tipo, orden]
                );
                creados.push(creado.rows[0]);
                orden += 1;
            }
        }

        await cliente.query(`UPDATE historias SET actualizado_en = NOW() WHERE id = $1`, [historiaId]);
        await cliente.query("COMMIT");
        return creados;
    } catch (error) {
        await cliente.query("ROLLBACK");
        for (const ruta of guardados) await rm(path.join(process.cwd(), ruta), { force: true });
        throw error;
    } finally {
        cliente.release();
    }
}

export async function eliminarItemHistoria(usuarioId: string, historiaId: string, itemId: string) {
    await historiaDelAutor(usuarioId, historiaId);
    const item = await db.query(
        `DELETE FROM historias_items WHERE id = $1 AND historia_id = $2 RETURNING archivo_id`,
        [itemId, historiaId]
    );
    if (item.rowCount !== 1) throw new Error("Ese elemento no existe en la historia");

    const archivoId = item.rows[0].archivo_id as string | null;
    if (archivoId) {
        const archivo = await db.query(`DELETE FROM archivos WHERE id = $1 RETURNING ruta`, [archivoId]);
        const ruta = archivo.rows[0]?.ruta as string | undefined;
        if (ruta) await rm(path.join(process.cwd(), ruta), { force: true });
    }
    await db.query(`UPDATE historias SET actualizado_en = NOW() WHERE id = $1`, [historiaId]);
    return { mensaje: "Elemento eliminado" };
}

export async function eliminarHistoria(usuarioId: string, historiaId: string) {
    await historiaDelAutor(usuarioId, historiaId);

    // Primero se guardan rutas e ids: al borrar la historia, sus elementos se
    // van en cascada y despues se limpian los archivos de la carpeta uploads.
    const archivos = await db.query(
        `SELECT a.id, a.ruta
        FROM historias_items i
        INNER JOIN archivos a ON a.id = i.archivo_id
        WHERE i.historia_id = $1`,
        [historiaId]
    );

    await db.query(`DELETE FROM historias WHERE id = $1`, [historiaId]);

    for (const fila of archivos.rows) {
        await db.query(`DELETE FROM archivos WHERE id = $1`, [fila.id]);
        await rm(path.join(process.cwd(), fila.ruta), { force: true });
    }

    return { mensaje: "Historia eliminada" };
}
export async function obtenerMisHistorias(usuarioId: string) {
    const resultado = await db.query(
        `SELECT ${CAMPOS_HISTORIA}
        FROM historias h
        WHERE h.autor_id = $1
        ORDER BY h.actualizado_en DESC`,
        [usuarioId]
    );
    return resultado.rows;
}

export async function obtenerHistoriasUsuario(usuarioId: string) {
    const resultado = await db.query(
        `SELECT ${CAMPOS_HISTORIA}
        FROM historias h
        INNER JOIN usuarios u ON u.id = h.autor_id AND u.activo = TRUE
        WHERE h.autor_id = $1
        ORDER BY h.actualizado_en DESC`,
        [usuarioId]
    );
    return resultado.rows;
}

export async function obtenerHistoria(usuarioId: string, historiaId: string) {
    const resultado = await db.query(
        `SELECT ${CAMPOS_HISTORIA}, ${ITEMS_HISTORIA}
        FROM historias h
        INNER JOIN usuarios u ON u.id = h.autor_id AND u.activo = TRUE
        WHERE h.id = $1`,
        [historiaId]
    );
    if (resultado.rowCount !== 1) throw new Error("Esa historia no existe");
    return resultado.rows[0];
}