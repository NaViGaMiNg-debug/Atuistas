import argon2 from "argon2";
import crypto from "node:crypto";
import { db } from "../db/database.js";
import {
    generarCodigoVinculacion,
    cifrarCodigo,
    obtenerHashCodigo,
    descifrarCodigo
} from "./codigo.service.js";


/* ==============================
   CREAR SESIÓN
   ============================== */

async function crearSesion(
    usuarioId: string,
    dispositivoIdentificador: string
): Promise<{
    token: string;
    expira_en: Date;
}> {

    const dispositivoResultado = await db.query(
        `
        INSERT INTO dispositivos (
            usuario_id,
            identificador
        )
        VALUES ($1, $2)
        ON CONFLICT (usuario_id, identificador)
        DO UPDATE SET ultimo_uso = NOW()
        RETURNING id
        `,
        [
            usuarioId,
            dispositivoIdentificador
        ]
    );


    const dispositivoId =
        dispositivoResultado.rows[0].id;


    const identificadorSesion =
        crypto.randomBytes(16).toString("hex");


    const secretoSesion =
        crypto.randomBytes(32).toString("hex");


    const token =
        `${identificadorSesion}.${secretoSesion}`;


    const tokenHash =
        await argon2.hash(secretoSesion);


    const expiraEn = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
    );


    await db.query(
        `
        INSERT INTO sesiones (
            usuario_id,
            dispositivo_id,
            identificador,
            token_hash,
            expira_en
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
            usuarioId,
            dispositivoId,
            identificadorSesion,
            tokenHash,
            expiraEn
        ]
    );


    return {
        token,
        expira_en: expiraEn
    };

}


/* ==============================
   REGISTRAR USUARIO
   ============================== */

export async function registrarUsuario(
    nombre: string,
    dispositivoId: string
) {

    const nombreLimpio =
        nombre.trim();


    if (!nombreLimpio) {

        throw new Error(
            "El nombre no puede estar vacío"
        );

    }


    if (nombreLimpio.length > 25) {

        throw new Error(
            "El nombre no puede superar los 25 caracteres"
        );

    }


    const nombreNormalizado =
        nombreLimpio.toLocaleLowerCase();


    const usuarioExistente =
        await db.query(
            `
            SELECT id
            FROM usuarios
            WHERE nombre_normalizado = $1
            `,
            [nombreNormalizado]
        );


    if (
        usuarioExistente.rowCount &&
        usuarioExistente.rowCount > 0
    ) {

        throw new Error(
            "Ese nombre ya está en uso"
        );

    }


    const codigoVinculacion =
        generarCodigoVinculacion();


    const codigoVinculacionCifrado =
        cifrarCodigo(codigoVinculacion);


    const codigoVinculacionHash =
        obtenerHashCodigo(codigoVinculacion);


    const resultado =
        await db.query(
            `
            INSERT INTO usuarios (
                nombre,
                nombre_normalizado,
                codigo_vinculacion_cifrado,
                codigo_vinculacion_hash
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id, nombre, creado_en
            `,
            [
                nombreLimpio,
                nombreNormalizado,
                codigoVinculacionCifrado,
                codigoVinculacionHash
            ]
        );


    const usuario =
        resultado.rows[0];


    const sesion =
        await crearSesion(
            usuario.id,
            dispositivoId
        );


    return {
        id: usuario.id,
        nombre: usuario.nombre,
        token: sesion.token,
        expira_en: sesion.expira_en,
        codigo_vinculacion:
            codigoVinculacion
    };

}


/* ==============================
   VINCULAR DISPOSITIVO
   ============================== */

export async function vincularDispositivo(
    codigo: string,
    dispositivoId: string
) {

    if (!codigo) {

        throw new Error(
            "El código de vinculación es obligatorio"
        );

    }


    const codigoHash =
        obtenerHashCodigo(
            codigo.trim()
        );


    const resultado =
        await db.query(
            `
            SELECT id, nombre
            FROM usuarios
            WHERE activo = TRUE
            AND codigo_vinculacion_hash = $1
            LIMIT 1
            `,
            [codigoHash]
        );


    if (resultado.rowCount === 0) {

        throw new Error(
            "Código de vinculación incorrecto"
        );

    }


    const usuario =
        resultado.rows[0];


    const sesion =
        await crearSesion(
            usuario.id,
            dispositivoId
        );


    return {
        id: usuario.id,
        nombre: usuario.nombre,
        token: sesion.token,
        expira_en: sesion.expira_en
    };

}


/* ==============================
   OBTENER CUENTA
   ============================== */

export async function obtenerCuenta(
    usuarioId: string
) {

    const resultado =
        await db.query(
            `
            SELECT
                u.id,
                u.nombre,
                u.descripcion,
                u.color_nombre,
                u.etiqueta,
                u.es_desarrollador,
                u.avatar_archivo_id,
                u.creado_en,
                u.codigo_vinculacion_cifrado,
                a.ruta AS avatar_ruta
            FROM usuarios u
            LEFT JOIN archivos a
                ON a.id = u.avatar_archivo_id
            WHERE u.id = $1
            AND u.activo = TRUE
            `,
            [usuarioId]
        );


    if (resultado.rowCount === 0) {

        throw new Error(
            "Usuario no encontrado"
        );

    }


    const usuario =
        resultado.rows[0];


    const codigo = usuario.codigo_vinculacion_cifrado
        ? descifrarCodigo(usuario.codigo_vinculacion_cifrado)
        : null;


    return {
        id: usuario.id,
        nombre: usuario.nombre,
        descripcion: usuario.descripcion,
        color_nombre: usuario.color_nombre,
        etiqueta: usuario.etiqueta,
        es_desarrollador: usuario.es_desarrollador === true,
        avatar_archivo_id:
            usuario.avatar_archivo_id,
        avatar_ruta:
            usuario.avatar_ruta,
        creado_en: usuario.creado_en,
        codigo_vinculacion: codigo
    };

}


/* ==============================
   ACTUALIZAR CUENTA
   ============================== */

export async function actualizarCuenta(
    usuarioId: string,
    descripcion?: string,
    colorNombre?: string,
    nombre?: string
) {

    const descripcionLimpia =
        (descripcion ?? "").trim();


    if (descripcionLimpia.length > 500) {

        throw new Error(
            "La descripción no puede superar los 500 caracteres"
        );

    }


    const color =
        (colorNombre ?? "").trim();


    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {

        throw new Error(
            "El color del nombre no es válido"
        );

    }

    let nombreLimpio: string | null = null;
    let nombreNormalizado: string | null = null;
    if (nombre !== undefined) {
        nombreLimpio = nombre.trim();
        if (!nombreLimpio || nombreLimpio.length > 25) {
            throw new Error("El nombre debe tener entre 1 y 25 caracteres");
        }
        nombreNormalizado = nombreLimpio.toLocaleLowerCase();
        const duplicado = await db.query(
            `SELECT 1 FROM usuarios
             WHERE nombre_normalizado = $1 AND id <> $2
             LIMIT 1`,
            [nombreNormalizado, usuarioId]
        );
        if (duplicado.rowCount !== 0) {
            throw new Error("Ese nombre ya está en uso");
        }
    }


    const resultado =
        await db.query(
            `
            UPDATE usuarios
            SET
                nombre = COALESCE($1, nombre),
                nombre_normalizado = COALESCE($2, nombre_normalizado),
                descripcion = $3,
                color_nombre = $4
            WHERE id = $5
            AND activo = TRUE
            RETURNING
                id,
                nombre,
                descripcion,
                color_nombre,
                avatar_archivo_id,
                creado_en
            `,
            [
                nombreLimpio,
                nombreNormalizado,
                descripcionLimpia || null,
                color,
                usuarioId
            ]
        );


    if (resultado.rowCount === 0) {

        throw new Error(
            "Usuario no encontrado"
        );

    }


    return resultado.rows[0];

}


/* ==============================
   REGENERAR CÓDIGO DE VINCULACIÓN
   ============================== */

export async function regenerarCodigoVinculacion(
    usuarioId: string
) {

    const codigo =
        generarCodigoVinculacion();


    const codigoCifrado =
        cifrarCodigo(codigo);


    const codigoHash =
        obtenerHashCodigo(codigo);


    const resultado =
        await db.query(
            `
            UPDATE usuarios
            SET
                codigo_vinculacion_cifrado = $1,
                codigo_vinculacion_hash = $2
            WHERE id = $3
            AND activo = TRUE
            RETURNING id
            `,
            [
                codigoCifrado,
                codigoHash,
                usuarioId
            ]
        );


    if (resultado.rowCount === 0) {

        throw new Error(
            "Usuario no encontrado"
        );

    }


    return codigo;

}