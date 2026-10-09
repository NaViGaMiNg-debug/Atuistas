/**
 * Prueba del reenvío de mensajes: se puede marcar cualquier mensaje visible
 * (mío o ajeno) en el chat privado y en el servidor, la papelera solo sale
 * con lo borrable, el botón de reenviar abre el modal y el backend copia
 * al chat privado del amigo (la ubicación en vivo llega congelada).
 *
 *   node deploy/probar-reenviar.mjs
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

const app = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const servicio = fs.readFileSync(path.join(raiz, "src", "services", "mensajes.service.ts"), "utf8");
const rutas = fs.readFileSync(path.join(raiz, "src", "routes", "mensajes.routes.ts"), "utf8");

/* ---------- Selección: cualquiera visible ---------- */

comprobar(
    !/function alternarSeleccionMensajeChat\([\s\S]{0,160}if \(!mensaje\.es_mio\) return;/.test(app),
    "En privado se puede marcar un mensaje ajeno"
);
comprobar(
    app.includes("function puedeBorrarSeleccionChat("),
    "La papelera privada se filtra por lo borrable"
);
comprobar(
    app.includes("botonReenviar") && app.includes("botonBorrar"),
    "La barra privada separa reenviar de borrar"
);
comprobar(
    app.includes("function puedeReenviarMensajeServidor("),
    "En servidor se puede marcar cualquiera visible"
);
comprobar(
    app.includes("function puedeBorrarSeleccionServidor("),
    "La papelera del servidor se filtra por lo borrable"
);
comprobar(
    app.includes('document.getElementById("boton-reenviar-seleccion-servidor")'),
    "El servidor tiene su botón de reenviar cableado"
);

/* ---------- Modal compartido ---------- */

comprobar(html.includes('id="modal-reenviar-mensaje"'), "El modal de reenviar está en el HTML");
comprobar(
    app.includes("function abrirModalReenviar(") && app.includes("function reenviarA("),
    "El modal se abre y envía al amigo elegido"
);
comprobar(
    app.includes('origen: reenvioPendiente.tipo === "servidor"'),
    "El modal recuerda si viene de privado o de servidor"
);

/* ---------- Backend ---------- */

comprobar(servicio.includes("export async function reenviarMensajes("), "Existe el servicio de reenvío");
comprobar(rutas.includes('"/api/mensajes/reenviar"'), "Existe la ruta de reenvío");
comprobar(
    servicio.includes("enVivo: false"),
    "La ubicación en vivo llega congelada, no en directo"
);
comprobar(
    servicio.includes("Hay mensajes ocultos que no puedes reenviar"),
    "Los ocultos ajenos no se pueden reenviar"
);
comprobar(
    servicio.includes("eliminarMensajesTexto"),
    "El borrado sigue existiendo aparte del reenvío"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");
