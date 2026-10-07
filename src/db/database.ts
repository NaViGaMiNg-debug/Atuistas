import { Pool } from "pg";
import { env } from "../config/env.js";

// La conexion a la base: sale de lo que haya en el .env, aqui no hay nada escrito a mano.
export const db = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password
});