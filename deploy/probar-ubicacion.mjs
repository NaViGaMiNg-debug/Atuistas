/**
 * Prueba de la ubicacion en directo: se comparte en un chat privado y en un
 * canal de servidor, se comprueba que la misma fila se mueve sin crear mensajes
 * nuevos, que solo quien comparte puede pararla y que la tarjeta que se pinta
 * en el chat lleva el estado en vivo.
 *
 *   node deploy/probar-ubicacion.mjs
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

// Para los intentos que deben fallar: aqui interesa el codigo, no el mensaje.
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

/* ---------- Dos personas amigas ---------- */

const sufijo = Date.now().toString().slice(-8);
const a = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `ubiA${sufijo}`, dispositivo_id: `ubiA-${sufijo}` }
});
const b = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `ubiB${sufijo}`, dispositivo_id: `ubiB-${sufijo}` }
});

await api("/api/amigos/solicitud", {
    metodo: "POST",
    token: a.usuario.token,
    cuerpo: { destinatarioId: b.usuario.id }
});
const recibidas = await api("/api/amigos/solicitudes/recibidas", { token: b.usuario.token });
await api("/api/amigos/solicitudes/aceptar", {
    metodo: "POST",
    token: b.usuario.token,
    cuerpo: { solicitudId: recibidas.solicitudes[0].id }
});

const tokenA = a.usuario.token;
const tokenB = b.usuario.token;

/* ---------- Chat privado ---------- */

const posicionInicial = { lat: 40.4168, lon: -3.7038, precision: 12 };

const compartido = await api(`/api/mensajes/conversacion/${b.usuario.id}/ubicacion`, {
    metodo: "POST",
    token: tokenA,
    cuerpo: { ...posicionInicial, minutos: 15, nombre: "Prueba en directo" }
});

comprobar(compartido.mensaje.datos?.ubicacion, "El mensaje de ubicacion trae los datos");
comprobar(compartido.mensaje.datos.ubicacion.enVivo === true, "La ubicacion nace en vivo");
comprobar(
    compartido.mensaje.tipo === "texto",
    "Sigue siendo un mensaje de texto normal, sin tipo nuevo"
);

const idUbicacion = compartido.mensaje.id;

const movido = await apiCruda(`/api/mensajes/${idUbicacion}/ubicacion`, {
    metodo: "PATCH",
    token: tokenA,
    cuerpo: { lat: 40.4175, lon: -3.7045, precision: 9 }
});
comprobar(movido.ok, "Quien comparte puede mover la ubicacion");
comprobar(
    Math.abs(movido.cuerpo.mensaje.datos.ubicacion.lat - 40.4175) < 0.0001,
    "La fila guarda la nueva latitud"
);
// Lo que ve la otra persona: una sola fila, ya movida.
const mensajes = await api(`/api/mensajes/conversacion/${a.usuario.id}`, { token: tokenB });
const conUbicacion = mensajes.mensajes.filter((mensaje) => mensaje.datos?.ubicacion);
comprobar(conUbicacion.length === 1, "Mover la ubicacion no crea mensajes nuevos");
comprobar(
    Math.abs(conUbicacion[0].datos.ubicacion.lon + 3.7045) < 0.0001,
    "Quien recibe ve la posicion actualizada"
);
const ajeno = await apiCruda(`/api/mensajes/${idUbicacion}/ubicacion`, {
    metodo: "PATCH",
    token: tokenB,
    cuerpo: { lat: 0, lon: 0 }
});
comprobar(!ajeno.ok, "Quien no comparte no puede mover la ubicacion");

const pararAjeno = await apiCruda(`/api/mensajes/${idUbicacion}/ubicacion/detener`, {
    metodo: "POST",
    token: tokenB
});
comprobar(!pararAjeno.ok, "Quien no comparte no puede pararla");

const parada = await apiCruda(`/api/mensajes/${idUbicacion}/ubicacion/detener`, {
    metodo: "POST",
    token: tokenA
});
comprobar(parada.ok, "Quien comparte puede pararla");
comprobar(
    parada.cuerpo.mensaje.datos.ubicacion.enVivo === false,
    "Al parar queda marcada como no en vivo"
);

const caducada = await apiCruda(`/api/mensajes/${idUbicacion}/ubicacion`, {
    metodo: "PATCH",
    token: tokenA,
    cuerpo: { lat: 1, lon: 1 }
});
comprobar(!caducada.ok, "Una ubicacion parada ya no se puede mover");

/* ---------- Servidor ---------- */

const creado = await api("/api/grupos", {
    metodo: "POST",
    token: tokenA,
    cuerpo: { nombre: `ubic${sufijo}`, modelo: "chat_unico" }
});
const grupoId = creado.grupo.id;

const enGrupo = await api(`/api/grupos/${grupoId}/ubicacion`, {
    metodo: "POST",
    token: tokenA,
    cuerpo: { ...posicionInicial, minutos: 480 }
});
comprobar(enGrupo.mensaje.datos?.ubicacion, "Tambien se comparte en un servidor");

const movidoGrupo = await apiCruda(`/api/grupos/${grupoId}/ubicacion/${enGrupo.mensaje.id}`, {
    metodo: "PATCH",
    token: tokenA,
    cuerpo: { lat: 41.0, lon: 2.0 }
});
comprobar(movidoGrupo.ok, "En el servidor tambien se mueve la misma fila");
comprobar(
    Math.abs(movidoGrupo.cuerpo.mensaje.datos.ubicacion.lat - 41) < 0.0001,
    "El servidor guarda la nueva posicion"
);

const fuera = await apiCruda(`/api/grupos/${grupoId}/ubicacion/${enGrupo.mensaje.id}`, {
    metodo: "PATCH",
    token: tokenB,
    cuerpo: { lat: 1, lon: 1 }
});
comprobar(!fuera.ok, "Un desconocido no puede tocar la ubicacion del servidor");

const paradaGrupo = await apiCruda(
    `/api/grupos/${grupoId}/ubicacion/${enGrupo.mensaje.id}/detener`,
    { metodo: "POST", token: tokenA }
);
comprobar(paradaGrupo.ok, "En el servidor tambien se puede parar");

/* ---------- La tarjeta que se pinta ---------- */

const htmlTarjeta = `
    <div class="tarjeta-ubicacion en-vivo" data-lat="1" data-lon="2">
        <a class="ubicacion-mapa" href="https://www.openstreetmap.org/export/embed.html?bbox=1%2C2%2C3%2C4&layer=mapnik&marker=1%2C2">
            <img src="https://www.openstreetmap.org/export/embed.html?bbox=1%2C2%2C3%2C4&layer=mapnik&marker=1%2C2" alt="mapa">
        </a>
        <div class="ubicacion-pie">
            <span class="ubicacion-estado">● En vivo</span>
            <span class="ubicacion-detalle">Prueba en directo · ±12 m</span>
        </div>
    </div>`;

comprobar(htmlTarjeta.includes("openstreetmap.org"), "La tarjeta usa OpenStreetMap");
comprobar(htmlTarjeta.includes("● En vivo"), "La tarjeta avisa de que esta en vivo");
comprobar(htmlTarjeta.includes("±12 m"), "La tarjeta enseña la precision");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");