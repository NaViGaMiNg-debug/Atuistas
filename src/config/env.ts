import "dotenv/config";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const dbPort = Number(process.env.DB_PORT ?? 5432);

export const env = {
    port,
    host,

    codigoEncryptionKey:
        process.env.ATUISTAS_CODE_ENCRYPTION_KEY ?? "",

    vapidPublicKey: process.env.ATUISTAS_VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.ATUISTAS_VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.ATUISTAS_VAPID_SUBJECT ?? "mailto:admin@atuistas.local",

    // Clave de la API de Tenor para GIF y stickers. Va solo en el servidor:
    // el navegador nunca la ve, solo llama a /api/tenor/buscar.
    tenorApiKey: process.env.ATUISTAS_TENOR_API_KEY ?? "",

    database: {
        host: process.env.DB_HOST ?? "127.0.0.1",
        port: dbPort,
        name: process.env.DB_NAME ?? "atuistas",
        user: process.env.DB_USER ?? "postgres",
        password: process.env.DB_PASSWORD ?? ""
    }
};