/**
 * Prueba de los poderes de desarrollador:
 *
 * - La cuenta marcada como desarrollador (la que se llama "Iván J.") puede
 *   poner etiqueta, nombre y descripcion a cualquier perfil, y borrar
 *   publicaciones, reels, estados e historias de otras personas.
 * - El resto de cuentas no puede tocar nada de los demas.
 * - La etiqueta sale en el perfil y la cuenta sin poderes no ve el botón.
 *
 * Para marcar la cuenta de prueba como desarrollador hay que tocar la base de
 * datos, así que este archivo es el único de las pruebas que no trabaja solo
 * con la API: conecta con PostgreSQL con los datos del .env, sube el permiso de
 * la cuenta recien creada y luego lo vuelve a quitar al terminar.
 *
 *   node deploy/probar-desarrollador.mjs
 */
import "dotenv/config";
import pg from "pg";

const base = process.env.BASE || "http://127.0.0.1:3000";
const { Pool } = pg;

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

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function marcarDesarrollador(usuarioId, activo) {
    await pool.query(
        `UPDATE usuarios SET es_desarrollador = $2::boolean WHERE id = $1`,
        [usuarioId, activo]
    );
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

const dev = await registro("dev");
const otro = await registro("otro");
const testigo = await registro("testigo");

console.log(`Sesion de prueba ${sufijo}: ${dev.nombre}, ${otro.nombre} y ${testigo.nombre}`);

try {
    /* ---------- Sin poderes no hay herramientas ---------- */

    const estadoInicial = await api("/api/desarrollador/estado", { token: dev.token });
    comprobar(
        estadoInicial.ok && estadoInicial.datos.es_desarrollador === false,
        "Una cuenta normal no tiene poderes de desarrollador"
    );

    const edicionSinPermiso = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { etiqueta: "Inventada" }
    });
    comprobar(!edicionSinPermiso.ok, "Una cuenta normal no puede editar a otra");

    const perfilSinPermiso = await api(`/api/perfil/${otro.id}`, { token: dev.token });
    comprobar(
        perfilSinPermiso.datos.perfil?.soy_desarrollador === false,
        "El perfil no marca al visitante como desarrollador"
    );

    /* ---------- El desarrollador etiqueta y edita ---------- */

    await marcarDesarrollador(dev.id, true);

    const estadoDev = await api("/api/desarrollador/estado", { token: dev.token });
    comprobar(
        estadoDev.ok && estadoDev.datos.es_desarrollador === true,
        "La cuenta marcada responde con poderes activos"
    );

    // El propio desarrollador recibe la etiqueta "Creador" si no tiene otra.
    await pool.query(`UPDATE usuarios SET etiqueta = NULL WHERE id = $1`, [dev.id]);
    const { rows: etiquetadoPorMigracion } = await pool.query(
        `SELECT 1 AS ok FROM usuarios WHERE id = $1 AND es_desarrollador = TRUE`,
        [dev.id]
    );
    comprobar(etiquetadoPorMigracion.length === 1, "El desarrollador sigue marcado tras reiniciar");

    const etiqueta = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { etiqueta: "Creador" }
    });
    comprobar(
        etiqueta.ok && etiqueta.datos.usuario?.etiqueta === "Creador",
        `El desarrollador pone la etiqueta (${etiqueta.datos.usuario?.etiqueta ?? etiqueta.datos.error})`
    );

    const perfilEtiquetado = await api(`/api/perfil/${otro.id}`, { token: testigo.token });
    comprobar(
        perfilEtiquetado.datos.perfil?.etiqueta === "Creador",
        "La etiqueta sale en el perfil de esa persona"
    );

    const nombre = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { nombre: `Renombrado${sufijo}` }
    });
    comprobar(
        nombre.ok && nombre.datos.usuario?.nombre === `Renombrado${sufijo}`,
        `El desarrollador cambia el nombre (${nombre.datos.usuario?.nombre ?? nombre.datos.error})`
    );

    const descripcion = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { descripcion: "Descripcion puesta por el desarrollador" }
    });
    comprobar(
        descripcion.ok && descripcion.datos.usuario?.descripcion === "Descripcion puesta por el desarrollador",
        "El desarrollador cambia la descripcion"
    );

    const nombreRepetido = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { nombre: dev.nombre }
    });
    comprobar(!nombreRepetido.ok, "No se puede poner a alguien un nombre que ya existe");

    const etiquetaLarga = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { etiqueta: "x".repeat(40) }
    });
    comprobar(!etiquetaLarga.ok, "La etiqueta corta si es demasiado larga");

    const soloEtiqueta = await api(`/api/desarrollador/usuarios/${otro.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { etiqueta: "Moderador" }
    });
    comprobar(
        soloEtiqueta.ok
            && soloEtiqueta.datos.usuario?.etiqueta === "Moderador"
            && soloEtiqueta.datos.usuario?.descripcion === "Descripcion puesta por el desarrollador",
        "Cambiar solo la etiqueta no toca el resto de datos"
    );

    /* ---------- Borrar contenido de otra persona ---------- */

    // Reel ajeno: se sube un mp4 mínimo igual que hace la prueba de reels.
    function caja(tipo, ...cargas) {
        const contenido = Buffer.concat(cargas);
        const cabecera = Buffer.alloc(8);
        cabecera.writeUInt32BE(contenido.length + 8, 0);
        cabecera.write(tipo, 4, "ascii");
        return Buffer.concat([cabecera, contenido]);
    }
    const entero = (valor) => {
        const bytes = Buffer.alloc(4);
        bytes.writeUInt32BE(valor >>> 0, 0);
        return bytes;
    };
    const mvhd = () => {
        const bytes = Buffer.alloc(100);
        bytes.writeUInt32BE(1000, 12);
        bytes.writeUInt32BE(3000, 16);
        bytes.writeUInt32BE(0x00010000, 20);
        bytes.writeUInt16BE(0x0100, 24);
        bytes.writeUInt32BE(0x00010000, 36);
        bytes.writeUInt32BE(0x00010000, 52);
        bytes.writeUInt32BE(0x40000000, 68);
        bytes.writeUInt32BE(2, 96);
        return bytes;
    };
    const mp4 = Buffer.concat([
        caja("ftyp", Buffer.from("isom", "ascii"), entero(0x200), Buffer.from("iso2avc1mp41", "ascii")),
        caja("moov", caja("mvhd", mvhd())),
        caja("mdat", Buffer.alloc(64, 0))
    ]);
    const formularioReel = new FormData();
    formularioReel.append("titulo", "Reel ajeno");
    formularioReel.append("visibilidad", "publica");
    formularioReel.append("archivo", new Blob([mp4], { type: "video/mp4" }), "reel.mp4");
    const subidaReel = await fetch(`${base}/api/reels`, {
        method: "POST",
        headers: { Authorization: `Bearer ${otro.token}` },
        body: formularioReel
    }).then((respuesta) => respuesta.json());
    comprobar(Boolean(subidaReel.reel?.id), "La otra persona sube un reel");

    const borrarReelAjeno = await api(`/api/reels/${subidaReel.reel.id}`, {
        metodo: "DELETE",
        token: testigo.token
    });
    comprobar(!borrarReelAjeno.ok, "Una cuenta normal no borra el reel ajeno");

    const borrarReel = await api(`/api/reels/${subidaReel.reel.id}`, {
        metodo: "DELETE",
        token: dev.token
    });
    comprobar(borrarReel.ok, "El desarrollador borra el reel de otra persona");

    const publicacion = await api("/api/publicaciones", {
        metodo: "POST",
        token: otro.token,
        cuerpo: { texto: "Publicacion de una persona normal" }
    });
    comprobar(publicacion.ok, "La otra persona sube una publicacion");

    const borrarSinPermiso = await api(`/api/publicaciones/${publicacion.datos.publicacion.id}`, {
        metodo: "DELETE",
        token: testigo.token
    });
    comprobar(!borrarSinPermiso.ok, "Una cuenta normal no borra contenido ajeno");

    const borrarConPermiso = await api(`/api/publicaciones/${publicacion.datos.publicacion.id}`, {
        metodo: "DELETE",
        token: dev.token
    });
    comprobar(borrarConPermiso.ok, "El desarrollador borra la publicacion de otra persona");

    const estado = await api("/api/estados", {
        metodo: "POST",
        token: otro.token,
        cuerpo: { texto: "Estado de otra persona", visibilidad: "publica" }
    });
    comprobar(estado.ok, "La otra persona sube un estado");

    const borrarEstado = await api(`/api/estados/${estado.datos.estado.id}`, {
        metodo: "DELETE",
        token: dev.token
    });
    comprobar(borrarEstado.ok, "El desarrollador borra el estado de otra persona");

    const historia = await api("/api/historias", {
        metodo: "POST",
        token: otro.token,
        cuerpo: { nombre: "Historia ajena" }
    });
    comprobar(historia.ok, "La otra persona crea una historia");

    const renombrarAjena = await api(`/api/historias/${historia.datos.historia.id}`, {
        metodo: "PUT",
        token: testigo.token,
        cuerpo: { nombre: "No es tuya" }
    });
    comprobar(!renombrarAjena.ok, "Una cuenta normal no renombra una historia ajena");

    const borrarHistoria = await api(`/api/historias/${historia.datos.historia.id}`, {
        metodo: "DELETE",
        token: dev.token
    });
    comprobar(borrarHistoria.ok, "El desarrollador borra la historia de otra persona");

    /* ---------- La etiqueta del desarrollador ---------- */

    await api(`/api/desarrollador/usuarios/${dev.id}`, {
        metodo: "PUT",
        token: dev.token,
        cuerpo: { etiqueta: "Creador" }
    });
    const perfilDev = await api(`/api/perfil/${dev.id}`, { token: testigo.token });
    comprobar(
        perfilDev.datos.perfil?.etiqueta === "Creador",
        "El perfil del desarrollador puede decir Creador"
    );
} finally {
    await marcarDesarrollador(dev.id, false);
    await pool.end();
}

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");