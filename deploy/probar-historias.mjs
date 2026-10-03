/**
 * Prueba del flujo de historias: crear una carpeta con nombre, anadir texto y
 * fotos, renombrarla, editarla, verla desde otro usuario y borrarla.
 *
 *   node deploy/probar-historias.mjs
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
    return { ok: respuesta.ok, datos };
}

// Foto minima en PNG (1x1) para las pruebas.
const fotoPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

async function anadirItem(token, historiaId, tipo, texto, archivos = 0) {
    const formulario = new FormData();
    formulario.append("tipo", tipo);
    formulario.append("texto", texto ?? "");
    for (let i = 0; i < archivos; i += 1) {
        formulario.append("archivo", new Blob([fotoPng], { type: "image/png" }), `foto-${i}.png`);
    }
    const respuesta = await fetch(`${base}/api/historias/${historiaId}/items`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formulario
    });
    return { ok: respuesta.ok, datos: await respuesta.json().catch(() => ({})) };
}

const sufijo = Date.now().toString().slice(-8);
const a = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `histA${sufijo}`, dispositivo_id: `histA-${sufijo}` }
});
const b = await api("/api/auth/registro", {
    metodo: "POST",
    cuerpo: { nombre: `histB${sufijo}`, dispositivo_id: `histB-${sufijo}` }
});
const tokenA = a.datos.usuario.token;
const tokenB = b.datos.usuario.token;
const idA = a.datos.usuario.id;

console.log(`Sesion de prueba ${sufijo}`);

/* ---------- Crear la carpeta ---------- */

const sinNombre = await api("/api/historias", { metodo: "POST", token: tokenA, cuerpo: { nombre: "  " } });
comprobar(!sinNombre.ok, `Una historia necesita nombre (${sinNombre.datos.error ?? ""})`);

const creada = await api("/api/historias", { metodo: "POST", token: tokenA, cuerpo: { nombre: "Ensayos" } });
comprobar(creada.ok, `Se crea la historia con nombre (${creada.datos.error ?? "ok"})`);
const historiaId = creada.datos.historia?.id;
comprobar(typeof historiaId === "string", "La historia creada trae id");

/* ---------- Anadir elementos ---------- */

const texto = await anadirItem(tokenA, historiaId, "texto", "Primer dia tocando");
comprobar(texto.ok, `Se anade un texto (${texto.datos.error ?? "ok"})`);

const fotos = await anadirItem(tokenA, historiaId, "imagen", "", 3);
comprobar(fotos.ok && fotos.datos.items.length === 3, `Se anaden 3 fotos (${fotos.datos.items?.length})`);

const vacio = await anadirItem(tokenA, historiaId, "texto", "   ");
comprobar(!vacio.ok, "Un texto vacio no se guarda");

/* ---------- Ver la historia ---------- */

const detalle = await api(`/api/historias/${historiaId}`, { token: tokenA });
comprobar(detalle.datos.historia.items.length === 4, `La historia tiene 4 elementos (${detalle.datos.historia?.items?.length})`);
comprobar(detalle.datos.historia.nombre === "Ensayos", "La historia conserva su nombre");

const mias = await api("/api/historias/mias", { token: tokenA });
comprobar(mias.datos.historias.length === 1, `Cuenta lista sus historias (${mias.datos.historias?.length})`);
comprobar(Boolean(mias.datos.historias[0].portada), "La historia trae la portada de la burbuja");

const deOtro = await api(`/api/usuarios/${idA}/historias`, { token: tokenB });
comprobar(deOtro.datos.historias.length === 1, "Otro usuario ve las historias en el perfil");

/* ---------- Editar ---------- */

const renombrada = await api(`/api/historias/${historiaId}`, { metodo: "PUT", token: tokenA, cuerpo: { nombre: "Ensayos 2026" } });
comprobar(renombrada.datos.historia?.nombre === "Ensayos 2026", "Se renombra la historia");

const ajena = await api(`/api/historias/${historiaId}`, { metodo: "PUT", token: tokenB, cuerpo: { nombre: "Mia" } });
comprobar(!ajena.ok, "Nadie mas puede renombrar una historia");

const itemId = detalle.datos.historia.items[0].id;
const borradoItem = await api(`/api/historias/${historiaId}/items/${itemId}`, { metodo: "DELETE", token: tokenA });
comprobar(borradoItem.ok, "Se borra un elemento");

const trasBorrar = await api(`/api/historias/${historiaId}`, { token: tokenA });
comprobar(trasBorrar.datos.historia.items.length === 3, `Quedan 3 elementos (${trasBorrar.datos.historia?.items?.length})`);

/* ---------- Borrar la historia ---------- */

const borrada = await api(`/api/historias/${historiaId}`, { metodo: "DELETE", token: tokenB });
comprobar(!borrada.ok, "Nadie mas puede borrar una historia");

const propia = await api(`/api/historias/${historiaId}`, { metodo: "DELETE", token: tokenA });
comprobar(propia.ok, `El autor borra la historia (${propia.datos.error ?? "ok"})`);

const miasFinal = await api("/api/historias/mias", { token: tokenA });
comprobar(miasFinal.datos.historias.length === 0, "La historia borrada ya no sale");

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");