import webPush from "web-push";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { db } from "../db/database.js";

interface VapidKeys {
    publicKey: string;
    privateKey: string;
}

interface PushSubscriptionData {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

let keysPromise: Promise<VapidKeys> | null = null;
let configured = false;

async function obtenerClaves(): Promise<VapidKeys> {
    if (env.vapidPublicKey && env.vapidPrivateKey) {
        return { publicKey: env.vapidPublicKey, privateKey: env.vapidPrivateKey };
    }

    const directory = path.join(process.cwd(), "data");
    const file = path.join(directory, "push-vapid.json");
    try {
        return JSON.parse(await readFile(file, "utf8")) as VapidKeys;
    } catch {
        await mkdir(directory, { recursive: true });
        const generated = webPush.generateVAPIDKeys();
        const temporary = `${file}.${process.pid}.tmp`;
        try {
            await writeFile(temporary, JSON.stringify(generated), { mode: 0o600, flag: "wx" });
            try {
                await writeFile(file, await readFile(temporary), { mode: 0o600, flag: "wx" });
                return generated;
            } catch (error) {
                const existing = await readFile(file, "utf8").catch(() => "");
                if (!existing) throw error;
                return JSON.parse(existing) as VapidKeys;
            }
        } finally {
            await rm(temporary, { force: true });
        }
    }
}

async function prepararPush() {
    if (configured) return;
    keysPromise ??= obtenerClaves();
    const keys = await keysPromise;
    webPush.setVapidDetails(env.vapidSubject, keys.publicKey, keys.privateKey);
    configured = true;
}

export async function obtenerClavePublicaPush() {
    await prepararPush();
    return (await keysPromise!).publicKey;
}

export async function guardarSuscripcionPush(
    usuarioId: string,
    dispositivoId: string,
    subscription: PushSubscriptionData
) {
    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        throw new Error("La suscripción del dispositivo no es válida");
    }
    const serialized = JSON.stringify(subscription);
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `UPDATE dispositivos SET push_token = NULL
             WHERE push_token IS NOT NULL AND push_token::jsonb->>'endpoint' = $1`,
            [subscription.endpoint]
        );
        const resultado = await client.query(
            `UPDATE dispositivos
             SET push_token = $1, ultimo_uso = NOW()
             WHERE usuario_id = $2 AND identificador = $3
             RETURNING id`,
            [serialized, usuarioId, dispositivoId]
        );
        if (resultado.rowCount !== 1) throw new Error("No se encontró el dispositivo de esta sesión");
        await client.query("COMMIT");
        return { mensaje: "Notificaciones activadas en este dispositivo" };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function borrarSuscripcionPush(usuarioId: string, dispositivoId: string) {
    await db.query(
        `UPDATE dispositivos SET push_token = NULL
         WHERE usuario_id = $1 AND identificador = $2`,
        [usuarioId, dispositivoId]
    );
    return { mensaje: "Notificaciones desactivadas en este dispositivo" };
}

export async function enviarPush(
    usuarioId: string,
    notification: { id: string; titulo: string; contenido: string; tipo: string; cantidad?: number; autor_id?: string | null; datos?: Record<string, string> }
) {
    try {
        await prepararPush();
        const subscriptions = await db.query(
            `SELECT id, push_token FROM dispositivos
             WHERE usuario_id = $1 AND push_token IS NOT NULL`,
            [usuarioId]
        );
        const cantidad = Number(notification.cantidad) || 1;
        // El tag es por persona (no por aviso): así el móvil sustituye el aviso
        // anterior por el nuevo en vez de apilar muchos de la misma persona.
        const tag = `atuistas-${notification.autor_id ?? notification.id}`;
        const cuerpo = cantidad > 1 ? `${notification.contenido} · ${cantidad} avisos` : notification.contenido;
        const payload = JSON.stringify({
            title: notification.titulo,
            body: cuerpo,
            tag,
            // Con renotify false no vuelve a sonar: solo se actualiza.
            renotify: false,
            // datos lleva el remitente y el destinatario del aviso: con él el
            // service worker sabe a qué chat o perfil abrir al pulsar.
            data: {
                notificationId: notification.id,
                type: notification.tipo,
                cantidad: String(cantidad),
                ...(notification.datos ?? {})
            }
        });

        await Promise.all(subscriptions.rows.map(async (row) => {
            try {
                await webPush.sendNotification(JSON.parse(row.push_token) as PushSubscriptionData, payload);
            } catch (error) {
                const status = (error as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) {
                    await db.query(`UPDATE dispositivos SET push_token = NULL WHERE id = $1`, [row.id]);
                } else {
                    console.error("No se pudo entregar el aviso Push:", error);
                }
            }
        }));
    } catch (error) {
        console.error("No se pudo preparar el servicio Push:", error);
    }
}
