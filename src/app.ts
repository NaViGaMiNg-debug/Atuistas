import Fastify from "fastify";

const app = Fastify({
  logger: true
});

app.get("/", async () => {
  return {
    mensaje: "Atuistas está funcionando"
  };
});

const start = async () => {
  try {
    await app.listen({
      port: 3000,
      host: "127.0.0.1"
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();