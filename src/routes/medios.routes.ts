import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { env } from "../config/env.js";

// Proxy de búsqueda de GIF y stickers. El navegador nunca ve la clave: pregunta
// aquí y el servidor llama a Giphy por ella. Sin clave puesta en el .env la ruta
// responde 503 con faltaClave y el selector avisa en vez de romperse.
//
// Se usa la capa de Giphy compatible con Tenor (api.giphy.com/v2/search): misma
// forma de respuesta (`results[].media_formats`), lo que deja el cliente tal cual
// y deja abierta la puerta a una clave antigua de Tenor si algum día hiciera falta.
const ORIGEN_GIPHY = "https://api.giphy.com";
const CLAVE_CLIENTE = "atuistas-web";

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
                client_key: CLAVE_CLIENTE,
                q: busqueda,
                limit: "24",
                contentfilter: "medium",
                // Los stickers son WebP con transparencia; para los GIF, un gif
                // pequeño para previsualizar y el completo para enviar.
                media_filter: stickers
                    ? "tinywebp_transparent,webp_transparent"
                    : "tinygif,gif"
            });

            if (stickers) {
                // searchfilter=sticker es la única forma admitida por la capa
                // compatible; las variantes con "static" ya no existen.
                parametros.set("searchfilter", "sticker");
            }

            try {
                const respuesta = await fetch(
                    `${ORIGEN_GIPHY}/v2/search?${parametros.toString()}`
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
                if (!json?.results) {
                    return reply.code(502).send({
                        error: "El proveedor de GIF no devolvió resultados"
                    });
                }

                const medio = json.results
                    .map((resultado: any) => {
                        const formatos = resultado.media_formats ?? {};
                        const url =
                            formatos.gif_transparent?.url
                            ?? formatos.webp_transparent?.url
                            ?? formatos.gif?.url
                            ?? "";

                        const mini =
                            formatos.tinygif?.url
                            ?? formatos.tinywebp_transparent?.url
                            ?? url;

                        return {
                            id: resultado.id,
                            titulo: String(resultado.title ?? "").slice(0, 80),
                            url,
                            mini
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