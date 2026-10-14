/**
 * Prueba de la escalera del boton atras.
 *
 * Cubre el orden que debe seguir el boton atras del movil, paso a paso:
 *   1. Si hay una ventana (modal) abierta, se cierra la de encima.
 *   2. Luego el selector, los visores, el chat y el grupo.
 *   3. Sin capas, si la seccion tiene varios apartados se va al principal.
 *   4. Si no tiene varios o ya está en el principal, se va a Entrar.
 *   5. Estando en Entrar pero en Publico, se va a Mis Amigos.
 *   6. Estando en Entrar > Mis Amigos y sin nada, el atras sale de la app.
 *
 * Se apoya en las funciones reales de app.js (cerrarCapaSuperior, darPasoAtras,
 * retrocederAApartadoPrincipal), extraidas tal cual, y en un DOM de mentira.
 *
 *   node deploy/probar-navegacion.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(aqui, "..", "public", "app.js"), "utf8");

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

// Mismo bloque que prueba-historial: contiene todas las funciones del boton
// atras (sincronizarAtrasSeccion, mis funciones nuevas, cerrarCapaSuperior y
// el listener popstate). cambiarFeedEntrada vive mas abajo, fuera del bloque.
const inicio = codigo.indexOf("let capasApiladas = 0;");
const fin = codigo.indexOf("function observarCapas()");
if (inicio < 0 || fin < 0 || fin <= inicio) {
    console.log("FALLO: no se encuentra el bloque del boton atras en app.js");
    process.exit(1);
}
const bloque = codigo.slice(inicio, fin);

/* ---------- DOM de mentira ---------- */

// Un elemento por id, con hidden controlable, para poder inspeccionar el
// resultado de cerrar una capa.
function crearElemento(id = "") {
    const el = {
        id,
        hidden: true,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute(n, v) { el[n] = n === "hidden" ? true : v; },
        getAttribute(n) { return n in el ? el[n] : null; },
        removeAttribute(n) { delete el[n]; },
        querySelector() { return { click() { el._cerradoPorBoton = true; } }; },
        querySelectorAll() { return []; },
        matches() { return false; },
        click() { el._clickeado = true; }
    };
    return el;
}


/* ---------- Estado y registro de cierres ---------- */

const log = [];        // Qué stub se disparó, en orden.
let closedId = null;   // Id del modal que se cerró con el botón.

// Elementos por id con hidden controlable. Los que necesita el botón atrás.
const porId = new Map();
const el = (id) => {
    if (!porId.has(id)) porId.set(id, crearElemento(id));
    return porId.get(id);
};

// Modales: querySelectorAll(".modal") devuelve esta lista en orden del DOM.
let modales = [];
const modal = (id, visible) => {
    const m = crearElemento(id);
    m.hidden = !visible;
    m.querySelector = () => ({
        click() { closedId = id; }
    });
    return m;
};

const sandbox = {
    console,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    // Variables que viven FUERA del bloque extraído y lo leen las funciones.
    seccionActual: "entrar",
    vistaServidorActual: "lista",
    pestanaModeracion: "cuentas",
    contenidoPublico: { hidden: true },
    seccionSolicitudes: { hidden: true },
    // navigation no se define: gastarEntradaPropia usa typeof navigation.
    window: {
        history: {
            state: null,
            pushState(estado) { this.state = estado; },
            back() { log.push("history.back"); }
        },
        addEventListener() {}
    },
    document: {
        getElementById: (id) => el(id),
        querySelectorAll: (sel) => (sel === ".modal" ? modales : [])
    },
    // Stubs de las funciones de cierre que viven fuera del bloque: registran
    // la acción para poder comprobar el orden sin depender del DOM real.
    cerrarSelector() { log.push("selector"); el("selector-medio").hidden = true; },
    cerrarVisorReels() { log.push("reels"); el("visor-reels").hidden = true; },
    cerrarVisorHistorias() { log.push("historias"); el("visor-historias-pantalla").hidden = true; },
    cerrarChat() { log.push("chat"); el("panel-chat").hidden = true; },
    mostrarFaseServidor(fase) { log.push("servidor:" + fase); sandbox.vistaServidorActual = fase; },
    mostrarMisEstados() { log.push("estados"); },
    mostrarSeccion(s) { log.push("seccion:" + s); sandbox.seccionActual = s; },
    mostrarPestanaServidor(n) { log.push("pestana-servidor:" + n); },
    mostrarPestanaModeracion(n) { log.push("pestana-mod:" + n); sandbox.pestanaModeracion = n; },
    cambiarFeedEntrada(publico) { log.push("feed:" + (publico ? "publico" : "amigos")); sandbox.contenidoPublico.hidden = !publico; },
    botonEncontrarPersonas: { click() { log.push("boton-encontrar"); sandbox.seccionSolicitudes.hidden = true; } }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(bloque, sandbox, { timeout: 5000 });

/* ---------- Casos ---------- */

// Reinicia capas visibles y el registro entre comprobaciones.
function reiniciar({ modales: mods = [], ocultos = [], seccion, vista = "lista",
    pestanaMod = "cuentas", publico = false, solicitudes = false } = {}) {
    log.length = 0;
    closedId = null;
    modales = mods;
    for (const id of ["selector-medio", "visor-reels", "visor-historias-pantalla",
        "panel-chat", "panel-servidor", "visor-estados", "seccion-chats"]) {
        el(id).hidden = true;
    }
    for (const id of ocultos) el(id).hidden = false;
    sandbox.seccionActual = seccion;
    sandbox.vistaServidorActual = vista;
    sandbox.pestanaModeracion = pestanaMod;
    sandbox.contenidoPublico.hidden = !publico;
    sandbox.seccionSolicitudes.hidden = !solicitudes;
}

const capa = (fn) => vm.runInContext(fn, sandbox);

// 1) Una ventana abierta es prioridad: se cierra la de encima, no el chat.
reiniciar({ ocultos: ["panel-chat"], modales: [modal("modal-a", true)] });
capa("cerrarCapaSuperior()");
comprobar(closedId === "modal-a", "Con una ventana sobre el chat, atras cierra la ventana");
comprobar(log.includes("chat") === false, "La ventana tapa al chat: el chat no se cierra");
comprobar(el("panel-chat").hidden === false, "El chat sigue abierto tras cerrar la ventana");

// 2) Con dos ventanas, se cierra la ultima (la de mas arriba).
reiniciar({ modales: [modal("modal-a", true), modal("modal-b", true)] });
capa("cerrarCapaSuperior()");
comprobar(closedId === "modal-b", "Con dos ventanas, atras cierra la ultima abierta");

// 3) Una ventana oculta no cuenta: solo la visible se cierra.
reiniciar({ modales: [modal("modal-oculto", false), modal("modal-a", true)] });
capa("cerrarCapaSuperior()");
comprobar(closedId === "modal-a", "Una ventana oculta se ignora, se cierra la visible");

// 4) Sin ventanas, el selector va antes que el chat.
reiniciar({ ocultos: ["selector-medio", "panel-chat"] });
capa("cerrarCapaSuperior()");
comprobar(log[0] === "selector", "Sin ventanas, atras cierra el selector primero");
comprobar(el("panel-chat").hidden === false, "El selector tapa al chat: el chat no se cierra");

// 5) Con el grupo en fase chat, atras vuelve a la lista.
reiniciar({ ocultos: ["panel-servidor"], seccion: "servidores", vista: "chat" });
capa("cerrarCapaSuperior()");
comprobar(log[0] === "servidor:lista", "En un grupo, atras sale a la lista del servidor");

// 6) Sin capas, en servidores > buscar se vuelve al apartado principal (chats).
reiniciar({ seccion: "servidores", vista: "lista" });
const paso1 = capa("darPasoAtras()");
comprobar(paso1 === true, "En un apartado secundario, atras da un paso (no sale)");
comprobar(log.includes("pestana-servidor:chats"), "De buscar/mis-servidores se vuelve a Chats");

// 7) En servidores > chats, atras pasa a la seccion Entrar.
reiniciar({ seccion: "servidores", vista: "lista", ocultos: ["seccion-chats"] });
const paso2 = capa("darPasoAtras()");
comprobar(log.includes("seccion:entrar"), "Del apartado principal se pasa a Entrar");
comprobar(paso2 === true, "Ir a Entrar sigue siendo un paso dentro de la app");

// 8) En Entrar > Publico, atras vuelve a Mis Amigos.
reiniciar({ seccion: "entrar", publico: true });
const paso3 = capa("darPasoAtras()");
comprobar(log.includes("feed:amigos"), "Estando en Publico, atras vuelve a Mis Amigos");
comprobar(paso3 === true, "Volver a Mis Amigos es un paso, no la salida");

// 9) En Entrar > Mis Amigos y sin nada, atras sale de la app.
reiniciar({ seccion: "entrar", publico: false });
const salir = capa("darPasoAtras()");
comprobar(salir === false, "En Entrar > Mis Amigos sin nada, atras sale de la app");

// 10) En amigos > solicitudes, atras vuelve a Encontrar personas.
reiniciar({ seccion: "amigos", solicitudes: true });
const pasoAmigos = capa("darPasoAtras()");
comprobar(log.includes("boton-encontrar"), "De Solicitudes se vuelve a Encontrar personas");
comprobar(pasoAmigos === true, "Volver al principal de Amigos es un paso");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");

