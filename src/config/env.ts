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
    vapidSubject: process.env.ATUISTAS_VAPID_SUBJECT ?? "mailto:admin@atuistas.com",

    // Proveedor de GIF y stickers. Tenor apagó su API el 30 de junio de 2026
    // y ya no admite clientes nuevos, así que el servicio es Giphy, que además
    // ofrece una capa compatible con Tenor (misma forma de respuesta).
    // La clave va solo en el servidor: el navegador nunca la ve.
    giphyApiKey: process.env.ATUISTAS_GIPHY_API_KEY ?? "",

    database: {
        host: process.env.DB_HOST ?? "127.0.0.1",
        port: dbPort,
        name: process.env.DB_NAME ?? "atuistas",
        user: process.env.DB_USER ?? "postgres",
        password: process.env.DB_PASSWORD ?? ""
    }
};