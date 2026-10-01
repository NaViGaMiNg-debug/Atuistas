import crypto from "node:crypto";
import { env } from "../config/env.js";

const CARACTERES = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generarBloque(): string {
    let bloque = "";

    for (let i = 0; i < 4; i++) {
        const indice = crypto.randomInt(0, CARACTERES.length);
        bloque += CARACTERES[indice];
    }

    return bloque;
}

export function generarCodigoVinculacion(): string {
    return `ATU-${generarBloque()}-${generarBloque()}`;
}

function obtenerClave(): Buffer {
    return Buffer.from(
        env.codigoEncryptionKey,
        "hex"
    );
}

export function cifrarCodigo(codigo: string): string {
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        obtenerClave(),
        iv
    );

    const cifrado = Buffer.concat([
        cipher.update(codigo, "utf8"),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return [
        iv.toString("base64"),
        authTag.toString("base64"),
        cifrado.toString("base64")
    ].join(".");
}

export function descifrarCodigo(codigoCifrado: string): string {
    const partes = codigoCifrado.split(".");

    if (partes.length !== 3) {
        throw new Error("Código cifrado inválido");
    }

    const iv = Buffer.from(partes[0], "base64");
    const authTag = Buffer.from(partes[1], "base64");
    const cifrado = Buffer.from(partes[2], "base64");

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        obtenerClave(),
        iv
    );

    decipher.setAuthTag(authTag);

    const descifrado = Buffer.concat([
        decipher.update(cifrado),
        decipher.final()
    ]);

    return descifrado.toString("utf8");
}

export function obtenerHashCodigo(codigo: string): string {
    return crypto
        .createHmac(
            "sha256",
            obtenerClave()
        )
        .update(codigo)
        .digest("hex");
}