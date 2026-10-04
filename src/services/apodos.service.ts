import { db } from "../db/database.js";

// APODOS: el nombre privado que le pones a cada persona.
//
// Cada usuario le pone el apodo que quiere a quien quiera (solo a otras
// cuentas). Ese apodo se ve en lugar del nombre real en toda la app de quien lo
// puso, pero no lo ve nadie mas: la otra persona sigue viendo su nombre real.
// En "Agregar amigos" no se usa el apodo, porque ahi se buscan personas nuevas.

export async function listarApodos(usuarioId: string) {
    const resultado = await db.query(
        `SELECT otro_id, apodo
         FROM apodos
         WHERE usuario_id = $1
         ORDER BY apodo COLLATE "C"`,
        [usuarioId]
    );
    return resultado.rows as { otro_id: string; apodo: string }[];
}

export async function guardarApodo(usuarioId: string, otroId: string, apodo: string) {
    if (usuarioId === otroId) {
        throw new Error("No te puedes poner un apodo a ti mismo");
    }

    const texto = (apodo ?? "").trim();
    if (!texto) {
        // Apodo vacio = quitarlo.
        await db.query(
            `DELETE FROM apodos WHERE usuario_id = $1 AND otro_id = $2`,
            [usuarioId, otroId]
        );
        return { otro_id: otroId, apodo: null };
    }

    if (texto.length > 25) {
        throw new Error("El apodo no puede superar los 25 caracteres");
    }

    const existe = await db.query(
        `SELECT 1 FROM usuarios WHERE id = $1 AND activo = TRUE`,
        [otroId]
    );
    if (existe.rowCount !== 1) {
        throw new Error("Esa persona no existe");
    }

    const resultado = await db.query(
        `INSERT INTO apodos (usuario_id, otro_id, apodo)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id, otro_id)
         DO UPDATE SET apodo = EXCLUDED.apodo
         RETURNING otro_id, apodo`,
        [usuarioId, otroId, texto]
    );
    return resultado.rows[0];
}

export async function quitarApodo(usuarioId: string, otroId: string) {
    await db.query(
        `DELETE FROM apodos WHERE usuario_id = $1 AND otro_id = $2`,
        [usuarioId, otroId]
    );
    return { mensaje: "Apodo quitado" };
}

export async function obtenerApodo(usuarioId: string, otroId: string) {
    const resultado = await db.query(
        `SELECT apodo FROM apodos WHERE usuario_id = $1 AND otro_id = $2`,
        [usuarioId, otroId]
    );
    return (resultado.rows[0]?.apodo as string | undefined) ?? null;
}

// Nombre que le tiene que mostrar el servidor a "usuarioId" para "otroId":
// su apodo si lo tiene puesto, y el nombre real si no.
export async function nombrePara(usuarioId: string, otroId: string, nombreReal: string) {
    const apodo = await obtenerApodo(usuarioId, otroId);
    return apodo || nombreReal;
}