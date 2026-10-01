import { randomBytes } from "node:crypto";
import { db } from "../db/database.js";
import { crearNotificacion } from "./notificaciones.service.js";
import { emitirAUsuarios } from "../ws/tiempo-real.js";

interface MiembroGrupo {
    rol: "creador" | "moderador" | "miembro";
    silenciado: boolean;
    puede_escribir: boolean;
}

export async function comprobarMiembro(usuarioId: string, grupoId: string): Promise<MiembroGrupo> {
    const resultado = await db.query(
        `SELECT rol, silenciado, puede_escribir
         FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, usuarioId]
    );

    if (resultado.rowCount !== 1) {
        throw new Error("No perteneces a este servidor");
    }

    return resultado.rows[0];
}

async function comprobarGestor(usuarioId: string, grupoId: string) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);

    if (miembro.rol !== "creador" && miembro.rol !== "moderador") {
        throw new Error("Solo el creador o un moderador pueden hacer esto");
    }

    return miembro;
}

async function obtenerIdsMiembros(grupoId: string) {
    const resultado = await db.query(
        `SELECT usuario_id FROM miembros_grupo WHERE grupo_id = $1`,
        [grupoId]
    );
    return resultado.rows.map((fila: { usuario_id: string }) => fila.usuario_id);
}

interface CanalGrupo {
    id: string;
    nombre: string;
    retencion_horas: number | null;
    permite_ocultos: boolean;
}

async function resolverCanal(grupoId: string, canalId?: string): Promise<CanalGrupo> {
    const resultado = canalId
        ? await db.query(
            `SELECT id, nombre, retencion_horas, permite_ocultos
             FROM canales_grupo WHERE id = $1 AND grupo_id = $2`,
            [canalId, grupoId]
        )
        : await db.query(
            `SELECT id, nombre, retencion_horas, permite_ocultos
             FROM canales_grupo WHERE grupo_id = $1
             ORDER BY orden, creado_en LIMIT 1`,
            [grupoId]
        );

    if (resultado.rowCount !== 1) {
        throw new Error(canalId ? "El canal no existe" : "Este servidor no tiene canales");
    }

    return resultado.rows[0];
}

// El autor de un mensaje oculto solo se muestra a quien lo envió.
function enmascararMensaje(
    fila: Record<string, any>,
    usuarioId: string
): Record<string, any> {
    const esMio = fila.autor_id === usuarioId;
    const base = {
        ...fila,
        es_mio: esMio,
        envio_oculto: Boolean(fila.oculto) && esMio
    };

    if (!fila.oculto || esMio) {
        return base;
    }

    return {
        ...base,
        autor_id: null,
        autor_nombre: null,
        color_nombre: null
    };
}

export async function listarGrupos(usuarioId: string) {
    const resultado = await db.query(
        `
        SELECT g.id, g.nombre, g.descripcion, g.tipo, g.creador_id,
               (g.creador_id = $1::uuid) AS es_creador,
               g.creado_en, g.desaparece_en,
               g.modelo, g.retencion_horas, g.permite_ocultos,
               m.rol AS mi_rol, m.silenciado AS mi_silenciado,
               m.ultima_lectura_en,
               a.ruta AS imagen_ruta,
               (SELECT COUNT(*)::int FROM miembros_grupo m2 WHERE m2.grupo_id = g.id) AS miembros,
               (SELECT mg.contenido FROM mensajes_grupo mg
                   INNER JOIN canales_grupo c ON c.id = mg.canal_id
                   WHERE mg.grupo_id = g.id
                     AND (c.retencion_horas IS NULL
                          OR mg.creado_en > NOW() - make_interval(hours => c.retencion_horas))
                   ORDER BY mg.creado_en DESC LIMIT 1) AS ultimo_mensaje,
               (SELECT COUNT(*)::int FROM mensajes_grupo mg2
                   INNER JOIN canales_grupo c2 ON c2.id = mg2.canal_id
                   WHERE mg2.grupo_id = g.id
                     AND mg2.autor_id <> $1::uuid
                     AND mg2.creado_en > COALESCE(m.ultima_lectura_en, to_timestamp(0))
                     AND (c2.retencion_horas IS NULL
                          OR mg2.creado_en > NOW() - make_interval(hours => c2.retencion_horas))
               ) AS mensajes_sin_leer
        FROM grupos g
        INNER JOIN miembros_grupo m ON m.grupo_id = g.id AND m.usuario_id = $1
        LEFT JOIN archivos a ON a.id = g.imagen_archivo_id
        WHERE g.desaparece_en IS NULL OR g.desaparece_en > NOW()
        ORDER BY g.creado_en DESC
        `,
        [usuarioId]
    );

    return resultado.rows;
}

export async function buscarGrupos(texto: string, usuarioId: string) {
    const termino = texto.trim();
    if (!termino) return [];

    const resultado = await db.query(
        `
        SELECT g.id, g.nombre, g.descripcion, g.tipo, g.creado_en,
               a.ruta AS imagen_ruta,
               (SELECT COUNT(*)::int FROM miembros_grupo m WHERE m.grupo_id = g.id) AS miembros
        FROM grupos g
        LEFT JOIN miembros_grupo propio ON propio.grupo_id = g.id AND propio.usuario_id = $1
        LEFT JOIN archivos a ON a.id = g.imagen_archivo_id
        WHERE propio.usuario_id IS NULL
          AND (g.desaparece_en IS NULL OR g.desaparece_en > NOW())
          AND g.nombre ILIKE $2
        ORDER BY g.nombre
        LIMIT 20
        `,
        [usuarioId, `%${termino}%`]
    );

    return resultado.rows;
}

// Descubrimiento: los diez servidores recientes a los que todavía no has entrado.
export async function descubrirGrupos(usuarioId: string) {
    const resultado = await db.query(
        `
        SELECT g.id, g.nombre, g.descripcion, g.tipo, g.creado_en,
               a.ruta AS imagen_ruta,
               (SELECT COUNT(*)::int FROM miembros_grupo m WHERE m.grupo_id = g.id) AS miembros
        FROM grupos g
        LEFT JOIN miembros_grupo propio ON propio.grupo_id = g.id AND propio.usuario_id = $1
        LEFT JOIN archivos a ON a.id = g.imagen_archivo_id
        WHERE propio.usuario_id IS NULL
          AND (g.desaparece_en IS NULL OR g.desaparece_en > NOW())
        ORDER BY g.creado_en DESC
        LIMIT 10
        `,
        [usuarioId]
    );

    return resultado.rows;
}

export interface OpcionesGrupo {
    nombre: string;
    descripcion?: string;
    tipo?: "normal" | "amistades";
    modelo?: "chat_unico" | "canales";
    retencionHoras?: number | null;
    permiteOcultos?: boolean;
}

export async function crearGrupo(usuarioId: string, opciones: OpcionesGrupo) {
    const nombreLimpio = (opciones.nombre ?? "").trim();
    const descripcionLimpia = (opciones.descripcion ?? "").trim();
    const tipo = opciones.tipo ?? "normal";
    const modelo = opciones.modelo ?? "chat_unico";
    const retencionHoras = opciones.retencionHoras === undefined ? 48 : opciones.retencionHoras;
    const permiteOcultos = opciones.permiteOcultos ?? false;

    if (!nombreLimpio || nombreLimpio.length > 25) {
        throw new Error("El nombre debe tener entre 1 y 25 caracteres");
    }
    if (descripcionLimpia.length > 500) {
        throw new Error("La descripción no puede superar los 500 caracteres");
    }
    if (tipo !== "normal" && tipo !== "amistades") {
        throw new Error("El tipo de servidor no es válido");
    }
    if (modelo !== "chat_unico" && modelo !== "canales") {
        throw new Error("El modelo del servidor no es válido");
    }
    if (retencionHoras !== null && (!Number.isInteger(retencionHoras) || retencionHoras < 1 || retencionHoras > 8760)) {
        throw new Error("La retención de mensajes no es válida");
    }
    if (typeof permiteOcultos !== "boolean") {
        throw new Error("La configuración de mensajes ocultos no es válida");
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const insertado = await client.query(
            `INSERT INTO grupos (creador_id, nombre, descripcion, tipo, modelo, retencion_horas, permite_ocultos)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, nombre, descripcion, tipo, modelo, retencion_horas, permite_ocultos, creado_en`,
            [usuarioId, nombreLimpio, descripcionLimpia || null, tipo, modelo, retencionHoras, permiteOcultos]
        );
        const grupo = insertado.rows[0];

        // Todo servidor nace con su canal general.
        await client.query(
            `INSERT INTO canales_grupo (grupo_id, nombre, orden, retencion_horas, permite_ocultos)
             VALUES ($1, 'general', 0, $2, $3)`,
            [grupo.id, retencionHoras, permiteOcultos]
        );

        await client.query(
            `INSERT INTO miembros_grupo (grupo_id, usuario_id, origen, rol)
             VALUES ($1, $2, 'manual', 'creador')`,
            [grupo.id, usuarioId]
        );

        if (tipo === "amistades") {
            await client.query(
                `
                INSERT INTO miembros_grupo (grupo_id, usuario_id, origen, rol)
                SELECT $1,
                       CASE WHEN usuario_a_id = $2 THEN usuario_b_id ELSE usuario_a_id END,
                       'amistad', 'miembro'
                FROM amistades
                WHERE usuario_a_id = $2 OR usuario_b_id = $2
                ON CONFLICT (grupo_id, usuario_id) DO NOTHING
                `,
                [grupo.id, usuarioId]
            );
        }

        await client.query("COMMIT");
        return grupo;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function unirseAGrupo(usuarioId: string, grupoId: string) {
    const resultado = await db.query(
        `SELECT id, creador_id, tipo, nombre FROM grupos
         WHERE id = $1 AND (desaparece_en IS NULL OR desaparece_en > NOW())`,
        [grupoId]
    );
    if (resultado.rowCount !== 1) throw new Error("Servidor no encontrado");

    const bloqueado = await db.query(
        `SELECT 1 FROM miembros_bloqueados_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, usuarioId]
    );
    if (bloqueado.rowCount === 1) throw new Error("No puedes volver a unirte a este servidor");

    const grupo = resultado.rows[0];
    if (grupo.tipo === "amistades") {
        const amistad = await db.query(
            `SELECT 1 FROM amistades
             WHERE usuario_a_id = LEAST($1::uuid, $2::uuid)
               AND usuario_b_id = GREATEST($1::uuid, $2::uuid)`,
            [grupo.creador_id, usuarioId]
        );
        if (amistad.rowCount !== 1) {
            throw new Error("Solo los amigos del creador pueden unirse a este servidor");
        }
    }

    await db.query(
        `INSERT INTO miembros_grupo (grupo_id, usuario_id, origen)
         VALUES ($1, $2, 'manual') ON CONFLICT (grupo_id, usuario_id) DO NOTHING`,
        [grupoId, usuarioId]
    );
    return { mensaje: "Te has unido al servidor" };
}

export async function salirDeGrupo(usuarioId: string, grupoId: string) {
    const resultado = await db.query(
        `DELETE FROM miembros_grupo
         WHERE grupo_id = $1 AND usuario_id = $2 AND rol <> 'creador'
         RETURNING grupo_id`,
        [grupoId, usuarioId]
    );
    if (resultado.rowCount !== 1) {
        throw new Error("No puedes salir de este servidor; el creador debe eliminarlo");
    }
    return { mensaje: "Has salido del servidor" };
}

export async function eliminarGrupo(usuarioId: string, grupoId: string) {
    const resultado = await db.query(
        `DELETE FROM grupos WHERE id = $1 AND creador_id = $2 RETURNING id`,
        [grupoId, usuarioId]
    );
    if (resultado.rowCount !== 1) throw new Error("Solo el creador puede eliminar el servidor");
    return { mensaje: "Servidor eliminado" };
}

export async function obtenerGrupo(usuarioId: string, grupoId: string) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);

    const resultado = await db.query(
        `
        SELECT g.id, g.nombre, g.descripcion, g.tipo, g.creador_id,
               g.creado_en, g.desaparece_en, g.modelo, g.retencion_horas,
               g.permite_ocultos, g.canales_activado_en,
               a.ruta AS imagen_ruta,
               (g.creador_id = $2::uuid) AS es_creador,
               (SELECT COUNT(*)::int FROM miembros_grupo m WHERE m.grupo_id = g.id) AS miembros,
               (SELECT COUNT(*)::int FROM mensajes_grupo mg
                   INNER JOIN canales_grupo c ON c.id = mg.canal_id
                   WHERE mg.grupo_id = g.id
                     AND mg.autor_id <> $2::uuid
                     AND mg.creado_en > COALESCE(m2.ultima_lectura_en, to_timestamp(0))
                     AND (c.retencion_horas IS NULL
                          OR mg.creado_en > NOW() - make_interval(hours => c.retencion_horas))
               ) AS mensajes_sin_leer
        FROM grupos g
        INNER JOIN miembros_grupo m2 ON m2.grupo_id = g.id AND m2.usuario_id = $2
        LEFT JOIN archivos a ON a.id = g.imagen_archivo_id
        WHERE g.id = $1
        `,
        [grupoId, usuarioId]
    );
    if (resultado.rowCount !== 1) throw new Error("Servidor no encontrado");

    const bloqueado = await db.query(
        `SELECT 1 FROM miembros_bloqueados_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, usuarioId]
    );

    const detalle: Record<string, unknown> = {
        ...resultado.rows[0],
        mi_rol: miembro.rol,
        mi_silenciado: miembro.silenciado,
        mi_puede_escribir: miembro.puede_escribir,
        bloqueado: bloqueado.rowCount === 1,
        canales: await listarCanales(usuarioId, grupoId)
    };

    // El código de invitación solo lo ven quienes pueden gestionar el servidor.
    if (miembro.rol === "creador" || miembro.rol === "moderador") {
        const invitacion = await db.query(
            `SELECT codigo_invitacion AS codigo,
                    codigo_invitacion_expira_en AS expira_en,
                    codigo_invitacion_creado_en AS creado_en
             FROM grupos
             WHERE id = $1
               AND codigo_invitacion IS NOT NULL
               AND codigo_invitacion_expira_en > NOW()`,
            [grupoId]
        );
        detalle.invitacion = invitacion.rows[0] ?? null;
    }

    return detalle;
}

export async function listarCanales(usuarioId: string, grupoId: string) {
    await comprobarMiembro(usuarioId, grupoId);

    const resultado = await db.query(
        `SELECT id, nombre, orden, descripcion, retencion_horas, permite_ocultos, creado_en
         FROM canales_grupo WHERE grupo_id = $1
         ORDER BY orden, creado_en`,
        [grupoId]
    );
    return resultado.rows;
}

function validarNombreCanal(nombre: string) {
    const limpio = (nombre ?? "").trim();
    if (!limpio || limpio.length > 30) {
        throw new Error("El nombre del canal debe tener entre 1 y 30 caracteres");
    }
    return limpio;
}

function validarRetencionCanal(retencionHoras: number | null) {
    if (
        retencionHoras !== null &&
        (!Number.isInteger(retencionHoras) || retencionHoras < 1 || retencionHoras > 8760)
    ) {
        throw new Error("La retención del canal no es válida");
    }
    return retencionHoras;
}

// Pasar de un chat único a canales es irreversible: nunca vuelve a chat_unico.
export async function activarCanales(usuarioId: string, grupoId: string) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);
    if (miembro.rol !== "creador") {
        throw new Error("Solo el creador puede activar los canales");
    }

    const actualizado = await db.query(
        `UPDATE grupos
         SET modelo = 'canales',
             canales_activado_en = COALESCE(canales_activado_en, NOW()),
             actualizado_en = NOW()
         WHERE id = $1 AND modelo = 'chat_unico'
         RETURNING id`,
        [grupoId]
    );

    // Repetir la activación no es un error si el servidor ya tiene canales.
    if (actualizado.rowCount !== 1) {
        const actual = await db.query(`SELECT modelo FROM grupos WHERE id = $1`, [grupoId]);
        if (actual.rowCount !== 1 || actual.rows[0].modelo !== "canales") {
            throw new Error("No se pudieron activar los canales");
        }
    }

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "grupo_actualizado",
        grupoId
    });
    return { mensaje: "Canales activados" };
}

export async function crearCanal(
    usuarioId: string,
    grupoId: string,
    nombre: string,
    opciones: { descripcion?: string; retencionHoras?: number | null; permiteOcultos?: boolean } = {}
) {
    await comprobarGestor(usuarioId, grupoId);
    const limpio = validarNombreCanal(nombre);
    const retencionHoras = validarRetencionCanal(
        opciones.retencionHoras === undefined ? null : opciones.retencionHoras
    );
    const permiteOcultos = opciones.permiteOcultos === true;
    const descripcion = (opciones.descripcion ?? "").trim() || null;

    if (descripcion && descripcion.length > 200) {
        throw new Error("La descripción no puede superar los 200 caracteres");
    }

    const existe = await db.query(
        `SELECT 1 FROM canales_grupo WHERE grupo_id = $1 AND LOWER(nombre) = LOWER($2)`,
        [grupoId, limpio]
    );
    if (existe.rowCount === 1) throw new Error("Ya existe un canal con ese nombre");

    const insertado = await db.query(
        `INSERT INTO canales_grupo (grupo_id, nombre, orden, descripcion, retencion_horas, permite_ocultos)
         SELECT $1, $2,
                COALESCE((SELECT MAX(orden) + 1 FROM canales_grupo WHERE grupo_id = $1), 0),
                $3, $4, $5
         RETURNING id, nombre, orden, descripcion, retencion_horas, permite_ocultos, creado_en`,
        [grupoId, limpio, descripcion, retencionHoras, permiteOcultos]
    );

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "canales_actualizados",
        grupoId
    });
    return insertado.rows[0];
}

export interface CambiosCanal {
    nombre?: string;
    descripcion?: string | null;
    retencionHoras?: number | null;
    permiteOcultos?: boolean;
}

export async function actualizarCanal(
    usuarioId: string,
    grupoId: string,
    canalId: string,
    cambios: CambiosCanal
) {
    await comprobarGestor(usuarioId, grupoId);

    const canales = await db.query(
        `SELECT id FROM canales_grupo WHERE grupo_id = $1`,
        [grupoId]
    );
    if (!canales.rows.some((fila: { id: string }) => fila.id === canalId)) {
        throw new Error("El canal no existe");
    }

    const campos: string[] = [];
    const valores: unknown[] = [canalId];
    const agregar = (columna: string, valor: unknown) => {
        valores.push(valor);
        campos.push(`${columna} = $${valores.length}`);
    };

    if (cambios.nombre !== undefined) {
        const nombreLimpio = validarNombreCanal(cambios.nombre);
        const duplicado = await db.query(
            `SELECT 1 FROM canales_grupo
             WHERE grupo_id = $1 AND id <> $2 AND LOWER(nombre) = LOWER($3)`,
            [grupoId, canalId, nombreLimpio]
        );
        if (duplicado.rowCount === 1) throw new Error("Ya existe un canal con ese nombre");
        agregar("nombre", nombreLimpio);
    }

    if (cambios.descripcion !== undefined) {
        const descripcion = (cambios.descripcion ?? "").trim();
        if (descripcion.length > 200) {
            throw new Error("La descripción no puede superar los 200 caracteres");
        }
        agregar("descripcion", descripcion || null);
    }

    if (cambios.retencionHoras !== undefined) {
        agregar("retencion_horas", validarRetencionCanal(cambios.retencionHoras));
    }

    if (cambios.permiteOcultos !== undefined) {
        if (typeof cambios.permiteOcultos !== "boolean") {
            throw new Error("La configuración de mensajes ocultos no es válida");
        }
        agregar("permite_ocultos", cambios.permiteOcultos);
    }

    if (campos.length === 0) throw new Error("No hay cambios para guardar");

    const actualizado = await db.query(
        `UPDATE canales_grupo
         SET ${campos.join(", ")}, actualizado_en = NOW()
         WHERE id = $1
         RETURNING id, nombre, orden, descripcion, retencion_horas, permite_ocultos, actualizado_en`,
        valores
    );

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "canales_actualizados",
        grupoId
    });
    return actualizado.rows[0];
}

export async function eliminarCanal(usuarioId: string, grupoId: string, canalId: string) {
    const miembro = await comprobarGestor(usuarioId, grupoId);

    const canal = await db.query(
        `SELECT nombre FROM canales_grupo WHERE id = $1 AND grupo_id = $2`,
        [canalId, grupoId]
    );
    if (canal.rowCount !== 1) throw new Error("El canal no existe");

    const total = await db.query(
        `SELECT COUNT(*)::int AS total FROM canales_grupo WHERE grupo_id = $1`,
        [grupoId]
    );
    if (total.rows[0].total <= 1) {
        throw new Error("El servidor debe conservar al menos un canal");
    }

    if (canal.rows[0].nombre === "general" && miembro.rol !== "creador") {
        throw new Error("Solo el creador puede eliminar el canal general");
    }

    // Borrado irreversible: los mensajes del canal caen en cascada.
    await db.query(`DELETE FROM canales_grupo WHERE id = $1`, [canalId]);

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "canales_actualizados",
        grupoId
    });
    return { mensaje: "Canal eliminado" };
}

export async function obtenerMensajesGrupo(
    usuarioId: string,
    grupoId: string,
    canalId?: string,
    antesDe?: string
) {
    await comprobarMiembro(usuarioId, grupoId);
    const canal = await resolverCanal(grupoId, canalId);

    const parametros: unknown[] = [grupoId, usuarioId, canal.id];
    let filtroAnterior = "";

    if (antesDe) {
        const fecha = new Date(antesDe);
        if (Number.isNaN(fecha.getTime())) {
            throw new Error("El cursor de mensajes no es válido");
        }
        parametros.push(fecha.toISOString());
        filtroAnterior = "AND mg.creado_en < $4::timestamptz";
    }

    const resultado = await db.query(
        `
        SELECT mg.id, mg.canal_id, mg.autor_id, (mg.autor_id = $2::uuid) AS es_mio,
               mg.tipo, mg.contenido, mg.mensaje_respondiendo_id,
               mg.oculto, mg.editado_en, mg.creado_en,
               ar.ruta AS archivo_ruta,
               u.nombre AS autor_nombre, u.color_nombre,
               r.contenido AS respuesta_contenido,
               r.oculto AS respuesta_oculto,
               r.autor_id AS respuesta_autor_id,
               ru.nombre AS respuesta_autor_nombre,
               r.creado_en AS respuesta_creado_en
        FROM mensajes_grupo mg
        INNER JOIN usuarios u ON u.id = mg.autor_id
        INNER JOIN canales_grupo c ON c.id = mg.canal_id
        LEFT JOIN archivos ar ON ar.id = mg.archivo_id
        LEFT JOIN mensajes_grupo r ON r.id = mg.mensaje_respondiendo_id
        LEFT JOIN usuarios ru ON ru.id = r.autor_id
        WHERE mg.grupo_id = $1
          AND mg.canal_id = $3
          ${filtroAnterior}
          AND (c.retencion_horas IS NULL
               OR mg.creado_en > NOW() - make_interval(hours => c.retencion_horas))
        ORDER BY mg.creado_en DESC
        LIMIT 200
        `,
        parametros
    );

    const mensajes = resultado.rows.map((fila: any) => {
        const enmascarado = enmascararMensaje(fila, usuarioId);

        if (fila.respuesta_oculto && fila.respuesta_autor_id !== usuarioId) {
            enmascarado.respuesta_autor_nombre = null;
        }

        return enmascarado;
    });

    return mensajes.reverse();
}

export interface OpcionesMensajeGrupo {
    canalId?: string;
    respuestaId?: string;
    oculto?: boolean;
    tipo?: "texto" | "imagen" | "audio" | "video";
    archivoId?: string;
}

export async function enviarMensajeGrupo(
    usuarioId: string,
    grupoId: string,
    contenido: string,
    opciones: OpcionesMensajeGrupo = {}
) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);
    if (!miembro.puede_escribir) {
        throw new Error("Un moderador ha desactivado tu permiso para escribir en este servidor");
    }

    const texto = contenido.trim();
    const tipo = opciones.tipo ?? "texto";
    const archivoId = opciones.archivoId ?? null;

    if (tipo === "texto") {
        if (!texto || texto.length > 5000) {
            throw new Error("El mensaje debe tener entre 1 y 5000 caracteres");
        }
    } else {
        if (!archivoId) {
            throw new Error("El mensaje con archivo necesita un archivo adjunto");
        }
        // El archivo debe pertenecer a quien lo envía: nada de adjuntar ajenos.
        const archivo = await db.query(
            `SELECT 1 FROM archivos WHERE id = $1 AND propietario_id = $2`,
            [archivoId, usuarioId]
        );
        if (archivo.rowCount !== 1) {
            throw new Error("El archivo adjunto no es válido");
        }
        if (texto.length > 5000) {
            throw new Error("El mensaje no puede superar los 5000 caracteres");
        }
    }

    const canal = await resolverCanal(grupoId, opciones.canalId);
    const oculto = opciones.oculto === true;
    const respuestaId = opciones.respuestaId;

    if (oculto) {
        if (!canal.permite_ocultos) {
            throw new Error("Los mensajes ocultos no están activados en este canal");
        }
        const restringido = await db.query(
            `SELECT 1 FROM ocultos_restringidos_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
            [grupoId, usuarioId]
        );
        if (restringido.rowCount === 1) {
            throw new Error("No puedes enviar mensajes ocultos en este servidor");
        }
    }

    if (respuestaId) {
        const referencia = await db.query(
            `SELECT id FROM mensajes_grupo mg
             INNER JOIN canales_grupo c ON c.id = mg.canal_id
             WHERE mg.id = $1 AND mg.grupo_id = $2
               AND (c.retencion_horas IS NULL
                    OR mg.creado_en > NOW() - make_interval(hours => c.retencion_horas))`,
            [respuestaId, grupoId]
        );
        if (referencia.rowCount !== 1) throw new Error("El mensaje de respuesta no existe");
    }

    const insertado = await db.query(
        `INSERT INTO mensajes_grupo (grupo_id, canal_id, autor_id, tipo, contenido, archivo_id, mensaje_respondiendo_id, oculto)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [grupoId, canal.id, usuarioId, tipo, texto || null, archivoId, respuestaId ?? null, oculto]
    );

    const guardado = await db.query(
        `SELECT mg.id, mg.canal_id, mg.autor_id, (mg.autor_id = $2::uuid) AS es_mio,
                mg.tipo, mg.contenido, mg.archivo_id, mg.mensaje_respondiendo_id,
                mg.oculto, mg.editado_en, mg.creado_en,
                a.ruta AS archivo_ruta,
                u.nombre AS autor_nombre, u.color_nombre
         FROM mensajes_grupo mg
         INNER JOIN usuarios u ON u.id = mg.autor_id
         LEFT JOIN archivos a ON a.id = mg.archivo_id
         WHERE mg.id = $1`,
        [insertado.rows[0].id, usuarioId]
    );

    const mensaje = enmascararMensaje(guardado.rows[0], usuarioId);
    const resumen = texto.length > 120 ? `${texto.slice(0, 117)}...` : texto;

    const grupo = await db.query(`SELECT nombre FROM grupos WHERE id = $1`, [grupoId]);
    const miembros = await db.query(
        `SELECT usuario_id FROM miembros_grupo
         WHERE grupo_id = $1 AND usuario_id <> $2 AND silenciado = FALSE`,
        [grupoId, usuarioId]
    );
    for (const miembroAvisado of miembros.rows) {
        await crearNotificacion(
            miembroAvisado.usuario_id,
            "mensajes_grupo",
            "mensaje_grupo",
            `Mensaje en ${grupo.rows[0].nombre}`,
            resumen,
            { grupoId, mensajeId: mensaje.id }
        );
    }

    if (respuestaId) {
        const original = await db.query(`SELECT autor_id FROM mensajes_grupo WHERE id = $1`, [respuestaId]);
        const autorOriginal = original.rows[0]?.autor_id as string | undefined;
        if (autorOriginal && autorOriginal !== usuarioId) {
            const silencio = await db.query(
                `SELECT silenciado FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
                [grupoId, autorOriginal]
            );
            if (silencio.rowCount === 1 && !silencio.rows[0].silenciado) {
                await crearNotificacion(
                    autorOriginal,
                    "respuestas",
                    "respuesta_mensaje_grupo",
                    "Han respondido a tu mensaje",
                    resumen,
                    { grupoId, mensajeId: mensaje.id }
                );
            }
        }
    }

    // El autor ve su mensaje; el resto recibe la versión enmascarada.
    const ids = await obtenerIdsMiembros(grupoId);
    emitirAUsuarios(
        ids.filter((id) => id !== usuarioId),
        {
            tipo: "mensaje_nuevo",
            grupoId,
            canalId: canal.id,
            mensaje: enmascararMensaje(guardado.rows[0], "__ninguno__")
        }
    );
    emitirAUsuarios([usuarioId], {
        tipo: "mensaje_nuevo",
        grupoId,
        canalId: canal.id,
        mensaje
    });

    return mensaje;
}

export async function listarMiembrosGrupo(usuarioId: string, grupoId: string) {
    await comprobarMiembro(usuarioId, grupoId);

    const resultado = await db.query(
        `
        SELECT m.usuario_id, u.nombre, u.color_nombre, m.rol, m.unido_en,
               m.silenciado, m.puede_escribir,
               (m.usuario_id = $2::uuid) AS es_mio,
               (g.creador_id = m.usuario_id) AS es_creador_grupo
        FROM miembros_grupo m
        INNER JOIN usuarios u ON u.id = m.usuario_id
        INNER JOIN grupos g ON g.id = m.grupo_id
        WHERE m.grupo_id = $1
        ORDER BY CASE m.rol WHEN 'creador' THEN 0 WHEN 'moderador' THEN 1 ELSE 2 END,
                 m.unido_en
        `,
        [grupoId, usuarioId]
    );

    return resultado.rows;
}

export async function cambiarRolMiembro(
    usuarioId: string,
    grupoId: string,
    objetivoId: string,
    rol: string
) {
    const actor = await comprobarMiembro(usuarioId, grupoId);
    if (actor.rol !== "creador") throw new Error("Solo el creador puede cambiar roles");
    if (rol !== "moderador" && rol !== "miembro") throw new Error("El rol no es válido");
    if (objetivoId === usuarioId) throw new Error("No puedes cambiar tu propio rol");

    const actualizado = await db.query(
        `UPDATE miembros_grupo SET rol = $3
         WHERE grupo_id = $1 AND usuario_id = $2 AND rol <> 'creador'
         RETURNING usuario_id`,
        [grupoId, objetivoId, rol]
    );
    if (actualizado.rowCount !== 1) throw new Error("Ese miembro no está en el servidor");

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "miembros_actualizados",
        grupoId
    });
    return { mensaje: rol === "moderador" ? "Ahora es moderador" : "Ahora es miembro" };
}

export async function cambiarEscrituraMiembro(
    usuarioId: string,
    grupoId: string,
    objetivoId: string,
    puedeEscribir: boolean
) {
    const actor = await comprobarGestor(usuarioId, grupoId);
    if (typeof puedeEscribir !== "boolean") throw new Error("El permiso de escritura no es válido");
    if (objetivoId === usuarioId) throw new Error("No puedes cambiar tu propio permiso");

    const objetivo = await db.query(
        `SELECT rol FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, objetivoId]
    );
    if (objetivo.rowCount !== 1) throw new Error("Ese miembro no está en el servidor");
    if (objetivo.rows[0].rol === "creador") throw new Error("No puedes modificar al creador");
    if (actor.rol === "moderador" && objetivo.rows[0].rol === "moderador") {
        throw new Error("Un moderador no puede modificar a otro moderador");
    }

    await db.query(
        `UPDATE miembros_grupo SET puede_escribir = $3
         WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, objetivoId, puedeEscribir]
    );
    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "miembros_actualizados",
        grupoId
    });
    return { mensaje: puedeEscribir ? "Puede escribir de nuevo" : "Solo lectura activado" };
}

export async function expulsarMiembro(usuarioId: string, grupoId: string, objetivoId: string) {
    const actor = await comprobarGestor(usuarioId, grupoId);
    if (objetivoId === usuarioId) throw new Error("Para marcharte usa la opción de salir");

    const objetivo = await db.query(
        `SELECT rol FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, objetivoId]
    );
    if (objetivo.rowCount !== 1) throw new Error("Ese miembro no está en el servidor");
    if (objetivo.rows[0].rol === "creador") throw new Error("No puedes expulsar al creador");
    if (actor.rol === "moderador" && objetivo.rows[0].rol === "moderador") {
        throw new Error("Un moderador no puede expulsar a otro moderador");
    }

    await db.query(
        `DELETE FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, objetivoId]
    );
    emitirAUsuarios([objetivoId], { tipo: "expulsado", grupoId });
    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "miembros_actualizados",
        grupoId
    });
    return { mensaje: "Miembro expulsado" };
}

export async function silenciarGrupo(usuarioId: string, grupoId: string, silenciado: boolean) {
    if (typeof silenciado !== "boolean") throw new Error("El estado de silencio no es válido");

    const actualizado = await db.query(
        `UPDATE miembros_grupo SET silenciado = $3
         WHERE grupo_id = $1 AND usuario_id = $2
         RETURNING usuario_id`,
        [grupoId, usuarioId, silenciado]
    );
    if (actualizado.rowCount !== 1) throw new Error("No perteneces a este servidor");

    return { silenciado };
}

// Expulsa y bloquea en la misma transacción; un bloqueo oculto no guarda datos del objetivo.
export async function bloquearMiembro(
    usuarioId: string,
    grupoId: string,
    objetivoId: string,
    opciones: { oculto?: boolean; motivo?: string } = {}
) {
    const actor = await comprobarGestor(usuarioId, grupoId);
    if (objetivoId === usuarioId) throw new Error("No puedes bloquearte a ti mismo");

    const objetivo = await db.query(
        `SELECT rol FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, objetivoId]
    );
    if (objetivo.rowCount !== 1) throw new Error("Ese miembro no está en el servidor");
    if (objetivo.rows[0].rol === "creador") throw new Error("No puedes bloquear al creador");
    if (actor.rol === "moderador" && objetivo.rows[0].rol === "moderador") {
        throw new Error("Un moderador no puede bloquear a otro moderador");
    }

    const oculto = opciones.oculto === true;
    const motivo = (opciones.motivo ?? "").trim().slice(0, 500) || null;

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `DELETE FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
            [grupoId, objetivoId]
        );
        await client.query(
            `INSERT INTO miembros_bloqueados_grupo (grupo_id, usuario_id, bloqueado_por, oculto, motivo)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (grupo_id, usuario_id) DO UPDATE
             SET bloqueado_por = EXCLUDED.bloqueado_por,
                 oculto = EXCLUDED.oculto,
                 motivo = EXCLUDED.motivo,
                 creado_en = NOW()`,
            [grupoId, objetivoId, usuarioId, oculto, motivo]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    emitirAUsuarios([objetivoId], { tipo: "expulsado", grupoId });
    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "miembros_actualizados",
        grupoId
    });
    return { mensaje: "Miembro bloqueado" };
}

export async function listarBloqueadosGrupo(usuarioId: string, grupoId: string) {
    await comprobarGestor(usuarioId, grupoId);

    const resultado = await db.query(
        `
        SELECT b.creado_en AS bloqueado_en, b.oculto, b.motivo,
               CASE WHEN b.oculto THEN NULL ELSE b.usuario_id END AS usuario_id,
               CASE WHEN b.oculto THEN NULL ELSE u.nombre END AS nombre,
               CASE WHEN b.oculto THEN NULL ELSE u.color_nombre END AS color_nombre,
               CASE WHEN b.oculto THEN 'Bloqueado oculto · sin datos' ELSE 'Bloqueado' END AS etiqueta
        FROM miembros_bloqueados_grupo b
        LEFT JOIN usuarios u ON u.id = b.usuario_id
        WHERE b.grupo_id = $1
        ORDER BY b.creado_en DESC
        `,
        [grupoId]
    );

    return resultado.rows;
}

export async function desbloquearMiembro(usuarioId: string, grupoId: string, objetivoId: string) {
    await comprobarGestor(usuarioId, grupoId);

    const resultado = await db.query(
        `DELETE FROM miembros_bloqueados_grupo
         WHERE grupo_id = $1 AND usuario_id = $2 AND oculto = FALSE
         RETURNING usuario_id`,
        [grupoId, objetivoId]
    );
    if (resultado.rowCount !== 1) {
        throw new Error("Ese usuario no estaba bloqueado o su bloqueo es oculto");
    }

    return { mensaje: "Usuario desbloqueado" };
}

export async function traspasarPropiedad(usuarioId: string, grupoId: string, nuevoCreadorId: string) {
    if (usuarioId === nuevoCreadorId) throw new Error("Ese usuario ya es el creador");

    const client = await db.connect();
    try {
        await client.query("BEGIN");

        const objetivo = await client.query(
            `SELECT 1 FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
            [grupoId, nuevoCreadorId]
        );
        if (objetivo.rowCount !== 1) throw new Error("Ese usuario debe estar en el servidor");

        const actualizado = await client.query(
            `UPDATE grupos SET creador_id = $3, actualizado_en = NOW()
             WHERE id = $1 AND creador_id = $2 RETURNING id`,
            [grupoId, usuarioId, nuevoCreadorId]
        );
        if (actualizado.rowCount !== 1) throw new Error("Solo el creador puede traspasar el servidor");

        await client.query(
            `UPDATE miembros_grupo SET rol = 'creador'
             WHERE grupo_id = $1 AND usuario_id = $2`,
            [grupoId, nuevoCreadorId]
        );
        await client.query(
            `UPDATE miembros_grupo SET rol = 'moderador'
             WHERE grupo_id = $1 AND usuario_id = $2 AND rol <> 'creador'`,
            [grupoId, usuarioId]
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "grupo_actualizado",
        grupoId
    });
    return { mensaje: "Servidor traspasado" };
}

export async function marcarLectura(usuarioId: string, grupoId: string, canalId?: string) {
    await comprobarMiembro(usuarioId, grupoId);
    const canal = await resolverCanal(grupoId, canalId);

    await db.query(
        `UPDATE miembros_grupo SET ultima_lectura_en = NOW()
         WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, usuarioId]
    );

    return { canalId: canal.id, leido_en: new Date().toISOString() };
}

// Sin caracteres ambiguos (0/O, 1/I/l) para que el código se pueda dictar.
const ALFABETO_INVITACION = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generarCodigoInvitacionValor() {
    const bytes = randomBytes(9);
    let codigo = "";
    for (let indice = 0; indice < 9; indice++) {
        codigo += ALFABETO_INVITACION[bytes[indice] % ALFABETO_INVITACION.length];
    }
    return codigo;
}

export async function generarCodigoInvitacion(usuarioId: string, grupoId: string) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);
    if (miembro.rol !== "creador" && miembro.rol !== "moderador") {
        throw new Error("Solo el creador o un moderador pueden generar invitaciones");
    }

    // Un solo código vigente por servidor; regenerar invalida el anterior.
    // Reintenta ante la remotísima colisión del índice único de códigos.
    let resultado = null;
    for (let intento = 0; intento < 3; intento++) {
        try {
            resultado = await db.query(
                `UPDATE grupos
                 SET codigo_invitacion = $2,
                     codigo_invitacion_expira_en = NOW() + INTERVAL '7 days',
                     codigo_invitacion_creado_en = NOW(),
                     codigo_invitacion_creado_por = $3,
                     actualizado_en = NOW()
                 WHERE id = $1
                 RETURNING codigo_invitacion AS codigo,
                           codigo_invitacion_expira_en AS expira_en,
                           codigo_invitacion_creado_en AS creado_en`,
                [grupoId, generarCodigoInvitacionValor(), usuarioId]
            );
            break;
        } catch (error) {
            const codigoError = (error as { code?: string }).code;
            if (codigoError !== "23505" || intento === 2) throw error;
        }
    }

    if (!resultado || resultado.rowCount !== 1) {
        throw new Error("No se pudo generar la invitación");
    }
    return resultado.rows[0];
}

export async function deshabilitarCodigoInvitacion(usuarioId: string, grupoId: string) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);
    if (miembro.rol !== "creador" && miembro.rol !== "moderador") {
        throw new Error("Solo el creador o un moderador pueden desactivar invitaciones");
    }

    await db.query(
        `UPDATE grupos
         SET codigo_invitacion = NULL,
             codigo_invitacion_expira_en = NULL,
             codigo_invitacion_creado_en = NULL,
             codigo_invitacion_creado_por = NULL,
             actualizado_en = NOW()
         WHERE id = $1`,
        [grupoId]
    );
    return { mensaje: "Invitaciones desactivadas" };
}

export async function previsualizarInvitacion(usuarioId: string, codigo: string) {
    const limpio = (codigo ?? "").trim().toUpperCase();

    const resultado = await db.query(
        `
        SELECT g.id, g.nombre, g.descripcion, g.tipo, a.ruta AS imagen_ruta,
               g.codigo_invitacion_expira_en AS expira_en,
               (SELECT COUNT(*)::int FROM miembros_grupo m WHERE m.grupo_id = g.id) AS miembros,
               (EXISTS (
                    SELECT 1 FROM miembros_grupo m2
                    WHERE m2.grupo_id = g.id AND m2.usuario_id = $1
               )) AS es_miembro
        FROM grupos g
        LEFT JOIN archivos a ON a.id = g.imagen_archivo_id
        WHERE g.codigo_invitacion = $2
          AND g.codigo_invitacion_expira_en > NOW()
          AND (g.desaparece_en IS NULL OR g.desaparece_en > NOW())
        `,
        [usuarioId, limpio]
    );
    if (resultado.rowCount !== 1) throw new Error("La invitación no existe o ha caducado");

    return resultado.rows[0];
}

export async function unirsePorCodigo(usuarioId: string, codigo: string) {
    const limpio = (codigo ?? "").trim().toUpperCase();

    const resultado = await db.query(
        `SELECT g.id, g.tipo, g.nombre
         FROM grupos g
         WHERE g.codigo_invitacion = $1
           AND g.codigo_invitacion_expira_en > NOW()
           AND (g.desaparece_en IS NULL OR g.desaparece_en > NOW())`,
        [limpio]
    );
    if (resultado.rowCount !== 1) throw new Error("La invitación no existe o ha caducado");

    const grupo = resultado.rows[0];

    const bloqueado = await db.query(
        `SELECT 1 FROM miembros_bloqueados_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupo.id, usuarioId]
    );
    if (bloqueado.rowCount === 1) throw new Error("No puedes unirte a este servidor");

    const yaMiembro = await db.query(
        `SELECT 1 FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupo.id, usuarioId]
    );
    if (yaMiembro.rowCount === 1) return { mensaje: "Ya eres miembro", grupoId: grupo.id };

    // El enlace da acceso aunque el servidor sea de amigos.
    await db.query(
        `INSERT INTO miembros_grupo (grupo_id, usuario_id, origen)
         VALUES ($1, $2, 'manual') ON CONFLICT (grupo_id, usuario_id) DO NOTHING`,
        [grupo.id, usuarioId]
    );

    emitirAUsuarios(await obtenerIdsMiembros(grupo.id), {
        tipo: "miembros_actualizados",
        grupoId: grupo.id
    });
    return { mensaje: "Te has unido al servidor", grupoId: grupo.id };
}

// La foto del servidor se guarda como archivo propio y se enlaza al grupo.
// Vale para los dos modelos: servidores con canales y de chat único.
export async function actualizarImagenGrupo(
    usuarioId: string,
    grupoId: string,
    archivoId: string | null
) {
    await comprobarGestor(usuarioId, grupoId);

    if (archivoId) {
        const archivo = await db.query(
            `SELECT 1 FROM archivos WHERE id = $1 AND tipo = 'grupo_imagen'`,
            [archivoId]
        );
        if (archivo.rowCount !== 1) throw new Error("La foto del servidor no es válida");
    }

    await db.query(
        `UPDATE grupos SET imagen_archivo_id = $2, actualizado_en = NOW() WHERE id = $1`,
        [grupoId, archivoId]
    );

    const resultado = await db.query(
        `SELECT a.ruta AS imagen_ruta
         FROM grupos g
         LEFT JOIN archivos a ON a.id = g.imagen_archivo_id
         WHERE g.id = $1`,
        [grupoId]
    );

    const imagenRuta = (resultado.rows[0]?.imagen_ruta as string | null) ?? null;

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "grupo_actualizado",
        grupoId,
        imagenRuta
    });

    return { imagen_ruta: imagenRuta };
}

export async function editarMensajeGrupo(
    usuarioId: string,
    grupoId: string,
    mensajeId: string,
    contenido: string
) {
    await comprobarMiembro(usuarioId, grupoId);
    const texto = (contenido ?? "").trim();
    if (!texto || texto.length > 5000) {
        throw new Error("El mensaje debe tener entre 1 y 5000 caracteres");
    }

    const actualizado = await db.query(
        `UPDATE mensajes_grupo SET contenido = $3, editado_en = NOW()
         WHERE id = $1 AND grupo_id = $2 AND autor_id = $4 AND oculto = FALSE
         RETURNING id, canal_id`,
        [mensajeId, grupoId, texto, usuarioId]
    );

    if (actualizado.rowCount !== 1) {
        const existe = await db.query(
            `SELECT autor_id, oculto FROM mensajes_grupo WHERE id = $1 AND grupo_id = $2`,
            [mensajeId, grupoId]
        );
        if (existe.rowCount !== 1) throw new Error("El mensaje ya no existe");
        if (existe.rows[0].autor_id !== usuarioId) throw new Error("Solo puedes editar tus mensajes");
        throw new Error("Los mensajes ocultos no se pueden editar");
    }

    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "mensaje_editado",
        grupoId,
        canalId: actualizado.rows[0].canal_id,
        mensajeId,
        contenido: texto
    });
    return { mensaje: "Mensaje editado" };
}

export async function eliminarMensajesGrupo(
    usuarioId: string,
    grupoId: string,
    mensajeIds: string[]
) {
    const miembro = await comprobarMiembro(usuarioId, grupoId);
    const unicos = [...new Set(mensajeIds ?? [])].filter(Boolean);
    if (!unicos.length) throw new Error("No hay mensajes seleccionados");
    if (unicos.length > 50) throw new Error("Solo puedes eliminar hasta 50 mensajes a la vez");

    const gestor = miembro.rol === "creador" || miembro.rol === "moderador";
    const resultado = await db.query(
        `DELETE FROM mensajes_grupo mg
         WHERE mg.grupo_id = $1
           AND mg.id = ANY($2::uuid[])
           AND (mg.autor_id = $3 OR $4::boolean)
         RETURNING mg.id, mg.autor_id`,
        [grupoId, unicos, usuarioId, gestor]
    );
    if (resultado.rowCount === 0) throw new Error("No puedes eliminar estos mensajes");

    // Los autores eliminados también deben enterarse aunque ya no sean miembros.
    const autores = resultado.rows.map((fila: { autor_id: string }) => fila.autor_id);
    emitirAUsuarios([...(await obtenerIdsMiembros(grupoId)), ...autores], {
        tipo: "mensajes_eliminados",
        grupoId,
        mensajeIds: resultado.rows.map((fila: { id: string }) => fila.id)
    });
    return {
        mensaje: "Mensajes eliminados",
        eliminados: resultado.rowCount
    };
}

async function mensajeOcultoDeGrupo(grupoId: string, mensajeId: string) {
    const resultado = await db.query(
        `SELECT id, autor_id, oculto FROM mensajes_grupo WHERE id = $1 AND grupo_id = $2`,
        [mensajeId, grupoId]
    );
    if (resultado.rowCount !== 1) throw new Error("El mensaje ya no existe");
    if (!resultado.rows[0].oculto) throw new Error("Este mensaje no está oculto");
    return resultado.rows[0] as { id: string; autor_id: string; oculto: boolean };
}

// Moderación ciega: actúa sobre el autor sin revelarlo jamás en la respuesta.
export async function bloquearAutorDeMensaje(
    usuarioId: string,
    grupoId: string,
    mensajeId: string
) {
    const actor = await comprobarGestor(usuarioId, grupoId);
    const mensaje = await mensajeOcultoDeGrupo(grupoId, mensajeId);

    if (mensaje.autor_id === usuarioId) throw new Error("No puedes bloquear tu propio mensaje");

    const objetivo = await db.query(
        `SELECT rol FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
        [grupoId, mensaje.autor_id]
    );
    if (objetivo.rowCount !== 1) throw new Error("El autor ya no está en el servidor");
    if (objetivo.rows[0].rol === "creador") throw new Error("No puedes bloquear al creador");
    if (actor.rol === "moderador" && objetivo.rows[0].rol === "moderador") {
        throw new Error("Un moderador no puede bloquear a otro moderador");
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `DELETE FROM miembros_grupo WHERE grupo_id = $1 AND usuario_id = $2`,
            [grupoId, mensaje.autor_id]
        );
        await client.query(
            `INSERT INTO miembros_bloqueados_grupo (grupo_id, usuario_id, bloqueado_por, oculto)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (grupo_id, usuario_id) DO UPDATE
             SET bloqueado_por = EXCLUDED.bloqueado_por,
                 oculto = TRUE,
                 motivo = NULL,
                 creado_en = NOW()`,
            [grupoId, mensaje.autor_id, usuarioId]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    emitirAUsuarios([mensaje.autor_id], { tipo: "expulsado", grupoId });
    emitirAUsuarios(await obtenerIdsMiembros(grupoId), {
        tipo: "miembros_actualizados",
        grupoId
    });

    // Sin identidades: solo se confirma que el bloqueo se ha aplicado.
    return { bloqueado: true };
}

export async function restringirOcultosDeMensaje(
    usuarioId: string,
    grupoId: string,
    mensajeId: string
) {
    await comprobarGestor(usuarioId, grupoId);
    const mensaje = await mensajeOcultoDeGrupo(grupoId, mensajeId);

    await db.query(
        `INSERT INTO ocultos_restringidos_grupo (grupo_id, usuario_id, creado_por)
         VALUES ($1, $2, $3)
         ON CONFLICT (grupo_id, usuario_id) DO NOTHING`,
        [grupoId, mensaje.autor_id, usuarioId]
    );

    return { restringido: true };
}

export async function quitarRestriccionesOcultas(
    usuarioId: string,
    grupoId: string,
    usuarioObjetivoId?: string
) {
    await comprobarGestor(usuarioId, grupoId);

    const resultado = usuarioObjetivoId
        ? await db.query(
            `DELETE FROM ocultos_restringidos_grupo
             WHERE grupo_id = $1 AND usuario_id = $2
             RETURNING usuario_id`,
            [grupoId, usuarioObjetivoId]
        )
        : await db.query(
            `DELETE FROM ocultos_restringidos_grupo
             WHERE grupo_id = $1
             RETURNING usuario_id`,
            [grupoId]
        );

    return {
        mensaje: "Restricciones de mensajes ocultos levantadas",
        totales: resultado.rowCount
    };
}
