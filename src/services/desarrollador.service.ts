import { db } from "../db/database.js";

// Solo una cuenta tiene poderes de desarrollador: la que la migración marcó
// (la que se llama "Iván J."). Puede borrar contenido de cualquiera y poner
// nombre, descripción o etiqueta en el perfil de otros usuarios.
export async function esDesarrollador(usuarioId: string): Promise<boolean> {
    const resultado = await db.query(
        `SELECT es_desarrollador FROM usuarios WHERE id = $1 AND activo = TRUE`,
        [usuarioId]
    );
    return resultado.rows[0]?.es_desarrollador === true;
}

// Se usa antes de tocar contenido ajeno: si no se es el autor y tampoco se
// tiene el permiso, el contenido no se toca.
export async function puedeEditarComoDesarrollador(
    usuarioId: string,
    autorId: string | null | undefined
): Promise<boolean> {
    if (autorId && autorId === usuarioId) return true;
    return esDesarrollador(usuarioId);
}

// Cambia datos de otra cuenta (o de la propia). Solo el desarrollador puede:
// por eso mismo no necesita cambiar de color ni de avatar.
export async function editarUsuarioComoDesarrollador(
    editorId: string,
    objetivoId: string,
    cambios: { nombre?: string; descripcion?: string; etiqueta?: string }
) {
    if (!(await esDesarrollador(editorId))) {
        throw new Error("Solo la cuenta de desarrollador puede hacer esto");
    }

    const objetivo = await db.query(
        `SELECT id, nombre, descripcion, etiqueta FROM usuarios
         WHERE id = $1 AND activo = TRUE`,
        [objetivoId]
    );
    if (objetivo.rowCount !== 1) {
        throw new Error("Ese usuario no existe");
    }

    const actual = objetivo.rows[0] as {
        id: string;
        nombre: string;
        descripcion: string | null;
        etiqueta: string | null;
    };

    // Lo que no se manda se queda como estaba: así el formulario puede
    // enviar solo un campo sin borrar lo demás.
    let nombre = actual.nombre;
    let nombreNormalizado = nombre.toLocaleLowerCase();
    if (cambios.nombre !== undefined) {
        nombre = cambios.nombre.trim();
        if (!nombre || nombre.length > 25) {
            throw new Error("El nombre debe tener entre 1 y 25 caracteres");
        }
        nombreNormalizado = nombre.toLocaleLowerCase();
        const duplicado = await db.query(
            `SELECT 1 FROM usuarios WHERE nombre_normalizado = $1 AND id <> $2 LIMIT 1`,
            [nombreNormalizado, objetivoId]
        );
        if (duplicado.rowCount !== 0) {
            throw new Error("Ese nombre ya está en uso");
        }
    }

    let descripcion = actual.descripcion;
    if (cambios.descripcion !== undefined) {
        const limpia = cambios.descripcion.trim();
        if (limpia.length > 500) {
            throw new Error("La descripción no puede superar los 500 caracteres");
        }
        descripcion = limpia || null;
    }

    let etiqueta = actual.etiqueta;
    if (cambios.etiqueta !== undefined) {
        const texto = cambios.etiqueta.trim();
        if (texto.length > 24) {
            throw new Error("La etiqueta no puede superar los 24 caracteres");
        }
        etiqueta = texto || null;
    }

    const resultado = await db.query(
        `UPDATE usuarios
         SET nombre = $2,
             nombre_normalizado = $3,
             descripcion = $4,
             etiqueta = $5
         WHERE id = $1 AND activo = TRUE
         RETURNING id, nombre, descripcion, etiqueta, es_desarrollador`,
        [objetivoId, nombre, nombreNormalizado, descripcion, etiqueta]
    );

    return resultado.rows[0];
}