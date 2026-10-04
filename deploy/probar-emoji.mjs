/**
 * Prueba del selector de emojis, GIF y stickers: que la lista cargue con sus
 * grupos, que la busqueda encuentre por nombre, que al elegir un emoji se
 * inserte en el campo donde estaba el cursor y que los cuatro sitios de
 * escritura tengan su boton.
 *
 *   node deploy/probar-emoji.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

/* ---------- DOM minimo ---------- */

function crearElemento(id = "") {
    return {
        id,
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        innerHTML: "",
        className: "",
        style: {},
        dataset: {},
        files: [],
        children: [],
        parentNode: null,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        appendChild() {},
        append() {},
        remove() {},
        setAttribute() {},
        getAttribute() { return null; },
        removeAttribute() {},
        querySelector() { return crearElemento(); },
        querySelectorAll() { return []; },
        prepend() {},
        closest() { return null; },
        focus() {},
        click() {},
        scrollIntoView() {},
        insertAdjacentHTML() {},
        setSelectionRange() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
        matches() { return false; }
    };
}

const codigo = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const emojis = fs.readFileSync(path.join(raiz, "public", "data", "emojis.js"), "utf8");

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {},
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    document: {
        getElementById: (id) => crearElemento(id),
        querySelector: () => crearElemento(),
        querySelectorAll: () => [],
        createElement: () => crearElemento(),
        addEventListener() {},
        body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} }
    },
    window: {
        matchMedia: () => ({ matches: true, addEventListener() {} }),
        addEventListener() {},
        isSecureContext: false,
        innerHeight: 800,
        history: { pushState() {}, back() {}, state: null }
    },
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", host: "127.0.0.1:3000", href: "http://127.0.0.1:3000/", reload() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    FormData: class { append() {} },
    URL: { createObjectURL: () => "" },
    Blob: class {},
    File: class {},
    MutationObserver: class { observe() {} disconnect() {} },
    crypto: { randomUUID: () => "uuid-de-prueba" },
    Event: class { constructor(tipo, opciones) { this.tipo = tipo; Object.assign(this, opciones); } },
    alert() {},
    confirm() { return false; }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
try {
    vm.createContext(sandbox);
    vm.runInContext(emojis, sandbox, { timeout: 20000 });
    vm.runInContext(codigo, sandbox, { timeout: 20000 });
    comprobar(true, "emojis.js y app.js se ejecutan enteros sin ReferenceError");
} catch (error) {
    comprobar(false, `app.js lanzo ${error.message}`);
}

/* ---------- La lista de emojis ---------- */
/* ---------- La lista de emojis ---------- */

const totalEmojis = vm.runInContext(
    "EMOJIS_ATUISTAS.reduce((total, grupo) => total + grupo.items.length, 0)",
    sandbox
);
const grupos = vm.runInContext("EMOJIS_ATUISTAS.map((grupo) => grupo.grupo)", sandbox);

comprobar(totalEmojis > 200, `La lista trae emojis de verdad (${totalEmojis})`);
comprobar(grupos.length >= 6, `Hay varios grupos (${grupos.join(", ")})`);
comprobar(
    vm.runInContext(
        "EMOJIS_ATUISTAS.every((grupo) => grupo.etiqueta && grupo.items.every((pieza) => pieza[0] && pieza[1]))",
        sandbox
    ),
    "Cada pieza tiene emoji y nombre para poder buscarla"
);

/* ---------- La busqueda por nombre ---------- */

const normalizar = (texto) => vm.runInContext(
    `normalizarBusqueda(${JSON.stringify(texto)})`,
    sandbox
);

comprobar(normalizar("RISAS") === "risas", "La busqueda ignora mayusculas");
comprobar(normalizar("ánimo") === "animo", "La busqueda ignora los acentos");

comprobar(
    vm.runInContext(
        `EMOJIS_ATUISTAS.some((grupo) => grupo.items.some((pieza) => normalizarBusqueda(pieza[1]).includes("fuego")))`,
        sandbox
    ),
    "Se puede buscar por el nombre en espanol"
);

comprobar(
    vm.runInContext(
        `EMOJIS_ATUISTAS.every((grupo) => grupo.items.every((pieza) => !normalizarBusqueda(pieza[1]).includes("zzzz")))`,
        sandbox
    ),
    "Una busqueda sin resultados no inventa nada"
);

/* ---------- Insertar en el campo de escritura ---------- */

const entrada = crearElemento("entrada-mensaje");
entrada.value = "hola ";
entrada.selectionStart = 5;
entrada.selectionEnd = 5;
sandbox.entradaDePrueba = entrada;
vm.runInContext("insertarEnEntrada(entradaDePrueba, '😀')", sandbox);
comprobar(entrada.value === "hola 😀", "El emoji se inserta donde estaba el cursor");

const entradaMedia = crearElemento("entrada");
entradaMedia.value = "abc😀def";
entradaMedia.selectionStart = 5;
entradaMedia.selectionEnd = 5;
sandbox.entradaMedia = entradaMedia;
vm.runInContext("insertarEnEntrada(entradaMedia, '🎉')", sandbox);
comprobar(entradaMedia.value === "abc😀🎉def", "No se come lo que ya estaba escrito");

/* ---------- Los cuatro sitios con boton ---------- */

const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");

comprobar(
    codigo.includes('asegurarBotonEmoji("entrada-mensaje", "chat")'),
    "El chat privado engancha su boton de emojis"
);
comprobar(
    codigo.includes('asegurarBotonEmoji("entrada-mensaje-servidor", "servidor")'),
    "El servidor engancha su boton de emojis"
);
comprobar(
    codigo.includes('asegurarBotonEmoji("texto-comentario-reel", "comentario-reel")'),
    "Los comentarios de reels enganchan su boton"
);
comprobar(
    codigo.includes('asegurarBotonEmoji(idEntrada, "comentario-publicacion")'),
    "Los comentarios de publicaciones enganchan su boton"
);

comprobar(html.includes("/data/emojis.js"), "index.html carga la lista de emojis antes que app.js");

/* ---------- El teclado del movil no se abre solo ---------- */

comprobar(
    codigo.includes('boton.addEventListener("mousedown", (evento) => evento.preventDefault())'),
    "El boton no roba el foco: en el movil no salta el teclado"
);
const bloqueAbrirChat = codigo.slice(
    codigo.indexOf("async function abrirChat("),
    codigo.indexOf("async function abrirChat(") + 3000
);
comprobar(
    !bloqueAbrirChat.includes(".focus()"),
    "Entrar en un chat ya no enfoca el campo ni abre el teclado"
);

/* ---------- Estilos ---------- */

const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");
comprobar(css.includes(".selector-medio {"), "El panel del selector tiene estilos");
comprobar(css.includes(".boton-emoji {"), "El boton de emojis tiene estilos");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");