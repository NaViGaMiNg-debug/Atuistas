import { FastifyInstance } from "fastify";
import { autenticar } from "../middleware/auth.middleware.js";
import { env } from "../config/env.js";

// Proxy de búsqueda de Tenor. El navegador nunca ve la clave: pregunta aquí y el
// servidor llama a Tenor por ella. Sin clave puesta en el .env la ruta responde
// 503 con faltaClave y el selector avisa en vez de romperse.
export async function tenorRoutes(app: FastifyInstance) {
    app.get<{ Querystring: { buscar?: string; tipo?: string } }>(
        "/api/tenor/buscar",
        { preHandler: autenticar },
        async (request, reply) => {
            if (!env.tenorApiKey) {
                return reply.code(503).send({
                    faltaClave: true,
                    error: "Falta ATUISTAS_TENOR_API_KEY en el servidor"
                });
            }

            const tipo = request.query.tipo === "stickers" ? "stickers" : "gifs";
            const busqueda = (request.query.buscar ?? "").trim().slice(0, 60);

            if (!busqueda) {
                return { medio: [] };
            }

            const parametros = new URLSearchParams({
                key: env.tenorApiKey,
                q: busqueda,
                limit: "24",
                media_filter: tipo === "stickers" ? "tinygif,webp" : "gif",
                contentfilter: "medium"
            });

            try {
                const respuesta = await fetch(
                    `https://tenor.googleapis.com/v2/search?${parametros.toString()}`
                );

                if (!respuesta.ok) {
                    return reply.code(502).send({
                        error: "Tenor no ha contestado correctamente"
                    });
                }

                const json: any = await respuesta.json();

                const medio = (json.results ?? [])
                    .map((resultado: any) => {
                        const url =
                            resultado.media_formats?.tinygif?.url
                            ?? resultado.media_formats?.gif?.url;

                        return {
                            id: resultado.id,
                            titulo: String(resultado.title ?? "").slice(0, 80),
                            url: url ?? "",
                            mini:
                                resultado.media_formats?.tinygif?.url
                                ?? url
                                ?? ""
                        };
                    })
                    .filter((item: { url: string }) => item.url);

                return { medio };
            } catch (error) {
                app.log.error(error, "No se pudo buscar en Tenor");
                return reply.code(502).send({
                    error: "No se pudo buscar en Tenor"
                });
            }
        }
    );
}