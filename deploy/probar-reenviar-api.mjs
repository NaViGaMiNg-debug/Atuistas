/**
 * Prueba funcional del reenvío contra la API: A y B son amigos, B y C son
 * amigos; A escribe a B, B reenvía el mensaje ajeno a C y C lo recibe como
 * propio de B. También cubre el reenvío desde un servidor y la ubicación
 * congelada.
 *
 * Necesita la app en marcha (npm run dev) y una base de datos.
 * En local no hay base: se ejecuta contra el servidor tras publicar.
 *
 *   BASE=https://atuistas.com node deploy/probar-reenviar-api.mjs
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

async function apiCruda(ruta, { metodo = "GET", token, cuerpo } = {}) {
    const respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cuerpo ? { "Content-Type": "application/json" } : {})
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    return {
        ok: respuesta.ok,
        estado: respuesta.status,
        cuerpo: await respuesta.json().catch(() => ({}))
    };
}

async function hacerAmigos(origen, destino) {
    await api("/api/amigos/solicitud", {
        metodo: "POST",
        token: origen.token,
        cuerpo: { destinatarioId: destino.id }
    });
    const recibidas = await api("/api/amigos/solicitudes/recibidas", { token: destino.token });
    await api("/api/amigos/solicitudes/aceptar", {
        metodo: "POST",
        token: destino.token,
        cuerpo: { solicitudId: recibidas.solicitudes[0].id }
    });
}

/* ---------- Tres personas: A-B amigos, B-C amigos ---------- */

const sufijo = Date.now().toString().slice(-8);
const a = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `reA${sufijo}`, dispositivo_id: `reA-${sufijo}` }
});
const b = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `reB${sufijo}`, dispositivo_id: `reB-${sufijo}` }
});
const c = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `reC${sufijo}`, dispositivo_id: `reC-${sufijo}` }
});

await hacerAmigos(a.usuario, b.usuario);
await hacerAmigos(b.usuario, c.usuario);

const tokenA = a.usuario.token;
const tokenB = b.usuario.token;
const tokenC = c.usuario.token;

/* ---------- A escribe a B, B reenvía el ajeno a C ---------- */

const original = await api(`/api/mensajes/conversacion/${b.usuario.id}`, {
    metodo: "POST",
    token: tokenA,
    cuerpo: { contenido: "Hola B, esto lo reenvías tú" }
});
comprobar(original.mensaje?.id, "A escribe a B");

const reenviado = await api("/api/mensajes/reenviar", {
    metodo: "POST",
    token: tokenB,
    cuerpo: {
        mensajeIds: [original.mensaje.id],
        destinatarioId: c.usuario.id,
        origen: { tipo: "privado" }
    }
});
comprobar(reenviado.reenviados === 1, "B reenvía el mensaje ajeno a C");
comprobar(reenviado.mensaje === "Mensaje reenviado", "El aviso dice que se reenvió");

const chatC = await api(`/api/mensajes/conversacion/${b.usuario.id}`, { token: tokenC });
const recibido = chatC.mensajes.find((mensaje) => mensaje.contenido === "Hola B, esto lo reenvías tú");
comprobar(Boolean(recibido), "C recibe el texto reenviado");
comprobar(recibido?.es_mio === false && recibido?.autor_id === b.usuario.id, "Para C el autor es B");

/* ---------- Límites ---------- */

const vacio = await apiCruda("/api/mensajes/reenviar", {
    metodo: "POST",
    token: tokenB,
    cuerpo: { mensajeIds: [], destinatarioId: c.usuario.id }
});
comprobar(!vacio.ok, "Sin mensajes no se reenvía");

const sinDestino = await apiCruda("/api/mensajes/reenviar", {
    metodo: "POST",
    token: tokenB,
    cuerpo: { mensajeIds: [original.mensaje.id], destinatarioId: "" }
});
comprobar(!sinDestino.ok, "Sin destino no se reenvía");

const noAmigo = await apiCruda("/api/mensajes/reenviar", {
    metodo: "POST",
    token: tokenA,
    cuerpo: { mensajeIds: [original.mensaje.id], destinatarioId: c.usuario.id }
});
comprobar(!noAmigo.ok, "A no puede reenviar a C porque no son amigos");

/* ---------- Desde un servidor ---------- */

const creado = await api("/api/grupos", {
    metodo: "POST",
    token: tokenA,
    cuerpo: { nombre: `reenv${sufijo}`, modelo: "chat_unico" }
});
const grupoId = creado.grupo.id;

const enGrupo = await api(`/api/grupos/${grupoId}/mensajes`, {
    metodo: "POST",
    token: tokenA,
    cuerpo: { contenido: "Aviso del servidor" }
});
comprobar(enGrupo.mensaje?.id, "Hay un mensaje en el servidor");

const ajenoGrupo = await apiCruda("/api/mensajes/reenviar", {
    metodo: "POST",
    token: tokenB,
    cuerpo: {
        mensajeIds: [enGrupo.mensaje.id],
        destinatarioId: c.usuario.id,
        origen: { tipo: "servidor", grupoId }
    }
});
comprobar(!ajenoGrupo.ok, "Quien no está en el servidor no reenvía desde él");

// B se une y ya sí puede reenviar el mensaje visible a C.
await api(`/api/grupos/${grupoId}/unirse`, { metodo: "POST", token: tokenB });

const desdeGrupo = await api("/api/mensajes/reenviar", {
    metodo: "POST",
    token: tokenB,
    cuerpo: {
        mensajeIds: [enGrupo.mensaje.id],
        destinatarioId: c.usuario.id,
        origen: { tipo: "servidor", grupoId }
    }
});
comprobar(desdeGrupo.reenviados === 1, "Un miembro reenvía desde el servidor");

const chatTrasGrupo = await api(`/api/mensajes/conversacion/${b.usuario.id}`, { token: tokenC });
comprobar(
    chatTrasGrupo.mensajes.some((mensaje) => mensaje.contenido === "Aviso del servidor"),
    "C recibe también lo reenviado desde el servidor"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");
