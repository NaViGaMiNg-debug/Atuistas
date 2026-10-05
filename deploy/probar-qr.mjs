/**
 * Prueba del codigo QR: que el atajo de Q y R solo salte tras cinco segundos
 * manteniendolas, que se pueda cerrar, y que el boton de Cuenta solo salga en
 * movil y solo en esa pestana.
 *
 *   node deploy/probar-qr.mjs
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

/* ---------- Reloj de mentira: se avanza a mano ---------- */

let ahora = 0;
const temporizadores = new Map();
let siguienteTemporizador = 1;

function programar(fn, ms) {
    const id = siguienteTemporizador++;
    temporizadores.set(id, { fn, cuando: ahora + ms });
    return id;
}

function cancelar(id) {
    temporizadores.delete(id);
}

function avanzar(ms) {
    ahora += ms;
    for (const [id, temporizador] of [...temporizadores]) {
        if (temporizador.cuando <= ahora) {
            temporizadores.delete(id);
            temporizador.fn();
        }
    }
}

function vaciarReloj() {
    temporizadores.clear();
    ahora = 0;
}

const codigo = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");

/* ---------- Solo nos interesa el bloque del QR ---------- */

// Se ejecuta ese trozo con un DOM minimo, en vez de toda la app (que pediria
// un navegador entero).
const inicio = codigo.indexOf("EL CÓDIGO QR");
const fin = codigo.indexOf("SELECTOR DE EMOJIS, GIF Y STICKERS");
const bloque = codigo.slice(
    codigo.lastIndexOf("/* ==============================", inicio),
    codigo.lastIndexOf("/* ==============================", fin)
);

const ventana = {
    id: "modal-codigo",
    hidden: true,
    innerHTML: "",
    oyentes: {},
    addEventListener(tipo, fn) {
        this.oyentes[tipo] = fn;
    },
    querySelector() {
        return { addEventListener() {} };
    }
};

const botones = {
    "boton-qr-cuenta": { addEventListener() {}, hidden: true }
};

const oyentes = {};
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: programar,
    clearTimeout: cancelar,
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    document: {
        // La ventana del codigo vive en el DOM en cuanto se construye, asi que
        // a partir de ese momento getElementById la encuentra.
        getElementById: (id) =>
            id === "modal-codigo" ? ventana : (botones[id] ?? null),
        createElement() {
            return ventana;
        },
        addEventListener(tipo, fn) {
            oyentes[tipo] = fn;
        },
        body: { appendChild() {} }
    },
    window: {
        addEventListener(tipo, fn) {
            oyentes[`ventana:${tipo}`] = fn;
        },
        innerHeight: 800
    }
};
sandbox.globalThis = sandbox;

try {
    vm.createContext(sandbox);
    vm.runInContext(bloque, sandbox, { timeout: 10000 });
    comprobar(true, "El bloque del codigo QR carga sin errores");
} catch (error) {
    comprobar(false, `El bloque del QR lanzo ${error.message}`);
}

// La ventana se construye la primera vez que se abre.
const codigoAbierto = () => ventana.id === "modal-codigo" && ventana.hidden === false;
const tecla = (letra, modificador = false) => ({
    key: letra,
    ctrlKey: modificador,
    altKey: false,
    metaKey: false
});

function empezarDeCero() {
    vm.runInContext("cancelarAtajoCodigo()", sandbox);
    vaciarReloj();
    ventana.hidden = true;
}

/* ---------- El atajo ---------- */

// Q sola no hace nada, aunque se mantenga mucho tiempo.
oyentes.keydown(tecla("q"));
avanzar(9000);
comprobar(!codigoAbierto(), "La Q sola no abre nada");

// Las dos a la vez: cuenta cinco segundos y salta.
oyentes.keydown(tecla("r"));
comprobar(
    vm.runInContext("temporizadorAtajo !== null", sandbox),
    "Con las dos teclas a la vez hay una cuenta atras"
);

avanzar(4000);
comprobar(!codigoAbierto(), "A los cuatro segundos todavia no se abre");

avanzar(1500);
comprobar(codigoAbierto(), "A los cinco segundos se abre la imagen");

comprobar(
    vm.runInContext("temporizadorAtajo === null", sandbox),
    "Al abrirse, la cuenta se da por hecha y no se repite sola"
);

// Si se suelta una antes de tiempo, se cancela.
empezarDeCero();
oyentes.keydown(tecla("q"));
oyentes.keydown(tecla("r"));
avanzar(2000);
oyentes.keyup(tecla("r"));
avanzar(5000);
comprobar(!codigoAbierto(), "Si sueltas una tecla antes de tiempo no se abre");

// Volver a mantenerlas reinicia la cuenta entera.
oyentes.keydown(tecla("r"));
avanzar(3000);
comprobar(!codigoAbierto(), "La cuenta se reinicia si hay que volver a pulsar");

// Ctrl+R no debe contar como atajo: choca con recargar la pagina.
empezarDeCero();
oyentes.keydown(tecla("q"));
oyentes.keydown(tecla("r", true));
avanzar(9000);
comprobar(!codigoAbierto(), "Con Ctrl pulsado no se abre");

// Si se cambia de ventana con las teclas pulsadas, se cancela.
empezarDeCero();
oyentes.keydown(tecla("q"));
oyentes.keydown(tecla("r"));
avanzar(1000);
oyentes["ventana:blur"]();
avanzar(9000);
comprobar(!codigoAbierto(), "Al cambiar de ventana se cancela la cuenta");

/* ---------- Lo que se pinta ---------- */

comprobar(
    codigo.includes('IMAGEN_CODIGO = "/qratuistas.png"'),
    "La ventana usa la imagen que hay en public"
);
comprobar(codigo.includes('id="cerrar-codigo"'), "La ventana trae su boton de cerrar");
comprobar(css.includes(".cerrar-codigo {"), "El boton de cerrar tiene estilos");
comprobar(css.includes(".dialogo-codigo {"), "La ventana del QR tiene estilos");
comprobar(
    fs.existsSync(path.join(raiz, "public", "qratuistas.png")),
    "La imagen existe en public"
);

function zIndexDe(selectorCss) {
    const encontrado = css.match(new RegExp(`${selectorCss.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
    return encontrado ? Number(encontrado[1].match(/z-index:\s*(\d+)/)?.[1] ?? 0) : 0;
}

comprobar(
    zIndexDe(".modal-codigo") > zIndexDe(".panel-chat"),
    `La ventana del QR se ve por encima del chat (${zIndexDe(".modal-codigo")} > ${zIndexDe(".panel-chat")})`
);

/* ---------- El boton de Cuenta ---------- */

comprobar(html.includes('id="boton-qr-cuenta"'), "Hay un boton para abrir el QR");
comprobar(
    /<header class="barra-superior">[\s\S]*?boton-qr-cuenta/.test(html),
    "El boton esta en la cabecera, junto al titulo"
);
comprobar(
    /boton-qr-cuenta[\s\S]{0,220}hidden/.test(html),
    "El boton nace escondido"
);
comprobar(
    codigo.includes('botonCodigo.hidden = seccion !== "cuenta"'),
    "El boton solo se enseña en la pestana de Cuenta"
);
comprobar(
    codigo.includes('document.getElementById("boton-qr-cuenta")?.addEventListener("click", abrirCodigo)'),
    "El boton abre la misma ventana"
);
comprobar(
    css.includes("@media (min-width: 701px)") &&
        /\.boton-qr-cuenta\s*\{[^}]*display:\s*none/.test(css),
    "En pantallas grandes el boton no sale: ahi esta el atajo de teclado"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");
