/**
 * Prueba de los apodos y del fondo de perfil:
 *
 * - Cada persona le pone el apodo que quiere a quien quiera y solo ella lo ve.
 * - El apodo sustituye al nombre real en los avisos, pero la otra persona sigue
 *   viendo su nombre de verdad.
 * - La imagen de fondo se sube, se ve en el perfil de los demas y se quita.
 *
 *   node deploy/probar-apodos.mjs
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
    return { ok: respuesta.ok, status: respuesta.status, datos };
}

// PNG de 1x1: sirve para probar la subida del fondo sin traer imagenes grandes.
const PNG_UN_PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

async function subirFondo(token, nombre = "fondo.png") {
    const formulario = new FormData();
    formulario.append("archivo", new Blob([PNG_UN_PIXEL], { type: "image/png" }), nombre);
    const respuesta = await fetch(`${base}/api/auth/fondo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formulario
    });
    return { ok: respuesta.ok, datos: await respuesta.json().catch(() => ({})) };
}

const sufijo = Date.now().toString().slice(-8);
const registro = async (nombre) => {
    const respuesta = await api("/api/auth/registro", {
        metodo: "POST",
        cuerpo: { nombre: `${nombre}${sufijo}`, dispositivo_id: `${nombre}-${sufijo}` }
    });
    if (!respuesta.ok) throw new Error(`No se pudo crear ${nombre}: ${JSON.stringify(respuesta.datos)}`);
    return respuesta.datos.usuario;
};

const ana = await registro("ana");
const ben = await registro("ben");

console.log(`Sesion de prueba ${sufijo}: ${ana.nombre} y ${ben.nombre}`);

/* ---------- Apodos privados ---------- */

const ninguno = await api("/api/apodos", { token: ana.token });
comprobar(
    ninguno.ok && Array.isArray(ninguno.datos.apodos) && ninguno.datos.apodos.length === 0,
    "La lista de apodos empieza vacia"
);

const puesto = await api(`/api/apodos/${ben.id}`, {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "Prima" }
});
comprobar(
    puesto.ok && puesto.datos.apodo?.apodo === "Prima",
    `Ana le pone un apodo a Ben (${puesto.datos.apodo?.apodo ?? puesto.datos.error})`
);

const deAna = await api("/api/apodos", { token: ana.token });
comprobar(
    deAna.datos.apodos.length === 1 && deAna.datos.apodos[0].apodo === "Prima",
    "El apodo aparece en la lista de quien lo puso"
);

const deBen = await api("/api/apodos", { token: ben.token });
comprobar(
    deBen.datos.apodos.length === 0,
    "Ben no ve el apodo que le puso Ana: es privado"
);

const cambiar = await api(`/api/apodos/${ben.id}`, {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "Vecina" }
});
comprobar(cambiar.ok && cambiar.datos.apodo?.apodo === "Vecina", "El apodo se cambia");

const aSiMismo = await api(`/api/apodos/${ana.id}`, {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "Yo" }
});
comprobar(!aSiMismo.ok, "No se puede poner un apodo a uno mismo");

const largo = await api(`/api/apodos/${ben.id}`, {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "x".repeat(40) }
});
comprobar(!largo.ok, "El apodo se corta si es demasiado largo");

const inexistente = await api("/api/apodos/00000000-0000-0000-0000-000000000000", {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "Fantasma" }
});
comprobar(!inexistente.ok, "No se puede poner apodo a quien no existe");

/* ---------- El apodo sale en los avisos, el nombre real sigue intacto ---------- */

// Para poder escribirse hacen faltaser amigos: se piden y se aceptan.
await api("/api/amigos/solicitud", {
    metodo: "POST",
    token: ana.token,
    cuerpo: { destinatarioId: ben.id }
});
const recibidas = await api("/api/amigos/solicitudes/recibidas", { token: ben.token });
await api("/api/amigos/solicitudes/aceptar", {
    metodo: "POST",
    token: ben.token,
    cuerpo: { solicitudId: recibidas.datos.solicitudes[0].id }
});

// El apodo que cuenta en un aviso es el que le puso quien lo recibe: Ben le
// pone uno a Ana y el aviso que Ana recibe sale con ese apodo.
await api(`/api/apodos/${ana.id}`, {
    metodo: "PUT",
    token: ben.token,
    cuerpo: { apodo: "Novia" }
});

await api(`/api/mensajes/conversacion/${ben.id}`, {
    metodo: "POST",
    token: ana.token,
    cuerpo: { contenido: "Hola desde Ana" }
});

const avisosDeBen = await api("/api/notificaciones", { token: ben.token });
const aviso = avisosDeBen.datos.notificaciones.find((n) => n.tipo === "mensaje_privado");
comprobar(Boolean(aviso), "El mensaje genera aviso");
comprobar(
    Boolean(aviso && aviso.titulo.startsWith("Novia — ")),
    `El aviso sale con el apodo que le puso quien lo recibe (${aviso ? aviso.titulo : "sin aviso"})`
);

const cuentaDeBen = await api("/api/auth/me", { token: ben.token });
comprobar(
    cuentaDeBen.datos.usuario.nombre === ben.nombre,
    "Ben sigue viendo su nombre real en su cuenta"
);

const vacio = await api(`/api/apodos/${ben.id}`, {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "" }
});
comprobar(vacio.ok && vacio.datos.apodo?.apodo === null, "Un apodo vacio lo quita");

const trasQuitar = await api("/api/apodos", { token: ana.token });
comprobar(trasQuitar.datos.apodos.length === 0, "Tras quitarlo la lista vuelve a estar vacia");

const puestoOtra = await api(`/api/apodos/${ben.id}`, {
    metodo: "PUT",
    token: ana.token,
    cuerpo: { apodo: "Prima" }
});
comprobar(puestoOtra.ok, "Se puede volver a poner un apodo");

const borrado = await api(`/api/apodos/${ben.id}`, { metodo: "DELETE", token: ana.token });
comprobar(borrado.ok, "El apodo se puede borrar directamente");

/* ---------- Fondo del perfil ---------- */

const sinFondo = await api("/api/auth/me", { token: ana.token });
comprobar(!sinFondo.datos.usuario.fondo_ruta, "La cuenta empieza sin fondo");

const subida = await subirFondo(ana.token);
comprobar(
    subida.ok && typeof subida.datos.fondo_url === "string",
    `Se sube la imagen de fondo (${subida.datos.fondo_url ?? subida.datos.error})`
);

const conFondo = await api("/api/auth/me", { token: ana.token });
comprobar(Boolean(conFondo.datos.usuario.fondo_ruta), "La cuenta recuerda su fondo");

const perfilDeAna = await api(`/api/perfil/${ana.id}`, { token: ben.token });
comprobar(
    Boolean(perfilDeAna.datos.perfil?.fondo_url),
    "Ben ve el fondo de Ana en su perfil"
);

const perfilDeBen = await api(`/api/perfil/${ben.id}`, { token: ana.token });
comprobar(!perfilDeBen.datos.perfil?.fondo_url, "Quien no tiene fondo no pone ninguno");

// Subir otro fondo cambia el anterior: no se acumulan archivos.
const segundo = await subirFondo(ana.token, "otro.png");
comprobar(segundo.ok && segundo.datos.fondo_url !== subida.datos.fondo_url, "El fondo se reemplaza");

const quitado = await api("/api/auth/fondo", { metodo: "DELETE", token: ana.token });
comprobar(quitado.ok, "El fondo se puede quitar");

const sinFondoYa = await api("/api/auth/me", { token: ana.token });
comprobar(!sinFondoYa.datos.usuario.fondo_ruta, "Tras quitarlo la cuenta se queda sin fondo");

const fondoAjeno = await api("/api/auth/fondo", { metodo: "DELETE", token: ben.token });
comprobar(fondoAjeno.ok, "Quitar un fondo que no existe no falla");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");