/**
 * Prueba del flujo de notificaciones: aviso con el nombre de quien lo lanza,
 * enlaces profundos, mensajes sin leer que se limpian al abrir el chat y
 * preferencias guardadas sin boton.
 *
 *   node deploy/probar-notificaciones.mjs
 */
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
    if (!respuesta.ok) {
        throw new Error(datos.error || `Fallo ${respuesta.status} en ${ruta}`);
    }
    return datos;
}

const sufijo = Date.now().toString().slice(-8);
const a = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `avisoA${sufijo}`, dispositivo_id: `avisoA-${sufijo}` }
});
const b = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `avisoB${sufijo}`, dispositivo_id: `avisoB-${sufijo}` }
});

const tokenA = a.usuario.token;
const tokenB = b.usuario.token;
const idA = a.usuario.id;
const idB = b.usuario.id;

console.log(`Sesion de prueba ${sufijo}: ${a.usuario.nombre} y ${b.usuario.nombre}`);

/* ---------- Solicitud de amistad: aviso con remitente y enlace profundo ---------- */

await api("/api/amigos/solicitud", {
    metodo: "POST",
    token: tokenB,
    cuerpo: { destinatarioId: idA }
});

const avisos = await api("/api/notificaciones", { token: tokenA });
const solicitud = avisos.notificaciones.find((aviso) => aviso.tipo === "solicitud_amistad");

comprobar(Boolean(solicitud), "La solicitud de amistad genera un aviso");
comprobar(
    Boolean(solicitud && solicitud.titulo.startsWith(`${b.usuario.nombre} \u2014 `)),
    `El aviso lleva el nombre de quien lo lanza (${solicitud ? solicitud.titulo : "sin aviso"})`
);
comprobar(Boolean(solicitud && solicitud.datos && solicitud.datos.usuarioId === idB), "El aviso guarda el id para abrir el chat");
comprobar(avisos.no_leidas === 1, `Hay un aviso sin leer (${avisos.no_leidas})`);

const recibidas = await api("/api/amigos/solicitudes/recibidas", { token: tokenA });
await api("/api/amigos/solicitudes/aceptar", {
    metodo: "POST",
    token: tokenA,
    cuerpo: { solicitudId: recibidas.solicitudes[0].id }
});

/* ---------- Mensajes sin leer y limpieza al abrir el chat ---------- */

await api(`/api/mensajes/conversacion/${idA}`, {
    metodo: "POST",
    token: tokenB,
    cuerpo: { contenido: "Hola desde el otro chat" }
});
await api(`/api/mensajes/conversacion/${idA}`, {
    metodo: "POST",
    token: tokenB,
    cuerpo: { contenido: "Y un segundo mensaje" }
});

const conSinLeer = await api("/api/amigos", { token: tokenA });
comprobar(
    conSinLeer.amigos[0].mensajes_sin_leer === 2,
    `La lista de amigos cuenta los mensajes sin leer (${conSinLeer.amigos[0].mensajes_sin_leer})`
);

let abierto = true;
try {
    const carga = await api(`/api/mensajes/conversacion/${idB}`, { token: tokenA });
    comprobar(carga.mensajes.length === 2, `El chat devuelve los mensajes (${carga.mensajes.length})`);
} catch (error) {
    abierto = false;
    comprobar(false, `Abrir el chat responde bien: ${error.message}`);
}

if (abierto) {
    const trasAbrir = await api("/api/amigos", { token: tokenA });
    comprobar(
        trasAbrir.amigos[0].mensajes_sin_leer === 0,
        `Abrir el chat limpia el punto rojo (${trasAbrir.amigos[0].mensajes_sin_leer})`
    );
}

/* ---------- Preferencias y marcar todo leído ---------- */

const configuracion = await api("/api/notificaciones/configuracion", { token: tokenA });
await api("/api/notificaciones/configuracion", {
    metodo: "PUT",
    token: tokenA,
    cuerpo: { ...configuracion.configuracion, corazones: false }
});
const trasGuardar = await api("/api/notificaciones/configuracion", { token: tokenA });
comprobar(trasGuardar.configuracion.corazones === false, "Las preferencias se guardan sin boton de guardar");

await api("/api/notificaciones/leer-todas", { metodo: "POST", token: tokenA });
const trasLeer = await api("/api/notificaciones", { token: tokenA });
comprobar(trasLeer.no_leidas === 0, `Marcar todo leido vacia el punto rojo (${trasLeer.no_leidas})`);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");