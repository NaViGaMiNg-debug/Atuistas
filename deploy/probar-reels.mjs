/**
 * Prueba del flujo de reels: subir uno con titulo obligatorio, verlo en el
 * feed de amigos y en el publico, darle like, comentar y borrarlo.
 *
 *   node deploy/probar-reels.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const base = process.env.BASE || "http://127.0.0.1:3000";

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

async function api(ruta, { metodo = "GET", token, cuerpo } = {}) {
    const respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cuerpo ? { "Content-Type": "application/json" } : {})
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, status: respuesta.status, datos };
}

// Video de prueba: un MP4 minimo pero valido (ftyp + moov/mvhd + mdat), con
// la duracion que se le indica. ffprobe lo lee sin problema.
function caja(tipo, ...cargas) {
    const contenido = Buffer.concat(cargas);
    const cabecera = Buffer.alloc(8);
    cabecera.writeUInt32BE(contenido.length + 8, 0);
    cabecera.write(tipo, 4, "ascii");
    return Buffer.concat([cabecera, contenido]);
}

function entero(valor) {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(valor >>> 0, 0);
    return bytes;
}

function mvhd(segundos) {
    const bytes = Buffer.alloc(100);
    bytes.writeUInt32BE(1000, 12);
    bytes.writeUInt32BE(segundos * 1000, 16);
    bytes.writeUInt32BE(0x00010000, 20);
    bytes.writeUInt16BE(0x0100, 24);
    bytes.writeUInt32BE(0x00010000, 36);
    bytes.writeUInt32BE(0x00010000, 52);
    bytes.writeUInt32BE(0x40000000, 68);
    bytes.writeUInt32BE(2, 96);
    return bytes;
}

function mp4DePrueba(segundos) {
    return Buffer.concat([
        caja("ftyp", Buffer.from("isom", "ascii"), entero(0x200), Buffer.from("iso2avc1mp41", "ascii")),
        caja("moov", caja("mvhd", mvhd(segundos))),
        caja("mdat", Buffer.alloc(64, 0))
    ]);
}

const bufferVideo = mp4DePrueba(3);
async function subirReel(token, titulo, visibilidad) {
    const formulario = new FormData();
    formulario.append("titulo", titulo);
    formulario.append("visibilidad", visibilidad);
    formulario.append("archivo", new Blob([bufferVideo], { type: "video/mp4" }), "reel.mp4");
    const respuesta = await fetch(`${base}/api/reels`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formulario
    });
    return { ok: respuesta.ok, status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}
const sufijo = Date.now().toString().slice(-8);
const a = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `reelA${sufijo}`, dispositivo_id: `reelA-${sufijo}` }
});
const b = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `reelB${sufijo}`, dispositivo_id: `reelB-${sufijo}` }
});
const tokenA = a.datos.usuario.token;
const tokenB = b.datos.usuario.token;
const idA = a.datos.usuario.id;

console.log(`Sesion de prueba ${sufijo}`);

/* ---------- Subir ---------- */

const sinTitulo = await subirReel(tokenA, "   ", "amigos");
comprobar(!sinTitulo.ok, `Sin titulo no se puede subir (${sinTitulo.datos.error ?? ""})`);

const subido = await subirReel(tokenA, "Mi primer reel", "amigos");
comprobar(subido.ok, `Se sube un reel con titulo (${subido.datos.error ?? "ok"})`);
const reelId = subido.datos.reel?.id;
comprobar(typeof reelId === "string", "El reel creado trae id");

comprobar((await subirReel(tokenA, "Reel solo para amigos", "amigos")).ok, "Se sube un reel de amigos");
const subidoPublico = await subirReel(tokenA, "Reel publico", "publica");
comprobar(subidoPublico.ok, "Se sube un reel publico");
const reelPublicoId = subidoPublico.datos.reel?.id;

/* ---------- Feed ---------- */

const feedAmigos = await api("/api/reels", { token: tokenA });
const feedPublico = await api("/api/reels?seccion=publica", { token: tokenA });
const mios = feedAmigos.datos.reels.filter((reel) => reel.autor_id === idA);
comprobar(mios.length === 3, `El feed propio trae los 3 reels del usuario (${mios.length})`);
comprobar(mios.some((reel) => reel.visibilidad === "publica"), "El feed propio incluye el reel publico");
comprobar(
    (feedPublico.datos.reels || []).every((reel) => reel.visibilidad === "publica"),
    "El feed publico solo trae reels publicos"
);
comprobar(
    feedPublico.datos.reels.filter((reel) => reel.autor_id === idA).length === 1,
    "El feed publico trae solo el reel publico del usuario"
);
comprobar(Boolean(feedAmigos.datos.reels[0].video_url), "El reel trae la ruta del video");

const ajeno = await api("/api/reels", { token: tokenB });
comprobar(
    ajeno.datos.reels.every((reel) => reel.autor_id !== idA || reel.visibilidad === "publica"),
    "Un desconocido solo ve los reels publicos de los demas"
);

/* ---------- Like ---------- */

const like = await api(`/api/reels/${reelId}/like`, { metodo: "POST", token: tokenA });
comprobar(like.datos.me_gusta === true && like.datos.likes === 1, `El corazon se rellena y cuenta (${JSON.stringify(like.datos)})`);

const quitarLike = await api(`/api/reels/${reelId}/like`, { metodo: "POST", token: tokenA });
comprobar(quitarLike.datos.me_gusta === false && quitarLike.datos.likes === 0, "El corazon se quita al volver a pulsarlo");

/* ---------- Comentarios ---------- */

const comentario = await api(`/api/reels/${reelPublicoId}/comentarios`, {
    metodo: "POST",
    token: tokenB,
    cuerpo: { texto: "Buen reel" }
});
comprobar(comentario.ok, `Se puede comentar (${comentario.datos.error ?? "ok"})`);

const vacio = await api(`/api/reels/${reelPublicoId}/comentarios`, {
    metodo: "POST",
    token: tokenB,
    cuerpo: { texto: "   " }
});
comprobar(!vacio.ok, "Un comentario vacio no se guarda");

const comentarios = await api(`/api/reels/${reelPublicoId}/comentarios`, { token: tokenA });
comprobar(comentarios.datos.comentarios.length === 1, `Se leen los comentarios (${comentarios.datos.comentarios?.length})`);

const detalle = await api(`/api/reels/${reelPublicoId}`, { token: tokenA });
comprobar(detalle.datos.reel.comentarios === 1, "El detalle del reel trae el contador de comentarios");

/* ---------- Permisos y borrado ---------- */

comprobar(!(await api(`/api/reels/${reelId}`, { metodo: "DELETE", token: tokenB })).ok, "No se puede borrar el reel de otro");
comprobar(!(await api(`/api/reels/${reelId}/comentarios`, { token: tokenB })).ok, "Un desconocido no comenta en un reel de amigos");

const misReels = await api("/api/reels/mios", { token: tokenA });
comprobar(misReels.datos.reels.length === 3, `La cuenta lista sus reels (${misReels.datos.reels?.length})`);

const borrado = await api(`/api/reels/${reelId}`, { metodo: "DELETE", token: tokenA });
comprobar(borrado.ok, `El autor borra su reel (${borrado.datos.error ?? "ok"})`);

const trasBorrar = await api("/api/reels", { token: tokenA });
comprobar(!trasBorrar.datos.reels.some((reel) => reel.id === reelId), "El reel borrado ya no sale en el feed");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");