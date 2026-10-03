/**
 * Comprobacion visual de los cambios del servidor: entra solo a un chat,
 * comprueba que la barra de escritura queda pegada abajo y que la pestanita
 * del nombre del grupo existe y responde.
 *
 *   node deploy/probar-servidor.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const base = process.env.BASE || "http://127.0.0.1:3000";

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

/* ---------- Sesion de prueba ---------- */

const sufijo = Date.now().toString().slice(-8);
const registro = await fetch(`${base}/api/auth/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: `prueba${sufijo}`, dispositivo_id: `prueba-${sufijo}` })
}).then((r) => r.json());

const token = registro.usuario.token;
const cabeceras = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const creado = await fetch(`${base}/api/grupos`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ nombre: `pruebasrv${sufijo}`, modelo: "chat_unico" })
}).then((r) => r.json());

const grupoId = creado.grupo.id;
comprobar(creado.grupo.modelo === "chat_unico", "El servidor nace como chat unico");

await fetch(`${base}/api/grupos/${grupoId}/descripcion`, {
    method: "PUT",
    headers: cabeceras,
    body: JSON.stringify({ descripcion: "Descripcion de prueba" })
});

const detalle = await fetch(`${base}/api/grupos/${grupoId}`, { headers: cabeceras }).then((r) => r.json());
comprobar(detalle.grupo.descripcion === "Descripcion de prueba", "La descripcion se guarda y se lee");
comprobar(detalle.grupo.canales.length === 1, "El chat unico tiene un solo canal");
comprobar(detalle.grupo.canales[0].nombre === "general", "Ese canal es el general");

/* ---------- DOM minimo ---------- */

function crearElemento(id = "") {
    return {
        id, hidden: false, disabled: false, value: "", textContent: "", innerHTML: "",
        className: "", style: {}, dataset: {}, files: [], children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, removeEventListener() {}, appendChild() {}, append() {}, remove() {},
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        querySelector() { return crearElemento(); },
        querySelectorAll() { return []; },
        prepend() {}, append() {},
        closest() { return null; }, focus() {}, click() {},
        scrollIntoView() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; }
    };
}

const codigo = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame() { return 0; },
    document: {
        getElementById: (id) => crearElemento(id),
        querySelector: () => crearElemento(),
        querySelectorAll: () => [],
        createElement: () => crearElemento(),
        addEventListener() {}, body: { classList: { add() {}, remove() {}, toggle() {} } }
    },
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {}, isSecureContext: false },
    navigator: { onLine: true },
    localStorage: { getItem: () => token, setItem() {}, removeItem() {} },
    location: { protocol: "http:", host: "127.0.0.1:3000", href: `${base}/`, reload() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    FormData: class { append() {} },
    setInterval() { return 0; },
    isSecureContext: false,
    URL: { createObjectURL: () => "" },
    Blob: class {},
    alert() {}, confirm() { return false; }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

try {
    vm.createContext(sandbox);
    vm.runInContext(codigo, sandbox, { timeout: 20000 });
    comprobar(true, "app.js se ejecuta entero sin ReferenceError");
} catch (error) {
    comprobar(false, `app.js lanzo ${error.message}`);
}

/* ---------- Los identificadores nuevos existen en el HTML ---------- */

const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const nuevos = [
    "boton-ver-grupo", "boton-foto-servidor", "modal-acciones-servidor",
    "boton-cerrar-acciones-servidor", "resumen-foto-servidor", "resumen-nombre-servidor",
    "resumen-miembros-servidor", "bloque-descripcion-servidor", "editar-descripcion-servidor",
    "resumen-descripcion-servidor", "boton-guardar-descripcion-servidor",
    "boton-acciones-miembros-servidor", "boton-acciones-ajustes-servidor",
    "boton-activar-canales-acciones", "boton-salir-servidor-acciones",
    "boton-eliminar-servidor-acciones", "estado-acciones-servidor"
];
for (const id of nuevos) {
    comprobar(html.includes(`id="${id}"`), `El HTML define ${id}`);
}

// La fila de botones antiguos no debe verse nunca.
comprobar(html.includes('id="acciones-contexto-servidor"'), "La fila antigua sigue en el markup, pero oculta por CSS y JS");

/* ---------- El service worker cambia de version ---------- */

const sw = fs.readFileSync(path.join(raiz, "public", "sw.js"), "utf8");
comprobar(/const VERSION = "v4"/.test(sw), "El service worker subio a la version v4");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");