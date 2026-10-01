import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db/database.js";

export type TipoArchivoMultimedia = "imagen" | "audio" | "video";

// La extensión decide el Content-Type con el que se sirve el archivo, así que
// una grabación webm nunca puede guardarse como .m4a. El audio WebM usa .weba
// (y no .webm) porque si no el navegador lo serviría como vídeo.
const EXTENSIONES: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/webm": ".weba",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
};

const EXTENSION_POR_DEFECTO: Record<TipoArchivoMultimedia, string> = {
    imagen: ".jpg",
    audio: ".m4a",
    video: ".mp4"
};

export function detectarTipoArchivo(mimetype: string): TipoArchivoMultimedia | null {
    const limpio = (mimetype ?? "").split(";")[0].trim().toLowerCase();
    if (limpio.startsWith("image/")) return "imagen";
    if (limpio.startsWith("audio/")) return "audio";
    if (limpio.startsWith("video/")) return "video";
    return null;
}

export function limiteParaTipo(tipo: TipoArchivoMultimedia) {
    return tipo === "imagen" ? 12 * 1024 * 1024 : 25 * 1024 * 1024;
}

export function extensionDeMime(mimetype: string, tipo: TipoArchivoMultimedia) {
    const limpio = (mimetype ?? "").split(";")[0].trim().toLowerCase();
    return EXTENSIONES[limpio] ?? EXTENSION_POR_DEFECTO[tipo];
}

interface DatosArchivoSubido {
    propietarioId: string;
    tipo: string;
    mimeType: string;
    nombreOriginal?: string;
    buffer: Buffer;
    carpeta: string;
}

// Guarda el archivo en uploads/<carpeta> y registra la fila en archivos.
export async function guardarArchivoSubido(datos: DatosArchivoSubido) {
    const multimedia = detectarTipoArchivo(datos.mimeType) ?? "imagen";
    const nombreArchivo = `${crypto.randomUUID()}${extensionDeMime(datos.mimeType, multimedia)}`;
    const destino = path.join(process.cwd(), "uploads", datos.carpeta);

    await fs.mkdir(destino, { recursive: true });
    await fs.writeFile(path.join(destino, nombreArchivo), datos.buffer);

    const rutaRelativa = `uploads/${datos.carpeta}/${nombreArchivo}`;
    const registro = await db.query(
        `INSERT INTO archivos (propietario_id, tipo, mime_type, nombre_original, tamano, ruta)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
            datos.propietarioId,
            datos.tipo,
            datos.mimeType,
            (datos.nombreOriginal || nombreArchivo).slice(0, 255),
            datos.buffer.length,
            rutaRelativa
        ]
    );

    return { id: registro.rows[0].id as string, ruta: rutaRelativa };
}
