import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { PoolClient } from "pg";
import ffprobe from "ffprobe-static";
import { db } from "../db/database.js";

const execFileAsync = promisify(execFile);
const maxPhotoBytes = 12 * 1024 * 1024;
const maxMediaBytes = 50 * 1024 * 1024;
const maxVideoSeconds = 4 * 60;
const maxReelSeconds = 90;
const maxAudioSeconds = 3 * 60 + 30;

export interface UploadFile {
    filename: string;
    mimetype: string;
    buffer: Buffer;
}

interface ValidatedFile extends UploadFile {
    type: "imagen" | "video" | "audio";
    extension: string;
}

const photoTypes = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
    ["image/avif", ".avif"]
]);

const videoTypes = new Map([
    ["video/mp4", ".mp4"],
    ["video/webm", ".webm"],
    ["video/quicktime", ".mov"]
]);

const audioTypes = new Map([
    ["audio/webm", ".webm"],
    ["audio/ogg", ".ogg"],
    ["audio/mpeg", ".mp3"],
    ["audio/mp4", ".m4a"],
    ["audio/wav", ".wav"],
    ["audio/x-wav", ".wav"]
]);

async function comprobarDuracion(buffer: Buffer, extension: string, maximoSegundos: number) {
    if (!ffprobe.path) throw new Error("No está disponible la validación multimedia en este servidor");
    const temporal = path.join(os.tmpdir(), `atuistas-${randomUUID()}${extension}`);
    try {
        await writeFile(temporal, buffer, { flag: "wx" });
        const { stdout } = await execFileAsync(ffprobe.path, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            temporal
        ], { timeout: 15000, windowsHide: true });
        const duration = Number(stdout.trim());
        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error("No se pudo leer la duración del archivo");
        }
        if (duration > maximoSegundos) {
            throw new Error(`La duración máxima permitida es de ${Math.floor(maximoSegundos / 60)}:${String(maximoSegundos % 60).padStart(2, "0")}`);
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("La duración máxima")) throw error;
        throw new Error("El archivo multimedia no se pudo validar o está dañado");
    } finally {
        await rm(temporal, { force: true });
    }
}

export async function validarArchivos(
    files: UploadFile[],
    mode: "imagen" | "imagenes" | "video" | "audio" | "reel"
): Promise<ValidatedFile[]> {
    const maximumCount = mode === "imagenes" ? 10 : 1;
    if (!files.length || files.length > maximumCount) {
        throw new Error(mode === "imagenes" ? "Selecciona entre 1 y 10 fotos" : "Selecciona un archivo");
    }

    const output: ValidatedFile[] = [];
    for (const file of files) {
        const mimeType = file.mimetype.split(";", 1)[0].trim().toLowerCase();
        if (mode === "imagen" || mode === "imagenes") {
            const extension = photoTypes.get(mimeType);
            if (!extension) throw new Error("Las fotos deben ser JPEG, PNG, WebP, GIF o AVIF");
            if (file.buffer.length > maxPhotoBytes) throw new Error("Cada foto puede pesar como máximo 12 MB");
            output.push({ ...file, type: "imagen", extension });
            continue;
        }

        if (mode === "video" || mode === "reel") {
            const extension = videoTypes.get(mimeType);
            if (!extension) throw new Error("El vídeo debe ser MP4, WebM o MOV");
            if (file.buffer.length > maxMediaBytes) throw new Error("El vídeo puede pesar como máximo 50 MB");
            // Un reel es un vídeo corto: 90 segundos como mucho.
            await comprobarDuracion(file.buffer, extension, mode === "reel" ? maxReelSeconds : maxVideoSeconds);
            output.push({ ...file, type: "video", extension });
            continue;
        }

        const extension = audioTypes.get(mimeType);
        if (!extension) throw new Error("El audio debe ser WebM, OGG, MP3, M4A o WAV");
        if (file.buffer.length > maxMediaBytes) throw new Error("El audio puede pesar como máximo 50 MB");
        await comprobarDuracion(file.buffer, extension, maxAudioSeconds);
        output.push({ ...file, type: "audio", extension });
    }

    return output;
}

async function guardarYEnlazarArchivos(
    client: PoolClient,
    usuarioId: string,
    files: ValidatedFile[],
    kind: "estado" | "publicacion",
    parentId: string
) {
    const folder = kind === "estado" ? "estados" : "publicaciones";
    const directory = path.join(process.cwd(), "uploads", folder);
    await mkdir(directory, { recursive: true });
    const savedPaths: string[] = [];

    try {
        for (const [orden, file] of files.entries()) {
            const filename = `${randomUUID()}${file.extension}`;
            const diskPath = path.join(directory, filename);
            await writeFile(diskPath, file.buffer, { flag: "wx" });
            savedPaths.push(diskPath);
            const relativePath = path.posix.join("uploads", folder, filename);
            const stored = await client.query(
                `INSERT INTO archivos (propietario_id, tipo, mime_type, nombre_original, tamano, ruta)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [usuarioId, `${kind}_${file.type}`, file.mimetype, file.filename.slice(0, 255), file.buffer.length, relativePath]
            );
            if (kind === "estado") {
                await client.query(
                    `INSERT INTO multimedia_estado (estado_id, archivo_id, tipo, orden) VALUES ($1, $2, $3, $4)`,
                    [parentId, stored.rows[0].id, file.type, orden]
                );
            } else {
                await client.query(
                    `INSERT INTO multimedia_publicacion (publicacion_id, archivo_id, tipo, orden) VALUES ($1, $2, $3, $4)`,
                    [parentId, stored.rows[0].id, file.type, orden]
                );
            }
        }
        return savedPaths;
    } catch (error) {
        for (const diskPath of savedPaths) await rm(diskPath, { force: true });
        throw error;
    }
}

export async function crearEstadoMultimedia(
    usuarioId: string,
    visibilidad: "amigos" | "publica",
    mode: "imagen" | "imagenes" | "video" | "audio",
    rawFiles: UploadFile[],
    texto = ""
) {
    if (visibilidad !== "amigos" && visibilidad !== "publica") throw new Error("La visibilidad no es válida");
    const mensaje = texto.trim();
    if (mensaje.length > 500) throw new Error("El estado no puede superar los 500 caracteres");
    const files = await validarArchivos(rawFiles, mode);
    const client = await db.connect();
    let savedPaths: string[] = [];
    try {
        await client.query("BEGIN");
        const status = await client.query(
            `INSERT INTO estados (autor_id, texto, visibilidad, expira_en)
             VALUES ($1, NULLIF($2, ''), $3, NOW() + INTERVAL '24 hours') RETURNING id`,
            [usuarioId, mensaje, visibilidad]
        );
        savedPaths = await guardarYEnlazarArchivos(client, usuarioId, files, "estado", status.rows[0].id);
        await client.query("COMMIT");
        return { id: status.rows[0].id };
    } catch (error) {
        await client.query("ROLLBACK");
        for (const diskPath of savedPaths) await rm(diskPath, { force: true });
        throw error;
    } finally {
        client.release();
    }
}

export async function crearPublicacionMultimedia(
    usuarioId: string,
    visibilidad: "amigos" | "publica",
    mode: "imagenes" | "video",
    rawFiles: UploadFile[],
    texto = ""
) {
    if (visibilidad !== "amigos" && visibilidad !== "publica") throw new Error("La visibilidad no es válida");
    const mensaje = texto.trim();
    if (mensaje.length > 5000) throw new Error("La publicación no puede superar los 5000 caracteres");
    const files = await validarArchivos(rawFiles, mode);
    if (mode === "imagenes" && files.some((file) => file.type !== "imagen")) throw new Error("Esta publicación admite solo fotos");
    if (mode === "video" && files.length !== 1) throw new Error("Una publicación admite un solo vídeo");

    const client = await db.connect();
    let savedPaths: string[] = [];
    try {
        await client.query("BEGIN");
        const post = await client.query(
            `INSERT INTO publicaciones (autor_id, texto, visibilidad) VALUES ($1, NULLIF($2, ''), $3) RETURNING id`,
            [usuarioId, mensaje, visibilidad]
        );
        savedPaths = await guardarYEnlazarArchivos(client, usuarioId, files, "publicacion", post.rows[0].id);
        await client.query("COMMIT");
        return { id: post.rows[0].id };
    } catch (error) {
        await client.query("ROLLBACK");
        for (const diskPath of savedPaths) await rm(diskPath, { force: true });
        throw error;
    } finally {
        client.release();
    }
}
