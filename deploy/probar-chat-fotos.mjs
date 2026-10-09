/**
 * Prueba de las mejoras del chat: el cuadro de escritura crece con el texto
 * hasta tres lineas y a partir de ahi solo hace scroll vertical (nunca hacia
 * los lados), se pueden subir todas las fotos de una vez al chat privado
 * (con el limite de siempre por foto y compresion de las que lo pasen) y
 * pulsar una foto de un mensaje la abre en grande para ampliarla y deslizar
 * a la siguiente o a la anterior.
 *
 *   node deploy/probar-chat-fotos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");
const app = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const appSinVersion = fs.readFileSync(path.join(raiz, "public", "sw.js"), "utf8");

// Devuelve el cuerpo de la regla cuyo selector coincide exactamente.
function reglaDe(selector) {
    for (const [, cabeza, cuerpo] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const lista = cabeza
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .split(",")
            .map((parte) => parte.trim())
            .filter(Boolean);
        if (lista.includes(selector)) return cuerpo;
    }
    return "";
}

/* ---------- El cuadro de escritura crece hasta tres lineas ---------- */

comprobar(/<textarea[^>]*id="entrada-mensaje"/s.test(html), "El chat privado escribe en un textarea");
comprobar(
    /<textarea[^>]*id="entrada-mensaje-servidor"/s.test(html),
    "El servidor escribe en un textarea"
);
comprobar(
    !/<input[^>]*id="entrada-mensaje"/s.test(html),
    "El cuadro del chat ya no es un input de una sola linea"
);
comprobar(
    !/<input[^>]*id="entrada-mensaje-servidor"/s.test(html),
    "El cuadro del servidor ya no es un input de una sola linea"
);

for (const selector of ["#entrada-mensaje", "#entrada-mensaje-servidor"]) {
    const cuerpo = reglaDe(selector);
    comprobar(cuerpo.length > 0, `${selector} tiene su propia regla`);
    comprobar(/max-height:\s*92px/.test(cuerpo), `${selector} se para en tres lineas`);
    comprobar(/overflow-y:\s*auto/.test(cuerpo), `${selector} hace scroll vertical cuando se llena`);
    comprobar(/overflow-x:\s*hidden/.test(cuerpo), `${selector} nunca hace scroll hacia los lados`);
    comprobar(/resize:\s*none/.test(cuerpo), `${selector} no se ensancha arrastrando la esquina`);
    comprobar(/white-space:\s*pre-wrap/.test(cuerpo), `${selector} respeta los saltos de linea`);
}

comprobar(app.includes("function ajustarAlturaEntrada("), "El crecimiento del cuadro vive en el composer");
comprobar(
    /Math\.min\(medida, maximo\)/.test(app),
    "La altura se para en el maximo y ahi sigue scrolleando dentro"
);
comprobar(
    /keydown[\s\S]{0,260}requestSubmit\(botonAccion\)/.test(app),
    "Enter vuelve a enviar el mensaje desde el textarea"
);
comprobar(app.includes("evento.shiftKey"), "Shift+Enter deja saltar linea");
comprobar(
    /limpiarTodo\(\)[\s\S]{0,400}ajustarAlturaEntrada\(\)/.test(app),
    "Al vaciar el composer el cuadro vuelve a su alto de una linea"
);

/* ---------- Todas las fotos a la vez al chat privado ---------- */

comprobar(
    (app.match(/multiplesFotos:\s*true/g) || []).length === 1,
    "Solo el chat privado admite subir todas las fotos de una vez"
);
comprobar(
    app.includes('inputArchivo.multiple = Boolean(config.multiplesFotos) && clase === "imagen"'),
    "El input de FOTOS se pone multiple solo donde toca"
);
comprobar(app.includes("function prepararAdjuntos("), "Las fotos elegidas se preparan juntas");
comprobar(
    app.includes("adjunto.archivos ?? [adjunto.archivo]"),
    "Al enviar se recorren todas las fotos del adjunto"
);

const bloqueEnviarChat = app.slice(
    app.indexOf("async function enviarMensajeChat"),
    app.indexOf("async function subirAdjuntoPrivado")
);
comprobar(bloqueEnviarChat.length > 0, "Se encuentra el envio del chat privado");
comprobar(
    /for \(let indice = 0; indice < Math\.max\(subidos\.length, 1\)/.test(bloqueEnviarChat),
    "Cada foto sube su propio mensaje"
);
comprobar(
    bloqueEnviarChat.includes('contenido: indice === 0 ? contenido : ""'),
    "El texto de la respuesta se queda en la primera foto"
);
comprobar(
    app.includes('archivo.type?.startsWith("image/") && archivo.size > LIMITE_FOTO_BYTES') &&
        /async function subirAdjuntoPrivado[\s\S]{0,600}comprimirFoto\(archivo\)/.test(app),
    "Las fotos que pasan del limite de siempre se comprimen al subir"
);

/* ---------- La foto del chat se abre en grande ---------- */

comprobar(html.includes('id="modal-fotos-chat"'), "El visor de fotos esta en el HTML");
comprobar(
    html.includes('id="foto-chat-anterior"') && html.includes('id="foto-chat-siguiente"'),
    "El visor tiene flechas para cambiar de foto"
);
comprobar(app.includes("function abrirFotosChat("), "El chat abre sus fotos en grande");
comprobar(
    app.includes('querySelectorAll(".adjunto-mensaje img")'),
    "Se recogen las fotos de la conversacion entera, en orden"
);
comprobar(app.includes("punterosFotoChat"), "La foto se amplia con el pellizco del dedo");
comprobar(
    /dblclick[\s\S]{0,320}escalaFotoChat = 2\.5/.test(app),
    "Con doble pulsacion se amplia y se vuelve al tamano normal"
);
comprobar(
    /wheel[\s\S]{0,160}acercarFotoChat\(/.test(app),
    "La rueda del raton tambien acerca y aleja"
);
comprobar(
    /Math\.abs\(deltaX\) > 60/.test(app),
    "Deslizando con el dedo se pasa a la foto siguiente o anterior"
);
comprobar(
    app.includes('["lista-mensajes", "mensajes-servidor"]'),
    "Se puede abrir una foto desde cualquier conversacion"
);
comprobar(html.includes("boton-cerrar-fotos-chat"), "La X del visor tiene su propia clase");
comprobar(
    /\.boton-cerrar-fotos-chat[\s\S]{0,160}left:/.test(css),
    "La X del visor esta arriba a la izquierda"
);
comprobar(
    app.includes("vistaPreviaSalidaFotoChat") && app.includes("restablecerSalidaFotoChat"),
    "Al arrastrar en vertical la foto sigue al dedo y el fondo se atenua"
);
comprobar(
    /Math\.abs\(deltaY\) > Math\.abs\(deltaX\)[\s\S]{0,160}cerrarFotosChat\(\)/.test(app),
    "Deslizando arriba o abajo se sale del visor en cualquier foto"
);
comprobar(
    app.includes("document.elementFromPoint(evento.clientX, evento.clientY)"),
    "El toque abre la foto aunque el gesto del mensaje capture el puntero"
);
comprobar(
    html.includes("/app.js?v=26") && appSinVersion.includes('"/app.js?v=26"'),
    "El HTML y el service worker sirven el JS nuevo y no la copia vieja"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");

