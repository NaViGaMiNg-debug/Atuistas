/**
 * Prueba de las acciones nuevas sobre los estados:
 * - Likes: el corazon alterna (poner/quitar) y el feed trae likes y me_gusta.
 * - Denuncia: ruta /api/estados/:id/denuncias con motivo obligatorio 3-500,
 *   no repetida (unique) y solo para quien puede ver el estado.
 *
 *   node deploy/probar-estados-denuncia-like.mjs
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

const sufijo = Date.now().toString().slice(-8);
const autor = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `dena${sufijo}`, dispositivo_id: `denaA-${sufijo}` }
});
const lector = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `denb${sufijo}`, dispositivo_id: `denb-${sufijo}` }
});
comprobar(Boolean(autor.datos.usuario?.token && lector.datos.usuario?.token), `Dos cuentas de prueba (${sufijo})`);
const tokenAutor = autor.datos.usuario?.token;
const tokenLector = lector.datos.usuario?.token;

const estado = await api("/api/estados", {
    metodo: "POST",
    token: tokenAutor,
    cuerpo: { texto: "Estado para like y denuncia", visibilidad: "publica" }
});
comprobar(estado.ok, `Se publica un estado publico (${estado.datos.error ?? "ok"})`);
const estadoId = estado.datos.estado?.id;

/* ---------- Likes ---------- */

const sinLike = await api(`/api/estados/${estadoId}/like`, { metodo: "POST", token: tokenLector });
comprobar(
    sinLike.datos.me_gusta === true && sinLike.datos.likes === 1,
    `El like se pone y cuenta (${JSON.stringify(sinLike.datos)})`
);
const quitar = await api(`/api/estados/${estadoId}/like`, { metodo: "POST", token: tokenLector });
comprobar(
    quitar.datos.me_gusta === false && quitar.datos.likes === 0,
    `El like se quita al volver a pulsarlo (${JSON.stringify(quitar.datos)})`
);

const feed = await api("/api/estados?seccion=publica", { token: tokenLector });
const enFeed = (feed.datos.estados || []).find((item) => item.id === estadoId);
comprobar(typeof enFeed?.likes === "number", "El feed trae el contador de likes del estado");
comprobar(typeof enFeed?.me_gusta === "boolean", "El feed trae si a esta persona le gusta el estado");

/* ---------- Denuncia ---------- */

const motivoCorto = await api(`/api/estados/${estadoId}/denuncias`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { motivo: "no" }
});
comprobar(!motivoCorto.ok, `Un motivo de menos de 3 caracteres no pasa (${motivoCorto.datos.error ?? ""})`);

const sinToken = await api(`/api/estados/${estadoId}/denuncias`, {
    metodo: "POST",
    cuerpo: { motivo: "Este estado es inapropiado" }
});
comprobar(!sinToken.ok, `Sin sesion no se puede denunciar (${sinToken.status})`);

const valida = await api(`/api/estados/${estadoId}/denuncias`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { motivo: "Este estado es inapropiado" }
});
comprobar(valida.ok, `La denuncia con motivo valido se guarda (${valida.datos.error ?? "ok"})`);

const repetida = await api(`/api/estados/${estadoId}/denuncias`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { motivo: "Vuelvo a denunciar lo mismo" }
});
comprobar(!repetida.ok, `No se puede denunciar dos veces el mismo estado (${repetida.datos.error ?? ""})`);

// Un estado de amigos no se puede denunciar desde fuera de la amistad.
const privado = await api("/api/estados", {
    metodo: "POST",
    token: tokenAutor,
    cuerpo: { texto: "Solo para amigos", visibilidad: "amigos" }
});
const intruso = await api(`/api/estados/${privado.datos.estado?.id}/denuncias`, {
    metodo: "POST",
    token: tokenLector,
    cuerpo: { motivo: "Intento denunciar algo que no veo" }
});
comprobar(!intruso.ok, `Un desconocido no denuncia un estado de amigos (${intruso.datos.error ?? ""})`);

// Al borrar el estado, su denuncia se borra con el (cascada).
const borrado = await api(`/api/estados/${estadoId}`, { metodo: "DELETE", token: tokenAutor });
comprobar(borrado.ok, `El autor borra su estado (${borrado.datos.error ?? "ok"})`);

// Limpieza para no dejar basura.
await api(`/api/estados/${privado.datos.estado?.id}`, { metodo: "DELETE", token: tokenAutor });

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");
