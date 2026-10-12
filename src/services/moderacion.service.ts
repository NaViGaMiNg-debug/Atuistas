import { db } from "../db/database.js";
import { enviarPush } from "./push.service.js";

// Bloqueo privado total: crea el bloqueo direccional, rompe la amistad
// en ambas direcciones y borra las solicitudes pendientes entre ambos.
// Al romper la amistad el chat desaparece de GET /api/amigos y los
// mensajes/solicitudes quedan bloqueados por las comprobaciones que ya
// existen en amigos.service y mensajes.service.
export async function bloquearCuenta(
    bloqueadorId: string,
    bloqueadoId: string
) {
    if (bloqueadorId === bloqueadoId) {
        throw new Error("No puedes bloquearte a ti mismo");
    }

    const objetivo = await db.query(
        `SELECT id FROM usuarios WHERE id = $1 AND activo = TRUE`,
        [bloqueadoId]
    );
    if (objetivo.rowCount !== 1) {
        throw new Error("Esa cuenta no existe");
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `INSERT INTO bloqueos (bloqueador_id, bloqueado_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING`,
            [bloqueadorId, bloqueadoId]
        );
        await client.query(
            `DELETE FROM amistades
              WHERE usuario_a_id = LEAST($1::uuid, $2::uuid)
                AND usuario_b_id = GREATEST($1::uuid, $2::uuid)`,
            [bloqueadorId, bloqueadoId]
        );
        await client.query(
            `DELETE FROM solicitudes_amistad
              WHERE (emisor_id = $1 AND receptor_id = $2)
                 OR (emisor_id = $2 AND receptor_id = $1)`,
            [bloqueadorId, bloqueadoId]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return { mensaje: "Cuenta bloqueada" };
}

function rolDeEtiqueta(etiqueta: string | null): "Creador" | "Admin" | null {
    if (etiqueta === "Creador" || etiqueta === "Admin") return etiqueta;
    return null;
}

// Silenciar: no rompe la amistad ni el chat; solo corta los avisos de
// esa persona (mensajes privados, solicitudes, reacciones y comentarios).
export async function silenciarCuenta(usuarioId: string, silenciadoId: string) {
    if (usuarioId === silenciadoId) {
        throw new Error("No puedes silenciarte a ti mismo");
    }
    const objetivo = await db.query(
        `SELECT id FROM usuarios WHERE id = $1 AND activo = TRUE`,
        [silenciadoId]
    );
    if (objetivo.rowCount !== 1) {
        throw new Error("Esa cuenta no existe");
    }
    await db.query(
        `INSERT INTO silencios (usuario_id, silenciado_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING`,
        [usuarioId, silenciadoId]
    );
    return { mensaje: "Chat silenciado" };
}

export async function desilenciarCuenta(usuarioId: string, silenciadoId: string) {
    await db.query(
        `DELETE FROM silencios WHERE usuario_id = $1 AND silenciado_id = $2`,
        [usuarioId, silenciadoId]
    );
    return { mensaje: "Silencio quitado" };
}

// Usado por el servicio de avisos: si quien provoca el aviso está
// silenciado por el destinatario, el aviso no se crea ni se envía Push.
export async function estaSilenciado(usuarioId: string, autorId: string) {
    const resultado = await db.query(
        `SELECT 1 FROM silencios
          WHERE usuario_id = $1 AND silenciado_id = $2`,
        [usuarioId, autorId]
    );
    return resultado.rowCount === 1;
}

// Denuncia oculta de cuentas: la etiqueta visible NO se toca. Solo se
// guarda en denuncias_cuentas para que en un futuro Creador/Admin vean
// las cuentas denunciadas. Se puede denunciar a Admin, nunca a Creador.
export async function denunciarCuenta(
    denuncianteId: string,
    denunciadoId: string,
    motivo: string
) {
    const motivoLimpio = (motivo ?? "").trim();
    if (motivoLimpio.length < 3 || motivoLimpio.length > 500) {
        throw new Error("El motivo debe tener entre 3 y 500 caracteres");
    }
    if (denuncianteId === denunciadoId) {
        throw new Error("No puedes denunciarte a ti mismo");
    }

    const objetivo = await db.query(
        `SELECT id, nombre, etiqueta FROM usuarios
          WHERE id = $1 AND activo = TRUE`,
        [denunciadoId]
    );
    if (objetivo.rowCount !== 1) {
        throw new Error("Esa cuenta no existe");
    }
    if ((objetivo.rows[0].etiqueta ?? "") === "Creador") {
        throw new Error("No se puede denunciar a la cuenta Creador");
    }

    try {
        await db.query(
            `INSERT INTO denuncias_cuentas (denunciado_id, denunciante_id, motivo)
              VALUES ($1, $2, $3)`,
            [denunciadoId, denuncianteId, motivoLimpio]
        );
    } catch (error) {
        const codigo = (error as { code?: string }).code;
        if (codigo === "23505") {
            throw new Error("Ya has denunciado a esta cuenta");
        }
        throw error;
    }

    return { mensaje: "Cuenta denunciada" };
}

// Borrado total real por rol de etiqueta: solo Creador/Admin pueden.
// Nadie puede eliminar a Creador; a Admin solo lo elimina Creador;
// Admin solo elimina cuentas normales. Se guarda la tumba antes del
// DELETE y se manda Push antes de borrar (el CASCADE borra sesiones,
// notificaciones y todo lo demás).
export async function eliminarCuentaPorRol(
    ejecutorId: string,
    objetivoId: string
) {
    if (ejecutorId === objetivoId) {
        throw new Error("No puedes eliminar tu propia cuenta desde aquí");
    }

    const ejecutor = await db.query(
        `SELECT id, nombre, etiqueta FROM usuarios
          WHERE id = $1 AND activo = TRUE`,
        [ejecutorId]
    );
    if (ejecutor.rowCount !== 1) {
        throw new Error("Tu cuenta no existe");
    }
    const miRol = rolDeEtiqueta(ejecutor.rows[0].etiqueta ?? null);
    if (!miRol) {
        throw new Error("Solo Creador o Admin pueden eliminar cuentas");
    }

    const objetivo = await db.query(
        `SELECT id, nombre, etiqueta, codigo_vinculacion_hash FROM usuarios
          WHERE id = $1 AND activo = TRUE`,
        [objetivoId]
    );
    if (objetivo.rowCount !== 1) {
        throw new Error("Esa cuenta no existe");
    }
    const rolObjetivo = rolDeEtiqueta(objetivo.rows[0].etiqueta ?? null);
    if (rolObjetivo === "Creador") {
        throw new Error("Nadie puede eliminar a la cuenta Creador");
    }
    if (rolObjetivo === "Admin" && miRol !== "Creador") {
        throw new Error("Solo Creador puede eliminar a un Admin");
    }

    const nombreObjetivo: string = objetivo.rows[0].nombre;
    const miNombre: string = ejecutor.rows[0].nombre;
    try {
        await db.query(
            `INSERT INTO notificaciones
                 (usuario_id, tipo, titulo, contenido, datos)
              VALUES ($1, 'cuenta_eliminada',
                      'Tu cuenta ha sido eliminada', $2, $3::jsonb)`,
            [
                objetivoId,
                `Tu cuenta ha sido eliminada por ${miNombre} (${miRol}).`,
                JSON.stringify({ borradoPor: miNombre, rol: miRol })
            ]
        );
        const ultima = await db.query(
            `SELECT id, tipo, titulo, contenido, datos, cantidad, autor_id
               FROM notificaciones
              WHERE usuario_id = $1 AND tipo = 'cuenta_eliminada'
              ORDER BY creada_en DESC LIMIT 1`,
            [objetivoId]
        );
        if (ultima.rowCount === 1) {
            await enviarPush(objetivoId, ultima.rows[0]);
        }
    } catch {
        // Si el push falla, el borrado sigue: la tumba guarda el mensaje.
    }

    await db.query(
        `INSERT INTO tumbas_cuentas
             (usuario_id, nombre, borrado_por_nombre, borrado_por_rol,
              codigo_vinculacion_hash)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (usuario_id) DO UPDATE SET
             nombre = EXCLUDED.nombre,
             borrado_por_nombre = EXCLUDED.borrado_por_nombre,
             borrado_por_rol = EXCLUDED.borrado_por_rol,
             codigo_vinculacion_hash = EXCLUDED.codigo_vinculacion_hash,
             borrado_en = NOW()`,
        [
            objetivoId,
            nombreObjetivo,
            miNombre,
            miRol,
            objetivo.rows[0].codigo_vinculacion_hash ?? null
        ]
    );

    // Borrado total: el CASCADE arrastra sesiones, amistades,
    // solicitudes, bloqueos, denuncias, conversaciones, mensajes,
    // archivos y todo lo relacionado con la cuenta.
    await db.query(`DELETE FROM usuarios WHERE id = $1`, [objetivoId]);

    return { mensaje: "Cuenta eliminada" };
}

export async function obtenerTumba(usuarioId: string) {
    const resultado = await db.query(
        `SELECT usuario_id, nombre, borrado_por_nombre,
                borrado_por_rol, borrado_en
           FROM tumbas_cuentas WHERE usuario_id = $1`,
        [usuarioId]
    );
    return resultado.rows[0] ?? null;
}

// Si alguien intenta entrar con el código de una cuenta eliminada,
// la tumba se encuentra por el hash del código: así se le dice quién
// la borró y con qué rol antes de que pueda crearse otra cuenta.
export async function obtenerTumbaPorCodigoHash(codigoHash: string) {
    const resultado = await db.query(
        `SELECT usuario_id, nombre, borrado_por_nombre, borrado_por_rol
           FROM tumbas_cuentas WHERE codigo_vinculacion_hash = $1`,
        [codigoHash]
    );
    return resultado.rows[0] ?? null;
}
