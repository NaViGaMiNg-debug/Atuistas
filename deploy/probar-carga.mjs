/**
 * Comprueba que app.js se carga sin ReferenceError, que es el fallo que
 * dejo la interfaz muerta: una variable usada antes de declararla detiene
 * todo el script, y ningun boton responde.
 *
 *   node deploy/probar-carga.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

const origen = process.argv[2] || path.join(raiz, "public", "app.js");
const codigo = fs.readFileSync(origen, "utf8");

// Un DOM minimo: cualquier elemento pedido se devuelve con los metodos que
// la app usa en el arranque. No ejecuta la logica de la aplicacion, solo
// comprueba que el script llega hasta el final sin ReferenceError.
function crearElemento(id = "") {
    const elemento = {
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
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; }
        },
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        append() {},
        remove() {},
        setAttribute() {},
        getAttribute() { return null; },
        removeAttribute() {},
        querySelector() { return crearElemento(); },
        querySelectorAll() { return []; },
        closest() { return null; },
        focus() {},
        click() {},
        scrollIntoView() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; }
    };
    return elemento;
}

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
        createElement: (etiqueta) => crearElemento(etiqueta),
        addEventListener() {},
        removeEventListener() {},
        body: crearElemento("body"),
        documentElement: crearElemento("html")
    },
    window: {
        addEventListener() {},
        removeEventListener() {},
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        location: { protocol: "https:", host: "localhost", href: "https://localhost/" },
        navigator: { onLine: true, serviceWorker: undefined },
        isSecureContext: true,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        caches: undefined,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        confirm: () => false,
        alert: () => {},
        matchMedia: () => ({ matches: false, addEventListener() {} })
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    // El service worker se simula para que la app supere la linea del
    // registro; si no, la comprobacion pararia antes de tiempo.
    navigator: {
        onLine: true,
        mediaDevices: undefined,
        serviceWorker: {
            controller: null,
            register: async () => ({
                waiting: null,
                installing: null,
                addEventListener() {},
                update: async () => {},
                pushManager: { subscribe: async () => ({}), getSubscription: async () => null }
            }),
            ready: Promise.resolve({
                pushManager: { subscribe: async () => ({}), getSubscription: async () => null }
            }),
            addEventListener() {}
        }
    },
    caches: {
        open: async () => ({ match: async () => undefined, add: async () => {}, put: async () => {} }),
        keys: async () => [],
        delete: async () => {}
    },
    Cache: class {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    crypto: { randomUUID: () => "00000000-0000-0000-0000-000000000000" },
    location: { protocol: "https:", host: "localhost", href: "https://localhost/" },
    isSecureContext: true,
    MediaRecorder: undefined,
    Blob: class {},
    File: class {},
    FormData: class {},
    URL: { createObjectURL: () => "" },
    confirm: () => false,
    alert: () => {}
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

let fallo = null;
try {
    vm.createContext(sandbox);
    vm.runInContext(codigo, sandbox, { filename: origen, timeout: 20000 });
} catch (error) {
    fallo = error;
}

if (fallo) {
    console.log(`FALLO al cargar app.js: ${fallo.name}: ${fallo.message}`);
    const linea = (fallo.stack || "").split("\n").slice(0, 3).join("\n  ");
    console.log(`  ${linea}`);
    process.exit(1);
}

console.log("app.js se carga completo sin ReferenceError.");
