import { FastifyInstance } from "fastify";
import {
    registrarUsuario,
    vincularDispositivo,
    obtenerCuenta,
    actualizarCuenta,
    regenerarCodigoVinculacion
} from "../services/auth.service.js";
import { autenticar } from "../middleware/auth.middleware.js";
import { db } from "../db/database.js";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { validarArchivos } from "../services/multimedia.service.js";
import { guardarArchivoSubido } from "../services/archivos.service.js";


export async function authRoutes(app: FastifyInstance) {

    /* ==============================
       REGISTRO
       ============================== */

    app.post("/api/auth/registro", async (request, reply) => {

        try {

            const body = request.body as {
                nombre?: string;
                dispositivo_id?: string;
            };


            if (!body.nombre || !body.dispositivo_id) {

                return reply.status(400).send({
                    error: "El nombre es obligatorio"
                });

            }


            const usuario = await registrarUsuario(
                body.nombre,
                body.dispositivo_id
            );


            return reply.status(201).send({
                mensaje: "Usuario registrado correctamente",
                usuario
            });


        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al registrar el usuario";


            return reply.status(400).send({
                error: mensaje
            });

        }

    });


    /* ==============================
       VINCULAR DISPOSITIVO
       ============================== */

    app.post("/api/auth/vincular", async (request, reply) => {

        try {

            const body = request.body as {
                codigo?: string;
                dispositivo_id?: string;
            };


            if (!body.codigo || !body.dispositivo_id) {

                return reply.status(400).send({
                    error: "El código de vinculación es obligatorio"
                });

            }


            const usuario = await vincularDispositivo(
                body.codigo,
                body.dispositivo_id
            );


            return reply.status(200).send({
                mensaje: "Dispositivo vinculado correctamente",
                usuario
            });


        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al vincular el dispositivo";


            return reply.status(401).send({
                error: mensaje
            });

        }

    });


    /* ==============================
       OBTENER CUENTA
       ============================== */

    app.get("/api/auth/me", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {

            if (!request.usuario) {
                return reply.code(401).send({
                    error: "No autenticado"
                });
            }

            const usuario =
                await obtenerCuenta(request.usuario.id);


            return {
                usuario
            };


        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al obtener la cuenta";


            return reply.status(500).send({
                error: mensaje
            });

        }

    });


    /* ==============================
       ACTUALIZAR CUENTA
       ============================== */

    app.put("/api/auth/cuenta", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {

            const body = request.body as {
                nombre?: string;
                descripcion?: string;
                color_nombre?: string;
            };

            if (!request.usuario) {
                return reply.code(401).send({
                    error: "No autenticado"
                });
            }

            const cuenta =
                await actualizarCuenta(
                    request.usuario.id,
                    body.descripcion,
                    body.color_nombre,
                    body.nombre
                );


            return {
                mensaje: "Cuenta actualizada correctamente",
                usuario: cuenta
            };


        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al actualizar la cuenta";


            return reply.status(400).send({
                error: mensaje
            });

        }

    });


    /* ==============================
       REGENERAR CÓDIGO
       ============================== */

    app.post("/api/auth/codigo/regenerar", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {
                    
            if (!request.usuario) {
                return reply.code(401).send({
                    error: "No autenticado"
                });
            }

            const codigo =
                await regenerarCodigoVinculacion(
                    request.usuario.id
                );


            return {
                mensaje: "Código regenerado correctamente",
                codigo_vinculacion: codigo
            };


        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al regenerar el código";


            return reply.status(500).send({
                error: mensaje
            });

        }

    });

    /* ==============================
    SUBIR AVATAR
    ============================== */

    app.post("/api/auth/avatar", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {

            if (!request.usuario) {
                return reply.code(401).send({
                    error: "No autenticado"
                });
            }

            /*
            * OBTENER AVATAR ANTERIOR
            */

            const avatarAnterior =
                await db.query(
                    `
                    SELECT
                        u.avatar_archivo_id,
                        a.ruta
                    FROM usuarios u
                    LEFT JOIN archivos a
                        ON a.id = u.avatar_archivo_id
                    WHERE u.id = $1
                    AND u.activo = TRUE
                    `,
                    [request.usuario.id]
                );

            const avatarAnteriorId =
                avatarAnterior.rows[0]?.avatar_archivo_id;

            const avatarAnteriorRuta =
                avatarAnterior.rows[0]?.ruta;


            /*
            * RECIBIR IMAGEN
            */

            const archivo =
                await request.file();

            if (!archivo) {
                return reply.status(400).send({
                    error: "No se ha enviado ninguna imagen"
                });
            }


            if (!archivo.mimetype.startsWith("image/")) {
                return reply.status(400).send({
                    error: "El archivo debe ser una imagen"
                });
            }


            const buffer =
                await archivo.toBuffer();


            if (buffer.length > 12 * 1024 * 1024) {
                return reply.status(400).send({
                    error: "La imagen no puede superar los 12 MB"
                });
            }


            /*
            * GUARDAR ARCHIVO FÍSICO
            */

            const extension =
                path.extname(
                    archivo.filename
                ).toLowerCase();


            const nombreArchivo =
                `${crypto.randomUUID()}${extension}`;


            const carpetaAvatares =
                path.join(
                    process.cwd(),
                    "uploads",
                    "avatars"
                );


            await fs.mkdir(
                carpetaAvatares,
                {
                    recursive: true
                }
            );


            const rutaArchivo =
                path.join(
                    carpetaAvatares,
                    nombreArchivo
                );


            await fs.writeFile(
                rutaArchivo,
                buffer
            );


            /*
            * RUTA PARA BASE DE DATOS
            */

            const rutaRelativa =
                path.join(
                    "uploads",
                    "avatars",
                    nombreArchivo
                );


            /*
            * CREAR REGISTRO DEL NUEVO ARCHIVO
            */

            const archivoResultado =
                await db.query(
                    `
                    INSERT INTO archivos (
                        propietario_id,
                        tipo,
                        mime_type,
                        nombre_original,
                        tamano,
                        ruta
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING id
                    `,
                    [
                        request.usuario.id,
                        "avatar",
                        archivo.mimetype,
                        archivo.filename,
                        buffer.length,
                        rutaRelativa
                    ]
                );


            const archivoId =
                archivoResultado.rows[0].id;


            /*
            * ASIGNAR NUEVO AVATAR AL USUARIO
            */

            await db.query(
                `
                UPDATE usuarios
                SET avatar_archivo_id = $1
                WHERE id = $2
                AND activo = TRUE
                `,
                [
                    archivoId,
                    request.usuario.id
                ]
            );


            /*
            * BORRAR AVATAR ANTERIOR DE LA BASE DE DATOS
            */

            if (avatarAnteriorId) {

                await db.query(
                    `
                    DELETE FROM archivos
                    WHERE id = $1
                    `,
                    [avatarAnteriorId]
                );

            }


            /*
            * BORRAR AVATAR ANTERIOR DEL DISCO
            */

            if (avatarAnteriorRuta) {

                const rutaAnterior =
                    path.join(
                        process.cwd(),
                        avatarAnteriorRuta
                    );


                try {

                    await fs.unlink(
                        rutaAnterior
                    );

                } catch (error) {

                    console.warn(
                        "No se pudo borrar el avatar anterior:",
                        error
                    );

                }

            }


            return {
                mensaje: "Avatar guardado correctamente",
                archivo_id: archivoId
            };


        } catch (error) {

            const mensaje =
                error instanceof Error
                    ? error.message
                    : "Error al subir el avatar";


            return reply.status(500).send({
                error: mensaje
            });

        }

    });

    /* ==============================
       FONDO DEL PERFIL
       Es la imagen de la cabecera del perfil. Se sube como una foto normal y
       se puede quitar cuando quieras.
       ============================== */

    app.post("/api/auth/fondo", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {

            if (!request.usuario) {
                return reply.status(401).send({
                    error: "No autenticado"
                });
            }

            const usuarioId = request.usuario.id;

            const archivo = await request.file();

            if (!archivo) {
                return reply.status(400).send({
                    error: "No se ha enviado ninguna imagen"
                });
            }

            const [validado] = await validarArchivos(
                [{
                    filename: archivo.filename,
                    mimetype: archivo.mimetype,
                    buffer: await archivo.toBuffer()
                }],
                "imagen"
            );

            // El fondo anterior se guarda antes de tocar nada: si el nuevo entra
            // bien, el viejo se borra de la base y del disco.
            const anterior = await db.query(
                `SELECT u.fondo_archivo_id, a.ruta
                FROM usuarios u
                LEFT JOIN archivos a ON a.id = u.fondo_archivo_id
                WHERE u.id = $1
                AND u.activo = TRUE`,
                [usuarioId]
            );

            const fondoAnteriorId = anterior.rows[0]?.fondo_archivo_id as string | undefined;
            const fondoAnteriorRuta = anterior.rows[0]?.ruta as string | undefined;

            const guardado = await guardarArchivoSubido({
                propietarioId: usuarioId,
                tipo: "perfil_fondo",
                mimeType: validado.mimetype,
                nombreOriginal: validado.filename,
                buffer: validado.buffer,
                carpeta: "fondos"
            });

            await db.query(
                `UPDATE usuarios SET fondo_archivo_id = $1 WHERE id = $2 AND activo = TRUE`,
                [guardado.id, usuarioId]
            );

            if (fondoAnteriorId) {
                await db.query(`DELETE FROM archivos WHERE id = $1`, [fondoAnteriorId]);
                if (fondoAnteriorRuta) {
                    try {
                        await fs.unlink(path.join(process.cwd(), fondoAnteriorRuta));
                    } catch {
                        // Si el archivo ya no estaba, el fondo nuevo sigue
                        // puesto: no se cae por eso.
                    }
                }
            }

            return {
                mensaje: "Fondo del perfil guardado",
                fondo_url: guardado.ruta.replace(/\\/g, "/")
            };

        } catch (error) {

            const mensaje = error instanceof Error
                ? error.message
                : "No se pudo guardar el fondo del perfil";

            return reply.status(400).send({
                error: mensaje
            });

        }

    });


    app.delete("/api/auth/fondo", {
        preHandler: autenticar
    }, async (request, reply) => {

        try {

            if (!request.usuario) {
                return reply.status(401).send({
                    error: "No autenticado"
                });
            }

            const anterior = await db.query(
                `SELECT u.fondo_archivo_id, a.ruta
                FROM usuarios u
                LEFT JOIN archivos a ON a.id = u.fondo_archivo_id
                WHERE u.id = $1
                AND u.activo = TRUE`,
                [request.usuario.id]
            );

            const fondoId = anterior.rows[0]?.fondo_archivo_id as string | undefined;
            const fondoRuta = anterior.rows[0]?.ruta as string | undefined;

            await db.query(
                `UPDATE usuarios SET fondo_archivo_id = NULL WHERE id = $1`,
                [request.usuario.id]
            );

            if (fondoId) {
                await db.query(`DELETE FROM archivos WHERE id = $1`, [fondoId]);
                if (fondoRuta) {
                    try {
                        await fs.unlink(path.join(process.cwd(), fondoRuta));
                    } catch {
                        // El registro ya estaba borrado: da igual.
                    }
                }
            }

            return { mensaje: "Fondo del perfil quitado" };

        } catch (error) {

            const mensaje = error instanceof Error
                ? error.message
                : "No se pudo quitar el fondo del perfil";

            return reply.status(400).send({
                error: mensaje
            });

        }

    });

    /* ==============================
       CERRAR SESIÓN
       ============================== */

    app.post("/api/auth/logout", {
        preHandler: autenticar
    }, async (request, reply) => {

        const autorizacion =
            request.headers.authorization;


        if (!autorizacion) {

            return reply.status(401).send({
                error: "No autenticado"
            });

        }


        const token =
            autorizacion.split(" ")[1];


        const partesToken =
            token.split(".");


        const identificadorSesion =
            partesToken[0];


        await db.query(
            `
            UPDATE sesiones
            SET revocado_en = NOW()
            WHERE identificador = $1
            `,
            [identificadorSesion]
        );


        return {
            mensaje: "Sesión cerrada correctamente"
        };

    });

}