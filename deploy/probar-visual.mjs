/**
 * Prueba visual en Chrome sin intervention manual: deja la sesion iniciada
 * y abre un servidor de chat unico, para ver la barra de escritura y la
 * pestanita del nombre del grupo.
 *
 *   node deploy/probar-visual.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");
const base = process.env.BASE || "http://127.0.0.1:3000";

const sufijo = Date.now().toString().slice(-8);
const registro = await fetch(`${base}/api/auth/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: `visual${sufijo}`, dispositivo_id: `visual-${sufijo}` })
}).then((r) => r.json());
const token = registro.usuario.token;
const cabeceras = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const creado = await fetch(`${base}/api/grupos`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({ nombre: `Servidor ${sufijo}`, modelo: "chat_unico", descripcion: "Un servidor de prueba" })
}).then((r) => r.json());

// Con "oscuro" se pone un color de nombre muy oscuro, para comprobar que sale
// con reborde claro y que se sigue leyendo sobre el fondo negro.
if (process.argv.includes("oscuro")) {
    await fetch(`${base}/api/auth/cuenta`, {
        method: "PUT",
        headers: cabeceras,
        body: JSON.stringify({ color_nombre: "#101030", descripcion: "Prueba de color oscuro" })
    });
}

// Con "canales" el servidor se convierte, para comprobar que reaparece la
// lista de canales y que la descripcion se deja de mostrar.
if (process.argv.includes("canales")) {
    await fetch(`${base}/api/grupos/${creado.grupo.id}/activar-canales`, {
        method: "POST",
        headers: cabeceras,
        body: "{}"
    });
    for (const nombre of ["general", "random", "series"]) {
        if (nombre === "general") continue;
        await fetch(`${base}/api/grupos/${creado.grupo.id}/canales`, {
            method: "POST",
            headers: cabeceras,
            body: JSON.stringify({ nombre })
        });
    }
}

// Algunos mensajes de relleno, para que la lista tenga contenido.
const grupo = await fetch(`${base}/api/grupos/${creado.grupo.id}`, { headers: cabeceras }).then((r) => r.json());
const canalId = grupo.grupo.canales[0].id;

for (const contenido of ["Hola, este es el primer mensaje", "Segundo mensaje para ver la lista"]) {
    await fetch(`${base}/api/grupos/${creado.grupo.id}/mensajes`, {
        method: "POST",
        headers: cabeceras,
        body: JSON.stringify({ contenido, canalId })
    });
}

// Con "avisos" otro usuario le manda una solicitud de amistad al de prueba:
// así la ventanita se abre con avisos de verdad y el punto rojo encendido.
if (process.argv.includes("avisos")) {
    const otro = await fetch(`${base}/api/auth/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: `avisos${sufijo}`, dispositivo_id: `avisos-${sufijo}` })
    }).then((r) => r.json());

    // La solicitud la manda "otro": si la mandase el propio usuario de prueba
    // no habría aviso, porque nadie puede pedir amistad a sí mismo.
    await fetch(`${base}/api/amigos/solicitud`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${otro.usuario.token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ destinatarioId: registro.usuario.id })
    });
    console.log(`Aviso creado por ${otro.usuario.nombre}`);
}

// Con "reels" se suben dos reels de verdad al usuario de prueba: asi la
// tira horizontal y el visor se pueden ver con contenido, no vacios.
function mp4DePrueba(segundos) {
    const caja = (tipo, ...cargas) => {
        const contenido = Buffer.concat(cargas);
        const cabecera = Buffer.alloc(8);
        cabecera.writeUInt32BE(contenido.length + 8, 0);
        cabecera.write(tipo, 4, "ascii");
        return Buffer.concat([cabecera, contenido]);
    };
    const entero = (valor) => {
        const bytes = Buffer.alloc(4);
        bytes.writeUInt32BE(valor >>> 0, 0);
        return bytes;
    };
    const mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(1000, 12);
    mvhd.writeUInt32BE(segundos * 1000, 16);
    mvhd.writeUInt32BE(0x00010000, 20);
    mvhd.writeUInt16BE(0x0100, 24);
    mvhd.writeUInt32BE(0x00010000, 36);
    mvhd.writeUInt32BE(0x00010000, 52);
    mvhd.writeUInt32BE(0x40000000, 68);
    mvhd.writeUInt32BE(2, 96);
    return Buffer.concat([
        caja("ftyp", Buffer.from("isom", "ascii"), entero(0x200), Buffer.from("iso2avc1mp41", "ascii")),
        caja("moov", caja("mvhd", mvhd)),
        caja("mdat", Buffer.alloc(64, 0))
    ]);
}

if (process.argv.includes("reels")) {
    const video = mp4DePrueba(3);
    for (const titulo of ["Ensayo en la prueba", "Segundo reel de prueba"]) {
        const formulario = new FormData();
        formulario.append("titulo", titulo);
        formulario.append("visibilidad", "publica");
        formulario.append("archivo", new Blob([video], { type: "video/mp4" }), "reel.mp4");
        await fetch(`${base}/api/reels`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formulario
        });
    }
    console.log("Dos reels subidos al usuario de prueba");
}
// La pagina de prueba inyecta el token y llama a la misma funcion que usa
// la aplicacion al tocar una tarjeta de servidor.
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");

// Se intercepta localStorage antes de que corra la app.
const arranque = `
<script>
(function () {
    var token = ${JSON.stringify(token)};
    var idGrupo = ${JSON.stringify(creado.grupo.id)};
    var datos = {};
    Object.defineProperty(window, "localStorage", {
        value: {
            getItem: function (k) { return k === "atuistas_token" ? token : null; },
            setItem: function () {}, removeItem: function () {}
        },
        configurable: true
    });
    window.addEventListener("load", function () {
        setTimeout(function () {
            // Modo cuenta: abrir la pestana de Cuenta y no hacer nada mas.
            // Modo "especiales": escribe en Cuenta un nombre y una descripcion
            // con caracteres especiales para ver si se guardan o se pierden.
            if (${process.argv.includes("especiales")}) {
                setTimeout(function () {
                    var cuenta = document.getElementById("boton-cuenta");
                    if (cuenta) cuenta.click();
                }, 500);
                setTimeout(function () {
                    var nombre = document.getElementById("nombre-cuenta-editar");
                    var descripcion = document.getElementById("descripcion-cuenta");
                    var raro = "N" + String.fromCharCode(241) + "o" + String.fromCharCode(241) + "o & Dj's #1 " + String.fromCodePoint(0x1F3B8);
                    var texto = "Musica " + String.fromCharCode(9834) + " uxiux " + String.fromCharCode(9830) + " -> lista " + String.fromCharCode(10003) + " rock " + String.fromCharCode(9829) + " #1 " + String.fromCodePoint(0x1F3B8) + " " + String.fromCodePoint(0x2728) + " " + String.fromCharCode(171) + "citas" + String.fromCharCode(187);
                    nombre.value = raro;
                    nombre.dispatchEvent(new Event("input", { bubbles: true }));
                    descripcion.value = texto;
                    descripcion.dispatchEvent(new Event("input", { bubbles: true }));
                    descripcion.dispatchEvent(new Event("blur"));
                }, 1500);
                // Se codifica en ASCII (%XX) porque la consola de Windows
                //-traduciria los acentos y los emoji.
                setTimeout(function () {
                    var aviso = document.getElementById("guardado-cuenta");
                    fetch("/api/auth/me", {
                        headers: { Authorization: "Bearer " + localStorage.getItem("atuistas_token") }
                    })
                        .then(function (r) { return r.json(); })
                        .then(function (datos) {
                            document.body.setAttribute("data-especiales",
                                "nombre=" + encodeURIComponent(document.getElementById("nombre-cuenta-editar").value) +
                                " descripcion=" + encodeURIComponent(document.getElementById("descripcion-cuenta").value) +
                                " delServidor=" + encodeURIComponent(datos.usuario.descripcion || "") +
                                " aviso=" + encodeURIComponent(aviso ? aviso.textContent : ""));
                        });
                }, 4000);
                return;
            }
            // Con "entrar" se queda en la pantalla de Entrar (tira de reels).
            if (${process.argv.includes("entrar")}) {
                setTimeout(function () {
                    var inicio = document.getElementById("boton-entrar-app");
                    if (inicio) inicio.click();
                }, 500);
                // Con "visor" se abre el visor sobre la primera miniatura.
                if (${process.argv.includes("visor")}) {
                    setTimeout(function () {
                        var primera = document.querySelector("#pista-reels-amigos .miniatura-reel");
                        if (primera) primera.click();
                        setTimeout(function () {
                            var acciones = document.querySelectorAll("#pista-reels-visor .acciones-reel");
                            var caja = acciones[0] ? acciones[0].getBoundingClientRect() : null;
                            document.body.setAttribute("data-visor", "pantallas=" + document.querySelectorAll(".pantalla-reel").length + ",acciones=" + acciones.length + (caja ? ",x=" + Math.round(caja.x) + ",y=" + Math.round(caja.y) + ",w=" + Math.round(caja.width) + ",h=" + Math.round(caja.height) : ""));
                        }, 1200);
                    }, 2200);
                }
                return;
            }

            // Con "visor" se abre el visor de reels sobre la primera miniatura.
            if (${process.argv.includes("visor")}) {
                setTimeout(function () {
                    var primera = document.querySelector("#pista-reels-amigos .miniatura-reel");
                    if (primera) primera.click();
                }, 1600);
            }

            // Con "notificaciones" o "avisos" ademas se abre la ventanita.
            if (${process.argv.includes("cuenta") || process.argv.includes("notificaciones") || process.argv.includes("avisos")}) {
                var cuenta = document.getElementById("boton-cuenta");
                if (cuenta) cuenta.click();
${process.argv.includes("notificaciones") || process.argv.includes("avisos") ? `                setTimeout(function () {
                    var abrir = document.getElementById("boton-abrir-notificaciones");
                    if (abrir) abrir.click();
                }, 700);` : ""}
                return;
            }

            // Modo publicar: abrir la ventana de publicación con el tipo Fotos
            // ya elegido, para ver el botón de subir archivos y que el texto
            // deje de ser obligatorio.
            if (${process.argv.includes("publicar")}) {
                setTimeout(function () {
                    var abrir = document.getElementById("boton-abrir-publicacion");
                    if (abrir) abrir.click();
                    setTimeout(function () {
                        var fotos = document.querySelector('input[name="tipo-publicacion"][value="imagenes"]');
                        if (fotos) {
                            fotos.checked = true;
                            fotos.dispatchEvent(new Event("change"));
                        }
                        // Comprobacion: en Fotos el texto no es obligatorio y el
                        // boton se ve; en Texto vuelve a ser obligatorio y, al
                        // pulsar el boton, el tipo cambia solo a Fotos.
                        var texto = document.getElementById("texto-publicacion");
                        var etiqueta = document.getElementById("etiqueta-archivo-publicacion");
                        var marca = "fotos[obligatorio=" + texto.required + ",visible=" + (!etiqueta.hidden) + "," + etiqueta.textContent.trim() + "]";
                        var soloTexto = document.querySelector('input[name="tipo-publicacion"][value="texto"]');
                        soloTexto.checked = true;
                        soloTexto.dispatchEvent(new Event("change"));
                        marca += " texto[obligatorio=" + texto.required + ",visible=" + (!etiqueta.hidden) + "," + etiqueta.textContent.trim() + "]";
                        try {
                            etiqueta.click();
                            marca += " trasPulsar[tipo=" + document.querySelector('input[name="tipo-publicacion"]:checked').value + ",obligatorio=" + texto.required + "]";
                        } catch (falla) {
                            marca += " trasPulsar[error]";
                        }
                        document.body.setAttribute("data-prueba", marca);

                        // Lo mismo en el formulario de estado, que es el otro
                        // sitio donde faltaba el boton de archivos.
                        var miEstado = document.getElementById("boton-mi-estado");
                        if (miEstado) miEstado.click();
                        setTimeout(function () {
                            var formulario = document.getElementById("formulario-estado");
                            var textoE = document.getElementById("texto-estado");
                            var etiquetaE = document.getElementById("etiqueta-archivo-estado");
                            if (!formulario || formulario.hidden) {
                                document.body.setAttribute("data-prueba-estado", "formulario oculto");
                                return;
                            }
                            var fotosE = document.querySelector('input[name="tipo-estado"][value="imagenes"]');
                            fotosE.checked = true;
                            fotosE.dispatchEvent(new Event("change"));
                            var marcaE = "fotos[obligatorio=" + textoE.required + ",visible=" + (!etiquetaE.hidden) + "," + etiquetaE.textContent.trim() + "]";
                            var soloTextoE = document.querySelector('input[name="tipo-estado"][value="texto"]');
                            soloTextoE.checked = true;
                            soloTextoE.dispatchEvent(new Event("change"));
                            marcaE += " texto[obligatorio=" + textoE.required + ",visible=" + (!etiquetaE.hidden) + "]";
                            var audio = document.querySelector('input[name="tipo-estado"][value="audio"]');
                            audio.checked = true;
                            audio.dispatchEvent(new Event("change"));
                            marcaE += " audio[obligatorio=" + textoE.required + ",grabador=" + (!document.getElementById("controles-grabar-audio").hidden) + "]";
                            document.body.setAttribute("data-prueba-estado", marcaE);
                        }, 600);
                    }, 400);
                }, 500);
                return;
            }

            // Abrir la seccion de servidores y luego el grupo.
            var boton = document.getElementById("boton-servidores");
            if (boton) boton.click();
            setTimeout(function () {
                var tarjeta = document.querySelector('[data-abrir-servidor="' + idGrupo + '"]');
                if (tarjeta) tarjeta.click();
${process.argv.includes("modal") ? `
                // Con "modal" se abre ademas la pestanita del nombre del grupo.
                setTimeout(function () {
                    var abrir = document.getElementById("boton-ver-grupo");
                    if (abrir) abrir.click();
                }, 900);` : ""}
            }, 1500);
        }, 800);
    });
})();
</script>
`;

const salida = html
    .replace('<link rel="stylesheet" href="/style.css">', `<style>${css}</style>`)
    .replace('<script src="/app.js?v=23"></script>', `<script>${app}</script>`)
    .replace("</head>", `${arranque}</head>`);

// Se escribe directamente en public para que el servidor lo sirva por HTTP:
// abrirlo con file:// bloquearia las peticiones a la API.
const destino = path.join(raiz, "public", "prueba-visual.html");
fs.writeFileSync(destino, salida, "utf8");
console.log(`Pagina de prueba creada en ${destino}`);
console.log(`Servidor: ${creado.grupo.id}`);