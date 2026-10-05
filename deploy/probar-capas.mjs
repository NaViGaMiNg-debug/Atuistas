/**
 * Prueba de la escalera de capas (z-index).
 *
 * El panel del chat ocupa toda la pantalla y los modales van por encima: si
 * uno se queda debajo, no se ve ni se puede pulsar. Ya ha pasado dos veces (los
 * comentarios de los reels y el editor de fotos del chat), asi que aqui se
 * comprueba el orden entero de una vez.
 *
 *   node deploy/probar-capas.mjs
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

const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");

// Saca el z-index de un selector, aunque la regla lo comparta con otros.
// La comparacion es exacta: si no, ".modal-codigo" pareceria el mismo
// selector que ".modal" y la escalera se leeria fatal.
function zDe(selector) {
    const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    for (const [, selectores, cuerpo] of reglas) {
        // El texto previo al selector son comentarios: se quitan antes de
        // comparar, y la comparacion es exacta para que ".modal-codigo" no
        // cuente como ".modal".
        const lista = selectores
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .split(",")
            .map((parte) => parte.trim())
            .filter(Boolean);

        if (!lista.includes(selector)) continue;
        if (!/z-index\s*:/.test(cuerpo)) continue;
        return Number(cuerpo.match(/z-index\s*:\s*(\d+)/)[1]);
    }
    return null;
}

const peldanos = [
    [".modal", 1000],
    [".visor-reels", 1100],
    [".modal-contenido-social", 1400],
    // Los comentarios del estado salen del visor de estados (2000): tienen que
    // ir justo por encima para que se lean y se pueda escribir.
    ["#modal-comentarios-estado", 2100],
    [".panel-chat", 3000],
    ["#modal-perfil", 3100],
    ["#modal-acciones-perfil", 3200],
    ["#modal-foto-grande", 3300],
    // El editor de foto y la ubicacion salen los dos del composer y nunca a la
    // vez, asi que comparten peldano a proposito.
    ["#modal-editor-foto", 3400],
    ["#modal-ubicacion", 3400],
    [".selector-medio", 3500],
    [".modal-codigo", 3600],
    // Las fotos del chat se abren desde el chat y por encima de todo lo demas.
    ["#modal-fotos-chat", 3700]
];

let anterior = 0;
for (const [selector, minimo] of peldanos) {
    const valor = zDe(selector);
    comprobar(valor !== null, `${selector} tiene z-index propio (${valor})`);
    comprobar(valor >= minimo, `${selector} esta al menos en ${minimo} (${valor})`);
    comprobar(
        valor >= anterior,
        `${selector} va por encima del peldaño anterior (${anterior} <= ${valor})`
    );
    anterior = Math.max(anterior, valor ?? 0);
}

// Estas dos comparten regla y se abren una detras de otra: el mismo peldaño es
// lo correcto.
comprobar(
    zDe("#modal-acciones-perfil") === zDe("#modal-amigos-perfil"),
    "Las ventanas de acciones y de amigos comparten peldaño"
);

// Los casos que seatarson de verdad.
comprobar(
    zDe("#modal-editor-foto") > zDe(".panel-chat"),
    "El editor de fotos se abre encima del chat, no detrás"
);
comprobar(
    zDe(".modal-contenido-social") > zDe(".visor-reels"),
    "Los comentarios del reel se abren encima del vídeo"
);
comprobar(
    zDe("#modal-foto-grande") > zDe(".panel-chat"),
    "La foto en grande se abre encima del chat"
);
comprobar(
    zDe("#modal-perfil") > zDe(".panel-chat"),
    "El perfil se abre encima del chat"
);

// El editor de fotos se abre desde el compositor del chat y su resultado se
// adjunta al mensaje: si esto se rompe, la foto nunca llega.
comprobar(
    app.includes("abrirEditorFoto(archivo, (resultado) => {"),
    "El compositor del chat manda la foto al editor"
);
comprobar(
    /abrirEditorFoto\(archivo, \(resultado\) => \{\s*adjunto = \{ archivo: resultado, tipo \}/.test(app),
    "Lo que sale del editor se adjunta al mensaje"
);
comprobar(
    app.includes("continuar(resultado)"),
    "Al confirmar en el editor, el archivo vuelve al chat"
);
comprobar(
    html.includes('id="modal-editor-foto"') && html.includes("boton-editor-confirmar"),
    "El editor tiene su botón de confirmar"
);
comprobar(
    /inputArchivo\.addEventListener\("change"[\s\S]{0,240}inputArchivo\.value = ""/.test(app),
    "Eligiendo dos veces la misma foto, la segunda tambien se manda"
);

// Las fotos del chat se abren en grande desde el propio chat: encima del
// panel (3000) y congelando el resto de capas.
comprobar(
    html.includes('id="modal-fotos-chat"') && html.includes('id="foto-chat-grande"'),
    "El visor de fotos del chat esta en el HTML"
);
comprobar(
    zDe("#modal-fotos-chat") > zDe(".panel-chat"),
    "Las fotos del chat se abren encima del chat"
);
comprobar(
    zDe("#modal-comentarios-estado") > zDe(".visor-historias-pantalla"),
    "Los comentarios del estado se abren encima del visor de estados"
);
comprobar(
    app.includes("function abrirFotosChat(") && app.includes("function cambiarFotoChat("),
    "El visor de fotos tiene sus funciones"
);
comprobar(
    app.includes('["lista-mensajes", "mensajes-servidor"]'),
    "Se puede abrir una foto desde cualquier conversacion"
);
comprobar(
    app.includes("punterosFotoChat"),
    "La foto se amplia con el pellizco del dedo"
);
comprobar(
    /Math\.abs\(deltaX\) > 60/.test(app),
    "Deslizando se pasa a la foto siguiente o anterior"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");