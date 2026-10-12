/**
 * Comprueba la migración de moderación: tablas denuncias_cuentas y
 * tumbas_cuentas, y las columnas que necesita el bloqueo y el borrado
 * de cuentas por rol.
 *
 *   node deploy/probar-moderacion-migracion.mjs
 */
import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

let fallos = 0;
function comprobar(condicion, mensaje) {
    if (condicion) {
        console.log(`  ok  ${mensaje}`);
    } else {
        fallos += 1;
        console.log(`FALLO ${mensaje}`);
    }
}

try {
    const { migrarEsquema } = await import("../dist/db/migrations.js");
    await migrarEsquema();

    const tablas = await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_name IN ('denuncias_cuentas', 'tumbas_cuentas')`
    );
    const nombres = tablas.rows.map((fila) => fila.table_name).sort();
    comprobar(
        nombres[0] === "denuncias_cuentas" && nombres[1] === "tumbas_cuentas",
        "Las tablas denuncias_cuentas y tumbas_cuentas existen"
    );

    const columnas = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'tumbas_cuentas'`
    );
    const tumbasColumnas = columnas.rows.map((fila) => fila.column_name);
    comprobar(
        tumbasColumnas.includes("codigo_vinculacion_hash"),
        "tumbas_cuentas guarda el hash del codigo de vinculacion"
    );
    comprobar(
        tumbasColumnas.includes("borrado_por_rol"),
        "tumbas_cuentas guarda quien la borro y su rol"
    );

    const denuncias = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'denuncias_cuentas'`
    );
    const denunciaColumnas = denuncias.rows.map((fila) => fila.column_name);
    comprobar(
        denunciaColumnas.includes("motivo") && denunciaColumnas.includes("denunciante_id"),
        "denuncias_cuentas guarda motivo y denunciante"
    );
} catch (error) {
    fallos += 1;
    console.error("FALLO en la migracion:", error.message);
} finally {
    await pool.end().catch(() => {});
}

if (fallos > 0) {
    process.exitCode = 1;
} else {
    console.log("Migracion de moderacion correcta");
}
