import { db } from "../db/database.js";
import { rm } from "node:fs/promises";
import path from "node:path";
import { esDesarrollador } from "./desarrollador.service.js";
import { eliminarCuentaPorRol } from "./moderacion.service.js";

export type TipoDenuncia = "cuentas" | "reels" | "estados" | "publicaciones";

export interface EtiquetaAdmin {
    nombre: string;
    color: string;
}

async function leerEtiquetasAdmin(): Promise<EtiquetaAdmin[]> {
    try {
        const resultado = await db.query(
            `SELECT nombre, color FROM config_admin_etiquetas ORDER BY nombre ASC`
        );
        const lista = (resultado.rows as Array<{ nombre: string; color: string }>)
            .map((fila) => ({
                nombre: String(fila.nombre ?? "").trim(),
                color: String(fila.color ?? "").trim()
            }))
            .filter((fila) => fila.nombre.length > 0);
        if (lista.length > 0) return lista;
    } catch {
        // Tabla sin migrar: valor por defecto.
    }
    return [{ nombre: "Admin", color: "#3b82f6" }];
}

function colorValido(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export async function esAdminEtiqueta(usuarioId: string): Promise<boolean> {
    if (await esDesarrollador(usuarioId)) return true;
    const perfil = await db.query(
        `SELECT etiqueta FROM usuarios WHERE id = $1 AND activo = TRUE`,
        [usuarioId]
    );
    if (perfil.rowCount !== 1) return false;
    const etiqueta = String(perfil.rows[0].etiqueta ?? "").trim();
    if (!etiqueta) return false;
    if (etiqueta === "Creador") return true;
    const lista = await leerEtiquetasAdmin();
    return lista.some((item) => item.nombre === etiqueta);
}

export async function exigirAdmin(usuarioId: string): Promise<void> {
    if (!(await esAdminEtiqueta(usuarioId))) {
        throw new Error("Solo Creador o Admin pueden ver las denuncias");
    }
}

async function exigirCreador(usuarioId: string): Promise<void> {
    const perfil = await db.query(
        `SELECT etiqueta FROM usuarios WHERE id = $1 AND activo = TRUE`,
        [usuarioId]
    );
    if (perfil.rowCount !== 1 || String(perfil.rows[0].etiqueta ?? "") !== "Creador") {
        throw new Error("Solo la cuenta Creador puede cambiar las etiquetas de admin");
    }
}

export async function obtenerEtiquetasAdmin(usuarioId: string): Promise<EtiquetaAdmin[]> {
    await exigirAdmin(usuarioId);
    return leerEtiquetasAdmin();
}

export async function actualizarEtiquetasAdmin(
    usuarioId: string,
    etiquetas: Array<{ nombre?: string; color?: string }>
): Promise<EtiquetaAdmin[]> {
    await exigirCreador(usuarioId);
    const limpias: EtiquetaAdmin[] = [];
    const vistas = new Set<string>();
    for (const item of etiquetas ?? []) {
        const nombre = String(item?.nombre ?? "").trim().slice(0, 24);
        const color = String(item?.color ?? "").trim();
        if (!nombre || vistas.has(nombre)) continue;
        if (nombre === "Creador") continue;
        if (!colorValido(color)) {
            throw new Error(`El color de "${nombre}" no es valido (usa #RRGGBB)`);
        }
        vistas.add(nombre);
        limpias.push({ nombre, color });
    }
    if (limpias.length === 0) {
        throw new Error("Anade al menos una etiqueta de admin");
    }
    if (limpias.length > 10) {
        throw new Error("Maximo 10 etiquetas de admin");
    }
    await db.query(`DELETE FROM config_admin_etiquetas`);
    for (const item of limpias) {
        await db.query(
            `INSERT INTO config_admin_etiquetas (nombre, color) VALUES ($1, $2)`,
            [item.nombre, item.color]
        );
    }
    return limpias;
}

export function tablaDe(tipo: TipoDenuncia): { tabla: string; columna: string } {
    if (tipo === "cuentas") return { tabla: "denuncias_cuentas", columna: "denunciado_id" };
    if (tipo === "reels") return { tabla: "denuncias_reels", columna: "reel_id" };
    if (tipo === "estados") return { tabla: "denuncias_estados", columna: "estado_id" };
    return { tabla: "denuncias_publicaciones", columna: "publicacion_id" };
}

export async function contarDenunciasPendientes(usuarioId?: string): Promise<number> {
    if (usuarioId && !(await esAdminEtiqueta(usuarioId))) {
        throw new Error("Solo Creador o Admin pueden ver las denuncias");
    }
    let total = 0;
    const tipos: TipoDenuncia[] = ["cuentas", "reels", "estados", "publicaciones"];
    for (const tipo of tipos) {
        const { tabla, columna } = tablaDe(tipo);
        try {
            const r = await db.query(
                `SELECT COUNT(DISTINCT ${columna})::int AS total FROM ${tabla} WHERE revisado_en IS NULL`
            );
            total += Number(r.rows[0]?.total ?? 0);
        } catch {
            const r = await db.query(`SELECT COUNT(*)::int AS total FROM ${tabla}`);
            total += Number(r.rows[0]?.total ?? 0);
        }
    }
    return total;
}
async function denunciasDe(tabla: string, columna: string, objetoId: string) {
    const r = await db.query(
        `SELECT d.motivo, d.creado_en, d.denunciante_id,
                COALESCE(u.nombre, 'Cuenta eliminada') AS denunciante
           FROM ${tabla} d LEFT JOIN usuarios u ON u.id = d.denunciante_id
          WHERE d.${columna} = $1 ORDER BY d.creado_en ASC`,
        [objetoId]
    );
    return r.rows.map((f: Record<string, unknown>) => ({
        motivo: String(f.motivo ?? ""),
        denunciante: String(f.denunciante ?? "Desconocido"),
        denunciante_id: String(f.denunciante_id ?? ""),
        creado_en: String(f.creado_en ?? "")
    }));
}
async function revisadoDe(tabla: string, columna: string, objetoId: string): Promise<boolean> {
    try {
        const r = await db.query(
            `SELECT BOOL_AND(revisado_en IS NOT NULL) AS revisado FROM ${tabla} WHERE ${columna} = $1`,
            [objetoId]
        );
        return r.rows[0]?.revisado === true;
    } catch {
        return false;
    }
}

export async function listarDenuncias(usuarioId: string, tipo: TipoDenuncia) {
    await exigirAdmin(usuarioId);
    if (tipo === "cuentas") {
        const lista = await db.query(
            `SELECT d.denunciado_id AS id, MAX(d.creado_en) AS ultima
               FROM denuncias_cuentas d GROUP BY d.denunciado_id ORDER BY ultima DESC`
        );
        const out = [];
        for (const fila of lista.rows as Array<{ id: string }>) {
            const p = await db.query(
                `SELECT u.id, u.nombre, u.etiqueta, u.color_nombre,
                        CASE WHEN ar.ruta IS NULL THEN NULL
                             ELSE REPLACE(ar.ruta, '\\', '/') END AS avatar_url
                   FROM usuarios u
                   LEFT JOIN archivos ar ON ar.id = u.avatar_archivo_id
                  WHERE u.id = $1`,
                [fila.id]
            );
            if (p.rowCount !== 1) continue;
            out.push({
                id: fila.id,
                revisado: await revisadoDe("denuncias_cuentas", "denunciado_id", fila.id),
                cuenta: p.rows[0],
                denuncias: await denunciasDe("denuncias_cuentas", "denunciado_id", fila.id)
            });
        }
        return out;
    }
    if (tipo === "publicaciones") {
        const lista = await db.query(
            `SELECT d.publicacion_id AS id, MAX(d.creado_en) AS ultima
               FROM denuncias_publicaciones d GROUP BY d.publicacion_id ORDER BY ultima DESC`
        );
        const out = [];
        for (const fila of lista.rows as Array<{ id: string }>) {
            const pub = await db.query(
                `SELECT p.id, p.texto, p.visibilidad, p.creada_en, p.autor_id,
                        u.nombre AS autor_nombre,
                        COALESCE((
                            SELECT json_agg(json_build_object(
                                'tipo', mp.tipo,
                                'url', REPLACE(a.ruta, '\\', '/')
                            ) ORDER BY mp.orden)
                            FROM multimedia_publicacion mp
                            INNER JOIN archivos a ON a.id = mp.archivo_id
                            WHERE mp.publicacion_id = p.id
                        ), '[]'::json) AS multimedia
                   FROM publicaciones p
                   INNER JOIN usuarios u ON u.id = p.autor_id WHERE p.id = $1`,
                [fila.id]
            );
            if (pub.rowCount !== 1) continue;
            out.push({
                id: fila.id,
                revisado: await revisadoDe("denuncias_publicaciones", "publicacion_id", fila.id),
                publicacion: pub.rows[0],
                denuncias: await denunciasDe("denuncias_publicaciones", "publicacion_id", fila.id)
            });
        }
        return out;
    }
    if (tipo === "reels") {
        const lista = await db.query(
            `SELECT d.reel_id AS id, MAX(d.creado_en) AS ultima
               FROM denuncias_reels d GROUP BY d.reel_id ORDER BY ultima DESC`
        );
        const out = [];
        for (const fila of lista.rows as Array<{ id: string }>) {
            const reel = await db.query(
                `SELECT r.id, r.titulo, r.visibilidad, r.creado_en, r.autor_id,
                        u.nombre AS autor_nombre,
                        REPLACE(a.ruta, '\\', '/') AS video_url
                   FROM reels r
                   INNER JOIN usuarios u ON u.id = r.autor_id
                   INNER JOIN archivos a ON a.id = r.archivo_id WHERE r.id = $1`,
                [fila.id]
            );
            if (reel.rowCount !== 1) continue;
            out.push({
                id: fila.id,
                revisado: await revisadoDe("denuncias_reels", "reel_id", fila.id),
                reel: reel.rows[0],
                denuncias: await denunciasDe("denuncias_reels", "reel_id", fila.id)
            });
        }
        return out;
    }
    const lista = await db.query(
        `SELECT d.estado_id AS id, MAX(d.creado_en) AS ultima
           FROM denuncias_estados d GROUP BY d.estado_id ORDER BY ultima DESC`
    );
    const out = [];
    for (const fila of lista.rows as Array<{ id: string }>) {
        const est = await db.query(
            `SELECT s.id, s.texto, s.visibilidad, s.creado_en, s.autor_id,
                    u.nombre AS autor_nombre,
                    COALESCE((
                        SELECT json_agg(json_build_object(
                            'tipo', me.tipo,
                            'url', REPLACE(a.ruta, '\\', '/')
                        ) ORDER BY me.orden)
                        FROM multimedia_estado me
                        INNER JOIN archivos a ON a.id = me.archivo_id
                        WHERE me.estado_id = s.id
                    ), '[]'::json) AS multimedia
               FROM estados s
               INNER JOIN usuarios u ON u.id = s.autor_id WHERE s.id = $1`,
            [fila.id]
        );
        if (est.rowCount !== 1) continue;
        out.push({
            id: fila.id,
            revisado: await revisadoDe("denuncias_estados", "estado_id", fila.id),
            estado: est.rows[0],
            denuncias: await denunciasDe("denuncias_estados", "estado_id", fila.id)
        });
    }
    return out;
}
export async function marcarDenunciaRevisada(
    usuarioId: string, tipo: TipoDenuncia, objetoId: string, revisado: boolean
) {
    await exigirAdmin(usuarioId);
    const par = tablaDe(tipo);
    try {
        if (revisado) {
            await db.query(
                `UPDATE ${par.tabla} SET revisado_en = NOW(), revisado_por = $2 WHERE ${par.columna} = $1`,
                [objetoId, usuarioId]
            );
        } else {
            await db.query(
                `UPDATE ${par.tabla} SET revisado_en = NULL, revisado_por = NULL WHERE ${par.columna} = $1`,
                [objetoId]
            );
        }
    } catch {
        throw new Error("Reinicia el servidor para activar la marca de revisado");
    }
    return { revisado };
}
export async function borrarContenidoDenunciado(
    usuarioId: string, tipo: TipoDenuncia, objetoId: string
) {
    await exigirAdmin(usuarioId);
    // Las cuentas siguen sus reglas de rol (nadie borra a Creador...).
    if (tipo === "cuentas") return eliminarCuentaPorRol(usuarioId, objetoId);
    // Contenido: cualquiera con el triangulo puede borrarlo desde el panel.
    if (tipo === "reels") {
        const r = await db.query(
            `DELETE FROM reels WHERE id = $1 RETURNING archivo_id`,
            [objetoId]
        );
        if (r.rowCount !== 1) throw new Error("Ese reel ya no existe");
        const archivo = await db.query(
            `DELETE FROM archivos WHERE id = $1 RETURNING ruta`,
            [r.rows[0].archivo_id]
        );
        const ruta = archivo.rows[0]?.ruta as string | undefined;
        if (ruta) await rm(path.join(process.cwd(), ruta), { force: true });
        return { mensaje: "Reel eliminado" };
    }
    const tabla = tipo === "publicaciones" ? "publicaciones" : "estados";
    const r = await db.query(
        `DELETE FROM ${tabla} WHERE id = $1 RETURNING id`,
        [objetoId]
    );
    if (r.rowCount !== 1) throw new Error("Ese contenido ya no existe");
    return {
        mensaje: tipo === "publicaciones"
            ? "Publicacion eliminada"
            : "Estado eliminado"
    };
}



