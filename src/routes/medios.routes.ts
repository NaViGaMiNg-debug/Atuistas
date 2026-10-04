import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { env } from "../config/env.js";

// Proxy de búsqueda de GIF y stickers. El navegador nunca ve la clave: pregunta
// aquí y el servidor llama a Giphy por ella. Sin clave puesta en el .env la ruta
// responde 503 con faltaClave y el selector avisa en vez de romperse.
//
// Se usan los endpoints nativos (/v1/gifs/search y /v1/stickers/search) y no la
// capa compatible con Tenor (/v2): esa capa responde 401 a las claves beta,
// que es justo lo que da una cuenta gratuita.
const ORIGEN_GIPHY = "https://api.giphy.com";

export async function mediosRoutes(app: FastifyInstance) {
    app.get<{ Querystring: { buscar?: string; tipo?: string } }>(
        "/api/medios/buscar",
        { preHandler: autenticar },
        async (request, reply) => {
            if (!env.giphyApiKey) {
                return reply.code(503).send({
                    faltaClave: true,
                    error: "Falta ATUISTAS_GIPHY_API_KEY en el servidor"
                });
            }

            const stickers = request.query.tipo === "stickers";
            const busqueda = (request.query.buscar ?? "").trim().slice(0, 60);

            if (!busqueda) {
                return { medio: [] };
            }

            const parametros = new URLSearchParams({
                api_key: env.giphyApiKey,
                q: busqueda,
                limit: "24",
                // PG: hay GIF de internet con escenas duras puntual, y Atuistas
                // no comprueba la edad de nadie.
                rating: "pg",
                lang: "es"
            });

            try {
                const respuesta = await fetch(
                    `${ORIGEN_GIPHY}/v1/${stickers ? "stickers" : "gifs"}/search?${parametros.toString()}`
                );

                if (!respuesta.ok) {
                    request.log.warn(
                        { estado: respuesta.status },
                        "Giphy no ha contestado correctamente"
                    );
                    return reply.code(502).send({
                        error: "No se pudo buscar en el proveedor de GIF"
                    });
                }

                const json: any = await respuesta.json();

                // Giphy devuelve a veces una respuesta vacía con estado 200 cuando
                // algo falla por su lado: se trata como error, no como cero
                // resultados.
                if (!Array.isArray(json?.data)) {
                    return reply.code(502).send({
                        error: "El proveedor de GIF no devolvió resultados"
                    });
                }

                const medio = json.data
                    .map((item: any) => {
                        const imagenes = item.images ?? {};

                        // Los stickers llegan en WebP con transparencia; los GIF
                        // en su versión reducida, que pesa bastante menos y sigue
                        // siendo un gif animado.
                        const url = stickers
                            ? (imagenes.original?.webp
                                ?? imagenes.downsized?.webp
                                ?? imagenes.fixed_width?.webp
                                ?? imagenes.downsized?.url)
                            : (imagenes.downsized?.url ?? imagenes.original?.url);

                        const mini = stickers
                            ? (imagenes.fixed_width?.webp ?? url)
                            : (imagenes.fixed_width_small?.url
                                ?? imagenes.downsized_small?.url
                                ?? url);

                        return {
                            id: item.id,
                            titulo: String(item.title ?? "").slice(0, 80),
                            url: url ?? "",
                            mini: mini ?? ""
                        };
                    })
                    .filter((item: { url: string }) => item.url);

                return { medio };
            } catch (error) {
                request.log.error(error, "No se pudo buscar en Giphy");
                return reply.code(502).send({
                    error: "No se pudo buscar en el proveedor de GIF"
                });
            }
        }
    );
}
