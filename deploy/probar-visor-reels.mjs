/**
 * Prueba del visor de reels sin abrir un navegador: se carga app.js con un DOM
 * simulado y se comprueba lo que el usuario pidio.
 *
 * - Un toque en el video lo pausa y lo reanuda.
 * - La barra de abajo marca el tiempo y permite ir adelante o atras.
 * - El boton de comentarios abre el modal sin cerrar el visor.
 * - La caja de comentarios es sencilla y su boton dice COMENTAR.
 *
 *   node deploy/probar-visor-reels.mjs
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

/* ---------- DOM minimo con listeners reales ---------- */

//(localStorage de mentira para poder comprobar que la decision se guarda)
const guardado = new Map();



function crear(nodo = {}) {
    const base = {
        listeners: {},
        dataset: {},
        style: {},
        atributos: {},
        children: [],
        hidden: false,
        value: "",
        textContent: "",
        innerHTML: "",
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener(evento, manejador) {
            (this.listeners[evento] ||= []).push(manejador);
        },
        removeEventListener() {},
        dispatchEvent() {},
        appendChild(hijo) { this.children.push(hijo); return hijo; },
        append() {},
        remove() {},
        setAttribute(clave, valor) { this.atributos[clave] = valor; },
        getAttribute(clave) { return this.atributos[clave] ?? null; },
        removeAttribute() {},
        querySelector() { return crear(); },
        querySelectorAll() { return []; },
        setPointerCapture() {},
        releasePointerCapture() {},
        focus() {},
        click() {},
        closest() { return null; },
        getBoundingClientRect() { return { top: 0, left: 0, width: 200, height: 4, right: 200, bottom: 4 }; },
        scrollIntoView() {}
    };
    return Object.assign(base, nodo);
}

function disparar(nodo, evento, objeto = {}) {
    (nodo.listeners[evento] || []).forEach((manejador) => manejador({ preventDefault() {}, stopPropagation() {}, ...objeto }));
}

// El video simulado: guarda si esta en marcha y cuanto se ha advanced.
const video = crear({
    paused: true,
    duration: 100,
    currentTime: 0,
    reproducciones: 0,
    play() {
        this.paused = false;
        this.reproducciones += 1;
        return Promise.resolve();
    },
    pause() { this.paused = true; }
});

const ondas = crear();
const raya = crear();
const botonSonido = crear({
    selectores: { ".ondas-sonido": ondas, ".raya-sonido": raya },
    querySelector(selector) { return this.selectores[selector] || null; }
});

const relleno = crear();
const tiempo = crear();
const pista = crear({ elementos: { pista: null } });
const aviso = crear();

const pantalla = crear({
    dataset: { reelId: "reel-1" },
    selectores: {
        ".video-reel": video,
        ".barra-reel-pista": pista,
        ".barra-reel-relleno": relleno,
        ".barra-reel-tiempo": tiempo,
        ".aviso-reproduccion": aviso,
        ".boton-sonido-reel": botonSonido
    },
    querySelector(selector) { return this.selectores[selector] || null; }
});

// El toque llega desde el propio video: no esta dentro de botones ni de la barra.
const toqueEnVideo = { target: crear({ closest: () => null }) };
const toqueEnBarra = { target: crear({ closest: (sel) => (sel.includes("barra-reel") ? pista : null) }) };

/* ---------- Cargar app.js ---------- */

function crearElemento() { return crear(); }

const codigo = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
//(el codigo de la app, para comprobar que trae lo que debe)
const app = codigo;
const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame() { return 0; },
    document: {
        getElementById: () => crear(),
        querySelector: () => crear(),
        querySelectorAll: () => [],
        createElement: crearElemento,
        addEventListener() {},
        body: { classList: { add() {}, remove() {}, toggle() {} } }
    },
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {}, isSecureContext: false },
    navigator: { onLine: true },
    localStorage: {
        getItem: (clave) => (guardado.has(clave) ? guardado.get(clave) : null),
        setItem: (clave, valor) => guardado.set(clave, valor),
        removeItem: (clave) => guardado.delete(clave)
    },
    location: { protocol: "http:", host: "127.0.0.1:3000", href: "http://127.0.0.1:3000/", reload() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    FormData: class { append() {} },
    setInterval() { return 0; },
    isSecureContext: false,
    URL: { createObjectURL: () => "" },
    Blob: class {},
    Event: class { constructor(tipo) { this.type = tipo; } },
    crypto: { randomUUID: () => "uuid-de-prueba", getRandomValues: (array) => array },
    alert() {}, confirm() { return false; }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

try {
    vm.createContext(sandbox);
    vm.runInContext(codigo, sandbox, { timeout: 20000 });
    comprobar(true, "app.js carga sin errores en el visor");
} catch (error) {
    comprobar(false, `app.js lanzo ${error.message}`);
    console.log("");
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}

/* ---------- Barra de tiempo ---------- */

const formatear = vm.runInContext('tiempoReel', sandbox);
comprobar(formatear(0) === "0:00", "El tiempo empieza en 0:00");
comprobar(formatear(9) === "0:09", "Los segundos llevan dos cifras");
comprobar(formatear(95) === "1:35", "Pasado el minuto sale 1:35");
comprobar(formatear(-4) === "0:00", "Un tiempo raro no rompe nada");

/* ---------- Tocar para pausar ---------- */

sandbox.__pantalla = pantalla;

vm.runInContext('configurarPantallaReel(__pantalla)', sandbox);

disparar(pantalla, "click", toqueEnVideo);
comprobar(video.paused === false, "El primer toque pone el video en marcha");

disparar(pantalla, "click", toqueEnVideo);
comprobar(video.paused === true, "El segundo toque lo pausa");
comprobar(aviso.hidden === false, "Al pausar sale el aviso de reproducir");

disparar(aviso, "click", { ...toqueEnVideo });
comprobar(video.paused === false, "El aviso grande lo vuelve a poner en marcha");

disparar(pantalla, "click", toqueEnBarra);
comprobar(video.reproducciones === 2, "Tocar la barra no cambia la reproduccion");

/* ---------- La barra marca el tiempo ---------- */

video.currentTime = 25;
disparar(video, "timeupdate");
comprobar(relleno.style.width === "25%", `La barra se llena al ritmo del video (${relleno.style.width})`);
comprobar(tiempo.textContent === "0:25 / 1:40", `Sale el tiempo actual y el total (${tiempo.textContent})`);

/* ---------- Adelantar y retroceder con la barra ---------- */

disparar(pista, "pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, clientX: 150 });
comprobar(video.currentTime === 75, `Tocar la barra salta a ese punto (${video.currentTime})`);

disparar(pista, "pointermove", { pointerId: 1, clientX: 50 });
comprobar(video.currentTime === 25, `Arrastrar la barra va moviendo el video (${video.currentTime})`);

disparar(pista, "pointermove", { pointerId: 9, clientX: 100 });
comprobar(video.currentTime === 25, "Un puntejo que no esta arrastrando no mueve nada");

disparar(pista, "keydown", { key: "ArrowRight" });
comprobar(video.currentTime === 30, "La flecha derecha adelanta cinco segundos");

disparar(pista, "keydown", { key: "ArrowLeft" });
comprobar(video.currentTime === 25, "La flecha izquierda retrocede cinco segundos");

disparar(pista, "keydown", { key: "End" });
comprobar(video.currentTime === 100, "La tecla Fin va al final");

disparar(pista, "keydown", { key: "Home" });
comprobar(video.currentTime === 0, "La tecla Inicio vuelve al principio");

/* ---------- El sonido ---------- */

// El boton de sonido existe y arranca en silencio: los navegadores no dejan
// reproducir con sonido sin un toque previo.
comprobar(
    app.includes('class="boton-sonido-reel"'),
    "Los reels tienen boton de sonido"
);
comprobar(video.muted === true, "El reel arranca en silencio");
comprobar(botonSonido.atributos["aria-pressed"] === "false", "El boton sale apagado");
comprobar(
    ondas.style.display === "none" && raya.style.display === "",
    "En silencio sale el altavoz tachado"
);

// Al pulsarlo, suena y el icono se cambia.
disparar(botonSonido, "click", { ...toqueEnVideo });
comprobar(video.muted === false, "El boton quita el silencio");
comprobar(botonSonido.atributos["aria-pressed"] === "true", "El boton se marca como encendido");
comprobar(
    ondas.style.display === "" && raya.style.display === "none",
    "Con sonido salen las ondas"
);
comprobar(guardado.get("atuistas_reels_sonido") === "1", "La decision se recuerda");

// Y al volver a pulsarlo vuelve a callarse.
disparar(botonSonido, "click", { ...toqueEnVideo });
comprobar(video.muted === true, "El boton vuelve a quitar el sonido");
comprobar(guardado.get("atuistas_reels_sonido") === "0", "La decision se sigue guardando");

// Si el navegador bloquea el sonido al cambiar de reel, se queda mudo en vez
// de quedarse parado: aqui se comprueba que el boton refleja el estado real.
disparar(botonSonido, "click", { ...toqueEnVideo });
video.play = () => Promise.reject(new Error("NotAllowedError"));
disparar(pantalla, "reel-en-pantalla");
// La reproduccion es asincrona: hay que dejar que se rechaza.
await new Promise((resolver) => setTimeout(resolver, 0));
comprobar(video.muted === true, "Si no deja sonar, se queda en silencio");
comprobar(botonSonido.atributos["aria-pressed"] === "false", "El boton vuelve a marcarse apagado");
/* ---------- Comentarios ---------- */

const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");

// El modal de comentarios tiene que quedar por encima del visor: si no, se
// abre detras del video y parece que el boton no hace nada.
const zModal = Number(css.match(/\.modal-contenido-social \{[^}]*z-index:\s*(\d+)/)?.[1] ?? 0);
const zVisor = Number(css.match(/\.visor-reels \{[^}]*z-index:\s*(\d+)/s)?.[1] ?? 0);
comprobar(zModal > zVisor, `Los comentarios se abren por encima del visor (${zModal} > ${zVisor})`);
comprobar(
    !app.includes("cerrarVisorReels();\n        abrirComentariosReel"),
    "Abrir comentarios no cierra el visor"
);
comprobar(
    app.includes("abrirComentariosReel(reelId, pantalla.querySelector"),
    "El boton de comentarios abre el panel sin salir del visor"
);
comprobar(/boton-comentar-reel[^>]*>\s*COMENTAR\s*</.test(html), "El boton dice COMENTAR");
comprobar(!/formulario-comentario-reel[\s\S]{0,500}ENVIAR/.test(html), "Ya no dice ENVIAR");
comprobar(css.includes(".formulario-comentario-reel input"), "La caja de comentarios tiene su propio estilo");
comprobar(app.includes("refrescarBotonComentar"), "El boton se activa solo cuando hay texto");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");