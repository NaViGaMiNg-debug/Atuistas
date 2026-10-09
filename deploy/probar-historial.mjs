/**
 * Prueba del historial del botón atrás.
 *
 * El fallo que cubre: al cambiar de pestaña con el menú inferior, el observador
 * de capas ve dos elementos ocultos en el mismo lote y el código viejo lanzaba
 * history.back() dos veces seguidas sin esperar al popstate: el segundo back
 * salía de Atuistas y caía en la pestaña anterior (Google).
 *
 * Comprueba que:
 *  1. Dos desapilarCapa() en el mismo lote lanzan UN solo back().
 *  2. Tras el popstate, el back pendiente se encadena solo si la entrada es
 *     nuestra (state.capa).
 *  3. Con la entrada inicial (state null) NUNCA se llama a back(): la app no
 *     puede salir de su propia URL.
 *
 * Uso: node deploy/probar-historial.mjs
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

// Solo el bloque del historial: desde las variables hasta el observador.
const inicio = codigo.indexOf("let capasApiladas = 0;");
const fin = codigo.indexOf("function observarCapas()");
if (inicio < 0 || fin < 0 || fin <= inicio) {
    console.log("FALLO: no se encuentra el bloque del historial en app.js");
    process.exit(1);
}
const bloque = codigo.slice(inicio, fin);

/* ---------- Historial de mentira: pila real con back() asíncrono ---------- */

let llamadasBack = 0;
let handlerPopstate = null;
const pila = [{ state: null }]; // La entrada inicial nunca tiene state nuestro.
let indice = 0;

const historyMock = {
    get state() { return pila[indice].state; },
    pushState(state) {
        pila.splice(indice + 1); // Como en el navegador: se corta el futuro.
        pila.push({ state });
        indice += 1;
    },
    back() {
        llamadasBack += 1;
        if (indice === 0) {
            // El navegador real navegaria fuera de la app: eso es el bug.
            return;
        }
        indice -= 1;
        // El popstate llega después, como en el navegador real.
        setTimeout(() => handlerPopstate && handlerPopstate(), 0);
    }
};

const elemento = () => ({ hidden: true });
const sandbox = {
    console,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    window: {
        history: historyMock,
        addEventListener(tipo, fn) {
            if (tipo === "popstate") handlerPopstate = fn;
        }
    },
    document: {
        getElementById: () => elemento(),
        querySelectorAll: () => []
    },
    // En el bloque no se define (vive arriba): se stubbea para popstate.
    mostrarSeccion() {},
    seccionActual: "amigos"
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(bloque, sandbox, { timeout: 5000 });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. Dos cierres en el mismo lote = UN solo back ---------- */

// Se apila una seccion (como hace mostrarSeccion al pulsar un boton del menu)
// y encima una capa (modal/panel): dos entradas nuestras en el historial.
vm.runInContext("sincronizarAtrasSeccion('cuenta')", sandbox);
comprobar(llamadasBack === 0, "Cambiar de seccion no retrocede: solo apila");
comprobar(pila.length === 2, `La seccion apila una entrada (${pila.length})`);
vm.runInContext("apilarCapa()", sandbox);
comprobar(pila.length === 3, `La capa apila la segunda (${pila.length})`);

// El observador ve dos capas ocultas en el mismo lote y llama dos veces.
vm.runInContext("desapilarCapa(); desapilarCapa();", sandbox);
comprobar(
    llamadasBack === 1,
    `Dos cierres en el mismo lote lanzan UN solo back (${llamadasBack})`
);

// Tras el popstate del primero, el pendiente se encadena solo (uno a uno).
await esperar(10);
await esperar(10);
await esperar(10);
comprobar(
    llamadasBack === 2,
    `El back pendiente se encadena tras el popstate (${llamadasBack})`
);
comprobar(indice === 0, `Se acaba en la entrada inicial, dentro de la app (indice ${indice})`);

// A partir de aqui la entrada inicial esta gastada: state null.
comprobar(sandbox.window.history.state === null, "La entrada inicial no tiene state nuestro");

/* ---------- 2. Nunca back() desde la entrada inicial ---------- */

llamadasBack = 0;
vm.runInContext("desapilarCapa();", sandbox);
await esperar(10);
comprobar(
    llamadasBack === 0,
    `Con la entrada inicial NO se llama a back (${llamadasBack}): la app no sale a Google`
);

vm.runInContext("sincronizarAtrasSeccion('entrar')", sandbox);
await esperar(10);
comprobar(
    llamadasBack === 0,
    "Volver a Entrar desde la inicial no retrocede tampoco"
);

/* ---------- 3. El contador no se descontaba doble ---------- */

// Apilar dos capas y gastarlas: el contador tiene que llegar a 0, no a -1.
vm.runInContext("apilarCapa(); apilarCapa();", sandbox);
comprobar(pila.length === 3, `Las capas apilan entradas (${pila.length})`);
vm.runInContext("desapilarCapa();", sandbox);
await esperar(10);
vm.runInContext("desapilarCapa();", sandbox);
await esperar(10);
await esperar(10);
const capas = vm.runInContext("capasApiladas", sandbox);
comprobar(capas === 0, `El contador aterriza en 0, sin negativos (${capas})`);
comprobar(indice === 0, `La pila vuelve a la entrada inicial (${indice})`);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");
