/**
 * Pruebas de moderación de cuentas (v45):
 *
 * - Denunciar: motivo obligatorio 3-500, una sola denuncia por cuenta,
 *   no se puede denunciar al Creador.
 * - Bloquear: rompe la amistad y el chat desaparece de la lista.
 * - Eliminar: solo Creador/Admin; Creador intocable; Admin solo lo
 *   elimina Creador; borrado total con tumba; al reentrar con el
 *   código viejo se le dice quién la borró y con qué rol.
 *
 * Arranca el servidor, crea cuentas de prueba, las borra al terminar.
 *
 *   node deploy/probar-moderacion.mjs
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { Pool } from "pg";

const PUERTO = Number(process.env.PORT ?? 3000);
const BASE = `http://127.0.0.1:${PUERTO}`;
const raiz = path.join(import.meta.dirname, "..");

const app = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

let fallos = 0;
function comprobar(condicion, mensaje) {
    if (condicion) {
        console.log(`  ok  ${mensaje}`);
    } else {
        fallos += 1;
        console.log(`FALLO ${mensaje}`);
    }
}

async function api(ruta, { metodo = "GET", token, cuerpo } = {}) {
    const respuesta = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: {
            ...(cuerpo ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const datos = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, status: respuesta.status, datos };
}

async function registrar(nombre) {
    const resultado = await api("/api/auth/registro", {
        metodo: "POST",
        cuerpo: {
            nombre,
            dispositivo_id: `prueba-mod-${nombre}-${Math.random().toString(16).slice(2)}`
        }
    });
    if (!resultado.ok) {
        throw new Error(`No se pudo registrar ${nombre}: ${JSON.stringify(resultado.datos)}`);
    }
    return {
        id: resultado.datos.usuario.id,
        nombre: resultado.datos.usuario.nombre,
        token: resultado.datos.usuario.token,
        codigo: resultado.datos.usuario.codigo_vinculacion
    };
}

let servidor = null;

async function arrancarServidor() {
    servidor = spawn("npx", ["tsx", "src/app.ts"], {
        cwd: process.cwd(),
        stdio: "ignore",
        shell: true
    });
    for (let intento = 0; intento < 60; intento += 1) {
        await esperar(1000);
        try {
            const respuesta = await fetch(`${BASE}/`);
            if (respuesta.ok) return;
        } catch {
            // Todavía no escucha: se vuelve a intentar.
        }
    }
    throw new Error("El servidor no llegó a escuchar en el puerto");
}

async function pararServidor() {
    if (!servidor) return;
    // En Windows el npx deja vivo al hijo tsx: se mata el árbol entero o
    // el puerto seguiría ocupado con un servidor viejo en la siguiente prueba.
    if (process.platform === "win32" && servidor.pid) {
        spawn("taskkill", ["/PID", String(servidor.pid), "/T", "/F"], {
            stdio: "ignore",
            shell: true
        });
    } else {
        servidor.kill();
    }
    servidor = null;
    await esperar(500);
}

const nombresPrueba = [];

try {
    /* ---------- El cliente lo que debe tener ---------- */

    comprobar(
        app.includes("CLAVE_CHATS_FIJADOS") && app.includes("ordenarAmigosConFijados"),
        "app.js guarda los chats fijados del movil y los pone arriba"
    );
    comprobar(
        app.includes('estaChatFijado(cuenta.id) ? "DESFIJAR" : "FIJAR"'),
        "Si el chat ya esta fijado el boton dice DESFIJAR"
    );
    comprobar(
        css.includes(".chat-amigo-pin") && html.includes("modal-acciones-cuenta"),
        "Los chats fijados llevan chincheta y existe el menu de acciones"
    );
    comprobar(
        app.includes("/api/denuncias/cuentas")
            && app.includes("entre 3 y 500 caracteres"),
        "El cliente denuncia con motivo obligatorio"
    );
    comprobar(
        app.includes("/api/bloqueos") && app.includes("¿Seguro de que quieres bloquear"),
        "Bloquear pregunta si estas seguro"
    );
    comprobar(
        app.includes("/api/admin/usuarios/")
            && app.includes("Escribe ELIMINAR en mayúsculas"),
        "Eliminar pide escribir ELIMINAR y usa la ruta de admin"
    );
    comprobar(
        html.includes('id="modal-cuenta-eliminada"')
            && app.includes("mostrarAvisoCuentaEliminada"),
        "Existe el aviso de cuenta eliminada con quien y rol"
    );
    comprobar(
        app.includes("miEtiquetaEsModeradora")
            && app.includes('etiqueta === "Creador" || etiqueta === "Admin"'),
        "La opcion eliminar solo se muestra a Creador o Admin"
    );
    comprobar(
        app.includes("/api/silencios")
            && app.includes('"QUITAR SILENCIO" : "SILENCIAR"')
            && html.includes('id="boton-cuenta-silenciar"'),
        "El menu de chats silencia y quita el silencio"
    );
    comprobar(
        css.includes(".chat-amigo-silencio"),
        "El chat silenciado lleva su campanita tachada"
    );

    await arrancarServidor();

    const creadora = await registrar(`ModCreador${Date.now().toString().slice(-5)}`);
    const admin = await registrar(`ModAdmin${Date.now().toString().slice(-5)}`);
    const normal = await registrar(`ModNormal${Date.now().toString().slice(-5)}`);
    nombresPrueba.push(creadora.id, admin.id, normal.id);

    await pool.query(
        `UPDATE usuarios SET etiqueta = 'Creador' WHERE id = $1`,
        [creadora.id]
    );
    await pool.query(
        `UPDATE usuarios SET etiqueta = 'Admin' WHERE id = $1`,
        [admin.id]
    );

    /* ---------- Denunciar ---------- */

    const motivoCorto = await api("/api/denuncias/cuentas", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { denunciadoId: admin.id, motivo: "ab" }
    });
    comprobar(
        !motivoCorto.ok,
        "Un motivo de 2 caracteres no se acepta"
    );

    const denunciaValida = await api("/api/denuncias/cuentas", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { denunciadoId: admin.id, motivo: "Spam repetido en el chat" }
    });
    comprobar(denunciaValida.ok, "La denuncia con motivo valido se guarda");

    const denunciaRepetida = await api("/api/denuncias/cuentas", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { denunciadoId: admin.id, motivo: "Otra vez por si acaso" }
    });
    comprobar(
        denunciaRepetida.status === 409,
        "No se puede denunciar dos veces a la misma cuenta"
    );

    const denunciaCreador = await api("/api/denuncias/cuentas", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { denunciadoId: creadora.id, motivo: "Intento de denuncia al Creador" }
    });
    comprobar(
        !denunciaCreador.ok,
        "Al Creador no se le puede denunciar"
    );

    const oculta = await pool.query(
        `SELECT etiqueta FROM usuarios WHERE id = $1`,
        [admin.id]
    );
    comprobar(
        oculta.rows[0]?.etiqueta === "Admin",
        "La denuncia no toca la etiqueta visible de la cuenta"
    );

    /* ---------- Bloquear ---------- */

    const solicitud = await api("/api/amigos/solicitud", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { destinatarioId: admin.id }
    });
    comprobar(solicitud.ok, "La solicitud de amistad se envia");

    const solicitudes = await api("/api/amigos/solicitudes/recibidas", {
        token: admin.token
    });
    const pendiente = solicitudes.datos.solicitudes?.find(
        (fila) => fila.emisor_id === normal.id
    );
    comprobar(Boolean(pendiente), "El Admin recibe la solicitud");

    const aceptar = await api("/api/amigos/solicitudes/aceptar", {
        metodo: "POST",
        token: admin.token,
        cuerpo: { solicitudId: pendiente?.id }
    });
    comprobar(aceptar.ok, "El Admin acepta la solicitud");

    const amigosAntes = await api("/api/amigos", { token: normal.token });
    comprobar(
        (amigosAntes.datos.amigos ?? []).some((fila) => fila.id === admin.id),
        "El chat aparece en la lista antes del bloqueo"
    );

    const bloqueo = await api("/api/bloqueos", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { bloqueadoId: admin.id }
    });
    comprobar(bloqueo.ok, "El bloqueo total se aplica");

    const amigosDespues = await api("/api/amigos", { token: normal.token });
    comprobar(
        !(amigosDespues.datos.amigos ?? []).some((fila) => fila.id === admin.id),
        "Tras bloquear, el chat desaparece de la lista (amistad rota)"
    );

    const solicitudTrasBloqueo = await api("/api/amigos/solicitud", {
        metodo: "POST",
        token: admin.token,
        cuerpo: { destinatarioId: normal.id }
    });
    comprobar(
        !solicitudTrasBloqueo.ok,
        "Tras el bloqueo no se pueden enviar solicitudes"
    );

    /* ---------- Silenciar ---------- */

    const segunda = await registrar(`ModSilencio${Date.now().toString().slice(-5)}`);
    nombresPrueba.push(segunda.id);

    const solicitudSilencio = await api("/api/amigos/solicitud", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { destinatarioId: segunda.id }
    });
    comprobar(solicitudSilencio.ok, "Se envia una solicitud para probar el silencio");

    const recibidasSegunda = await api("/api/amigos/solicitudes/recibidas", {
        token: segunda.token
    });
    const pendienteSegunda = recibidasSegunda.datos.solicitudes?.find(
        (fila) => fila.emisor_id === normal.id
    );
    const aceptarSegunda = await api("/api/amigos/solicitudes/aceptar", {
        metodo: "POST",
        token: segunda.token,
        cuerpo: { solicitudId: pendienteSegunda?.id }
    });
    comprobar(aceptarSegunda.ok, "Se acepta la solicitud del silencio");

    const silencio = await api("/api/silencios", {
        metodo: "POST",
        token: normal.token,
        cuerpo: { silenciadoId: segunda.id }
    });
    comprobar(
        silencio.ok && silencio.datos.mensaje === "Chat silenciado",
        `El chat se silencia${silencio.ok ? "" : ` (${silencio.status}: ${JSON.stringify(silencio.datos)})`}`
    );

    const listaSilenciada = await api("/api/amigos", { token: normal.token });
    const chatSilenciado = (listaSilenciada.datos.amigos ?? []).find(
        (fila) => fila.id === segunda.id
    );
    comprobar(
        chatSilenciado?.es_silenciado === true,
        "La lista de chats marca el chat como silenciado"
    );

    const antesAviso = await pool.query(
        `SELECT COUNT(*)::int AS total FROM notificaciones
          WHERE usuario_id = $1 AND autor_id = $2`,
        [normal.id, segunda.id]
    );
    await api("/api/mensajes/conversacion", {
        metodo: "POST",
        token: segunda.token,
        cuerpo: { destinatarioId: normal.id }
    }).catch(() => {});
    await api(`/api/mensajes/conversacion/${segunda.id}`, {
        metodo: "POST",
        token: segunda.token,
        cuerpo: { contenido: "Mensaje con el silencio puesto" }
    }).catch(() => {});
    const despuesAviso = await pool.query(
        `SELECT COUNT(*)::int AS total FROM notificaciones
          WHERE usuario_id = $1 AND autor_id = $2`,
        [normal.id, segunda.id]
    );
    comprobar(
        despuesAviso.rows[0].total === antesAviso.rows[0].total,
        "Con el silencio puesto no se crea ningun aviso"
    );

    const quitarSilencio = await api(`/api/silencios/${segunda.id}`, {
        metodo: "DELETE",
        token: normal.token
    });
    comprobar(quitarSilencio.ok, "El silencio se puede quitar");

    const listaSinSilencio = await api("/api/amigos", { token: normal.token });
    comprobar(
        (listaSinSilencio.datos.amigos ?? []).find(
            (fila) => fila.id === segunda.id
        )?.es_silenciado === false,
        "Tras quitarlo el chat deja de estar silenciado"
    );

    /* ---------- Eliminar por rol ---------- */

    const sinPermisos = await api(`/api/admin/usuarios/${admin.id}`, {
        metodo: "DELETE",
        token: normal.token
    });
    comprobar(
        sinPermisos.status === 403,
        "Una cuenta normal no puede eliminar a nadie"
    );

    const adminAlCreador = await api(`/api/admin/usuarios/${creadora.id}`, {
        metodo: "DELETE",
        token: admin.token
    });
    comprobar(
        adminAlCreador.status === 403,
        "Un Admin no puede eliminar a la Creador"
    );

    const autoBorrado = await api(`/api/admin/usuarios/${admin.id}`, {
        metodo: "DELETE",
        token: admin.token
    });
    comprobar(
        !autoBorrado.ok,
        "Nadie puede eliminarse a si mismo desde aqui"
    );

    const borrado = await api(`/api/admin/usuarios/${normal.id}`, {
        metodo: "DELETE",
        token: admin.token
    });
    comprobar(borrado.ok, "El Admin elimina a una cuenta normal");

    const borrada = await pool.query(
        `SELECT id FROM usuarios WHERE id = $1`,
        [normal.id]
    );
    comprobar(
        borrada.rowCount === 0,
        "La cuenta eliminada no existe en la base de datos"
    );

    const tumba = await pool.query(
        `SELECT nombre, borrado_por_nombre, borrado_por_rol,
                codigo_vinculacion_hash
           FROM tumbas_cuentas WHERE usuario_id = $1`,
        [normal.id]
    );
    comprobar(
        tumba.rowCount === 1
            && tumba.rows[0].borrado_por_nombre === admin.nombre
            && tumba.rows[0].borrado_por_rol === "Admin",
        "La tumba guarda quien la borro y su rol"
    );
    comprobar(
        Boolean(tumba.rows[0]?.codigo_vinculacion_hash),
        "La tumba guarda el codigo de vinculacion para avisar al reentrar"
    );

    /* ---------- Reentrada con el codigo viejo ---------- */

    const reentrada = await api("/api/auth/vincular", {
        metodo: "POST",
        cuerpo: {
            codigo: normal.codigo,
            dispositivo_id: `prueba-mod-reentrada-${Date.now()}`
        }
    });
    comprobar(
        reentrada.status === 401 && Boolean(reentrada.datos.cuenta_eliminada),
        "Al reentrar con el codigo viejo se le dice que su cuenta fue eliminada"
    );
    comprobar(
        reentrada.datos.cuenta_eliminada?.borrado_por_rol === "Admin",
        "El aviso indica el rol de quien la borro"
    );

} catch (error) {
    fallos += 1;
    console.error("FALLO en la prueba de moderacion:", error.message);
} finally {
    // Limpieza: las cuentas de prueba se borran por CASCADE al borrarlas.
    if (nombresPrueba.length > 0) {
        await pool.query(
            `DELETE FROM usuarios WHERE id = ANY($1::uuid[])`,
            [nombresPrueba]
        ).catch(() => {});
    }
    await pool.query(
        `DELETE FROM tumbas_cuentas WHERE usuario_id = ANY($1::uuid[])`,
        [nombresPrueba]
    ).catch(() => {});
    await pool.end().catch(() => {});
    await pararServidor();
}

if (fallos > 0) {
    process.exitCode = 1;
} else {
    console.log("Moderacion de cuentas correcta");
}
