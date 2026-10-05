/**
 * Prueba de los comentarios en los estados, igual que los de los reels:
 * - La tabla existe en el esquema y en las migraciones, con borrado en
 *   cascada: si el estado se borra, sus comentarios se borran con el.
 * - El backend deja leer y escribir comentarios con las mismas reglas de
 *   visibilidad que el propio estado, y el feed trae el contador.
 * - El cliente tiene su boton en el visor de estados y su ventana.
 *
 *   node deploy/probar-estados-comentarios.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const base = process.env.BASE || "http://127.0.0.1:3000";

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

async function api(ruta, { metodo = "GET", token, cuerpo } = {}) {
    const respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cuerpo ? { "Content-Type": "application/json" } : {})
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, status: respuesta.status, datos };
}

const esquema = fs.readFileSync(path.join(raiz, "src", "db", "schema.sql"), "utf8");
const migraciones = fs.readFileSync(path.join(raiz, "src", "db", "migrations.ts"), "utf8");
const servicio = fs.readFileSync(path.join(raiz, "src", "services", "contenido.service.ts"), "utf8");
const rutas = fs.readFileSync(path.join(raiz, "src", "routes", "contenido.routes.ts"), "utf8");
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");
const app = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");

/* ---------- La tabla y las rutas existen ---------- */

const tabla = esquema.match(/CREATE TABLE estados_comentarios \(([\s\S]*?)\);/)?.[1] ?? "";
comprobar(tabla.length > 0, "La tabla estados_comentarios esta en el esquema");
comprobar(
    /estado_id UUID NOT NULL\s+REFERENCES estados\(id\)\s+ON DELETE CASCADE/.test(tabla),
    "Los comentarios se borran en cascada con su estado"
);
comprobar(
    migraciones.includes("CREATE TABLE IF NOT EXISTS estados_comentarios"),
    "La tabla tambien se crea al arrancar en bases de datos existentes"
);
comprobar(
    migraciones.includes("REFERENCES estados(id) ON DELETE CASCADE"),
    "La migracion tambien lleva el borrado en cascada"
);
comprobar(
    esquema.includes("CREATE INDEX idx_estados_comentarios_estado"),
    "Los comentarios del estado tienen indice"
);
comprobar(
    (rutas.match(/\/api\/estados\/:estadoId\/comentarios/g) || []).length === 2,
    "Hay ruta para leer y ruta para comentar"
);
comprobar(
    servicio.includes("export async function obtenerComentariosEstado") &&
        servicio.includes("export async function comentarEstado"),
    "El servicio de comentarios del estado existe"
);
comprobar(
    servicio.includes("AS comentarios"),
    "El feed de estados trae el contador de comentarios"
);
comprobar(
    servicio.includes('"comentario_estado"'),
    "Comentar un estado avisa a su autor como en las publicaciones"
);

/* ---------- El cliente los pinta ---------- */

comprobar(html.includes('id="modal-comentarios-estado"'), "El visor de estados tiene su ventana");
comprobar(html.includes('id="boton-comentarios-estado"'), "El visor de estados tiene su boton");
comprobar(
    html.includes('id="texto-comentario-estado"') && html.includes('id="boton-comentar-estado"'),
    "La ventana tiene caja y boton para escribir"
);
comprobar(css.includes("#modal-comentarios-estado"), "Los comentarios del estado tienen z-index propio");
comprobar(
    /#modal-comentarios-estado\s*\{[^}]*z-index:\s*2100/.test(css),
    "Los comentarios se abren por encima del visor de estados (2100 > 2000)"
);
comprobar(app.includes("function abrirComentariosEstado("), "El cliente abre los comentarios del estado");
comprobar(
    app.includes("pintarCantidadComentariosEstado"),
    "El boton enseña cuant comentarios tiene el estado"
);
comprobar(
    app.includes("/comentarios`"),
    "Se piden los comentarios al servidor"
);

/* ---------- Contra el servidor ---------- */

const sufijo = Date.now().toString().slice(-8);
const autor = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `esta${sufijo}`, dispositivo_id: `estaA-${sufijo}` }
});
const lector = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `estb${sufijo}`, dispositivo_id: `estaB-${sufijo}` }
});
const tokenAutor = autor.datos.usuario?.token;
const tokenLector = lector.datos.usuario?.token;
comprobar(Boolean(tokenAutor && tokenLector), `Dos cuentas de prueba (${sufijo})`);

const estado = await api("/api/estados", {
    metodo: "POST",
    token: tokenAutor,
    cuerpo: { texto: "Estado para comentar", visibilidad: "publica" }
});
comprobar(estado.ok, `Se publica un estado publico (${estado.datos.error ?? "ok"})`);
const estadoId = estado.datos.estado?.id;

const vacio = await api(`/api/estados/${estadoId}/comentarios`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { texto: "   " }
});
comprobar(!vacio.ok, `Un comentario vacio no se guarda (${vacio.datos.error ?? ""})`);

const primero = await api(`/api/estados/${estadoId}/comentarios`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { texto: "Muy buen estado" }
});
comprobar(primero.ok, `Un desconocido comenta en un estado publico (${primero.datos.error ?? "ok"})`);

const segundo = await api(`/api/estados/${estadoId}/comentarios`, {
    metodo: "POST",
    token: tokenAutor,
    cuerpo: { texto: "Gracias!" }
});
comprobar(segundo.ok, "El autor tambien puede comentar su estado");

const lista = await api(`/api/estados/${estadoId}/comentarios`, { token: tokenAutor });
comprobar(
    lista.datos.comentarios?.length === 2,
    `El autor lee los dos comentarios (${lista.datos.comentarios?.length})`
);
comprobar(
    lista.datos.comentarios?.[0]?.autor_nombre != null,
    "Cada comentario trae el nombre de quien lo escribio"
);

const feed = await api("/api/estados?seccion=publica", { token: tokenLector });
const enFeed = (feed.datos.estados || []).find((item) => item.id === estadoId);
comprobar(enFeed?.comentarios === 2, `El feed trae el contador de comentarios (${enFeed?.comentarios})`);

// Un estado de amigos no se puede comentar desde fuera de la amistad.
const privado = await api("/api/estados", {
    metodo: "POST",
    token: tokenAutor,
    cuerpo: { texto: "Solo para amigos", visibilidad: "amigos" }
});
const intruso = await api(`/api/estados/${privado.datos.estado?.id}/comentarios`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { texto: "Me cuelo" }
});
comprobar(!intruso.ok, `Un desconocido no comenta en un estado de amigos (${intruso.datos.error ?? ""})`);

/* ---------- Al borrar el estado, sus comentarios se borran con el ---------- */

const borrado = await api(`/api/estados/${estadoId}`, { metodo: "DELETE", token: tokenAutor });
comprobar(borrado.ok, `El autor borra su estado (${borrado.datos.error ?? "ok"})`);

const trasBorrar = await api(`/api/estados/${estadoId}/comentarios`, { token: tokenLector });
comprobar(
    !trasBorrar.ok,
    `Sin estado no hay comentarios que leer (${trasBorrar.datos.error ?? ""})`
);

const feedTras = await api("/api/estados?seccion=publica", { token: tokenLector });
comprobar(
    !(feedTras.datos.estados || []).some((item) => item.id === estadoId),
    "El estado borrado ya no aparece en el feed"
);

// El estado de amigos tambien se limpia al final para no dejar basura.
await api(`/api/estados/${privado.datos.estado?.id}`, { metodo: "DELETE", token: tokenAutor });

// El visor de estados cierra tambien su ventana de comentarios.
comprobar(
    /cerrarVisorHistorias\(\)[\s\S]{0,600}modal-comentarios-estado/.test(app),
    "Al cerrar el estado se cierran tambien sus comentarios"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");

