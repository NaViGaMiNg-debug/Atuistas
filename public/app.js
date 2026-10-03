function obtenerIdentificadorDispositivo() {
    let identificador =
        localStorage.getItem("atuistas_dispositivo");

    if (!identificador) {
        identificador = crypto.randomUUID();

        localStorage.setItem(
            "atuistas_dispositivo",
            identificador
        );
    }

    return identificador;
}


const identificadorDispositivo =
    obtenerIdentificadorDispositivo();


/* ==============================
   ELEMENTOS PRINCIPALES
   ============================== */

const pantallaAcceso =
    document.getElementById("pantalla-acceso");

const pantallaApp =
    document.getElementById("pantalla-app");

const accesoInicial =
    document.getElementById("acceso-inicial");

const accesoLogin =
    document.getElementById("acceso-login");

const accesoRegistro =
    document.getElementById("acceso-registro");

const botonVolverLogin =
    document.getElementById("boton-volver-login");

const botonVolverRegistro =
    document.getElementById("boton-volver-registro");

const botonCopiarCodigo =
    document.getElementById("boton-copiar-codigo");

const botonEntrar =
    document.getElementById("boton-entrar");

const botonCrearCuenta =
    document.getElementById("boton-crear-cuenta");

const formularioLogin =
    document.getElementById("formulario-login");

const codigoLogin =
    document.getElementById("codigo-login");

const errorLogin =
    document.getElementById("error-login");

const formularioRegistro =
    document.getElementById("formulario-registro");

const nombreRegistro =
    document.getElementById("nombre-registro");

const errorRegistro =
    document.getElementById("error-registro");

const codigoGenerado =
    document.getElementById("codigo-generado");

const codigoGeneradoTexto =
    document.getElementById("codigo-generado-texto");

const botonContinuarRegistro =
    document.getElementById("boton-continuar-registro");

const botonVolverChat =
    document.getElementById("boton-volver-chat");

if (botonVolverChat) {
    botonVolverChat.addEventListener("click", () => {
        console.log("FLECHA PULSADA");
        cerrarChat();
    });
}

/* ========================================
   COMPOSER DE MENSAJES: MICRÓFONO, ENVÍO Y ADJUNTOS
   ======================================== */

// Estas dos variables se declujan aqui, y no junto al resto del estado de
// abajo, porque los composers se crean al principio del script y un "let"
// declarado mas abajo todavia no existiria en ese momento.
let composerChat = null;
let composerServidor = null;

const ICONO_COMPOSER_ENVIAR = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2Z" fill="currentColor"></path>
    </svg>
`;

const ICONO_COMPOSER_MICROFONO = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"></rect>
        <path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M12 17v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
    </svg>
`;

const ACEPTA_ADJUNTO = {
    imagen: "image/*",
    video: "video/*",
    audio: "audio/*"
};

const ETIQUETA_ADJUNTO = {
    imagen: "FOTO",
    video: "VÍDEO",
    audio: "AUDIO"
};

// Chrome graba en webm y Safari en mp4: se elige lo que soporte el navegador.
function tipoMimeGrabacion() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
        return "";
    }
    const candidatos = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus"
    ];
    return candidatos.find((tipo) => MediaRecorder.isTypeSupported(tipo)) ?? "";
}

function extensionDeAudio(mime) {
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4")) return "m4a";
    if (mime.includes("mpeg")) return "mp3";
    // .weba y no .webm: así el servidor lo sirve como audio y no como vídeo.
    return "weba";
}

function tipoDeMime(mime) {
    if (mime.startsWith("image/")) return "imagen";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return null;
}

// Composer compartido por el chat privado y el de servidor: cambia el icono
// entre micrófono y enviar, graba audio en el momento (con opción de borrarlo
// antes de enviarlo) y ofrece el menú de adjuntos con fotos, vídeos y audios.
function crearComposer(config) {
    const {
        formulario,
        entrada,
        botonAccion,
        botonMas,
        menu,
        inputArchivo,
        filaGrabacion,
        tiempoGrabacion,
        botonDescartar,
        chipAdjunto,
        enviar
    } = config;

    let adjunto = null;
    let grabadora = null;
    let flujoLocal = null;
    let mimeActual = "audio/webm";
    let trozos = [];
    let intervalo = null;
    let segundos = 0;
    let descartarGrabacion = false;
    let temporizadorAviso = null;

    const grabando = () => Boolean(grabadora) && grabadora.state === "recording";
    const hayTexto = () => Boolean(entrada.value.trim());

    function pintarChip() {
        if (!adjunto) {
            chipAdjunto.hidden = true;
            chipAdjunto.textContent = "";
            return;
        }
        chipAdjunto.hidden = false;
        chipAdjunto.textContent = `${ETIQUETA_ADJUNTO[adjunto.tipo] ?? "ARCHIVO"}: ${adjunto.archivo.name}`;
    }

    // Los errores se enseñan donde el chip del adjunto, sin sacar alertas.
    function avisar(texto) {
        if (!texto) return;
        if (temporizadorAviso) clearTimeout(temporizadorAviso);
        chipAdjunto.hidden = false;
        chipAdjunto.textContent = texto;
        chipAdjunto.classList.add("chip-adjunto-error");
        temporizadorAviso = setTimeout(() => {
            temporizadorAviso = null;
            chipAdjunto.classList.remove("chip-adjunto-error");
            pintarChip();
        }, 4000);
    }

    function actualizarBoton() {
        const enModoEnvio = hayTexto() || Boolean(adjunto) || grabando();
        botonAccion.innerHTML = enModoEnvio ? ICONO_COMPOSER_ENVIAR : ICONO_COMPOSER_MICROFONO;
        botonAccion.setAttribute("aria-label", enModoEnvio ? "Enviar mensaje" : "Grabar audio");
        botonAccion.classList.toggle("activo", enModoEnvio);
        botonAccion.classList.toggle("grabando", grabando());
    }

    function limpiarAdjunto() {
        adjunto = null;
        inputArchivo.value = "";
        if (temporizadorAviso) {
            clearTimeout(temporizadorAviso);
            temporizadorAviso = null;
        }
        chipAdjunto.classList.remove("chip-adjunto-error");
        pintarChip();
        actualizarBoton();
    }

    function cerrarMenu() {
        menu.hidden = true;
        botonMas.setAttribute("aria-expanded", "false");
    }

    function limpiarGrabacion() {
        if (intervalo) clearInterval(intervalo);
        intervalo = null;
        segundos = 0;
        filaGrabacion.hidden = true;
        formulario.classList.remove("grabando");
    }

    function detenerGrabacion(descartar) {
        descartarGrabacion = descartar;
        if (grabando()) {
            grabadora.stop();
            return;
        }
        limpiarGrabacion();
        actualizarBoton();
    }

    function pintarTiempo() {
        const minutos = Math.floor(segundos / 60);
        const resto = segundos % 60;
        tiempoGrabacion.textContent = `${minutos}:${String(resto).padStart(2, "0")}`;
    }

    function limpiarTodo() {
        // Si se estaba grabando, el audio a medias se tira: no se envía nunca.
        if (grabando()) detenerGrabacion(true);
        entrada.value = "";
        limpiarAdjunto();
        cerrarMenu();
        actualizarBoton();
        entrada.focus();
    }

    function abrirMenu() {
        menu.hidden = false;
        botonMas.setAttribute("aria-expanded", "true");
    }

    function alternarMenu() {
        if (menu.hidden) abrirMenu();
        else cerrarMenu();
    }

    function prepararAdjunto(archivo) {
        if (!archivo) return;
        const tipo = tipoDeMime(archivo.type);
        if (!tipo) {
            avisar("Solo se pueden adjuntar fotos, vídeos o audios");
            return;
        }
        adjunto = { archivo, tipo };
        pintarChip();
        actualizarBoton();
    }

    // Al terminar la grabación el audio queda como adjunto listo para enviar, o
    // se tira si el usuario pulsó BORRAR mientras grababa.
    function alDetenerGrabacion() {
        flujoLocal?.getTracks().forEach((pista) => pista.stop());
        flujoLocal = null;

        // Se usa el MIME guardado al arrancar: la grabadora ya está liberada.
        const tipo = mimeActual;

        limpiarGrabacion();

        if (descartarGrabacion || !trozos.length) {
            descartarGrabacion = false;
            adjunto = null;
            pintarChip();
            actualizarBoton();
            return;
        }

        const audio = new Blob(trozos, { type: tipo });
        trozos = [];
        adjunto = {
            archivo: new File(
                [audio],
                `audio-${Date.now()}.${extensionDeAudio(tipo)}`,
                { type: tipo }
            ),
            tipo: "audio"
        };
        pintarChip();
        actualizarBoton();
    }

    // Pide el micrófono y arranca la grabación. Mientras suena, el botón pasa a
    // "detener" y la fila muestra el tiempo y el botón de borrar.
    async function iniciarGrabacion() {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            avisar("Este navegador no permite grabar audio");
            return;
        }
        if (typeof MediaRecorder === "undefined") {
            avisar("Este navegador no permite grabar audio");
            return;
        }

        try {
            flujoLocal = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            console.error("No se pudo acceder al micrófono:", error);
            avisar("No se pudo acceder al micrófono");
            return;
        }

        const mime = tipoMimeGrabacion();
        try {
            grabadora = new MediaRecorder(flujoLocal, mime ? { mimeType: mime } : undefined);
        } catch (error) {
            console.error("No se pudo iniciar la grabación:", error);
            flujoLocal.getTracks().forEach((pista) => pista.stop());
            flujoLocal = null;
            avisar("No se pudo iniciar la grabación");
            return;
        }

        trozos = [];
        segundos = 0;
        descartarGrabacion = false;
        // El MIME se fija ahora porque al parar la grabadora ya está liberada.
        mimeActual = grabadora.mimeType || mime || "audio/webm";

        grabadora.addEventListener("dataavailable", (evento) => {
            if (evento.data && evento.data.size) trozos.push(evento.data);
        });
        grabadora.addEventListener("stop", () => {
            grabadora = null;
            alDetenerGrabacion();
        });

        grabadora.start();
        pintarTiempo();
        filaGrabacion.hidden = false;
        formulario.classList.add("grabando");
        intervalo = setInterval(() => {
            segundos += 1;
            pintarTiempo();
        }, 1000);
        actualizarBoton();
    }

    entrada.addEventListener("input", actualizarBoton);

    botonMas.addEventListener("click", (evento) => {
        evento.stopPropagation();
        alternarMenu();
    });

    menu.addEventListener("click", (evento) => {
        const opcion = evento.target.closest("[data-adjunto]");
        if (!opcion) return;
        const clase = opcion.dataset.adjunto;
        cerrarMenu();
        if (grabando()) detenerGrabacion(true);
        limpiarAdjunto();
        inputArchivo.accept = ACEPTA_ADJUNTO[clase] ?? "";
        inputArchivo.click();
    });

    inputArchivo.addEventListener("change", () => {
        prepararAdjunto(inputArchivo.files?.[0]);
    });

    botonDescartar.addEventListener("click", () => {
        if (grabando()) {
            detenerGrabacion(true);
            return;
        }
        limpiarAdjunto();
    });

    formulario.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && !menu.hidden) cerrarMenu();
    });

    document.addEventListener("click", (evento) => {
        if (menu.hidden) return;
        if (formulario.contains(evento.target)) return;
        cerrarMenu();
    });

    // El botón principal es el que hace de micrófono, de enviar y de parar la
    // grabación: el icono ya dice en cada momento qué va a pasar.
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();

        // Grabando, el botón solo corta el audio; al parar queda listo para enviar.
        if (grabando()) {
            detenerGrabacion(false);
            return;
        }

        const contenido = entrada.value.trim();

        // Sin texto ni adjunto el botón es el micrófono, así que empieza a
        // grabar. Solo si viene de pulsarlo: con Enter no se graba.
        if (!contenido && !adjunto) {
            if (evento.submitter === botonAccion) await iniciarGrabacion();
            return;
        }

        botonAccion.disabled = true;
        try {
            await enviar(contenido, adjunto);
            limpiarTodo();
        } catch (error) {
            console.error("No se pudo enviar el mensaje:", error);
            avisar(error.message || "No se pudo enviar el mensaje");
        } finally {
            botonAccion.disabled = false;
            actualizarBoton();
        }
    });

    actualizarBoton();

    return {
        refrescar: actualizarBoton,
        // Lo usa el resto de la app para vaciar el composer al cambiar de chat.
        limpiar: limpiarTodo,
        // El chat de servidor cambia el placeholder según el canal.
        cambiarPlaceholder: (texto) => {
            entrada.placeholder = texto;
        }
    };
}



const formularioMensaje =
    document.getElementById("formulario-mensaje");

if (formularioMensaje) {
    const mostrarCitaChat = (cual) => {
        const citaRespuesta = document.getElementById("cita-respuesta-chat");
        const citaEdicion = document.getElementById("cita-edicion-chat");
        if (citaRespuesta) citaRespuesta.hidden = cual !== "respuesta";
        if (citaEdicion) citaEdicion.hidden = cual !== "edicion";
    };

    const cancelarCitaChat = (limpiarEntrada) => {
        mensajeRespuestaChat = null;
        mensajeEdicionChat = null;
        mostrarCitaChat("ninguna");
        const estadoRespuesta = document.getElementById("estado-respuesta-chat");
        if (estadoRespuesta) estadoRespuesta.textContent = "";
        const estadoEdicion = document.getElementById("estado-edicion-chat");
        if (estadoEdicion) estadoEdicion.textContent = "";
        const entrada = document.getElementById("entrada-mensaje");
        if (entrada && limpiarEntrada) entrada.value = "";
        entrada?.focus();
    };

    document.getElementById("boton-cancelar-respuesta-chat")?.addEventListener("click", () => cancelarCitaChat(false));
    document.getElementById("boton-cancelar-edicion-chat")?.addEventListener("click", () => cancelarCitaChat(true));

    formularioMensaje.addEventListener("keydown", (evento) => {
        if (evento.key !== "Escape") return;
        cancelarCitaChat(true);
    });

    // El envío real vive en el composer: él se encarga del micrófono, de los
    // adjuntos y de vaciar la caja. Aquí solo se encolan las citas y la edición.
    composerChat = crearComposer({
        formulario: formularioMensaje,
        entrada: document.getElementById("entrada-mensaje"),
        botonAccion: document.getElementById("boton-accion-chat"),
        botonMas: document.getElementById("boton-mas-chat"),
        menu: document.getElementById("menu-adjuntar-chat"),
        inputArchivo: document.getElementById("archivo-chat"),
        filaGrabacion: document.getElementById("fila-grabacion-chat"),
        tiempoGrabacion: document.getElementById("tiempo-grabacion-chat"),
        botonDescartar: document.getElementById("boton-descartar-grabacion-chat"),
        chipAdjunto: document.getElementById("estado-adjunto-chat"),
        enviar: enviarMensajeChat
    });

    // Editar o responder se resuelve antes de mandar nada nuevo.
    async function enviarMensajeChat(contenido, adjunto) {
        const token = localStorage.getItem("atuistas_token");
        if (!token || !amigoChatActual) {
            throw new Error("No se pudo enviar el mensaje");
        }

        if (typeof guardarEdicionChat === "function" && mensajeEdicionChat) {
            if (adjunto) {
                throw new Error("No se puede editar con un archivo");
            }
            const entradaMensaje = document.getElementById("entrada-mensaje");
            await guardarEdicionChat(entradaMensaje);
            return;
        }

        // Con adjunto el texto es opcional: el archivo ya sube su propio mensaje.
        let archivoEnviado = null;
        if (adjunto) {
            archivoEnviado = await subirAdjuntoPrivado(adjunto.archivo);
        }

        if (!contenido && !archivoEnviado) return;

        const respuesta = await fetch(
            `/api/mensajes/conversacion/${amigoChatActual.id}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    contenido,
                    respuestaId: mensajeRespuestaChat,
                    tipo: archivoEnviado ? archivoEnviado.tipo : undefined,
                    archivoId: archivoEnviado ? archivoEnviado.archivo_id : undefined
                })
            }
        );

        const datos = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            throw new Error(datos.error || "No se pudo enviar el mensaje");
        }

        mensajeRespuestaChat = null;
        mostrarCitaChat("ninguna");
        const estadoRespuesta = document.getElementById("estado-respuesta-chat");
        if (estadoRespuesta) estadoRespuesta.textContent = "";

        await cargarMensajesChat();
    }

    // Sube la foto, el vídeo o el audio y devuelve el identificador con el que
    // el mensaje se vincula al archivo.
    async function subirAdjuntoPrivado(archivo) {
        const token = localStorage.getItem("atuistas_token");
        if (!token || !amigoChatActual) {
            throw new Error("No se pudo subir el archivo");
        }

        const datos = new FormData();
        datos.append("archivo", archivo);

        const respuesta = await fetch(
            `/api/mensajes/conversacion/${encodeURIComponent(amigoChatActual.id)}/adjuntos`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: datos
            }
        );

        const cuerpo = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
            throw new Error(cuerpo.error || "No se pudo subir el archivo");
        }
        return cuerpo;
    }
}

/* ==============================
   CUENTA
   ============================== */

const contenidoEntrar =
    document.getElementById("contenido-entrar");

const contenidoCuenta =
    document.getElementById("contenido-cuenta");

const contenidoAmigos =
    document.getElementById("contenido-amigos");

const contenidoServidores =
    document.getElementById("contenido-servidores");

const panelInicioEntrar =
    document.getElementById("panel-inicio-entrar");

const botonEntrarApp =
    document.getElementById("boton-entrar-app");

const botonAmigos =
    document.getElementById("boton-amigos");

const botonServidores =
    document.getElementById("boton-servidores");

const botonCuenta =
    document.getElementById("boton-cuenta");

const botonFotoPerfil =
    document.getElementById("boton-foto-perfil");

const fotoPerfilCuenta =
    document.getElementById("foto-perfil-cuenta");

const nombreCuenta =
    document.getElementById("nombre-cuenta");

const nombreCuentaEditar =
    document.getElementById("nombre-cuenta-editar");

const descripcionCuenta =
    document.getElementById("descripcion-cuenta");

const colorNombreCuenta =
    document.getElementById("color-nombre-cuenta");

const estadoCuenta =
    document.getElementById("estado-cuenta");

const codigoCuentaTexto =
    document.getElementById("codigo-cuenta-texto");

const botonCopiarCodigoCuenta =
    document.getElementById("boton-copiar-codigo-cuenta");

const botonRegenerarCodigo =
    document.getElementById("boton-regenerar-codigo");

const botonCerrarSesion =
    document.getElementById("boton-cerrar-sesion");

const guardadoCuenta =
    document.getElementById("guardado-cuenta");

const vistaNombreCuenta =
    document.getElementById("nombre-color-cuenta");

const contenidoPublico = 
    document.getElementById("contenido-publico");

// ========================================
// AGREGAR AMIGOS
// ========================================

const botonEncontrarPersonas =
    document.getElementById("boton-encontrar-personas");

const botonSolicitudes =
    document.getElementById("boton-solicitudes");

const seccionEncontrarPersonas =
    document.getElementById("seccion-encontrar-personas");

const seccionSolicitudes =
    document.getElementById("seccion-solicitudes");

const buscadorPersonas =
    document.getElementById("buscador-personas");

const estadoBusquedaAmigos =
    document.getElementById("estado-busqueda-amigos");

const listaResultadosAmigos =
    document.getElementById("lista-resultados-amigos");

const listaSolicitudesAmigos =
    document.getElementById("lista-solicitudes-amigos");

const estadoSolicitudesAmigos =
    document.getElementById("estado-solicitudes-amigos");

/* ==============================
   FOTO DE PERFIL
   ============================== */

const modalOpcionesFoto =
    document.getElementById("modal-opciones-foto");

const botonCerrarOpcionesFoto =
    document.getElementById(
        "boton-cerrar-opciones-foto"
    );

const botonVerFoto =
    document.getElementById("boton-ver-foto");

const botonCambiarFoto =
    document.getElementById("boton-cambiar-foto");

const modalFotoGrande =
    document.getElementById("modal-foto-grande");

const botonCerrarFotoGrande =
    document.getElementById(
        "boton-cerrar-foto-grande"
    );

const fotoPerfilGrande =
    document.getElementById("foto-perfil-grande");

const inputFotoPerfil =
    document.getElementById("input-foto-perfil");

let amigoChatActual = null;
let intervaloChat = null;
let grupoActual = null;
let intervaloGrupo = null;
let respuestaGrupoActual = null;
let mensajeRespuestaChat = null;
let mensajeEdicionChat = null;
let mensajesSeleccionadosChat = new Set();
let gestoChatEnCurso = false;
let interaccionChatEnCurso = false;
let temporizadorBusquedaGrupo = null;
let detalleGrupo = null;
let canalesGrupo = [];
let canalActual = null;
let ocultoServidorActivo = false;
let miembrosServidorActual = null;
let socketTiempoReal = null;
let temporizadorReconexionWs = null;
let intentosReconexionWs = 0;

const listaServidores = document.getElementById("lista-servidores");
const estadoServidores = document.getElementById("estado-servidores");
const resultadosServidores = document.getElementById("resultados-servidores");
const buscadorServidores = document.getElementById("buscador-servidores");
const panelServidor = document.getElementById("panel-servidor");
const zonaChatServidor = document.querySelector("#panel-servidor .zona-chat-servidor");
const mensajesServidor = document.getElementById("mensajes-servidor");
// Mensajes de servidor marcados con pulsación larga para borrarlos,
// igual que la selección del chat privado.
let mensajesSeleccionadosServidor = new Set();
const modalEstado = document.getElementById("modal-estado");
const modalPublicacion = document.getElementById("modal-publicacion");
let grabadoraAudio = null;
let flujoAudio = null;
let blobAudioEstado = null;
let misEstadosActuales = [];
let limiteGrabacionAudio = null;
let registroServiceWorker = null;
const secuenciasEstadosFeed = new Map();
let indiceHistoriaActual = 0;
let temporizadorHistoria = null;
let secuenciaHistoriaActual = [];

/* ========================================
   INSTALACIÓN Y ACTUALIZACIÓN DE LA PWA
   El boton de instalar solo aparece si el navegador dice que se puede
   instalar, y la actualizacion se comprueba sola: cuando hay version
   nueva, aparece el aviso y basta con pulsar ACTUALIZAR.
   ======================================== */

const botonInstalarApp = document.getElementById("boton-instalar-app");
const avisoActualizacion = document.getElementById("aviso-actualizacion");
const botonActualizarApp = document.getElementById("boton-actualizar-app");

let instalacionPendiente = null;

// Si la app ya se esta ejecutando como instalada, no tiene sentido ofrecer
// volver a instalarla.
function appYaInstalada() {
    return window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;
}

function mostrarBotonInstalar() {
    if (!botonInstalarApp || appYaInstalada()) return;
    botonInstalarApp.hidden = false;
}

botonInstalarApp?.addEventListener("click", async () => {
    if (!instalacionPendiente) return;
    botonInstalarApp.disabled = true;
    try {
        instalacionPendiente.prompt();
        // El usuario puede cancelar: outcome queda en "dismissed".
        const { outcome } = await instalacionPendiente.userChoice;
        if (outcome === "accepted") {
            botonInstalarApp.hidden = true;
        } else {
            botonInstalarApp.disabled = false;
        }
    } finally {
        instalacionPendiente = null;
    }
});

// Cuando hay una version nueva esperando, se avisa en vez de recargar solo:
// recargar sin permiso perderia lo que el usuario estuviera escribiendo.
function avisarActualizacion(registration) {
    if (!avisoActualizacion) return;

    avisoActualizacion.hidden = false;

    const aplicar = () => {
        avisarActualizacion.hidden = true;
        botonActualizarApp.disabled = true;
        if (registration.waiting) {
            registration.waiting.postMessage({ tipo: "activar-version" });
        } else {
            window.location.reload();
        }
    };

    botonActualizarApp.onclick = aplicar;
    botonActualizarApp.disabled = false;
}

function vigilarActualizaciones(registration) {
    if (!registration) return;

    // Ya hay una version nueva descargada al abrir la app.
    if (registration.waiting) {
        avisarActualizacion(registration);
    }

    // Se esta descargando una version nueva.
    registration.addEventListener("updatefound", () => {
        const instalando = registration.installing;
        if (!instalando) return;

        instalando.addEventListener("statechange", () => {
            // "installed" con un worker previo significa que hay version nueva.
            if (instalando.state === "installed" && navigator.serviceWorker.controller) {
                avisarActualizacion(registration);
            }
        });
    });

    // Cada certaino se pregunta al servidor si hay algo nuevo. Asi el
    // cambio llega solo, sin que el usuario tenga que reinstalar nada.
    setInterval(async () => {
        try {
            await registration.update();
        } catch {
            // Sin conexion no hay nada que comprobar.
        }
    }, 30 * 60 * 1000);
    // El service worker avisa cuando ya esta sirviendo la version nueva: se
    // recarga una vez y la app queda al dia sin que haya que instalar nada.
    let recargando = false;
    navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.tipo !== "version-aplicada") return;
        if (recargando) return;
        recargando = true;
        window.location.reload();
    });

}

if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js")
        .then((registration) => {
            registroServiceWorker = registration;
            vigilarActualizaciones(registration);
        })
        .catch((error) => console.warn("No se pudo registrar el service worker:", error));

    // Chrome avisa cuando la app cumple los requisitos de instalacion.
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        instalacionPendiente = event;
        mostrarBotonInstalar();
    });

    // Si el usuario instalo desde el navegador, el boton ya no hace falta.
    window.addEventListener("appinstalled", () => {
        instalacionPendiente = null;
        if (botonInstalarApp) botonInstalarApp.hidden = true;
    });
}

async function solicitarGrupo(ruta, opciones = {}) {
    const token = localStorage.getItem("atuistas_token");
    if (!token) throw new Error("Inicia sesión para usar los servidores");

    const respuesta = await fetch(ruta, {
        ...opciones,
        headers: {
            ...(opciones.body && !(opciones.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
            ...opciones.headers,
            Authorization: `Bearer ${token}`
        }
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || "No se pudo completar la operación");
    return datos;
}

/* ==============================
   MOSTRAR ACCESO
   ============================== */

function mostrarAcceso() {

    pantallaAcceso.hidden = false;
    pantallaApp.hidden = true;

    desconectarTiempoReal();


    /*
     * RESTABLECER PANTALLA INICIAL
     */

    accesoInicial.hidden = false;
    accesoLogin.hidden = true;
    accesoRegistro.hidden = true;
    codigoGenerado.hidden = true;


    /*
     * LIMPIAR CAMPOS Y ERRORES
     */

    codigoLogin.value = "";
    errorLogin.textContent = "";

    nombreRegistro.value = "";
    errorRegistro.textContent = "";


}

function colorSeguro(color) {
    return /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#ffffff";
}

// Luminancia percibida: sirve para saber si un color se pierde sobre el fondo
// oscuro de la aplicación y hay que rodearlo de algo claro.
function esColorOscuro(color) {
    const hex = colorSeguro(color);
    const rojo = parseInt(hex.slice(1, 3), 16);
    const verde = parseInt(hex.slice(3, 5), 16);
    const azul = parseInt(hex.slice(5, 7), 16);
    const luminancia = 0.2126 * rojo + 0.7152 * verde + 0.0722 * azul;
    return luminancia < 105;
}

// Color del anillo de los avatares: el del nombre, o blanco suave cuando el
// color es tan oscuro que se confundiría con el fondo.
function colorDeAnillo(color) {
    return esColorOscuro(color) ? "rgba(255, 255, 255, 0.85)" : colorSeguro(color);
}

// Estilo en línea para pintar un nombre. Si el color es oscuro se añade un
// halo claro, porque el fondo de la aplicación también es oscuro.
function estiloNombre(color) {
    const seguro = colorSeguro(color);
    if (esColorOscuro(seguro)) {
        return `color:${seguro};text-shadow:0 0 2px rgba(255,255,255,0.9),0 0 4px rgba(255,255,255,0.55);`;
    }
    return `color:${seguro};`;
}

// Deja el anillo del avatar del color del nombre. Se usa una variable CSS para
// que el estilo viva en style.css y no haya que repetirlo aquí.
function aplicarAnilloAvatar(elemento, color) {
    if (!elemento) return;
    elemento.style.setProperty("--anillo-avatar", colorDeAnillo(color));
    elemento.classList.add("con-anillo-nombre");
}

function escapeHtml(texto) {
    const elemento =
        document.createElement("div");

    elemento.textContent = texto;

    return elemento.innerHTML;
}

/* ==============================
   MOSTRAR APLICACIÓN
   ============================== */

function mostrarAplicacion() {

    console.log("Mostrando aplicación");

    pantallaAcceso.hidden = true;
    pantallaApp.hidden = false;

    conectarTiempoReal();

    mostrarSeccion("entrar");
    cargarConfiguracionNotificaciones();
    solicitarGrupo("/api/auth/me")
        .then((datos) => {
            localStorage.setItem("atuistas_cache_cuenta", JSON.stringify(datos.usuario));
            actualizarTarjetaMiEstado();
        })
        .catch(() => {});

}

async function cargarConfiguracionNotificaciones() {
    const estado = document.getElementById("estado-notificaciones");
    try {
        const datos = await solicitarGrupo("/api/notificaciones/configuracion");
        document.querySelectorAll("[data-preferencia]").forEach((entrada) => {
            entrada.checked = datos.configuracion[entrada.dataset.preferencia] === true;
        });
        estado.textContent = "";
    } catch (error) {
        estado.textContent = error.message;
    }
}

function convertirClavePush(clave) {
    const padding = "=".repeat((4 - (clave.length % 4)) % 4);
    const base64 = (clave + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

document.getElementById("boton-activar-notificaciones-dispositivo").addEventListener("click", async () => {
    const estado = document.getElementById("estado-notificaciones-dispositivo");
    try {
        if (!("Notification" in window) || !("PushManager" in window) || !window.isSecureContext) {
            throw new Error("Este navegador necesita HTTPS o localhost para activar avisos del dispositivo.");
        }
        if (Notification.permission === "denied") {
            throw new Error("Los avisos están bloqueados en los permisos del navegador.");
        }
        if (Notification.permission !== "granted") {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") throw new Error("No se concedió permiso para mostrar avisos.");
        }

        registroServiceWorker ??= await navigator.serviceWorker.ready;
        const claveRespuesta = await solicitarGrupo("/api/push/clave-publica");
        const suscripcion = await registroServiceWorker.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertirClavePush(claveRespuesta.clavePublica)
        });
        await solicitarGrupo("/api/push/suscripcion", {
            method: "POST",
            body: JSON.stringify({
                dispositivoId: identificadorDispositivo,
                suscripcion: suscripcion.toJSON()
            })
        });
        estado.textContent = "Los avisos se mostrarán en este dispositivo.";
    } catch (error) {
        estado.textContent = error.message || "No se pudieron activar los avisos.";
    }
});

document.getElementById("boton-guardar-notificaciones").addEventListener("click", async () => {
    const estado = document.getElementById("estado-notificaciones");
    const configuracion = {};
    document.querySelectorAll("[data-preferencia]").forEach((entrada) => {
        configuracion[entrada.dataset.preferencia] = entrada.checked;
    });
    try {
        await solicitarGrupo("/api/notificaciones/configuracion", {
            method: "PUT",
            body: JSON.stringify(configuracion)
        });
        estado.textContent = "Preferencias guardadas.";
    } catch (error) {
        estado.textContent = error.message;
    }
});

async function abrirChat(amigo) {
    const token = localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    const panelChat = document.getElementById("panel-chat");
    const nombreChat = document.getElementById("chat-nombre");
    const avatarChat = document.getElementById("chat-avatar");
    const listaMensajes = document.getElementById("lista-mensajes");
    const entradaMensaje = document.getElementById("entrada-mensaje");

    if (
        !panelChat ||
        !nombreChat ||
        !avatarChat ||
        !listaMensajes
    ) {
        return;
    }

    amigoChatActual = amigo;
    limpiarEstadoGestosChat();

    nombreChat.textContent = amigo.nombre;
    nombreChat.setAttribute("style", estiloNombre(amigo.color_nombre));

    // El marco de la foto va del mismo color que el nombre.
    aplicarAnilloAvatar(avatarChat, amigo.color_nombre);

    avatarChat.innerHTML = amigo.avatar_url
        ? `
            <img
                src="/${amigo.avatar_url}"
                alt=""
            >
          `
        : "";

    panelChat.hidden = false;

    listaMensajes.innerHTML = `
        <div class="mensajes-vacios">
            Cargando mensajes...
        </div>
    `;

    try {
        const respuesta = await fetch(
            "/api/mensajes/conversacion",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    destinatarioId: amigo.id
                })
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            console.error(
                "Error abriendo conversación:",
                datos
            );

            listaMensajes.innerHTML = `
                <div class="mensajes-vacios">
                    No se pudo abrir la conversación.
                </div>
            `;

            return;
        }

        await cargarMensajesChat();

        if (entradaMensaje) {
            entradaMensaje.focus();
        }

        if (intervaloChat) {
            clearInterval(intervaloChat);
        }

        intervaloChat = setInterval(() => {
            cargarMensajesChat();
        }, 2000);

    } catch (error) {
        console.error(
            "Error abriendo el chat:",
            error
        );

        listaMensajes.innerHTML = `
            <div class="mensajes-vacios">
                Ha ocurrido un error.
            </div>
        `;
    }
}

async function cargarMensajesChat() {
    const token = localStorage.getItem("atuistas_token");

    if (!token || !amigoChatActual) {
        return;
    }

    const listaMensajes =
        document.getElementById("lista-mensajes");

    if (!listaMensajes) {
        return;
    }

    if (interaccionChatEnCurso) {
        return;
    }

    try {
        const respuesta = await fetch(
            `/api/mensajes/conversacion/${amigoChatActual.id}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            console.error(
                "Error cargando mensajes:",
                datos
            );
            return;
        }

        const estabaAbajo =
            listaMensajes.scrollHeight -
            listaMensajes.scrollTop -
            listaMensajes.clientHeight <
            100;

        listaMensajes.innerHTML = "";

        if (
            !datos.mensajes ||
            datos.mensajes.length === 0
        ) {
            listaMensajes.innerHTML = `
                <div class="mensajes-vacios">
                    Todavía no hay mensajes.<br>
                    ¡Empieza la conversación!
                </div>
            `;

            return;
        }

        datos.mensajes.forEach((mensaje) => {
            const elemento =
                document.createElement("div");

            elemento.className =
                mensaje.es_mio
                    ? "mensaje-chat mensaje-chat-enviado"
                    : "mensaje-chat mensaje-chat-recibido";
            elemento.dataset.mensajeId = mensaje.id;
            elemento.dataset.esMio = mensaje.es_mio ? "1" : "0";
            elemento.dataset.tipoMensaje = mensaje.tipo || "texto";

            if (mensajesSeleccionadosChat.has(mensaje.id)) {
                elemento.classList.add("mensaje-chat-seleccionado");
            }

            const envoltura = document.createElement("div");
            envoltura.className = "mensaje-chat-contenido";

            if (mensaje.mensaje_respuesta_contenido) {
                const cita = document.createElement("small");
                cita.className = "mensaje-chat-cita";
                cita.textContent = `Respuesta: ${mensaje.mensaje_respuesta_contenido}`;
                envoltura.appendChild(cita);
            }

            // Foto, audio o vídeo: el archivo ya viene con su ruta y su tipo.
            if (mensaje.archivo_ruta) {
                const fuente = escapeHtml(mensaje.archivo_ruta);
                const adjunto = document.createElement("div");
                adjunto.className = "adjunto-mensaje";

                if (mensaje.tipo === "imagen") {
                    const imagen = document.createElement("img");
                    imagen.src = fuente;
                    imagen.alt = mensaje.contenido || "Imagen enviada";
                    imagen.loading = "lazy";
                    adjunto.appendChild(imagen);
                } else if (mensaje.tipo === "audio") {
                    const audio = document.createElement("audio");
                    audio.src = fuente;
                    audio.controls = true;
                    audio.preload = "metadata";
                    adjunto.appendChild(audio);
                } else if (mensaje.tipo === "video") {
                    const video = document.createElement("video");
                    video.src = fuente;
                    video.controls = true;
                    video.playsInline = true;
                    video.preload = "metadata";
                    adjunto.appendChild(video);
                }

                envoltura.appendChild(adjunto);
            }

            const contenido = document.createElement("p");
            contenido.textContent = mensaje.contenido || "";
            if (mensaje.editado_en) {
                const marca = document.createElement("small");
                marca.className = "mensaje-chat-editado";
                marca.textContent = " (editado)";
                contenido.appendChild(marca);
            }

            // Un mensaje solo con archivo no necesita un párrafo vacío debajo.
            if (mensaje.contenido || mensaje.editado_en) {
                envoltura.appendChild(contenido);
            }

            elemento.appendChild(envoltura);
            configurarGestoMensajeChat(elemento, mensaje);
            listaMensajes.appendChild(elemento);
        });

        if (estabaAbajo) {
            listaMensajes.scrollTop =
                listaMensajes.scrollHeight;
        }

    } catch (error) {
        console.error(
            "Error cargando mensajes:",
            error
        );
    }
}

function cerrarChat() {
    const panelChat = document.getElementById("panel-chat");

    console.log("PANEL CHAT:", panelChat);

    if (!panelChat) {
        console.error("No se encontró #panel-chat");
        return;
    }

    panelChat.setAttribute("hidden", "");

    amigoChatActual = null;
    limpiarEstadoGestosChat();

    // Se vacía el composer para que un audio grabado no acabe en otra persona.
    composerChat?.limpiar();

    if (intervaloChat) {
        clearInterval(intervaloChat);
        intervaloChat = null;
    }

    console.log("Chat cerrado");
}

/* ==============================
   GESTOS DE MENSAJES DEL CHAT
   ============================== */

const DISTANCIA_MAXIMA_GESTO_CHAT = 72;
const UMBRAL_RESPUESTA_CHAT = 30;
const TIEMPO_EDICION_CHAT = 1000;
const TIEMPO_SELECCION_CHAT = 550;

function limpiarEstadoGestosChat() {
    mensajeRespuestaChat = null;
    mensajeEdicionChat = null;
    mensajesSeleccionadosChat = new Set();
    gestoChatEnCurso = false;
    interaccionChatEnCurso = false;
    const citaRespuesta = document.getElementById("cita-respuesta-chat");
    if (citaRespuesta) citaRespuesta.hidden = true;
    const citaEdicion = document.getElementById("cita-edicion-chat");
    if (citaEdicion) citaEdicion.hidden = true;
    const estadoRespuesta = document.getElementById("estado-respuesta-chat");
    if (estadoRespuesta) estadoRespuesta.textContent = "";
    const estadoEdicion = document.getElementById("estado-edicion-chat");
    if (estadoEdicion) estadoEdicion.textContent = "";
    ocultarIndicadorGestoChat();
    actualizarBarraSeleccionChat();
}

function puedeEditarMensajeChat(mensaje) {
    return Boolean(mensaje.es_mio) && (mensaje.tipo || "texto") === "texto";
}

function mostrarIndicadorGestoChat(modo) {
    const indicador = document.getElementById("indicador-gesto-chat");
    const icono = document.getElementById("icono-gesto-chat");
    const texto = document.getElementById("texto-gesto-chat");
    if (!indicador || !icono || !texto) return;
    icono.textContent = modo === "editar" ? "✎" : "↩";
    texto.textContent = modo === "editar" ? "Editar" : "Responder";
    indicador.hidden = false;
}

function ocultarIndicadorGestoChat() {
    const indicador = document.getElementById("indicador-gesto-chat");
    if (indicador) indicador.hidden = true;
}

function activarRespuestaChat(mensaje) {
    const entradaMensaje = document.getElementById("entrada-mensaje");
    mensajeRespuestaChat = mensaje.id;
    mensajeEdicionChat = null;
    const estado = document.getElementById("estado-respuesta-chat");
    if (estado) estado.textContent = `Respondiendo a: ${mensaje.contenido || "mensaje"}`;
    const citaRespuesta = document.getElementById("cita-respuesta-chat");
    if (citaRespuesta) citaRespuesta.hidden = false;
    const citaEdicion = document.getElementById("cita-edicion-chat");
    if (citaEdicion) citaEdicion.hidden = true;
    const estadoEdicion = document.getElementById("estado-edicion-chat");
    if (estadoEdicion) estadoEdicion.textContent = "";
    entradaMensaje?.focus();
}

function activarEdicionChat(mensaje) {
    if (!puedeEditarMensajeChat(mensaje)) {
        activarRespuestaChat(mensaje);
        return;
    }
    const entradaMensaje = document.getElementById("entrada-mensaje");
    mensajeEdicionChat = mensaje;
    mensajeRespuestaChat = null;
    const estadoEdicion = document.getElementById("estado-edicion-chat");
    if (estadoEdicion) estadoEdicion.textContent = `Editando: ${mensaje.contenido || "mensaje"}`;
    const citaEdicion = document.getElementById("cita-edicion-chat");
    if (citaEdicion) citaEdicion.hidden = false;
    const citaRespuesta = document.getElementById("cita-respuesta-chat");
    if (citaRespuesta) citaRespuesta.hidden = true;
    const estadoRespuesta = document.getElementById("estado-respuesta-chat");
    if (estadoRespuesta) estadoRespuesta.textContent = "";
    if (entradaMensaje) {
        entradaMensaje.value = mensaje.contenido || "";
        // El texto viene del mensaje, no de una pulsación: hay que refrescar el botón.
        composerChat?.refrescar();
        entradaMensaje.focus();
    }
}

function alternarSeleccionMensajeChat(mensaje, elemento) {
    if (!mensaje.es_mio) return;
    if (mensajesSeleccionadosChat.has(mensaje.id)) {
        mensajesSeleccionadosChat.delete(mensaje.id);
        elemento?.classList.remove("mensaje-chat-seleccionado");
    } else {
        mensajesSeleccionadosChat.add(mensaje.id);
        elemento?.classList.add("mensaje-chat-seleccionado");
    }
    actualizarBarraSeleccionChat();
}

function actualizarBarraSeleccionChat() {
    const barra = document.getElementById("barra-seleccion-chat");
    const contador = document.getElementById("contador-seleccion-chat");
    if (!barra || !contador) return;
    const total = mensajesSeleccionadosChat.size;
    barra.hidden = total === 0;
    contador.textContent = total === 1 ? "1 seleccionado" : `${total} seleccionados`;
}

function configurarGestoMensajeChat(elemento, mensaje) {
    let punteroActivo = null;
    let inicioX = 0;
    let inicioY = 0;
    let desplazamiento = 0;
    let modoActual = "responder";
    let temporizadorEdicion = null;
    let temporizadorSeleccion = null;
    let movido = false;

    const limpiarEdicion = () => {
        if (temporizadorEdicion) {
            clearTimeout(temporizadorEdicion);
            temporizadorEdicion = null;
        }
    };

    const limpiarSeleccion = () => {
        if (temporizadorSeleccion) {
            clearTimeout(temporizadorSeleccion);
            temporizadorSeleccion = null;
        }
    };

    const aplicar = (valor) => {
        desplazamiento = Math.max(-DISTANCIA_MAXIMA_GESTO_CHAT, Math.min(DISTANCIA_MAXIMA_GESTO_CHAT, valor));
        const magnitud = Math.abs(desplazamiento);
        elemento.style.transform = desplazamiento === 0 ? "" : `translateX(${desplazamiento}px)`;
        if (magnitud >= UMBRAL_RESPUESTA_CHAT) {
            gestoChatEnCurso = true;
            mostrarIndicadorGestoChat(modoActual);
        } else if (modoActual === "responder") {
            ocultarIndicadorGestoChat();
            gestoChatEnCurso = false;
        }
        elemento.classList.toggle("mensaje-chat-modo-editar", modoActual === "editar" && magnitud >= 70);
    };

    elemento.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return;
        if (punteroActivo !== null) return;
        punteroActivo = evento.pointerId;
        interaccionChatEnCurso = true;
        try {
            elemento.setPointerCapture(evento.pointerId);
        } catch {
            // Si el navegador no permite capturar, se sigue con el gesto igualmente.
        }
        inicioX = evento.clientX;
        inicioY = evento.clientY;
        desplazamiento = 0;
        movido = false;
        modoActual = "responder";
        elemento.classList.remove("mensaje-chat-modo-editar");
        limpiarEdicion();
        limpiarSeleccion();
        const idPuntero = evento.pointerId;
        temporizadorSeleccion = setTimeout(() => {
            if (!movido && mensaje.es_mio && punteroActivo === idPuntero) {
                alternarSeleccionMensajeChat(mensaje, elemento);
                punteroActivo = null;
                interaccionChatEnCurso = false;
                limpiarEdicion();
                ocultarIndicadorGestoChat();
                if (navigator.vibrate) navigator.vibrate(20);
            }
        }, TIEMPO_SELECCION_CHAT);
    });

    elemento.addEventListener("pointermove", (evento) => {
        if (evento.pointerId !== punteroActivo) return;
        const deltaX = evento.clientX - inicioX;
        const deltaY = evento.clientY - inicioY;
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            movido = true;
            limpiarSeleccion();
        }
        if (!movido) return;
        if (Math.abs(deltaY) > Math.abs(deltaX) + 12) return;
        evento.preventDefault();
        aplicar(deltaX);
        if (Math.abs(desplazamiento) >= 70 && puedeEditarMensajeChat(mensaje) && !temporizadorEdicion && modoActual !== "editar") {
            temporizadorEdicion = setTimeout(() => {
                modoActual = "editar";
                elemento.classList.add("mensaje-chat-modo-editar");
                mostrarIndicadorGestoChat("editar");
                if (navigator.vibrate) navigator.vibrate(25);
            }, TIEMPO_EDICION_CHAT);
        }
        if (Math.abs(desplazamiento) < 70 && modoActual !== "editar") {
            limpiarEdicion();
            modoActual = "responder";
            elemento.classList.remove("mensaje-chat-modo-editar");
        }
    });

    const finalizar = (evento) => {
        if (evento.pointerId !== punteroActivo) return;
        punteroActivo = null;
        interaccionChatEnCurso = false;
        limpiarEdicion();
        limpiarSeleccion();
        const magnitud = Math.abs(desplazamiento);
        elemento.style.transform = "";
        elemento.classList.remove("mensaje-chat-modo-editar");
        ocultarIndicadorGestoChat();
        gestoChatEnCurso = false;
        if (!movido) {
            if (mensajesSeleccionadosChat.size > 0 && mensaje.es_mio) {
                alternarSeleccionMensajeChat(mensaje, elemento);
            }
            desplazamiento = 0;
            modoActual = "responder";
            return;
        }
        if (magnitud >= UMBRAL_RESPUESTA_CHAT) {
            if (modoActual === "editar" && puedeEditarMensajeChat(mensaje)) activarEdicionChat(mensaje);
            else activarRespuestaChat(mensaje);
        }
        desplazamiento = 0;
        modoActual = "responder";
    };

    elemento.addEventListener("pointerup", finalizar);
    elemento.addEventListener("pointercancel", (evento) => {
        if (evento.pointerId !== punteroActivo) return;
        punteroActivo = null;
        interaccionChatEnCurso = false;
        limpiarEdicion();
        limpiarSeleccion();
        elemento.style.transform = "";
        elemento.classList.remove("mensaje-chat-modo-editar");
        ocultarIndicadorGestoChat();
        gestoChatEnCurso = false;
        desplazamiento = 0;
        modoActual = "responder";
    });
}

async function guardarEdicionChat(entradaMensaje) {
    const contenido = entradaMensaje.value.trim();
    if (!mensajeEdicionChat || !contenido) return false;
    try {
        await solicitarGrupo(`/api/mensajes/${encodeURIComponent(mensajeEdicionChat.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ contenido })
        });
        mensajeEdicionChat = null;
        const citaEdicion = document.getElementById("cita-edicion-chat");
        if (citaEdicion) citaEdicion.hidden = true;
        const estadoEdicion = document.getElementById("estado-edicion-chat");
        if (estadoEdicion) estadoEdicion.textContent = "";
        entradaMensaje.value = "";
        await cargarMensajesChat();
        entradaMensaje.focus();
        return true;
    } catch (error) {
        alert(error.message);
        return true;
    }
}

async function eliminarSeleccionChat() {
    if (mensajesSeleccionadosChat.size === 0) return;
    const total = mensajesSeleccionadosChat.size;
    const texto = total === 1
        ? "¿Eliminar este mensaje? No se podrá recuperar."
        : `¿Eliminar estos ${total} mensajes? No se podrán recuperar.`;
    if (!confirm(texto)) return;
    try {
        await solicitarGrupo("/api/mensajes/eliminar", {
            method: "POST",
            body: JSON.stringify({ mensajeIds: [...mensajesSeleccionadosChat] })
        });
        mensajesSeleccionadosChat = new Set();
        actualizarBarraSeleccionChat();
        await cargarMensajesChat();
    } catch (error) {
        alert(error.message);
    }
}

document.getElementById("boton-borrar-seleccion-chat")?.addEventListener("click", eliminarSeleccionChat);

document.getElementById("boton-cancelar-seleccion-chat")?.addEventListener("click", () => {
    mensajesSeleccionadosChat = new Set();
    document.querySelectorAll(".mensaje-chat-seleccionado").forEach((nodo) => {
        nodo.classList.remove("mensaje-chat-seleccionado");
    });
    actualizarBarraSeleccionChat();
});

// ========================================
// CARGAR AMIGOS EN ENTRAR
// ========================================

async function cargarAmigos() {

    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    const listaAmigos =
        document.getElementById("lista-amigos");

    if (!listaAmigos) {
        return;
    }

    listaAmigos.innerHTML = "";

    try {

        const respuesta = await fetch(
            "/api/amigos",
            {
                method: "GET",

                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        const datos =
            await respuesta.json();

        if (!respuesta.ok) {

            console.error(
                "Error cargando amigos:",
                datos
            );

            return;
        }

        if (
            !datos.amigos ||
            datos.amigos.length === 0
        ) {

            listaAmigos.innerHTML = `
                <p class="sin-contenido">
                    Todavía no tienes amigos.
                </p>
            `;

            return;
        }

        datos.amigos.forEach((amigo) => {

            const elemento =
                document.createElement("div");

            elemento.className =
                "chat-amigo";

            elemento.innerHTML = `
                <div class="chat-amigo-avatar con-anillo-nombre" style="--anillo-avatar:${colorDeAnillo(amigo.color_nombre)};">

                    ${
                        amigo.avatar_url
                            ? `
                                <img
                                    src="/${amigo.avatar_url}"
                                    alt=""
                                >
                              `
                            : ""
                    }

                </div>

                <div class="chat-amigo-datos">

                    <strong style="${estiloNombre(amigo.color_nombre)}">
                        ${escapeHtml(amigo.nombre)}
                    </strong>

                </div>
            `;

            elemento.addEventListener("click", () => {
                abrirChat(amigo);
            });

            listaAmigos.appendChild(elemento);

        });

    } catch (error) {

        console.error(
            "Error cargando amigos:",
            error
        );

    }
}

/* ==============================
   CAMBIAR SECCIÓN
   ============================== */

function mostrarSeccion(seccion) {
    const panelChat = document.getElementById("panel-chat");

    if (panelChat) {
        panelChat.hidden = true;
    }

    amigoChatActual = null;

    if (intervaloChat) {
        clearInterval(intervaloChat);
        intervaloChat = null;
    }

    if (intervaloGrupo) {
        clearInterval(intervaloGrupo);
        intervaloGrupo = null;
    }
    grupoActual = null;
    detalleGrupo = null;
    canalesGrupo = [];
    canalActual = null;
    cerrarPanelesServidor();

    // Si se sale de Cuenta con algo a medio escribir, se guarda antes de
    // ocultar el panel: así no se pierde nada por no haber botón de guardar.
    if (!contenidoCuenta.hidden && seccion !== "cuenta") {
        guardarCuenta();
    }

    contenidoEntrar.hidden = true;
    contenidoPublico.hidden = true;
    panelInicioEntrar.hidden = true;
    contenidoCuenta.hidden = true;
    contenidoAmigos.hidden = true;
    contenidoServidores.hidden = true;

    // La vista de servidores usa todo el ancho en escritorio.
    document.body.classList.toggle("vista-servidores", seccion === "servidores");


    if (seccion === "entrar") {
        panelInicioEntrar.hidden = false;
        contenidoEntrar.hidden = false;
        contenidoPublico.hidden = true;
        cambiarFeedEntrada(false);

        cargarAmigos();
        cargarContenidoInicio();
    }


    if (seccion === "cuenta") {
        contenidoCuenta.hidden = false;
        cargarCuenta();
    }


    if (seccion === "amigos") {
        contenidoAmigos.hidden = false;
    }


    if (seccion === "servidores") {
        contenidoServidores.hidden = false;
        cargarServidores();
    }
}

function cambiarFeedEntrada(publico) {
    const botonAmigos = document.getElementById("boton-feed-amigos");
    const botonPublico = document.getElementById("boton-feed-publico");
    contenidoEntrar.hidden = publico;
    contenidoPublico.hidden = !publico;
    botonAmigos.classList.toggle("activa", !publico);
    botonPublico.classList.toggle("activa", publico);
    botonAmigos.setAttribute("aria-selected", String(!publico));
    botonPublico.setAttribute("aria-selected", String(publico));
}

document.getElementById("boton-feed-amigos").addEventListener("click", () => cambiarFeedEntrada(false));
document.getElementById("boton-feed-publico").addEventListener("click", () => cambiarFeedEntrada(true));

// ========================================
// NAVEGACIÓN POR FASES
// En escritorio los canales y el chat conviven; en móvil
// se muestra uno de cada vez. La misma lógica sirve para
// ambos: 'lista' -> 'canales' -> 'chat'.
// ========================================

let vistaServidorActual = "lista";

function esPantallaAncha() {
    return window.matchMedia("(min-width: 1000px)").matches;
}

// Un servidor de chat único no tiene lista de canales: su único canal es el
// general y nunca se enseña. En cuanto pasa a tener canales, vuelve a verse.
function servidorUsaCanales() {
    const modelo = detalleGrupo?.modelo ?? grupoActual?.modelo ?? null;
    return modelo === "canales";
}

function actualizarContextoServidor() {
    const titulo = document.getElementById("titulo-contexto-servidor");
    const subtitulo = document.getElementById("subtitulo-contexto-servidor");
    const acciones = document.getElementById("acciones-contexto-servidor");
    const volver = document.getElementById("boton-volver-servidor");
    const panel = document.getElementById("panel-servidor");
    const columna = document.getElementById("columna-canales");
    const pestanas = document.querySelector("#contenido-servidores > .pestanas-amigos");
    const ancho = esPantallaAncha();
    const crear = document.getElementById("boton-crear-servidor");
    const avatar = document.getElementById("avatar-contexto-servidor");
    const botonFoto = document.getElementById("boton-foto-servidor");

    // La foto del servidor acompaña al nombre; sin foto, se muestra la inicial.
    if (avatar) {
        const ruta = detalleGrupo?.imagen_ruta ?? grupoActual?.imagen_ruta ?? null;
        avatar.innerHTML = ruta
            ? `<img src="${escapeHtml(ruta)}" alt="" loading="lazy">`
            : `<span aria-hidden="true">${escapeHtml((grupoActual?.nombre || "?").charAt(0).toUpperCase())}</span>`;
        avatar.hidden = !grupoActual || panel.hidden;
    }

    // El botón de la foto solo existe con un servidor abierto.
    if (botonFoto) {
        botonFoto.hidden = !grupoActual || panel.hidden;
    }

    if (!grupoActual || panel.hidden) {
        // Pantalla de lista de servidores.
        titulo.textContent = "Servidores";
        subtitulo.textContent = "";
        volver.hidden = true;
        acciones.hidden = true;
        if (crear) crear.hidden = false;
        if (pestanas) pestanas.hidden = false;
        return;
    }

    const nombreServidor = grupoActual.nombre ?? "";

    if (vistaServidorActual === "chat") {
        // Con canales se enseña cuál está abierto; en chat único el título
        // es directamente el nombre del servidor.
        const tituloCanal = servidorUsaCanales() && canalActual;
        titulo.textContent = tituloCanal ? `#${canalActual.nombre}` : nombreServidor;
        subtitulo.textContent = tituloCanal ? nombreServidor : "";
    } else {
        titulo.textContent = nombreServidor;
        const etiquetaRol = detalleGrupo?.mi_rol === "creador" ? "Creador"
            : detalleGrupo?.mi_rol === "moderador" ? "Moderador"
            : detalleGrupo ? "Miembro" : "";
        subtitulo.textContent = [
            `${detalleGrupo?.miembros ?? grupoActual.miembros ?? "?"} miembros`,
            etiquetaRol,
            detalleGrupo?.mi_silenciado ? "Silenciado" : ""
        ].filter(Boolean).join(" · ");
    }

    // La fila de botones ya no se muestra: sus acciones viven en el modal
    // que abre el nombre del grupo. Se deja oculta siempre.
    volver.hidden = false;
    acciones.hidden = true;
    if (crear) crear.hidden = true;
    if (pestanas) pestanas.hidden = true;

    // En escritorio los canales permanecen a la izquierda siempre que haya chat.
    // Un chat único no los muestra nunca, porque solo tiene el general.
    const verColumna = servidorUsaCanales() && (ancho || vistaServidorActual === "canales");
    columna.hidden = !verColumna;
    zonaChatServidor.hidden = !verColumna && !(ancho || vistaServidorActual === "chat");
}

// Navega a una de las tres fases y refleja el cambio en el panel.
function mostrarFaseServidor(fase) {
    vistaServidorActual = fase;

    if (fase === "lista") {
        document.getElementById("panel-servidor").hidden = true;
        for (const id of ["seccion-mis-servidores", "seccion-buscar-servidores"]) {
            document.getElementById(id).hidden = id !== "seccion-mis-servidores";
        }
        const pestanas = document.querySelector("#contenido-servidores > .pestanas-amigos");
        if (pestanas) pestanas.hidden = false;
        grupoActual = null;
        detalleGrupo = null;
        canalesGrupo = [];
        canalActual = null;
        limpiarSeleccionServidor();
        if (intervaloGrupo) {
            clearInterval(intervaloGrupo);
            intervaloGrupo = null;
        }
    } else {
        for (const id of ["seccion-mis-servidores", "seccion-buscar-servidores"]) {
            document.getElementById(id).hidden = true;
        }
        document.getElementById("panel-servidor").hidden = false;
    }

    actualizarContextoServidor();
}

document.getElementById("boton-volver-servidor").addEventListener("click", () => {
    // En escritorio los canales y el chat conviven: la flecha vuelve directo a la lista.
    // En móvil se retrocede un paso: chat -> canales -> lista. Un chat único
    // no tiene pantalla de canales, así que vuelve directo a la lista.
    if (servidorUsaCanales() && !esPantallaAncha() && vistaServidorActual === "chat") {
        mostrarFaseServidor("canales");
    } else {
        mostrarFaseServidor("lista");
    }
});

function mostrarPestanaServidor(nombre) {
    const secciones = {
        propios: document.getElementById("seccion-mis-servidores"),
        buscar: document.getElementById("seccion-buscar-servidores")
    };
    const botones = {
        propios: document.getElementById("boton-mis-servidores"),
        buscar: document.getElementById("boton-buscar-servidores")
    };

    for (const [clave, seccion] of Object.entries(secciones)) {
        seccion.hidden = clave !== nombre;
        botones[clave].classList.toggle("activa", clave === nombre);
        botones[clave].setAttribute("aria-selected", String(clave === nombre));
    }

    panelServidor.hidden = true;
    estadoServidores.textContent = "";
    actualizarContextoServidor();
}

// Las tarjetas aprovechan datos que el backend ya envía y que antes se ignoraban:
// imagen, preview del último mensaje y contador de mensajes sin leer.
function plantillaTarjetaServidor(grupo, { conAccionUnirse = false } = {}) {
    const sinLeer = Number(grupo.mensajes_sin_leer) || 0;
    const preview = grupo.ultimo_mensaje
        ? String(grupo.ultimo_mensaje).slice(0, 90)
        : (grupo.descripcion || "Sin descripción");
    const insignia = sinLeer > 0
        ? `<span class="servidor-tarjeta-contador" aria-label="${sinLeer} mensajes sin leer">${sinLeer > 99 ? "99+" : sinLeer}</span>`
        : "";

    const imagen = grupo.imagen_ruta
        ? `<img class="servidor-tarjeta-imagen" src="${escapeHtml(grupo.imagen_ruta)}" alt="" loading="lazy">`
        : `<span class="servidor-tarjeta-inicial" aria-hidden="true">${escapeHtml((grupo.nombre || "?").charAt(0).toUpperCase())}</span>`;

    const cuerpo = `
            <span class="servidor-tarjeta-icono">${imagen}</span>
            <span class="servidor-tarjeta-datos">
                <strong>${escapeHtml(grupo.nombre)}</strong>
                <span class="servidor-tarjeta-preview">${escapeHtml(preview)}</span>
                <span class="servidor-tarjeta-meta">
                    ${grupo.miembros} miembros
                    ${grupo.modelo === "canales" ? " · canales" : ""}
                    ${grupo.permite_ocultos ? '<em class="insignia-oculto insignia-mini">OC</em>' : ""}
                </span>
            </span>
            ${insignia}`;

    // En "mis servidores" la tarjeta entera es el botón: se entra pulsándola.
    if (!conAccionUnirse) {
        return `
        <button type="button" class="servidor-tarjeta" data-abrir-servidor="${escapeHtml(grupo.id)}">
            ${cuerpo}
        </button>
    `;
    }

    return `
        <div class="servidor-tarjeta">
            ${cuerpo}
            <span class="servidor-tarjeta-acciones">
                <button type="button" data-unirse-servidor="${escapeHtml(grupo.id)}">UNIRSE</button>
            </span>
        </div>
    `;
}

// Recarga solo las tarjetas, sin cambiar de pantalla: se usa tras poner o
// quitar la foto, porque el modal de ajustes está dentro del panel del servidor.
async function refrescarListaServidores() {
    try {
        const datos = await solicitarGrupo("/api/grupos");
        listaServidores.innerHTML = datos.grupos
            .map((grupo) => plantillaTarjetaServidor(grupo))
            .join("");
    } catch (error) {
        console.error("No se pudieron refrescar los servidores:", error);
    }
}

async function cargarServidores() {
    mostrarFaseServidor("lista");
    mostrarPestanaServidor("propios");
    listaServidores.innerHTML = "";
    estadoServidores.textContent = "Cargando servidores...";
    try {
        const datos = await solicitarGrupo("/api/grupos");
        estadoServidores.textContent = datos.grupos.length ? "" : "Todavía no perteneces a ningún servidor.";
        listaServidores.innerHTML = datos.grupos
            .map((grupo) => plantillaTarjetaServidor(grupo))
            .join("");
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
}

async function buscarServidores(texto) {
    resultadosServidores.innerHTML = "";
    if (!texto.trim()) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/buscar?texto=${encodeURIComponent(texto)}`);
        resultadosServidores.innerHTML = datos.grupos.length
            ? datos.grupos.map((grupo) => plantillaTarjetaServidor(grupo, { conAccionUnirse: true })).join("")
            : '<p class="estado-amigos">No se encontraron servidores.</p>';
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
}

async function abrirServidor(grupo) {
    if (intervaloGrupo) clearInterval(intervaloGrupo);
    grupoActual = grupo;
    detalleGrupo = null;
    canalesGrupo = [];
    canalActual = null;
    ocultoServidorActivo = false;
    miembrosServidorActual = null;
    respuestaGrupoActual = null;
    mensajeRespuestaChat = null;
    mensajeEdicionChat = null;

    // El composer no arrastra nada de un servidor a otro.
    composerServidor?.limpiar();

    // Un chat único no tiene fase intermedia: se entra directo al chat,
    // también en móvil. Los que sí tienen canales conservan la pantalla
    // de canales como paso previo en móvil.
    mostrarFaseServidor(servidorUsaCanales() ? (esPantallaAncha() ? "chat" : "canales") : "chat");

    document.getElementById("boton-eliminar-servidor").hidden = !grupo.es_creador;
    mensajesServidor.innerHTML = "";
    limpiarSeleccionServidor();
    actualizarContextoServidor();

    await refrescarDetalleServidor();

    if (servidorUsaCanales() || esPantallaAncha()) {
        await abrirChatServidor();
    }

    // Con el WebSocket activo no hace falta sondear; el sondeo es la red de seguridad.
    intervaloGrupo = setInterval(() => {
        if (!socketAbierto()) {
            cargarMensajesServidor();
        }
    }, 7000);
}

// El chat solo se carga cuando la fase actual lo muestra.
async function abrirChatServidor() {
    if (!grupoActual) return;
    mostrarFaseServidor("chat");
    await cargarMensajesServidor();
    actualizarContextoServidor();
}

// El nombre del autor solo aparece en el primer mensaje seguido de esa persona,
// igual que en los chats privados. Los mensajes ocultos nunca lo muestran.
function plantillaMensaje(mensaje, opciones = {}) {
    const mostrarAutor = opciones.mostrarAutor === true;
    const ocultoAjeno = Boolean(mensaje.oculto) && !mensaje.es_mio && !mensaje.autor_nombre;
    const nombreAutor = mensaje.autor_nombre ?? "Desconocido";
    const estiloAutor = mensaje.autor_nombre ? estiloNombre(mensaje.color_nombre) : "color:#999;";
    const gestor = Boolean(detalleGrupo) && (detalleGrupo.mi_rol === "creador" || detalleGrupo.mi_rol === "moderador");

    let adjunto = "";
    if (mensaje.archivo_ruta) {
        const fuente = escapeHtml(mensaje.archivo_ruta);
        if (mensaje.tipo === "imagen") {
            adjunto = `<div class="adjunto-mensaje"><img src="${fuente}" alt="${escapeHtml(mensaje.contenido || "imagen")}" loading="lazy"></div>`;
        } else if (mensaje.tipo === "audio") {
            adjunto = `<div class="adjunto-mensaje"><audio src="${fuente}" controls preload="metadata"></audio></div>`;
        } else if (mensaje.tipo === "video") {
            adjunto = `<div class="adjunto-mensaje"><video src="${fuente}" controls playsinline preload="metadata"></video></div>`;
        }
    }

    let cita = "";
    if (mensaje.mensaje_respondiendo_id) {
        const autorRespuesta = mensaje.respuesta_autor_nombre ?? "Desconocido";
        const textoRespuesta = mensaje.respuesta_contenido
            ? (mensaje.respuesta_contenido.length > 90 ? `${mensaje.respuesta_contenido.slice(0, 87)}...` : mensaje.respuesta_contenido)
            : "mensaje eliminado";
        cita = `<blockquote class="cita-mensaje-servidor"><strong>${escapeHtml(autorRespuesta)}</strong><span>${escapeHtml(textoRespuesta)}</span></blockquote>`;
    }

    const insignias = [];
    if (mensaje.oculto) {
        insignias.push(`<span class="insignia-oculto insignia-mini">${mensaje.envio_oculto ? "OCULTO · tuyo" : "OCULTO"}</span>`);
    }
    if (mensaje.editado_en) {
        insignias.push("<small>editado</small>");
    }

    const cabecera = mostrarAutor && !ocultoAjeno
        ? `<div class="mensaje-servidor-cabecera">
               <strong style="${estiloAutor}">${escapeHtml(nombreAutor)}</strong>
           </div>`
        : "";

    const cuerpo = mensaje.contenido ? `<p>${escapeHtml(mensaje.contenido)}</p>` : "";

    return `
        <article class="mensaje-chat mensaje-chat-${mensaje.es_mio ? "enviado" : "recibido"}
                    ${mensaje.oculto ? "es-oculto" : ""} ${ocultoAjeno ? "oculto-ajeno" : ""}
                    ${mensajesSeleccionadosServidor.has(mensaje.id) ? "mensaje-chat-seleccionado" : ""}"
                 data-mensaje-id="${escapeHtml(mensaje.id)}" data-es-mio="${mensaje.es_mio ? "1" : "0"}"
                 data-autor-id="${escapeHtml(mensaje.autor_id ?? "")}"
                 data-tipo-mensaje="${escapeHtml(mensaje.tipo || "texto")}">
            ${cabecera}
            ${cita}
            <div class="mensaje-chat-contenido">
                ${adjunto}
                ${cuerpo}
                <span class="meta-mensaje-servidor">${insignias.join("")}
                    <time>${new Date(mensaje.creado_en).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </span>
            </div>
        </article>
    `;
}

// Agrupa por autor para decidir quién necesita cabecera.
function plantillasMensajesGrupo(mensajes) {
    let autorPrevio = null;
    return mensajes.map((mensaje) => {
        // Los adjuntos y los ocultos rompen el agrupado: siempre llevan cabecera.
        const conCabecera = autorPrevio !== mensaje.autor_id || mensaje.tipo !== "texto";
        autorPrevio = mensaje.autor_id;
        return plantillaMensaje(mensaje, { mostrarAutor: conCabecera });
    });
}

async function cargarMensajesServidor() {
    if (!grupoActual) return;
    try {
        const parametros = canalActual ? `?canalId=${encodeURIComponent(canalActual.id)}` : "";
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/mensajes${parametros}`);
        mensajesServidor.innerHTML = plantillasMensajesGrupo(datos.mensajes).join("")
            || '<p class="estado-amigos">Aún no hay mensajes en este canal.</p>';
        // Los gestos de responder, editar y borrar se cablean tras cada render.
        for (const elemento of mensajesServidor.querySelectorAll(".mensaje-chat")) {
            const mensaje = datos.mensajes.find((item) => item.id === elemento.dataset.mensajeId);
            if (mensaje) configurarGestoMensajeServidor(elemento, mensaje);
        }
        mensajesServidor.scrollTop = mensajesServidor.scrollHeight;
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
}

document.getElementById("lista-servidores").addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-abrir-servidor]");
    if (!boton) return;
    try {
        const datos = await solicitarGrupo("/api/grupos");
        const grupo = datos.grupos.find((elemento) => elemento.id === boton.dataset.abrirServidor);
        if (grupo) await abrirServidor(grupo);
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
});

document.getElementById("resultados-servidores").addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-unirse-servidor]");
    if (!boton) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(boton.dataset.unirseServidor)}/unirse`, { method: "POST" });
        await cargarServidores();
        const datos = await solicitarGrupo("/api/grupos");
        const grupo = datos.grupos.find((elemento) => elemento.id === boton.dataset.unirseServidor);
        if (grupo) await abrirServidor(grupo);
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
});

document.getElementById("boton-mis-servidores").addEventListener("click", () => cargarServidores());
document.getElementById("boton-buscar-servidores").addEventListener("click", () => mostrarPestanaServidor("buscar"));
// Vuelve a la lista de servidores desde cualquier punto (salir, eliminar, expulsión).
function volverAListaServidores() {
    if (intervaloGrupo) clearInterval(intervaloGrupo);
    intervaloGrupo = null;
    grupoActual = null;
    detalleGrupo = null;
    canalesGrupo = [];
    canalActual = null;
    ocultoServidorActivo = false;
    miembrosServidorActual = null;
    cerrarPanelesServidor();
    cargarServidores();
}

buscadorServidores.addEventListener("input", () => {
    clearTimeout(temporizadorBusquedaGrupo);
    temporizadorBusquedaGrupo = setTimeout(() => buscarServidores(buscadorServidores.value), 250);
});

document.getElementById("formulario-crear-servidor").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const campos = new FormData(formulario);
    try {
        const respuesta = await solicitarGrupo("/api/grupos", {
            method: "POST",
            body: JSON.stringify({
                nombre: document.getElementById("nombre-servidor").value,
                descripcion: document.getElementById("descripcion-servidor").value,
                tipo: document.getElementById("tipo-servidor").value,
                modelo: document.getElementById("modelo-servidor").value,
                permite_ocultos: document.getElementById("ocultos-servidor").checked
            })
        });
        formulario.reset();
        document.getElementById("modal-crear-servidor").hidden = true;
        await cargarServidores();
        const datos = await solicitarGrupo("/api/grupos");
        const grupo = datos.grupos.find((elemento) => elemento.id === respuesta.grupo.id);
        if (grupo) await abrirServidor(grupo);
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
});

// Sube el archivo seleccionado y devuelve { archivo_id, tipo }.
async function subirAdjuntoServidor(archivo) {
    const datos = new FormData();
    datos.append("archivo", archivo);
    const respuesta = await fetch(`/api/grupos/${encodeURIComponent(grupoActual.id)}/adjuntos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("atuistas_token")}` },
        body: datos
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo subir el archivo");
    return cuerpo;
}

// El composer del servidor comparte motor con el del chat privado: mismo
// micrófono, mismos adjuntos y el mismo botón que cambia de icono solo.
const formularioMensajeServidor = document.getElementById("formulario-mensaje-servidor");

if (formularioMensajeServidor) {
    composerServidor = crearComposer({
        formulario: formularioMensajeServidor,
        entrada: document.getElementById("entrada-mensaje-servidor"),
        botonAccion: document.getElementById("boton-accion-servidor"),
        botonMas: document.getElementById("boton-mas-servidor"),
        menu: document.getElementById("menu-adjuntar-servidor"),
        inputArchivo: document.getElementById("archivo-servidor"),
        filaGrabacion: document.getElementById("fila-grabacion-servidor"),
        tiempoGrabacion: document.getElementById("tiempo-grabacion-servidor"),
        botonDescartar: document.getElementById("boton-descartar-grabacion-servidor"),
        chipAdjunto: document.getElementById("estado-adjunto-servidor"),
        enviar: enviarMensajeServidor
    });
}

// Editar, responder, marcar como oculto y enviar el archivo son el mismo camino:
// aquí solo se compone el cuerpo de la petición.
async function enviarMensajeServidor(contenido, adjunto) {
    if (!grupoActual) {
        throw new Error("No hay ningún servidor abierto");
    }

    if (mensajeEdicionChat) {
        if (adjunto) {
            throw new Error("No se puede editar con un archivo");
        }
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/mensajes/${encodeURIComponent(mensajeEdicionChat)}`, {
            method: "PATCH",
            body: JSON.stringify({ contenido })
        });
        mensajeEdicionChat = null;
        mensajeRespuestaChat = null;
        await cargarMensajesServidor();
        actualizarControlesComposer();
        return;
    }

    let archivoEnviado = null;
    if (adjunto) {
        archivoEnviado = await subirAdjuntoServidor(adjunto.archivo);
    }

    if (!contenido && !archivoEnviado) return;

    await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/mensajes`, {
        method: "POST",
        body: JSON.stringify({
            contenido,
            canalId: canalActual ? canalActual.id : undefined,
            respuestaId: mensajeRespuestaChat,
            oculto: ocultoServidorActivo,
            tipo: archivoEnviado ? archivoEnviado.tipo : undefined,
            archivoId: archivoEnviado ? archivoEnviado.archivo_id : undefined
        })
    });

    mensajeRespuestaChat = null;
    await cargarMensajesServidor();
}

// Gestos de los mensajes de servidor, equivalentes a los del chat privado:
// deslizar al centro responde, mantener pulsado y deslizar más edita.
function configurarGestoMensajeServidor(elemento, mensaje) {
    if (elemento.dataset.gestoActivo === "1") return;
    elemento.dataset.gestoActivo = "1";

    let punteroActivo = null;
    let inicioX = 0;
    let inicioY = 0;
    let desplazamiento = 0;
    let modo = "responder";
    let temporizadorEdicion = null;
    let temporizadorSeleccion = null;
    let movido = false;

    const limpiar = () => {
        if (temporizadorEdicion) clearTimeout(temporizadorEdicion);
        temporizadorEdicion = null;
        if (temporizadorSeleccion) clearTimeout(temporizadorSeleccion);
        temporizadorSeleccion = null;
    };

    const resetear = () => {
        limpiar();
        elemento.style.transform = "";
        elemento.classList.remove("mensaje-chat-modo-editar");
        punteroActivo = null;
        desplazamiento = 0;
        modo = "responder";
    };

    const puedeEditar = () => Boolean(mensaje.es_mio) && !mensaje.oculto;

    const aplicar = (valor) => {
        desplazamiento = Math.max(-DISTANCIA_MAXIMA_GESTO_CHAT, Math.min(DISTANCIA_MAXIMA_GESTO_CHAT, valor));
        elemento.style.transform = `translateX(${desplazamiento}px)`;
    };

    elemento.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return;
        if (punteroActivo !== null) return;
        punteroActivo = evento.pointerId;
        try {
            elemento.setPointerCapture(evento.pointerId);
        } catch {
            // Sin captura de puntero el gesto sigue funcionando.
        }
        inicioX = evento.clientX;
        inicioY = evento.clientY;
        desplazamiento = 0;
        movido = false;
        modo = "responder";
        limpiar();

        const idPuntero = evento.pointerId;
        temporizadorSeleccion = setTimeout(() => {
            if (movido || punteroActivo !== idPuntero) return;
            // Pulsación larga: marca el mensaje para borrarlo, igual que en el chat privado.
            punteroActivo = null;
            if (alternarSeleccionMensajeServidor(mensaje, elemento) && navigator.vibrate) {
                navigator.vibrate(20);
            }
        }, TIEMPO_SELECCION_CHAT);
    });

    elemento.addEventListener("pointermove", (evento) => {
        if (evento.pointerId !== punteroActivo) return;
        const deltaX = evento.clientX - inicioX;
        const deltaY = evento.clientY - inicioY;
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            movido = true;
            if (temporizadorSeleccion) clearTimeout(temporizadorSeleccion);
            temporizadorSeleccion = null;
        }
        if (!movido) return;
        if (Math.abs(deltaY) > Math.abs(deltaX) + 12) return;
        evento.preventDefault();
        aplicar(deltaX);

        if (Math.abs(desplazamiento) >= 70 && puedeEditar() && !temporizadorEdicion && modo !== "editar") {
            temporizadorEdicion = setTimeout(() => {
                modo = "editar";
                elemento.classList.add("mensaje-chat-modo-editar");
                if (navigator.vibrate) navigator.vibrate(25);
            }, TIEMPO_EDICION_CHAT);
        }
        if (Math.abs(desplazamiento) < 70 && modo !== "editar") {
            if (temporizadorEdicion) clearTimeout(temporizadorEdicion);
            temporizadorEdicion = null;
            modo = "responder";
            elemento.classList.remove("mensaje-chat-modo-editar");
        }
    });

    const finalizar = () => {
        if (punteroActivo === null) return;
        const magnitud = Math.abs(desplazamiento);
        const terminoEnEditar = modo === "editar";
        const fuePulsacion = !movido;
        resetear();

        // Con una selección activa, un toque añade o quita el mensaje.
        if (fuePulsacion) {
            if (mensajesSeleccionadosServidor.size > 0) {
                alternarSeleccionMensajeServidor(mensaje, elemento);
            }
            return;
        }

        if (magnitud < UMBRAL_RESPUESTA_CHAT) return;
        if (terminoEnEditar && puedeEditar()) {
            activarEdicionMensajeServidor(mensaje);
        } else {
            activarRespuestaMensajeServidor(mensaje);
        }
    };

    elemento.addEventListener("pointerup", finalizar);
    elemento.addEventListener("pointercancel", resetear);
}

// Selección de mensajes de servidor: la pulsación larga marca mensajes para borrarlos,
// igual que en el chat privado. Un toque con la selección activa la activa o desactiva.
function puedeEliminarMensajeServidor(mensaje) {
    const gestor = Boolean(detalleGrupo) && (detalleGrupo.mi_rol === "creador" || detalleGrupo.mi_rol === "moderador");
    return Boolean(mensaje.es_mio) || gestor;
}

function alternarSeleccionMensajeServidor(mensaje, elemento) {
    if (!puedeEliminarMensajeServidor(mensaje)) return false;
    if (mensajesSeleccionadosServidor.has(mensaje.id)) {
        mensajesSeleccionadosServidor.delete(mensaje.id);
        elemento?.classList.remove("mensaje-chat-seleccionado");
    } else {
        mensajesSeleccionadosServidor.add(mensaje.id);
        elemento?.classList.add("mensaje-chat-seleccionado");
    }
    actualizarBarraSeleccionServidor();
    return true;
}

function actualizarBarraSeleccionServidor() {
    const barra = document.getElementById("barra-seleccion-servidor");
    const contador = document.getElementById("contador-seleccion-servidor");
    if (!barra || !contador) return;
    const total = mensajesSeleccionadosServidor.size;
    barra.hidden = total === 0;
    contador.textContent = total === 1 ? "1 seleccionado" : `${total} seleccionados`;
}

function limpiarSeleccionServidor() {
    mensajesSeleccionadosServidor = new Set();
    mensajesServidor?.querySelectorAll(".mensaje-chat-seleccionado").forEach((nodo) => {
        nodo.classList.remove("mensaje-chat-seleccionado");
    });
    actualizarBarraSeleccionServidor();
}

async function eliminarSeleccionServidor() {
    if (!grupoActual || mensajesSeleccionadosServidor.size === 0) return;
    const total = mensajesSeleccionadosServidor.size;
    const texto = total === 1
        ? "¿Eliminar este mensaje? No se podrá recuperar."
        : `¿Eliminar estos ${total} mensajes? No se podrán recuperar.`;
    if (!confirm(texto)) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/mensajes/eliminar`, {
            method: "POST",
            body: JSON.stringify({ mensajeIds: [...mensajesSeleccionadosServidor] })
        });
        limpiarSeleccionServidor();
        await cargarMensajesServidor();
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
}

document.getElementById("boton-borrar-seleccion-servidor")?.addEventListener("click", eliminarSeleccionServidor);

document.getElementById("boton-cancelar-seleccion-servidor")?.addEventListener("click", limpiarSeleccionServidor);

function activarRespuestaMensajeServidor(mensaje) {
    mensajeRespuestaChat = mensaje.id;
    mensajeEdicionChat = null;
    const entrada = document.getElementById("entrada-mensaje-servidor");
    entrada.placeholder = "Respuesta preparada. Escribe el mensaje...";
    entrada.focus();
}

function activarEdicionMensajeServidor(mensaje) {
    mensajeEdicionChat = mensaje.id;
    mensajeRespuestaChat = null;
    const entrada = document.getElementById("entrada-mensaje-servidor");
    entrada.value = mensaje.contenido ?? "";
    entrada.placeholder = "Editando el mensaje. Envía para guardar...";
    // El texto viene del mensaje, no de una pulsación: hay que refrescar el botón.
    composerServidor?.refrescar();
    entrada.focus();
}

document.getElementById("boton-salir-servidor").addEventListener("click", async () => {
    if (!grupoActual || !confirm(`¿Quieres salir de ${grupoActual.nombre}?`)) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/salir`, { method: "POST" });
        volverAListaServidores();
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
});

document.getElementById("boton-eliminar-servidor").addEventListener("click", async () => {
    if (!grupoActual || !confirm(`¿Eliminar ${grupoActual.nombre} y todo su contenido?`)) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}`, { method: "DELETE" });
        volverAListaServidores();
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
});

// ========================================
// DETALLE DEL SERVIDOR, CANALES Y COMPOSER
// ========================================

async function refrescarDetalleServidor() {
    if (!grupoActual) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}`);
        detalleGrupo = datos.grupo;
        canalesGrupo = detalleGrupo.canales || [];
        document.getElementById("boton-eliminar-servidor").hidden = detalleGrupo.mi_rol !== "creador";
        document.getElementById("boton-ajustes-servidor").hidden = !(detalleGrupo.mi_rol === "creador" || detalleGrupo.mi_rol === "moderador");
        actualizarContextoServidor();

        if (!canalActual || !canalesGrupo.some((canal) => canal.id === canalActual.id)) {
            canalActual = canalesGrupo[0] ?? null;
        }
        renderizarCanales();
        actualizarControlesComposer();
    } catch (error) {
        estadoServidores.textContent = error.message;
    }
}

function renderizarCanales() {
    const lista = document.getElementById("lista-canales");
    const usaCanales = Boolean(detalleGrupo) && detalleGrupo.modelo === "canales";

    // El canal ya no lleva botón de editar encima: la gestión va en su pantalla.
    // En chat único la lista no se pinta: su único canal es el general, que no
    // se enseña nunca como botón.
    lista.innerHTML = usaCanales
        ? canalesGrupo.map((canal) => {
        const activo = Boolean(canalActual) && canal.id === canalActual.id;
        return `
            <button class="canal-item ${activo ? "activo" : ""}" type="button" role="tab" aria-selected="${activo}" data-canal-id="${escapeHtml(canal.id)}">
                <span class="canal-item-hash" aria-hidden="true">#</span>
                <span class="canal-item-nombre">${escapeHtml(canal.nombre)}</span>
                ${canal.permite_ocultos ? '<span class="insignia-oculto insignia-mini" title="Permite mensajes ocultos">OC</span>' : ""}
            </button>
        `;
    }).join("")
        : "";

    actualizarContextoServidor();
}

function actualizarControlesComposer() {
    const botonOculto = document.getElementById("boton-oculto-servidor");
    const entrada = document.getElementById("entrada-mensaje-servidor");
    const permiteOcultos = Boolean(canalActual && canalActual.permite_ocultos);

    botonOculto.hidden = !permiteOcultos;
    if (!permiteOcultos) {
        ocultoServidorActivo = false;
    }
    botonOculto.classList.toggle("activo", ocultoServidorActivo);
    botonOculto.setAttribute("aria-pressed", String(ocultoServidorActivo));

    if (!mensajeRespuestaChat && !mensajeEdicionChat) {
        // En chat único no se nombra el canal: se escribe en el servidor entero.
        entrada.placeholder = servidorUsaCanales() && canalActual
            ? `Escribe un mensaje en #${canalActual.nombre}...`
            : "Escribe un mensaje...";
    }

    // El placeholder cambia, y con él el icono del botón: si hay texto de una
    // edición ya escrito, tiene que verse el de enviar y no el del micrófono.
    composerServidor?.refrescar();
}

document.getElementById("lista-canales").addEventListener("click", async (evento) => {
    const item = evento.target.closest("[data-canal-id]");
    if (!item || !grupoActual) return;
    const canal = canalesGrupo.find((elemento) => elemento.id === item.dataset.canalId);
    if (!canal) return;

    const cambioDeCanal = !(canalActual && canal.id === canalActual.id);
    canalActual = canal;
    if (cambioDeCanal) {
        ocultoServidorActivo = false;
        mensajeRespuestaChat = null;
        mensajeEdicionChat = null;
        renderizarCanales();
        actualizarControlesComposer();
        await cargarMensajesServidor();
        solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/lectura`, {
            method: "POST",
            body: JSON.stringify({ canalId: canal.id })
        }).catch(() => {});
    }

    // En escritorio el chat ya está visible; en móvil se abre al tocar el canal.
    if (!esPantallaAncha()) {
        await abrirChatServidor();
    }
});

document.getElementById("boton-crear-servidor").addEventListener("click", () => {
    document.getElementById("modal-crear-servidor").hidden = false;
    document.getElementById("nombre-servidor").focus();
});

document.getElementById("boton-cerrar-crear-servidor").addEventListener("click", () => {
    document.getElementById("modal-crear-servidor").hidden = true;
});

document.getElementById("boton-gestion-canales").addEventListener("click", async () => {
    document.getElementById("modal-ajustes-servidor").hidden = true;
    document.getElementById("modal-gestion-canales").hidden = false;
    await renderizarCanalesAjuste();
});

document.getElementById("boton-cerrar-gestion-canales").addEventListener("click", () => {
    document.getElementById("modal-gestion-canales").hidden = true;
});

document.getElementById("boton-oculto-servidor").addEventListener("click", () => {
    ocultoServidorActivo = !ocultoServidorActivo;
    const boton = document.getElementById("boton-oculto-servidor");
    boton.classList.toggle("activo", ocultoServidorActivo);
    boton.setAttribute("aria-pressed", String(ocultoServidorActivo));
});

// ========================================
// ACCIONES DEL SERVIDOR
// Se abren al pulsar el nombre del grupo, con el mismo criterio que el
// nombre de una persona: una pantalla propia en lugar de botones de
// siempre arriba.
// ========================================

const modalAccionesServidor =
    document.getElementById("modal-acciones-servidor");

const estadoAccionesServidor =
    document.getElementById("estado-acciones-servidor");

function abrirAccionesServidor() {
    if (!grupoActual || !modalAccionesServidor) return;

    const esGestor = detalleGrupo?.mi_rol === "creador" || detalleGrupo?.mi_rol === "moderador";
    const esCreador = detalleGrupo?.mi_rol === "creador";
    const usaCanales = servidorUsaCanales();
    const nombre = grupoActual.nombre ?? "";

    document.getElementById("titulo-acciones-servidor").textContent = nombre;
    document.getElementById("resumen-nombre-servidor").textContent = nombre;

    const miembros = detalleGrupo?.miembros ?? grupoActual.miembros ?? 0;
    document.getElementById("resumen-miembros-servidor").textContent =
        `${miembros} ${miembros === 1 ? "miembro" : "miembros"}`;

    // La foto se ve en grande con el mismo modal que las fotos de perfil.
    const resumenFoto = document.getElementById("resumen-foto-servidor");
    const ruta = detalleGrupo?.imagen_ruta ?? grupoActual.imagen_ruta ?? null;
    resumenFoto.innerHTML = ruta
        ? `<img src="${escapeHtml(ruta)}" alt="">`
        : `<span aria-hidden="true">${escapeHtml(nombre.charAt(0).toUpperCase())}</span>`;

    // La descripción se muestra solo en los servidores de chat único. En los
    // que tienen canales no se enseña, pero se conserva por si se vuelve.
    const bloqueDescripcion = document.getElementById("bloque-descripcion-servidor");
    const textoDescripcion = document.getElementById("resumen-descripcion-servidor");
    const entradaDescripcion = document.getElementById("editar-descripcion-servidor");
    const descripcion = detalleGrupo?.descripcion ?? "";

    bloqueDescripcion.hidden = !esGestor || usaCanales;
    textoDescripcion.hidden = usaCanales || Boolean(descripcion);
    textoDescripcion.textContent = descripcion;
    entradaDescripcion.value = descripcion;

    document.getElementById("boton-acciones-ajustes-servidor").hidden = !esGestor;
    document.getElementById("boton-activar-canales-acciones").hidden = !(esCreador && !usaCanales);
    document.getElementById("boton-eliminar-servidor-acciones").hidden = !esCreador;

    estadoAccionesServidor.textContent = "";
    modalAccionesServidor.hidden = false;
}

function cerrarAccionesServidor() {
    if (modalAccionesServidor) modalAccionesServidor.hidden = true;
}

document.getElementById("boton-ver-grupo").addEventListener("click", abrirAccionesServidor);

document.getElementById("boton-cerrar-acciones-servidor").addEventListener("click", cerrarAccionesServidor);

// Al pulsar fuera se cierra, igual que en las demás pantallas.
modalAccionesServidor.addEventListener("click", (evento) => {
    if (evento.target === modalAccionesServidor) {
        cerrarAccionesServidor();
    }
});

document.getElementById("boton-acciones-miembros-servidor").addEventListener("click", () => {
    cerrarAccionesServidor();
    abrirMiembrosServidor();
});

document.getElementById("boton-acciones-ajustes-servidor").addEventListener("click", () => {
    cerrarAccionesServidor();
    abrirAjustesServidor();
});

document.getElementById("boton-salir-servidor-acciones").addEventListener("click", async () => {
    if (!grupoActual || !confirm(`¿Quieres salir de ${grupoActual.nombre}?`)) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/salir`, { method: "POST" });
        cerrarAccionesServidor();
        volverAListaServidores();
    } catch (error) {
        estadoAccionesServidor.textContent = error.message;
    }
});

document.getElementById("boton-eliminar-servidor-acciones").addEventListener("click", async () => {
    if (!grupoActual || !confirm(`¿Eliminar ${grupoActual.nombre} y todo su contenido?`)) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}`, { method: "DELETE" });
        cerrarAccionesServidor();
        volverAListaServidores();
    } catch (error) {
        estadoAccionesServidor.textContent = error.message;
    }
});

document.getElementById("boton-activar-canales-acciones").addEventListener("click", async () => {
    if (!grupoActual) return;
    if (!confirm("¿Activar los canales en este servidor? Esta acción es irreversible.")) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/activar-canales`, { method: "POST" });
        await refrescarDetalleServidor();
        await refrescarListaServidores();
        cerrarAccionesServidor();

        // En móvil la lista de canales pasa a ser la pantalla de entrada.
        if (!esPantallaAncha()) {
            mostrarFaseServidor("canales");
        } else if (vistaServidorActual === "chat") {
            await cargarMensajesServidor();
        }
    } catch (error) {
        estadoAccionesServidor.textContent = error.message;
    }
});

/* ---------- Descripción del servidor ---------- */

document.getElementById("boton-guardar-descripcion-servidor").addEventListener("click", async (evento) => {
    if (!grupoActual) return;
    const boton = evento.currentTarget;
    const entrada = document.getElementById("editar-descripcion-servidor");

    try {
        boton.disabled = true;
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/descripcion`, {
            method: "PUT",
            body: JSON.stringify({ descripcion: entrada.value })
        });
        await refrescarDetalleServidor();
        await refrescarListaServidores();

        const textoDescripcion = document.getElementById("resumen-descripcion-servidor");
        const descripcion = detalleGrupo?.descripcion ?? "";
        textoDescripcion.textContent = descripcion;
        textoDescripcion.hidden = Boolean(descripcion);
        estadoAccionesServidor.textContent = "Descripción guardada.";
    } catch (error) {
        estadoAccionesServidor.textContent = error.message;
    } finally {
        boton.disabled = false;
    }
});

/* ---------- Foto del servidor desde la cabecera ---------- */

// La foto se cambia pulsando la imagen de la cabecera, pero solo quien la
// gestiona: el resto solo puede verla en grande.
document.getElementById("boton-foto-servidor").addEventListener("click", () => {
    if (!grupoActual) return;

    const esGestor = detalleGrupo?.mi_rol === "creador" || detalleGrupo?.mi_rol === "moderador";
    const ruta = detalleGrupo?.imagen_ruta ?? grupoActual.imagen_ruta ?? null;

    // Sin foto solo hay una opción posible: ponerla, y solo si se puede.
    if (!ruta) {
        if (esGestor) {
            abrirCambioFotoServidor();
        } else {
            estadoServidores.textContent = "Este servidor todavía no tiene foto.";
        }
        return;
    }

    // Con foto, quien gestiona elige entre verla o cambiarla.
    if (esGestor && !confirm("¿Quieres cambiar la foto del servidor?")) {
        return;
    }

    if (esGestor) {
        abrirCambioFotoServidor();
    } else {
        fotoPerfilGrande.src = ruta;
        modalFotoGrande.hidden = false;
    }
});

// Reutiliza el selector que ya usa el modal de ajustes.
function abrirCambioFotoServidor() {
    const selector = document.getElementById("archivo-imagen-servidor");
    selector.value = "";
    selector.click();
}

// ========================================
// MIEMBROS Y PANELES
// ========================================

function cerrarPanelesServidor() {
    document.getElementById("modal-acciones-servidor").hidden = true;
    document.getElementById("modal-miembros-servidor").hidden = true;
    document.getElementById("modal-ajustes-servidor").hidden = true;
    document.getElementById("modal-canal-servidor").hidden = true;
    document.getElementById("modal-gestion-canales").hidden = true;
    document.getElementById("modal-crear-servidor").hidden = true;

    // Al salir del servidor se sueltan el micro y el adjunto pendiente.
    composerServidor?.limpiar();
}

document.getElementById("boton-cerrar-miembros-servidor").addEventListener("click", () => {
    document.getElementById("modal-miembros-servidor").hidden = true;
});
document.getElementById("boton-cerrar-ajustes-servidor").addEventListener("click", () => {
    document.getElementById("modal-ajustes-servidor").hidden = true;
});
document.getElementById("boton-cerrar-canal-servidor").addEventListener("click", () => {
    document.getElementById("modal-canal-servidor").hidden = true;
});

document.getElementById("boton-miembros-servidor").addEventListener("click", () => abrirMiembrosServidor());

async function abrirMiembrosServidor() {
    if (!grupoActual) return;
    document.getElementById("modal-miembros-servidor").hidden = false;
    await cargarMiembrosServidor();
}

async function cargarMiembrosServidor() {
    if (!grupoActual) return;
    const lista = document.getElementById("lista-miembros-servidor");
    const estado = document.getElementById("estado-miembros-servidor");
    estado.textContent = "Cargando miembros...";
    try {
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/miembros`);
        miembrosServidorActual = datos.miembros;
        const miRol = detalleGrupo ? detalleGrupo.mi_rol : "miembro";
        const esCreador = miRol === "creador";
        const esGestor = esCreador || miRol === "moderador";

        lista.innerHTML = datos.miembros.map((miembro) => {
            const acciones = [];
            if (!miembro.es_mio) {
                if (esCreador && miembro.rol !== "creador") {
                    acciones.push(miembro.rol === "moderador"
                        ? `<button type="button" data-rol-miembro="${escapeHtml(miembro.usuario_id)}" data-nuevo-rol="miembro">QUITAR MODERADOR</button>`
                        : `<button type="button" data-rol-miembro="${escapeHtml(miembro.usuario_id)}" data-nuevo-rol="moderador">HACER MODERADOR</button>`);
                }
                if (esGestor && miembro.rol !== "creador" && !(miRol === "moderador" && miembro.rol === "moderador")) {
                    acciones.push(miembro.puede_escribir
                        ? `<button type="button" data-escritura-miembro="${escapeHtml(miembro.usuario_id)}" data-puede-escribir="false">SOLO LECTURA</button>`
                        : `<button type="button" data-escritura-miembro="${escapeHtml(miembro.usuario_id)}" data-puede-escribir="true">PERMITIR ESCRIBIR</button>`);
                    acciones.push(`<button class="peligro" type="button" data-expulsar-miembro="${escapeHtml(miembro.usuario_id)}">EXPULSAR</button>`);
                    acciones.push(`<button class="peligro" type="button" data-bloquear-miembro="${escapeHtml(miembro.usuario_id)}">BLOQUEAR</button>`);
                }
            }

            const etiquetas = [
                `<em class="etiqueta-rol etiqueta-${escapeHtml(miembro.rol)}">${miembro.rol === "creador" ? "Creador" : miembro.rol === "moderador" ? "Moderador" : "Miembro"}</em>`
            ];
            if (miembro.silenciado) etiquetas.push('<em class="etiqueta-aviso">Silenciado</em>');
            if (!miembro.puede_escribir) etiquetas.push('<em class="etiqueta-aviso">Solo lectura</em>');

            return `
                <div class="fila-servidor ${miembro.es_mio ? "yo" : ""}">
                    <span class="fila-servidor-datos">
                        <strong style="${estiloNombre(miembro.color_nombre)}">${escapeHtml(miembro.nombre)}${miembro.es_mio ? " (tú)" : ""}</strong>
                        <span>${etiquetas.join(" ")}</span>
                    </span>
                    <span class="fila-servidor-acciones">${acciones.join("")}</span>
                </div>
            `;
        }).join("");

        const selectTraspaso = document.getElementById("select-traspaso-servidor");
        selectTraspaso.innerHTML = '<option value="">Elige un miembro...</option>'
            + datos.miembros
                .filter((miembro) => !miembro.es_mio && miembro.rol !== "creador")
                .map((miembro) => `<option value="${escapeHtml(miembro.usuario_id)}">${escapeHtml(miembro.nombre)}</option>`)
                .join("");
        estado.textContent = "";
    } catch (error) {
        estado.textContent = error.message;
    }
}

document.getElementById("lista-miembros-servidor").addEventListener("click", async (evento) => {
    if (!grupoActual) return;
    const base = `/api/grupos/${encodeURIComponent(grupoActual.id)}/miembros`;

    const rol = evento.target.closest("[data-rol-miembro]");
    if (rol) {
        try {
            await solicitarGrupo(`${base}/${encodeURIComponent(rol.dataset.rolMiembro)}/rol`, {
                method: "PATCH",
                body: JSON.stringify({ rol: rol.dataset.nuevoRol })
            });
            await Promise.all([cargarMiembrosServidor(), refrescarDetalleServidor()]);
        } catch (error) {
            document.getElementById("estado-miembros-servidor").textContent = error.message;
        }
        return;
    }

    const escritura = evento.target.closest("[data-escritura-miembro]");
    if (escritura) {
        try {
            await solicitarGrupo(`${base}/${encodeURIComponent(escritura.dataset.escrituraMiembro)}/escritura`, {
                method: "PATCH",
                body: JSON.stringify({ puede_escribir: escritura.dataset.puedeEscribir === "true" })
            });
            await cargarMiembrosServidor();
        } catch (error) {
            document.getElementById("estado-miembros-servidor").textContent = error.message;
        }
        return;
    }

    const expulsar = evento.target.closest("[data-expulsar-miembro]");
    if (expulsar) {
        if (!confirm("¿Expulsar a este miembro del servidor?")) return;
        try {
            await solicitarGrupo(`${base}/${encodeURIComponent(expulsar.dataset.expulsarMiembro)}`, { method: "DELETE" });
            await Promise.all([cargarMiembrosServidor(), refrescarDetalleServidor()]);
        } catch (error) {
            document.getElementById("estado-miembros-servidor").textContent = error.message;
        }
        return;
    }

    const bloquear = evento.target.closest("[data-bloquear-miembro]");
    if (bloquear) {
        if (!confirm("¿Bloquear a este miembro? Se expulsará y no podrá volver a unirse.")) return;
        try {
            await solicitarGrupo(`${base}/${encodeURIComponent(bloquear.dataset.bloquearMiembro)}/bloquear`, {
                method: "POST",
                body: JSON.stringify({ oculto: false })
            });
            await Promise.all([cargarMiembrosServidor(), refrescarDetalleServidor()]);
        } catch (error) {
            document.getElementById("estado-miembros-servidor").textContent = error.message;
        }
    }
});

// ========================================
// AJUSTES DEL SERVIDOR
// ========================================

function renderizarInvitacion() {
    const texto = document.getElementById("codigo-invitacion-servidor");
    const invitacion = detalleGrupo ? detalleGrupo.invitacion : null;
    if (!invitacion) {
        texto.textContent = "Sin código activo.";
        texto.dataset.codigo = "";
        return;
    }
    const caduca = invitacion.expira_en ? new Date(invitacion.expira_en).toLocaleDateString() : "";
    texto.textContent = `Código ${invitacion.codigo}${caduca ? ` · caduca el ${caduca}` : ""}`;
    texto.dataset.codigo = invitacion.codigo;
}

async function abrirAjustesServidor(focoCanal = false) {
    if (!grupoActual || !detalleGrupo) return;
    document.getElementById("modal-ajustes-servidor").hidden = false;
    document.getElementById("estado-ajustes-servidor").textContent = "";
    renderizarInvitacion();
    renderizarCanalesAjuste();
    renderizarPreviaImagenServidor();
    const botonSilencio = document.getElementById("boton-silenciar-servidor");
    botonSilencio.textContent = detalleGrupo.mi_silenciado ? "DEJAR DE SILENCIAR" : "SILENCIAR";
    await Promise.all([cargarBloqueadosServidor(), cargarMiembrosServidor()]);
    if (focoCanal) {
        document.getElementById("nombre-canal").focus();
    }
}

// La previa del ajuste refleja la foto actual del servidor, sea del modelo que
// sea. Si no hay, se avisa con la inicial para no dejar el hueco vacío.
function renderizarPreviaImagenServidor() {
    const previa = document.getElementById("previa-imagen-servidor");
    const quitar = document.getElementById("boton-quitar-imagen-servidor");
    const ruta = detalleGrupo?.imagen_ruta ?? grupoActual?.imagen_ruta ?? null;

    previa.innerHTML = ruta
        ? `<img src="${escapeHtml(ruta)}" alt="">`
        : `<span aria-hidden="true">${escapeHtml((detalleGrupo?.nombre || grupoActual?.nombre || "?").charAt(0).toUpperCase())}</span>`;
    previa.classList.toggle("sin-imagen", !ruta);
    quitar.hidden = !ruta;
}

document.getElementById("boton-cambiar-imagen-servidor").addEventListener("click", () => {
    const selector = document.getElementById("archivo-imagen-servidor");
    selector.value = "";
    selector.click();
});

document.getElementById("archivo-imagen-servidor").addEventListener("change", async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo || !grupoActual) return;

    const estado = document.getElementById("estado-ajustes-servidor");
    estado.textContent = "Subiendo la foto...";
    try {
        const datos = new FormData();
        datos.append("archivo", archivo);
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/imagen`, {
            method: "POST",
            body: datos
        });
        await refrescarDetalleServidor();
        renderizarPreviaImagenServidor();
        actualizarContextoServidor();
        await refrescarListaServidores();
        estado.textContent = "Foto del servidor actualizada.";
    } catch (error) {
        estado.textContent = error.message;
    } finally {
        evento.target.value = "";
    }
});

document.getElementById("boton-quitar-imagen-servidor").addEventListener("click", async () => {
    if (!grupoActual) return;
    const estado = document.getElementById("estado-ajustes-servidor");
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/imagen`, { method: "DELETE" });
        await refrescarDetalleServidor();
        renderizarPreviaImagenServidor();
        actualizarContextoServidor();
        await refrescarListaServidores();
        estado.textContent = "Se ha quitado la foto del servidor.";
    } catch (error) {
        estado.textContent = error.message;
    }
});

function renderizarCanalesAjuste() {
    const lista = document.getElementById("lista-canales-ajuste");
    lista.innerHTML = canalesGrupo.map((canal) => `
        <div class="fila-servidor">
            <span class="fila-servidor-datos">
                <strong># ${escapeHtml(canal.nombre)}</strong>
                <span>${canal.retencion_horas ? `Retención ${canal.retencion_horas} h` : "Permanente"}${canal.permite_ocultos ? " · ocultos permitidos" : ""}</span>
            </span>
            <span class="fila-servidor-acciones">
                <button type="button" data-ajuste-canal="${escapeHtml(canal.id)}">EDITAR</button>
            </span>
        </div>
    `).join("") || '<p class="estado-amigos">No hay canales.</p>';
}

async function cargarBloqueadosServidor() {
    if (!grupoActual) return;
    const lista = document.getElementById("lista-bloqueados-servidor");
    try {
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/bloqueados`);
        lista.innerHTML = datos.bloqueados.length ? datos.bloqueados.map((bloqueo) => `
            <div class="fila-servidor">
                <span class="fila-servidor-datos">
                    <strong style="${estiloNombre(bloqueo.color_nombre)}">${escapeHtml(bloqueo.nombre ?? "Desconocido")}</strong>
                    <span>${escapeHtml(bloqueo.etiqueta)}${bloqueo.motivo ? ` · ${escapeHtml(bloqueo.motivo)}` : ""}</span>
                </span>
                <span class="fila-servidor-acciones">
                    ${bloqueo.usuario_id ? `<button type="button" data-desbloquear="${escapeHtml(bloqueo.usuario_id)}">DESBLOQUEAR</button>` : ""}
                </span>
            </div>
        `).join("") : '<p class="estado-amigos">No hay usuarios bloqueados.</p>';
    } catch (error) {
        lista.innerHTML = `<p class="estado-amigos">${escapeHtml(error.message)}</p>`;
    }
}

document.getElementById("boton-ajustes-servidor").addEventListener("click", () => abrirAjustesServidor());

document.getElementById("boton-generar-invitacion").addEventListener("click", async () => {
    if (!grupoActual) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/invitacion`, { method: "POST" });
        if (detalleGrupo) detalleGrupo.invitacion = datos.invitacion;
        renderizarInvitacion();
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("boton-copiar-invitacion").addEventListener("click", async () => {
    const codigo = document.getElementById("codigo-invitacion-servidor").dataset.codigo;
    if (!codigo) {
        document.getElementById("estado-ajustes-servidor").textContent = "Genera un código primero.";
        return;
    }
    try {
        await navigator.clipboard.writeText(codigo);
        document.getElementById("estado-ajustes-servidor").textContent = "Código copiado.";
    } catch {
        document.getElementById("estado-ajustes-servidor").textContent = `Código: ${codigo}`;
    }
});

document.getElementById("boton-eliminar-invitacion").addEventListener("click", async () => {
    if (!grupoActual) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/invitacion`, { method: "DELETE" });
        if (detalleGrupo) detalleGrupo.invitacion = null;
        renderizarInvitacion();
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("formulario-crear-canal").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!grupoActual) return;
    const retencion = document.getElementById("retencion-canal").value;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/canales`, {
            method: "POST",
            body: JSON.stringify({
                nombre: document.getElementById("nombre-canal").value,
                descripcion: document.getElementById("descripcion-canal").value || undefined,
                retencion_horas: retencion === "" ? null : Number(retencion),
                permite_ocultos: document.getElementById("ocultos-canal").checked
            })
        });
        evento.currentTarget.reset();
        await refrescarDetalleServidor();
        renderizarCanalesAjuste();
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("lista-canales-ajuste").addEventListener("click", (evento) => {
    const boton = evento.target.closest("[data-ajuste-canal]");
    if (boton) abrirEditorCanal(boton.dataset.ajusteCanal);
});

document.getElementById("lista-bloqueados-servidor").addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-desbloquear]");
    if (!boton || !grupoActual) return;
    if (!confirm("¿Desbloquear a este usuario?")) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/bloqueados/${encodeURIComponent(boton.dataset.desbloquear)}`, { method: "DELETE" });
        await cargarBloqueadosServidor();
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("boton-quitar-restricciones").addEventListener("click", async () => {
    if (!grupoActual) return;
    if (!confirm("¿Levantar todas las restricciones de mensajes ocultos de este servidor?")) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/ocultos/restricciones/quitar`, {
            method: "POST",
            body: JSON.stringify({})
        });
        document.getElementById("estado-ajustes-servidor").textContent = `${datos.totales} restricción(es) levantada(s).`;
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("boton-silenciar-servidor").addEventListener("click", async () => {
    if (!grupoActual || !detalleGrupo) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/silenciar`, {
            method: "POST",
            body: JSON.stringify({ silenciado: !detalleGrupo.mi_silenciado })
        });
        detalleGrupo.mi_silenciado = datos.silenciado;
        document.getElementById("boton-silenciar-servidor").textContent = datos.silenciado ? "DEJAR DE SILENCIAR" : "SILENCIAR";
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("boton-traspasar-servidor").addEventListener("click", async () => {
    if (!grupoActual) return;
    const usuarioId = document.getElementById("select-traspaso-servidor").value;
    if (!usuarioId) {
        document.getElementById("estado-ajustes-servidor").textContent = "Elige un miembro para traspasar el servidor.";
        return;
    }
    if (!confirm("¿Traspasar la propiedad del servidor? Perderás el rol de creador.")) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/propiedad`, {
            method: "POST",
            body: JSON.stringify({ usuarioId })
        });
        await refrescarDetalleServidor();
        document.getElementById("estado-ajustes-servidor").textContent = "Servidor traspasado.";
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

function abrirEditorCanal(canalId) {
    const canal = canalesGrupo.find((elemento) => elemento.id === canalId);
    if (!canal) return;
    document.getElementById("editar-canal-id").value = canal.id;
    document.getElementById("editar-nombre-canal").value = canal.nombre;
    document.getElementById("editar-descripcion-canal").value = canal.descripcion ?? "";
    document.getElementById("editar-retencion-canal").value = canal.retencion_horas ?? "";
    document.getElementById("editar-ocultos-canal").checked = Boolean(canal.permite_ocultos);
    document.getElementById("modal-canal-servidor").hidden = false;
}

document.getElementById("formulario-editar-canal").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!grupoActual) return;
    const canalId = document.getElementById("editar-canal-id").value;
    const retencion = document.getElementById("editar-retencion-canal").value;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/canales/${encodeURIComponent(canalId)}`, {
            method: "PATCH",
            body: JSON.stringify({
                nombre: document.getElementById("editar-nombre-canal").value,
                descripcion: document.getElementById("editar-descripcion-canal").value,
                retencion_horas: retencion === "" ? null : Number(retencion),
                permite_ocultos: document.getElementById("editar-ocultos-canal").checked
            })
        });
        document.getElementById("modal-canal-servidor").hidden = true;
        await refrescarDetalleServidor();
        renderizarCanalesAjuste();
        await cargarMensajesServidor();
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

document.getElementById("boton-eliminar-canal").addEventListener("click", async () => {
    if (!grupoActual) return;
    const canalId = document.getElementById("editar-canal-id").value;
    if (!canalId) return;
    if (!confirm("¿Eliminar este canal y todos sus mensajes?")) return;
    try {
        await solicitarGrupo(`/api/grupos/${encodeURIComponent(grupoActual.id)}/canales/${encodeURIComponent(canalId)}`, { method: "DELETE" });
        document.getElementById("modal-canal-servidor").hidden = true;
        await refrescarDetalleServidor();
        renderizarCanalesAjuste();
        await cargarMensajesServidor();
    } catch (error) {
        document.getElementById("estado-ajustes-servidor").textContent = error.message;
    }
});

// ========================================
// UNIRSE POR CÓDIGO DE INVITACIÓN
// ========================================

document.getElementById("formulario-invitacion").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const codigo = document.getElementById("codigo-invitacion").value.trim().toUpperCase();
    const vista = document.getElementById("vista-invitacion");
    vista.innerHTML = "";
    if (!codigo) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/invitacion/${encodeURIComponent(codigo)}`);
        const invitacion = datos.invitacion;
        vista.innerHTML = `
            <div class="servidor-item">
                <span class="servidor-item-datos">
                    <strong>${escapeHtml(invitacion.nombre)}</strong>
                    <span>${escapeHtml(invitacion.descripcion || "Sin descripción")} · ${invitacion.miembros} miembros</span>
                </span>
                ${invitacion.es_miembro
                    ? '<span class="servidor-item-meta">YA ES TUYO</span>'
                    : `<button type="button" data-unirse-codigo="${escapeHtml(codigo)}">UNIRSE</button>`}
            </div>
        `;
    } catch (error) {
        vista.innerHTML = `<p class="estado-amigos">${escapeHtml(error.message)}</p>`;
    }
});

document.getElementById("vista-invitacion").addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-unirse-codigo]");
    if (!boton) return;
    try {
        const datos = await solicitarGrupo(`/api/grupos/invitacion/${encodeURIComponent(boton.dataset.unirseCodigo)}/unirse`, { method: "POST" });
        document.getElementById("vista-invitacion").innerHTML = "";
        document.getElementById("codigo-invitacion").value = "";
        const listado = await solicitarGrupo("/api/grupos");
        const grupo = listado.grupos.find((elemento) => elemento.id === datos.grupoId);
        if (grupo) {
            await abrirServidor(grupo);
        } else {
            cargarServidores();
        }
    } catch (error) {
        document.getElementById("vista-invitacion").innerHTML = `<p class="estado-amigos">${escapeHtml(error.message)}</p>`;
    }
});

// ========================================
// TIEMPO REAL (WEBSOCKET)
// ========================================

function socketAbierto() {
    return Boolean(socketTiempoReal && socketTiempoReal.readyState === WebSocket.OPEN);
}

async function conectarTiempoReal() {
    if (!localStorage.getItem("atuistas_token")) return;
    if (socketTiempoReal) return;
    if (temporizadorReconexionWs) {
        clearTimeout(temporizadorReconexionWs);
        temporizadorReconexionWs = null;
    }

    let socket;
    try {
        // El token nunca viaja por la URL: se cambia por un ticket de un solo uso.
        const datos = await solicitarGrupo("/api/ws/ticket");
        const protocolo = location.protocol === "https:" ? "wss" : "ws";
        socket = new WebSocket(`${protocolo}://${location.host}/ws?ticket=${encodeURIComponent(datos.ticket)}`);
    } catch {
        programarReconexionWs();
        return;
    }

    socketTiempoReal = socket;

    socket.addEventListener("open", () => {
        intentosReconexionWs = 0;
    });

    socket.addEventListener("message", (evento) => {
        try {
            manejarEventoTiempoReal(JSON.parse(evento.data));
        } catch (error) {
            console.warn("Evento de tiempo real no válido", error);
        }
    });

    socket.addEventListener("error", () => {
        socket.close();
    });

    socket.addEventListener("close", () => {
        if (socketTiempoReal === socket) {
            socketTiempoReal = null;
        }
        programarReconexionWs();
    });
}

function programarReconexionWs() {
    if (temporizadorReconexionWs) return;
    if (!localStorage.getItem("atuistas_token")) return;
    intentosReconexionWs = Math.min(intentosReconexionWs + 1, 6);
    const espera = Math.min(1000 * (2 ** intentosReconexionWs), 30000);
    temporizadorReconexionWs = setTimeout(() => {
        temporizadorReconexionWs = null;
        conectarTiempoReal();
    }, espera);
}

function desconectarTiempoReal() {
    if (temporizadorReconexionWs) {
        clearTimeout(temporizadorReconexionWs);
        temporizadorReconexionWs = null;
    }
    intentosReconexionWs = 0;
    if (socketTiempoReal) {
        const socket = socketTiempoReal;
        socketTiempoReal = null;
        socket.close();
    }
}

function agregarMensajeServidor(mensaje) {
    if (!grupoActual || !mensaje || !mensaje.id) return;
    if (mensajesServidor.querySelector(`[data-mensaje-id="${CSS.escape(mensaje.id)}"]`)) return;
    const vacio = mensajesServidor.querySelector("p.estado-amigos");
    if (vacio) vacio.remove();

    // El cabecera depende del último autor ya pintado para no repetir el nombre.
    const ultimo = mensajesServidor.querySelector(".mensaje-chat:last-of-type");
    const mismoAutor = ultimo && ultimo.dataset.autorId === (mensaje.autor_id ?? "");
    const conCabecera = !mismoAutor || mensaje.tipo !== "texto";

    const contenedor = document.createElement("div");
    contenedor.innerHTML = plantillaMensaje(mensaje, { mostrarAutor: conCabecera });
    const elemento = contenedor.firstElementChild;
    if (!elemento) return;
    elemento.dataset.autorId = mensaje.autor_id ?? "";

    mensajesServidor.appendChild(elemento);
    configurarGestoMensajeServidor(elemento, mensaje);
    mensajesServidor.scrollTop = mensajesServidor.scrollHeight;
}

async function manejarEventoTiempoReal(evento) {
    if (!evento || !evento.tipo) return;

    if (evento.tipo === "conexion_establecida") return;

    if (evento.tipo === "expulsado") {
        if (!grupoActual || evento.grupoId !== grupoActual.id) return;
        alert("Ya no perteneces a este servidor.");
        cerrarPanelesServidor();
        volverAListaServidores();
        return;
    }

    if (!grupoActual || !evento.grupoId || evento.grupoId !== grupoActual.id) return;

    switch (evento.tipo) {
        case "mensaje_nuevo": {
            if (canalActual && evento.canalId !== canalActual.id) return;
            agregarMensajeServidor(evento.mensaje);
            return;
        }
        case "mensaje_editado": {
            const mensaje = mensajesServidor.querySelector(`[data-mensaje-id="${CSS.escape(evento.mensajeId)}"]`);
            if (!mensaje) return;
            const parrafo = mensaje.querySelector("p");
            if (parrafo) parrafo.textContent = evento.contenido;
            const meta = mensaje.querySelector(".meta-mensaje-servidor");
            if (meta && !meta.querySelector("small")) {
                meta.insertAdjacentHTML("afterbegin", "<small>editado</small>");
            }
            return;
        }
        case "mensajes_eliminados": {
            for (const id of evento.mensajeIds || []) {
                const nodo = mensajesServidor.querySelector(`[data-mensaje-id="${CSS.escape(id)}"]`);
                if (nodo) nodo.remove();
            }
            if (!mensajesServidor.querySelector(".mensaje-chat")) {
                mensajesServidor.innerHTML = '<p class="estado-amigos">Aún no hay mensajes en este canal.</p>';
            }
            return;
        }
        case "canales_actualizados": {
            await refrescarDetalleServidor();
            await cargarMensajesServidor();
            return;
        }
        case "grupo_actualizado": {
            await refrescarDetalleServidor();
            return;
        }
        case "miembros_actualizados": {
            await refrescarDetalleServidor();
            if (!document.getElementById("modal-miembros-servidor").hidden) {
                await cargarMiembrosServidor();
            }
            if (!document.getElementById("modal-ajustes-servidor").hidden) {
                await cargarMiembrosServidor();
                await cargarBloqueadosServidor();
            }
            return;
        }
        default:
            return;
    }
}

// ========================================
// BUSCAR PERSONAS
// ========================================








async function buscarPersonas(texto) {
    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    const textoLimpio = texto.trim();

    if (!textoLimpio) {
        listaResultadosAmigos.innerHTML = "";

        estadoBusquedaAmigos.textContent =
            "Escribe un nombre para buscar personas.";

        return;
    }

    estadoBusquedaAmigos.textContent =
        "Buscando...";

    listaResultadosAmigos.innerHTML = "";

    try {
        const respuesta = await fetch(
            `/api/amigos/buscar?texto=${encodeURIComponent(textoLimpio)}`,
            {
                method: "GET",
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            estadoBusquedaAmigos.textContent =
                datos.error ||
                "No se han podido buscar personas.";

            return;
        }

        if (!datos.usuarios || datos.usuarios.length === 0) {
            estadoBusquedaAmigos.textContent =
                "No se han encontrado personas.";

            return;
        }

        estadoBusquedaAmigos.textContent = "";

        datos.usuarios.forEach((usuario) => {
            const elemento =
                document.createElement("div");

            elemento.className = "persona-resultado";

            elemento.innerHTML = `
                <div class="persona-resultado-info">
                    <div class="persona-resultado-avatar">
                        ${usuario.avatar_url
                            ? `<img
                                src="/${usuario.avatar_url}"
                                alt=""
                            >`
                            : ""
                        }
                    </div>

                    <div class="persona-resultado-datos">
                        <strong style="${estiloNombre(usuario.color_nombre)}">
                            ${escapeHtml(usuario.nombre)}
                        </strong>
                    </div>
                </div>

                <button
                    type="button"
                    class="boton-enviar-solicitud"
                    data-usuario-id="${usuario.id}"
                    ${
                        usuario.estado_amistad !== "ninguno"
                            ? "disabled"
                            : ""
                    }
                >
                    ${
                        usuario.estado_amistad === "amigo"
                            ? "AMIGOS"
                            : usuario.estado_amistad === "solicitud_enviada"
                                ? "SOLICITUD ENVIADA"
                                : usuario.estado_amistad === "solicitud_recibida"
                                    ? "SOLICITUD RECIBIDA"
                                    : "AGREGAR"
                    }
                </button>
            `;

            listaResultadosAmigos.appendChild(elemento);

            const botonAgregar =
                elemento.querySelector(
                    ".boton-enviar-solicitud"
                );

            if (
                usuario.estado_amistad === "ninguno"
            ) {
                botonAgregar.addEventListener(
                    "click",
                    () => {
                        enviarSolicitudAmistad(
                            usuario.id,
                            botonAgregar
                        );
                    }
                );
            }

        });

    } catch (error) {
        console.error(
            "Error buscando personas:",
            error
        );

        estadoBusquedaAmigos.textContent =
            "No se ha podido conectar con el servidor.";
    }
}

buscadorPersonas.addEventListener(
    "input",
    () => {
        buscarPersonas(
            buscadorPersonas.value
        );
    }
);

// ========================================
// ENVIAR SOLICITUD DE AMISTAD
// ========================================

async function enviarSolicitudAmistad(
    usuarioId,
    boton
) {
    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    boton.disabled = true;
    boton.textContent = "ENVIANDO...";

    try {
        const respuesta = await fetch(
            "/api/amigos/solicitud",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    destinatarioId: usuarioId
                })
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            console.error(
                "Error enviando solicitud:",
                datos
            );

            boton.disabled = false;
            boton.textContent = "AGREGAR";

            return;
        }

        boton.textContent = "SOLICITUD ENVIADA";
        boton.disabled = true;

    } catch (error) {
        console.error(
            "Error enviando solicitud:",
            error
        );

        boton.disabled = false;
        boton.textContent = "AGREGAR";
    }
}

// ========================================
// CARGAR SOLICITUDES RECIBIDAS
// ========================================

async function cargarSolicitudesRecibidas() {
    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    listaSolicitudesAmigos.innerHTML = "";

    estadoSolicitudesAmigos.textContent =
        "Cargando solicitudes...";

    try {
        const respuesta = await fetch(
            "/api/amigos/solicitudes/recibidas",
            {
                method: "GET",
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            estadoSolicitudesAmigos.textContent =
                datos.error ||
                "No se han podido cargar las solicitudes.";

            return;
        }

        if (
            !datos.solicitudes ||
            datos.solicitudes.length === 0
        ) {
            estadoSolicitudesAmigos.textContent =
                "No hay solicitudes de amistad.";

            return;
        }

        estadoSolicitudesAmigos.textContent = "";

        datos.solicitudes.forEach((solicitud) => {
            const elemento =
                document.createElement("div");

            elemento.className =
                "solicitud-amistad";

            elemento.innerHTML = `
                <div class="solicitud-amistad-info">

                    <div class="solicitud-amistad-avatar">
                        ${solicitud.avatar_url
                            ? `<img
                                src="/${solicitud.avatar_url}"
                                alt=""
                            >`
                            : ""
                        }
                    </div>

                    <div class="solicitud-amistad-datos">
                        <strong style="${estiloNombre(solicitud.color_nombre)}">
                            ${escapeHtml(solicitud.nombre)}
                        </strong>
                    </div>

                </div>

                <div class="solicitud-amistad-acciones">

                    <button
                        type="button"
                        class="boton-aceptar-solicitud"
                        data-solicitud-id="${solicitud.id}"
                    >
                        ACEPTAR
                    </button>

                    <button
                        type="button"
                        class="boton-rechazar-solicitud"
                        data-solicitud-id="${solicitud.id}"
                    >
                        RECHAZAR
                    </button>

                </div>
            `;

            listaSolicitudesAmigos.appendChild(elemento);

            const botonAceptar =
                elemento.querySelector(
                    ".boton-aceptar-solicitud"
                );

            const botonRechazar =
                elemento.querySelector(
                    ".boton-rechazar-solicitud"
                );

            botonAceptar.addEventListener(
                "click",
                () => {
                    aceptarSolicitud(
                        solicitud.id,
                        elemento
                    );
                }
            );

            botonRechazar.addEventListener(
                "click",
                () => {
                    rechazarSolicitud(
                        solicitud.id,
                        elemento
                    );
                }
            );
        });

    } catch (error) {
        console.error(
            "Error cargando solicitudes:",
            error
        );

        estadoSolicitudesAmigos.textContent =
            "No se ha podido conectar con el servidor.";
    }
}

// ========================================
// ACEPTAR SOLICITUD
// ========================================

async function aceptarSolicitud(
    solicitudId,
    elemento
) {
    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    try {
        const respuesta = await fetch(
            "/api/amigos/solicitudes/aceptar",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    solicitudId
                })
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            console.error(
                "Error aceptando solicitud:",
                datos
            );

            return;
        }

        elemento.remove();

        cargarSolicitudesRecibidas();

    } catch (error) {
        console.error(
            "Error aceptando solicitud:",
            error
        );
    }
}


// ========================================
// RECHAZAR SOLICITUD
// ========================================

async function rechazarSolicitud(
    solicitudId,
    elemento
) {
    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    try {
        const respuesta = await fetch(
            "/api/amigos/solicitudes/rechazar",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    solicitudId
                })
            }
        );

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            console.error(
                "Error rechazando solicitud:",
                datos
            );

            return;
        }

        elemento.remove();

        cargarSolicitudesRecibidas();

    } catch (error) {
        console.error(
            "Error rechazando solicitud:",
            error
        );
    }
}

/* ==============================
   COMPROBAR SESIÓN
   ============================== */

async function comprobarSesion() {

    const token =
        localStorage.getItem("atuistas_token");


    if (!token) {

        mostrarAcceso();

        return;
    }


    try {

        const respuesta = await fetch(
            "/api/auth/me",
            {
                method: "GET",

                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );


        if (!respuesta.ok) {

            localStorage.removeItem(
                "atuistas_token"
            );

            mostrarAcceso();

            return;
        }


        mostrarAplicacion();


    } catch (error) {

        console.error(
            "Error comprobando sesión:",
            error
        );

        mostrarAcceso();

    }

}


/* ==============================
   ENTRAR
   ============================== */

botonEntrar.addEventListener(
    "click",
    () => {

        accesoInicial.hidden = true;
        accesoLogin.hidden = false;

        codigoLogin.focus();

    }
);


/* ==============================
   LOGIN
   ============================== */

formularioLogin.addEventListener(
    "submit",
    async (evento) => {

        evento.preventDefault();

        errorLogin.textContent = "";

        const codigo =
            codigoLogin.value.trim();


        if (!codigo) {

            errorLogin.textContent =
                "Introduce tu código";

            return;
        }


        try {

            const respuesta = await fetch(
                "/api/auth/vincular",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        codigo,
                        dispositivo_id:
                            identificadorDispositivo
                    })
                }
            );


            const tipoRespuesta =
                respuesta.headers.get("content-type") || "";

            let datos;
            try {
                datos = await respuesta.json();
            } catch {
                if (!tipoRespuesta.includes("application/json")) {
                    throw new Error(
                        "Esta página no está conectada al backend. No uses Go Live; abre http://127.0.0.1:3000."
                    );
                }

                throw new Error(
                    "El servidor devolvió una respuesta vacía. Comprueba que Atuistas esté ejecutándose en http://127.0.0.1:3000."
                );
            }


            if (!respuesta.ok) {

                throw new Error(
                    datos.error ||
                    "No se pudo iniciar sesión"
                );

            }


            localStorage.setItem(
                "atuistas_token",
                datos.usuario.token
            );


            mostrarAplicacion();


        } catch (error) {

            console.error(
                "Error iniciando sesión:",
                error
            );

            errorLogin.textContent =
                error.message ||
                "Error al iniciar sesión";

        }

    }
);


/* ==============================
   CREAR CUENTA
   ============================== */

botonCrearCuenta.addEventListener(
    "click",
    () => {

        accesoInicial.hidden = true;
        accesoRegistro.hidden = false;

        nombreRegistro.focus();

    }
);


/* ==============================
   VOLVER DESDE LOGIN
   ============================== */

botonVolverLogin.addEventListener(
    "click",
    () => {

        accesoLogin.hidden = true;
        accesoInicial.hidden = false;

    }
);


/* ==============================
   VOLVER DESDE REGISTRO
   ============================== */

botonVolverRegistro.addEventListener(
    "click",
    () => {

        accesoRegistro.hidden = true;
        accesoInicial.hidden = false;

    }
);


/* ==============================
   REGISTRO
   ============================== */

formularioRegistro.addEventListener(
    "submit",
    async (evento) => {

        evento.preventDefault();

        errorRegistro.textContent = "";

        const nombre =
            nombreRegistro.value.trim();


        if (nombre.length === 0) {

            errorRegistro.textContent =
                "Introduce un nombre";

            return;
        }


        try {

            const respuesta = await fetch(
                "/api/auth/registro",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        nombre,
                        dispositivo_id:
                            identificadorDispositivo
                    })
                }
            );


            const datos =
                await respuesta.json();


            if (!respuesta.ok) {

                throw new Error(
                    datos.error ||
                    "No se pudo crear la cuenta"
                );

            }


            localStorage.setItem(
                "atuistas_token",
                datos.usuario.token
            );


            formularioRegistro.hidden = true;


            codigoGeneradoTexto.textContent =
                datos.usuario.codigo_vinculacion;


            codigoGenerado.hidden = false;


        } catch (error) {

            console.error(
                "Error registrando usuario:",
                error
            );

            errorRegistro.textContent =
                error.message ||
                "Error al crear la cuenta";

        }

    }
);


/* ==============================
   CONTINUAR DESPUÉS DEL REGISTRO
   ============================== */

botonContinuarRegistro.addEventListener(
    "click",
    () => {

        codigoGenerado.hidden = true;

        accesoRegistro.hidden = true;

        mostrarAplicacion();

    }
);


/* ==============================
   COPIAR CÓDIGO DE REGISTRO
   ============================== */

botonCopiarCodigo.addEventListener(
    "click",
    async () => {

        const codigo =
            codigoGeneradoTexto.textContent;


        if (!codigo) {
            return;
        }


        try {

            await navigator.clipboard.writeText(
                codigo
            );


            botonCopiarCodigo.textContent = "✓";

            botonCopiarCodigo.setAttribute(
                "aria-label",
                "Código copiado"
            );


            setTimeout(() => {

                botonCopiarCodigo.textContent = "⧉";

                botonCopiarCodigo.setAttribute(
                    "aria-label",
                    "Copiar código"
                );

            }, 2000);


        } catch (error) {

            console.error(
                "No se pudo copiar el código:",
                error
            );

        }

    }
);


/* ==============================
   NAVEGACIÓN PRINCIPAL
   ============================== */

botonEntrarApp.addEventListener(
    "click",
    () => {

        mostrarSeccion("entrar");

    }
);


botonAmigos.addEventListener(
    "click",
    () => {

        mostrarSeccion("amigos");

    }
);

// ========================================
// PESTAÑAS DE AGREGAR AMIGOS
// ========================================

botonEncontrarPersonas.addEventListener("click", () => {
    seccionEncontrarPersonas.hidden = false;
    seccionSolicitudes.hidden = true;

    botonEncontrarPersonas.classList.add("activa");
    botonSolicitudes.classList.remove("activa");

    botonEncontrarPersonas.setAttribute(
        "aria-selected",
        "true"
    );

    botonSolicitudes.setAttribute(
        "aria-selected",
        "false"
    );
});

botonSolicitudes.addEventListener("click", () => {
    seccionEncontrarPersonas.hidden = true;
    seccionSolicitudes.hidden = false;

    botonEncontrarPersonas.classList.remove("activa");
    botonSolicitudes.classList.add("activa");

    botonEncontrarPersonas.setAttribute(
        "aria-selected",
        "false"
    );

    botonSolicitudes.setAttribute(
        "aria-selected",
        "true"
    );

    cargarSolicitudesRecibidas();
});

botonServidores.addEventListener(
    "click",
    () => {

        mostrarSeccion("servidores");

    }
);


botonCuenta.addEventListener(
    "click",
    () => {

        mostrarSeccion("cuenta");

    }
);


/* ==============================
   ABRIR OPCIONES DE FOTO
   ============================== */

botonFotoPerfil.addEventListener(
    "click",
    () => {

        modalOpcionesFoto.hidden = false;

    }
);


/* ==============================
   CERRAR OPCIONES DE FOTO
   ============================== */

botonCerrarOpcionesFoto.addEventListener(
    "click",
    () => {

        modalOpcionesFoto.hidden = true;

    }
);


/* ==============================
   VER FOTO GRANDE
   ============================== */

botonVerFoto.addEventListener(
    "click",
    () => {

        const foto =
            fotoPerfilCuenta.src;


        if (!foto || foto.endsWith("/")) {
            return;
        }


        fotoPerfilGrande.src = foto;

        modalOpcionesFoto.hidden = true;
        modalFotoGrande.hidden = false;

    }
);


/* ==============================
   CERRAR FOTO GRANDE
   ============================== */

botonCerrarFotoGrande.addEventListener(
    "click",
    () => {

        modalFotoGrande.hidden = true;

    }
);


/* ==============================
   CAMBIAR FOTO
   ============================== */

botonCambiarFoto.addEventListener(
    "click",
    () => {

        modalOpcionesFoto.hidden = true;

        inputFotoPerfil.click();

    }
);


/* ==============================
   CAMBIAR FOTO DE PERFIL
   ============================== */

inputFotoPerfil.addEventListener(
    "change",
    async () => {

        const archivo =
            inputFotoPerfil.files[0];


        if (!archivo) {
            return;
        }


        if (!archivo.type.startsWith("image/")) {

            alert(
                "Selecciona una imagen válida."
            );

            inputFotoPerfil.value = "";

            return;
        }


        if (archivo.size > 12 * 1024 * 1024) {

            alert(
                "La imagen no puede superar los 12 MB."
            );

            inputFotoPerfil.value = "";

            return;
        }


        /*
         * PREVISUALIZACIÓN INMEDIATA
         */

        const url =
            URL.createObjectURL(archivo);

        fotoPerfilCuenta.src = url;
        fotoPerfilGrande.src = url;


        /*
         * SUBIR AL SERVIDOR
         */

        const token =
            localStorage.getItem("atuistas_token");


        if (!token) {

            alert(
                "Tu sesión ha expirado."
            );

            return;
        }


        const formulario =
            new FormData();

        formulario.append(
            "avatar",
            archivo
        );


        try {

            botonCambiarFoto.disabled = true;


            const respuesta =
                await fetch(
                    "/api/auth/avatar",
                    {
                        method: "POST",

                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        },

                        body: formulario
                    }
                );


            const datos =
                await respuesta.json();


            if (!respuesta.ok) {

                throw new Error(
                    datos.error ||
                    "No se pudo subir la imagen"
                );

            }


            alert(
                "Foto de perfil actualizada correctamente."
            );


        } catch (error) {

            console.error(
                "Error subiendo avatar:",
                error
            );


            alert(
                error.message ||
                "Error al subir la foto de perfil"
            );


        } finally {

            botonCambiarFoto.disabled = false;

            inputFotoPerfil.value = "";

        }

    }
);


/* ==============================
   CERRAR MODALES AL PULSAR FUERA
   ============================== */

modalOpcionesFoto.addEventListener(
    "click",
    (evento) => {

        if (
            evento.target ===
            modalOpcionesFoto
        ) {

            modalOpcionesFoto.hidden = true;

        }

    }
);


modalFotoGrande.addEventListener(
    "click",
    (evento) => {

        if (
            evento.target ===
            modalFotoGrande
        ) {

            modalFotoGrande.hidden = true;

        }

    }
);


/* ==============================
   CARGAR CUENTA
   ============================== */

async function cargarCuenta() {

    const token =
        localStorage.getItem("atuistas_token");


    if (!token) {
        return;
    }


    try {

        const respuesta = await fetch(
            "/api/auth/me",
            {
                method: "GET",

                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );


        if (!respuesta.ok) {
            return;
        }


        const datos =
            await respuesta.json();


        if (!datos.usuario) {
            return;
        }


        const usuario =
            datos.usuario;

        localStorage.setItem("atuistas_cache_cuenta", JSON.stringify(usuario));
        actualizarTarjetaMiEstado();


        /* ==============================
           DATOS BÁSICOS
           ============================== */

        // Punto de partida del guardado automático: lo que hay en el servidor.
        cuentaGuardada = {
            nombre: usuario.nombre,
            descripcion: usuario.descripcion || "",
            color_nombre: usuario.color_nombre || "#FFFFFF"
        };

        mostrarGuardadoCuenta("");

        nombreCuentaEditar.value =
            usuario.nombre;

        pintarNombreCuenta(usuario.nombre, usuario.color_nombre);

        descripcionCuenta.value =
            usuario.descripcion || "";


        colorNombreCuenta.value =
            usuario.color_nombre || "#FFFFFF";


        estadoCuenta.textContent =
            usuario.es_admin
                ? "Developer"
                : "";


        /* ==============================
           FOTO DE PERFIL
           ============================== */

        if (usuario.avatar_ruta) {

            const rutaAvatar =
                "/" + usuario.avatar_ruta.replace(/\\/g, "/");

            fotoPerfilCuenta.src =
                rutaAvatar;

            fotoPerfilGrande.src =
                rutaAvatar;

        }

        // Anillo del avatar del mismo color que el nombre.
        aplicarAnilloAvatar(botonFotoPerfil, usuario.color_nombre);


        /* ==============================
           CÓDIGO DE VINCULACIÓN
           ============================== */

        codigoCuentaTexto.textContent =
            usuario.codigo_vinculacion || "Código no disponible. Regenera uno para vincular otros dispositivos.";


    } catch (error) {

        console.error(
            "Error cargando cuenta:",
            error
        );

    }

}


/* ==============================
   GUARDADO AUTOMÁTICO DE LA CUENTA
   El nombre, la descripción y el color se guardan solos: al salir del campo,
   al cambiar el color y al cerrar la pestaña de Cuenta. Ya no hay botón.
   ============================== */

// Últimos valores confirmados por el servidor. Si algo se rechaza (por ejemplo
// un nombre ya ocupado) la interfaz vuelve a estos para no dejar en pantalla
// un nombre que en realidad no está guardado.
let cuentaGuardada = { nombre: "", descripcion: "", color_nombre: "#FFFFFF" };

let temporizadorCuenta = null;
let guardandoCuenta = false;
let cambioPendienteCuenta = false;

function leerCacheCuenta() {
    try {
        return JSON.parse(localStorage.getItem("atuistas_cache_cuenta") || "null");
    } catch {
        return null;
    }
}

function pintarNombreCuenta(nombre, color) {
    if (nombreCuenta) {
        nombreCuenta.textContent = nombre;
        nombreCuenta.setAttribute("style", estiloNombre(color));
    }
    if (vistaNombreCuenta) {
        vistaNombreCuenta.textContent = nombre || "Tu nombre";
        vistaNombreCuenta.setAttribute("style", estiloNombre(color));
    }
}

function mostrarGuardadoCuenta(mensaje, esError = false) {
    if (!guardadoCuenta) return;
    guardadoCuenta.textContent = mensaje;
    guardadoCuenta.classList.toggle("error", esError);
}

async function guardarCuenta() {

    const token =
        localStorage.getItem("atuistas_token");

    if (!token) {
        return;
    }

    // Si ya hay una petición en vuelo, el cambio se aplica al terminar en vez
    // de lanzar otra: así nunca se pisan dos guardados.
    if (guardandoCuenta) {
        cambioPendienteCuenta = true;
        return;
    }

    const nombre =
        nombreCuentaEditar.value.trim();

    const descripcion =
        descripcionCuenta.value.trim();

    const colorNombre =
        colorNombreCuenta.value;

    // Si no ha cambiado nada, no se molesta al servidor.
    if (
        nombre === cuentaGuardada.nombre &&
        descripcion === cuentaGuardada.descripcion &&
        colorNombre.toLowerCase() === cuentaGuardada.color_nombre.toLowerCase()
    ) {
        return;
    }

    guardandoCuenta = true;

    try {

        const respuesta = await fetch(
            "/api/auth/cuenta",
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body: JSON.stringify({
                    nombre,
                    descripcion,
                    color_nombre:
                        colorNombre
                })
            }
        );


        const datos =
            await respuesta.json();


        if (!respuesta.ok) {

            throw new Error(
                datos.error ||
                "No se pudieron guardar los cambios"
            );

        }


        if (datos.usuario) {

            cuentaGuardada = {
                nombre: datos.usuario.nombre,
                descripcion: datos.usuario.descripcion || "",
                color_nombre: datos.usuario.color_nombre || "#FFFFFF"
            };

            // Manda el servidor: puede haber recortado el nombre.
            nombreCuentaEditar.value =
                datos.usuario.nombre;

            descripcionCuenta.value =
                datos.usuario.descripcion || "";

            colorNombreCuenta.value =
                datos.usuario.color_nombre ||
                "#FFFFFF";

            pintarNombreCuenta(datos.usuario.nombre, datos.usuario.color_nombre);

            localStorage.setItem(
                "atuistas_cache_cuenta",
                JSON.stringify({ ...(leerCacheCuenta() || {}), ...datos.usuario })
            );

            actualizarTarjetaMiEstado();

        }


        mostrarGuardadoCuenta("Guardado");

        setTimeout(() => {

            if (guardadoCuenta && guardadoCuenta.textContent === "Guardado") {

                mostrarGuardadoCuenta("");

            }

        }, 1600);


    } catch (error) {

        console.error(
            "Error guardando cuenta:",
            error
        );


        mostrarGuardadoCuenta(
            error.message ||
            "Error al guardar los cambios",
            true
        );


        // El nombre es único: si lo rechazan se recupera el último válido, en
        // vez de dejar escrito uno que no existe.
        nombreCuentaEditar.value = cuentaGuardada.nombre;
        descripcionCuenta.value = cuentaGuardada.descripcion;
        colorNombreCuenta.value = cuentaGuardada.color_nombre;
        pintarNombreCuenta(cuentaGuardada.nombre, cuentaGuardada.color_nombre);


    } finally {

        guardandoCuenta = false;

        if (cambioPendienteCuenta) {

            cambioPendienteCuenta = false;
            guardarCuenta();

        }

    }

}

// Espera a que el usuario deje de escribir para no mandar una petición por
// tecla.
function programarGuardadoCuenta() {

    if (temporizadorCuenta) {
        clearTimeout(temporizadorCuenta);
    }

    temporizadorCuenta = setTimeout(() => {
        temporizadorCuenta = null;
        guardarCuenta();
    }, 900);

}


/* ==============================
   COPIAR CÓDIGO DE CUENTA
   ============================== */

botonCopiarCodigoCuenta.addEventListener(
    "click",
    async () => {

        const codigo =
            codigoCuentaTexto.textContent;


        if (
            !codigo ||
            codigo === "Cargando..."
        ) {
            return;
        }


        try {

            await navigator.clipboard.writeText(
                codigo
            );


            botonCopiarCodigoCuenta.textContent =
                "✓";


            botonCopiarCodigoCuenta.setAttribute(
                "aria-label",
                "Código copiado"
            );


            setTimeout(() => {

                botonCopiarCodigoCuenta.textContent =
                    "⧉";


                botonCopiarCodigoCuenta.setAttribute(
                    "aria-label",
                    "Copiar código de vinculación"
                );

            }, 2000);


        } catch (error) {

            console.error(
                "No se pudo copiar el código:",
                error
            );

        }

    }
);


/* ==============================
   REGENERAR CÓDIGO
   ============================== */

botonRegenerarCodigo.addEventListener(
    "click",
    async () => {

        const confirmar =
            confirm(
                "¿Quieres regenerar tu código de vinculación?\n\nEl código actual dejará de funcionar para vincular nuevos dispositivos. Tus dispositivos ya vinculados seguirán conectados."
            );


        if (!confirmar) {
            return;
        }


        const token =
            localStorage.getItem("atuistas_token");


        if (!token) {
            return;
        }


        botonRegenerarCodigo.disabled = true;


        try {

            const respuesta = await fetch(
                "/api/auth/codigo/regenerar",
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


            const datos =
                await respuesta.json();


            if (!respuesta.ok) {

                throw new Error(
                    datos.error ||
                    "No se pudo regenerar el código"
                );

            }


            codigoCuentaTexto.textContent =
                datos.codigo_vinculacion;


            alert(
                "Código regenerado correctamente."
            );


        } catch (error) {

            console.error(
                "Error regenerando código:",
                error
            );


            alert(
                error.message ||
                "Error al regenerar el código"
            );


        } finally {

            botonRegenerarCodigo.disabled = false;

        }

    }
);


/* ==============================
   GUARDADO AUTOMÁTICO DE LA CUENTA
   No hay botón: se guarda al salir del campo, al cambiar el color y al cerrar
   la pestaña de Cuenta.
   ============================== */

nombreCuentaEditar.addEventListener("input", programarGuardadoCuenta);
nombreCuentaEditar.addEventListener("blur", guardarCuenta);

descripcionCuenta.addEventListener("input", programarGuardadoCuenta);
descripcionCuenta.addEventListener("blur", guardarCuenta);

// El color se previsualiza al momento y se guarda en cuanto se suelta.
colorNombreCuenta.addEventListener("input", () => {
    pintarNombreCuenta(nombreCuentaEditar.value.trim(), colorNombreCuenta.value);
    programarGuardadoCuenta();
});

colorNombreCuenta.addEventListener("change", guardarCuenta);


/* ==============================
   CERRAR SESIÓN
   ============================== */

botonCerrarSesion.addEventListener(
    "click",
    async () => {

        const token =
            localStorage.getItem("atuistas_token");


        if (!token) {

            mostrarAcceso();

            return;
        }


        try {

            await fetch(
                "/api/auth/logout",
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        } catch (error) {

            console.error(
                "Error cerrando sesión:",
                error
            );

        }


        localStorage.removeItem(
            "atuistas_token"
        );


        mostrarAcceso();

    }
);

async function cargarContenidoInicio() {
    await Promise.all([
        cargarEstados("amigos", document.getElementById("lista-estados-amigos")),
        cargarEstados("publica", document.getElementById("lista-estados-publicos")),
        cargarPublicaciones("amigos", document.getElementById("lista-publicaciones-amigos")),
        cargarPublicaciones("publica", document.getElementById("lista-publicaciones-publicas"))
    ]);
}

// Cada foto de un estado se ve como una historia suelta en el visor: el número cuenta fotos, no estados.
function contarHistoriasEstado(estados = []) {
    return estados.reduce((total, estado) => total + Math.max(1, (estado.multimedia || []).length), 0);
}

async function cargarEstados(seccion, contenedor) {
    if (!contenedor) return;
    const tarjetaPropia = seccion === "amigos"
        ? document.getElementById("boton-mi-estado")
        : null;

    try {
        const datos = await solicitarGrupo(`/api/estados?seccion=${seccion}`);
        if (seccion === "amigos") {
            misEstadosActuales = datos.estados.filter((estado) => estado.es_mio);
            actualizarTarjetaMiEstado();
        }
        const visibles = datos.estados
            .filter((estado) => seccion !== "amigos" || !estado.es_mio)
            .sort((primero, segundo) => new Date(primero.creado_en) - new Date(segundo.creado_en));
        const porPersona = new Map();
        for (const estado of visibles) {
            if (!porPersona.has(estado.autor_id)) porPersona.set(estado.autor_id, []);
            porPersona.get(estado.autor_id).push(estado);
        }

        const tarjetas = [...porPersona.entries()].map(([autorId, estados], indice) => {
            const clave = `${seccion}-${indice}-${autorId}`;
            secuenciasEstadosFeed.set(clave, estados);
            const persona = estados[0];
            const historias = contarHistoriasEstado(estados);
            const primerMedio = persona.multimedia?.[0];
            const portada = primerMedio
                ? renderizarMedios([primerMedio])
                : `<span class="tarjeta-historia-texto">${escapeHtml(persona.texto || "Estado")}</span>`;
            return `
                <button class="tarjeta-estado tarjeta-historia" type="button" data-ver-historias="${escapeHtml(clave)}" aria-label="Ver los ${historias} estados de ${escapeHtml(persona.autor_nombre)}">
                    ${portada}
                    ${persona.avatar_url ? `<img class="avatar-historia con-anillo-nombre" style="--anillo-avatar:${colorDeAnillo(persona.color_nombre)}" src="/${escapeHtml(persona.avatar_url)}" alt="">` : '<span class="avatar-historia avatar-historia-vacio"></span>'}
                    <span class="nombre-historia" style="${estiloNombre(persona.color_nombre)}">${escapeHtml(persona.autor_nombre)}</span>
                    ${historias > 1 ? `<span class="cantidad-historias">${historias}</span>` : ""}
                </button>
            `;
        });
        contenedor.innerHTML = tarjetas.join("") || (seccion === "publica" ? '<p class="estado-amigos">No hay estados recientes.</p>' : "");
        if (tarjetaPropia) contenedor.prepend(tarjetaPropia);
    } catch (error) {
        contenedor.innerHTML = `<p class="estado-amigos">${escapeHtml(error.message)}</p>`;
        if (tarjetaPropia) contenedor.prepend(tarjetaPropia);
    }
}

async function cargarPublicaciones(seccion, contenedor) {
    try {
        const datos = await solicitarGrupo(`/api/publicaciones?seccion=${seccion}`);
        guardarPosicionesCarruselFoto(contenedor);
        contenedor.innerHTML = datos.publicaciones.map((publicacion) => renderizarPublicacion(publicacion)).join("") || '<p class="estado-amigos">Todavía no hay publicaciones.</p>';
        restaurarPosicionesCarruselFoto(contenedor);
    } catch (error) {
        contenedor.innerHTML = `<p class="estado-amigos">${escapeHtml(error.message)}</p>`;
    }
}

function renderizarPublicacion(publicacion) {
    return `
        <article class="publicacion-actual" data-publicacion="${escapeHtml(publicacion.id)}">
            <header class="cabecera-publicacion-actual">
                <button class="boton-perfil-publicacion" type="button" data-abrir-perfil="${escapeHtml(publicacion.autor_id)}" aria-label="Ver el perfil de ${escapeHtml(publicacion.autor_nombre)}">
                    ${publicacion.avatar_url ? `<img class="con-anillo-nombre" style="--anillo-avatar:${colorDeAnillo(publicacion.color_nombre)}" src="/${escapeHtml(publicacion.avatar_url)}" alt="">` : '<span class="avatar-publicacion-vacio"></span>'}
                    <span class="datos-publicacion-actual">
                        <strong style="${estiloNombre(publicacion.color_nombre)}">${escapeHtml(publicacion.autor_nombre)}</strong>
                        <time>${new Date(publicacion.creada_en).toLocaleString()}</time>
                    </span>
                </button>
                ${publicacion.es_mia ? `<button type="button" data-eliminar-publicacion="${escapeHtml(publicacion.id)}">ELIMINAR</button>` : ""}
            </header>
            ${publicacion.texto ? `<p class="texto-publicacion-actual">${escapeHtml(publicacion.texto)}</p>` : ""}
            ${renderizarMediosPublicacion(publicacion.multimedia)}
            <div class="acciones-publicacion-actual">
                <button class="boton-corazon-publicacion${publicacion.me_gusta ? " boton-corazon-publicacion-activo" : ""}" type="button" data-corazon-publicacion="${escapeHtml(publicacion.id)}" aria-pressed="${Boolean(publicacion.me_gusta)}" aria-label="Me gusta" title="Me gusta">
                    <svg class="icono-corazon-publicacion" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    <span data-contador-corazon>${publicacion.corazones}</span>
                </button>
                <button type="button" data-comentarios-publicacion="${escapeHtml(publicacion.id)}">COMENTARIOS · ${publicacion.comentarios}</button>
            </div>
            <div class="comentarios-publicacion" hidden></div>
        </article>
    `;
}

function renderizarMedio(medio = {}) {
    const ruta = `/${escapeHtml(medio.url)}`;
    if (medio.tipo === "imagen") return `<img class="contenido-multimedia-social" src="${ruta}" alt="Imagen compartida">`;
    if (medio.tipo === "video") return `<video class="contenido-multimedia-social" src="${ruta}" controls playsinline></video>`;
    if (medio.tipo === "audio") return `<audio class="contenido-multimedia-social" src="${ruta}" controls></audio>`;
    return "";
}

function renderizarMedios(multimedia = []) {
    return (multimedia || []).map((medio) => renderizarMedio(medio)).join("");
}

function renderizarMediosPublicacion(multimedia = []) {
    const medios = (multimedia || []).filter((medio) => medio?.url);
    if (medios.length <= 1) return renderizarMedios(medios);

    return `
        <div class="carrusel-publicacion" data-carrusel-publicacion>
            <div class="carrusel-pista" data-carrusel-pista>
                ${medios.map((medio, indice) => `
                    <div class="carrusel-diapositiva" data-carrusel-diapositiva="${indice}">
                        ${renderizarMedio(medio)}
                    </div>
                `).join("")}
            </div>
            <div class="carrusel-puntos">
                ${medios.map((_, indice) => `
                    <button class="carrusel-punto${indice === 0 ? " carrusel-punto-activo" : ""}" type="button" data-punto-carrusel="${indice}" aria-label="Ver la foto ${indice + 1} de ${medios.length}" aria-current="${indice === 0}"></button>
                `).join("")}
            </div>
        </div>
    `;
}

// Carrusel de fotos de las publicaciones: en táctil se desliza con el scroll nativo
// (scroll-snap) y en escritorio arrastrando con el ratón.
let arrastreCarruselFoto = null;

// Última foto vista en cada publicación, para no volver a la primera al recargar el feed.
const posicionesCarruselFoto = new Map();

function medirCarruselFoto(carrusel) {
    const pista = carrusel?.querySelector("[data-carrusel-pista]");
    const diapositivas = carrusel?.querySelectorAll("[data-carrusel-diapositiva]");
    if (!pista || !diapositivas?.length) return null;

    const ancho = pista.clientWidth || 1;
    const indice = Math.max(0, Math.min(diapositivas.length - 1, Math.round(pista.scrollLeft / ancho)));
    return { pista, diapositivas, ancho, indice };
}

function actualizarPuntosCarruselFoto(carrusel) {
    const medida = medirCarruselFoto(carrusel);
    if (!medida) return;

    carrusel.querySelectorAll("[data-punto-carrusel]").forEach((punto, indice) => {
        const activo = indice === medida.indice;
        punto.classList.toggle("carrusel-punto-activo", activo);
        punto.setAttribute("aria-current", String(activo));
    });
}

function irADiapositivaCarruselFoto(carrusel, indice) {
    const medida = medirCarruselFoto(carrusel);
    if (!medida) return;

    const destino = Math.max(0, Math.min(medida.diapositivas.length - 1, Number(indice) || 0));
    medida.pista.scrollTo({ left: destino * medida.ancho, behavior: "smooth" });
    actualizarPuntosCarruselFoto(carrusel);
}

// Igual que irADiapositivaCarruselFoto, pero sin animación: se usa al recargar el feed.
function moverCarruselFotoADiapositiva(carrusel, indice) {
    const pista = carrusel?.querySelector("[data-carrusel-pista]");
    const diapositivas = carrusel?.querySelectorAll("[data-carrusel-diapositiva]");
    if (!pista || !diapositivas?.length || !pista.clientWidth) return;

    const destino = Math.max(0, Math.min(diapositivas.length - 1, Math.round(indice) || 0));
    pista.scrollLeft = destino * pista.clientWidth;
    actualizarPuntosCarruselFoto(carrusel);
}

function guardarPosicionesCarruselFoto(contenedor) {
    contenedor?.querySelectorAll("[data-carrusel-publicacion]").forEach((carrusel) => {
        const publicacionId = carrusel.closest("[data-publicacion]")?.dataset.publicacion;
        const pista = carrusel.querySelector("[data-carrusel-pista]");
        if (!publicacionId || !pista?.clientWidth) return;
        posicionesCarruselFoto.set(publicacionId, Math.round(pista.scrollLeft / pista.clientWidth));
    });
}

function restaurarPosicionesCarruselFoto(contenedor) {
    contenedor?.querySelectorAll("[data-carrusel-publicacion]").forEach((carrusel) => {
        const publicacionId = carrusel.closest("[data-publicacion]")?.dataset.publicacion;
        const indice = posicionesCarruselFoto.get(publicacionId);
        // El índice 0 es la primera foto: no hay nada que mover.
        if (!indice) return;
        moverCarruselFotoADiapositiva(carrusel, indice);
    });
}

// El corazón se rellena en cuanto se pulsa y, si la petición falla, vuelve a su estado.
function reflejarCorazonPublicacion(boton, activo) {
    boton.classList.toggle("boton-corazon-publicacion-activo", activo);
    boton.setAttribute("aria-pressed", String(activo));
}

function abrirHistorias(clave) {
    const estados = secuenciasEstadosFeed.get(clave);
    if (!estados?.length) return;

    secuenciaHistoriaActual = estados.flatMap((estado) => {
        const medios = estado.multimedia || [];
        if (medios.length <= 1) return [estado];
        return medios.map((medio, indice) => ({
            ...estado,
            multimedia: [medio],
            texto: indice === 0 ? estado.texto : ""
        }));
    });
    indiceHistoriaActual = 0;
    document.getElementById("visor-historias-pantalla").hidden = false;
    mostrarHistoriaActual();
}

function cerrarVisorHistorias() {
    if (temporizadorHistoria) clearTimeout(temporizadorHistoria);
    temporizadorHistoria = null;
    document.querySelectorAll("#contenido-historia-pantalla video, #contenido-historia-pantalla audio").forEach((media) => {
        media.pause();
    });
    document.getElementById("visor-historias-pantalla").hidden = true;
    document.getElementById("contenido-historia-pantalla").replaceChildren();
    secuenciaHistoriaActual = [];
}

function mostrarHistoriaActual() {
    if (temporizadorHistoria) clearTimeout(temporizadorHistoria);
    temporizadorHistoria = null;
    const visor = document.getElementById("visor-historias-pantalla");
    const estado = secuenciaHistoriaActual[indiceHistoriaActual];
    if (!estado) {
        cerrarVisorHistorias();
        return;
    }

    const avatar = document.getElementById("avatar-autor-historia");
    avatar.hidden = !estado.avatar_url;
    if (estado.avatar_url) avatar.src = `/${estado.avatar_url}`;
    aplicarAnilloAvatar(avatar, estado.color_nombre);

    const nombreAutorHistoria = document.getElementById("nombre-autor-historia");
    nombreAutorHistoria.textContent = estado.autor_nombre;
    nombreAutorHistoria.setAttribute("style", estiloNombre(estado.color_nombre));

    const progreso = document.getElementById("progreso-historias");
    progreso.innerHTML = secuenciaHistoriaActual.map((_, indice) => `
        <span class="progreso-historia ${indice < indiceHistoriaActual ? "completado" : ""}">
            <i class="${indice === indiceHistoriaActual ? "activo" : ""}"></i>
        </span>
    `).join("");

    const contenido = document.getElementById("contenido-historia-pantalla");
    contenido.innerHTML = `${renderizarMedios(estado.multimedia)}${estado.texto ? `<p class="texto-historia-pantalla">${escapeHtml(estado.texto)}</p>` : ""}`;
    const medio = contenido.querySelector("img, video, audio");
    const duracion = 5000;
    const fill = progreso.querySelector(".progreso-historia i.activo");

    if (medio instanceof HTMLVideoElement) {
        medio.autoplay = true;
        medio.muted = true;
        medio.addEventListener("ended", pasarHistoriaSiguiente, { once: true });
        medio.addEventListener("timeupdate", () => {
            if (fill && Number.isFinite(medio.duration) && medio.duration > 0) {
                fill.style.transform = `scaleX(${Math.min(medio.currentTime / medio.duration, 1)})`;
            }
        });
        medio.play().catch(() => {});
    } else if (medio instanceof HTMLAudioElement) {
        medio.addEventListener("ended", pasarHistoriaSiguiente, { once: true });
        medio.addEventListener("timeupdate", () => {
            if (fill && Number.isFinite(medio.duration) && medio.duration > 0) {
                fill.style.transform = `scaleX(${Math.min(medio.currentTime / medio.duration, 1)})`;
            }
        });
    } else {
        if (fill) {
            fill.style.animationDuration = `${duracion}ms`;
            fill.classList.add("avanzar");
        }
        temporizadorHistoria = setTimeout(pasarHistoriaSiguiente, duracion);
    }
    visor.focus({ preventScroll: true });
}

function pasarHistoriaSiguiente() {
    if (indiceHistoriaActual < secuenciaHistoriaActual.length - 1) {
        indiceHistoriaActual += 1;
        mostrarHistoriaActual();
    } else {
        cerrarVisorHistorias();
    }
}

function pasarHistoriaAnterior() {
    if (indiceHistoriaActual > 0) {
        indiceHistoriaActual -= 1;
        mostrarHistoriaActual();
    }
}

document.getElementById("cerrar-visor-historias").addEventListener("click", cerrarVisorHistorias);
document.getElementById("historia-anterior").addEventListener("click", pasarHistoriaAnterior);
document.getElementById("historia-siguiente").addEventListener("click", pasarHistoriaSiguiente);
document.addEventListener("keydown", (evento) => {
    if (document.getElementById("visor-historias-pantalla").hidden) return;
    if (evento.key === "Escape") cerrarVisorHistorias();
    else if (evento.key === "ArrowRight") pasarHistoriaSiguiente();
    else if (evento.key === "ArrowLeft") pasarHistoriaAnterior();
});

function actualizarTarjetaMiEstado() {
    const imagen = document.getElementById("avatar-mi-estado");
    const etiqueta = document.getElementById("texto-mi-estado");
    const cantidad = document.getElementById("cantidad-mis-estados");
    if (!imagen || !etiqueta || !cantidad) return;

    const cuenta = localStorage.getItem("atuistas_cache_cuenta");
    if (cuenta) {
        try {
            const usuario = JSON.parse(cuenta);
            if (usuario.avatar_ruta) {
                imagen.src = `/${usuario.avatar_ruta.replace(/\\/g, "/")}`;
                imagen.hidden = false;
            } else {
                imagen.hidden = true;
            }
        } catch {
            if (imagen) imagen.hidden = true;
        }
    }
    const historiasPropias = contarHistoriasEstado(misEstadosActuales);
    etiqueta.textContent = misEstadosActuales.length ? "Ver o añadir" : "Añadir estado";
    cantidad.textContent = String(historiasPropias);
    cantidad.hidden = historiasPropias === 0;
}

function mostrarFormularioEstado() {
    document.getElementById("acciones-mi-estado").hidden = true;
    document.getElementById("visor-estados").hidden = true;
    document.getElementById("formulario-estado").hidden = false;
}

function mostrarMisEstados() {
    const visor = document.getElementById("visor-estados");
    document.getElementById("acciones-mi-estado").hidden = true;
    document.getElementById("formulario-estado").hidden = true;
    visor.hidden = false;
    visor.innerHTML = misEstadosActuales.map((estado) => `
        <article class="visor-estado-item">
            ${renderizarMedios(estado.multimedia)}
            ${estado.texto ? `<p>${escapeHtml(estado.texto)}</p>` : ""}
            <small>${escapeHtml(estado.visibilidad === "publica" ? "Público" : "Mis amigos")} · Hasta ${new Date(estado.expira_en).toLocaleString()}</small>
            <button type="button" data-eliminar-estado="${escapeHtml(estado.id)}">ELIMINAR</button>
        </article>
    `).join("") || '<p class="estado-amigos">No tienes estados activos.</p>';
}

document.getElementById("boton-mi-estado").addEventListener("click", async () => {
    await cargarEstados("amigos", document.getElementById("lista-estados-amigos"));
    modalEstado.hidden = false;
    const formulario = document.getElementById("formulario-estado");
    formulario.reset();
    formulario.querySelector("input[name=tipo-estado]:checked").dispatchEvent(new Event("change"));
    document.getElementById("archivo-estado").value = "";
    document.getElementById("vista-previa-audio").hidden = true;
    blobAudioEstado = null;
    document.getElementById("visor-estados").hidden = true;
    if (misEstadosActuales.length) {
        document.getElementById("acciones-mi-estado").hidden = false;
        document.getElementById("formulario-estado").hidden = true;
    } else {
        mostrarFormularioEstado();
    }
});

document.getElementById("boton-ver-mis-estados").addEventListener("click", mostrarMisEstados);
document.getElementById("boton-anadir-estado").addEventListener("click", mostrarFormularioEstado);
document.getElementById("boton-cerrar-modal-estado").addEventListener("click", () => { modalEstado.hidden = true; });
document.getElementById("boton-abrir-publicacion").addEventListener("click", () => {
    const form = document.getElementById("formulario-publicacion");
    form.reset();
    form.querySelector("input[name=tipo-publicacion]:checked").dispatchEvent(new Event("change"));
    document.getElementById("archivo-publicacion").value = "";
    modalPublicacion.hidden = false;
});
document.getElementById("boton-cerrar-modal-publicacion").addEventListener("click", () => { modalPublicacion.hidden = true; });
modalEstado.addEventListener("click", (evento) => {
    if (evento.target === modalEstado) modalEstado.hidden = true;
});
modalPublicacion.addEventListener("click", (evento) => {
    if (evento.target === modalPublicacion) modalPublicacion.hidden = true;
});
document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
        modalEstado.hidden = true;
        modalPublicacion.hidden = true;
    }
});

function configurarSelectorMedio(formId, fileLabelId, fileInputId, typeName, textAreaId, audioControlsId = null) {
    const form = document.getElementById(formId);
    const fileLabel = document.getElementById(fileLabelId);
    const fileInput = document.getElementById(fileInputId);
    const textArea = document.getElementById(textAreaId);
    const audioControls = audioControlsId ? document.getElementById(audioControlsId) : null;
    const actualizar = () => {
        const mode = form.querySelector(`input[name="${typeName}"]:checked`).value;
        const audioMode = mode === "audio";
        const needsFile = ["imagen", "imagenes", "video", "audio"].includes(mode);
        fileLabel.hidden = !needsFile;
        textArea.hidden = needsFile;
        textArea.required = !needsFile;
        if (audioControls) audioControls.hidden = !audioMode;
        if (mode === "imagen") {
            fileInput.accept = "image/*";
            fileInput.multiple = false;
        } else if (mode === "imagenes") {
            fileInput.accept = "image/*";
            fileInput.multiple = true;
        } else if (mode === "video") {
            fileInput.accept = "video/mp4,video/webm,video/quicktime";
            fileInput.multiple = false;
        } else if (audioMode) {
            fileInput.accept = "audio/*";
            fileInput.multiple = false;
        }
        const label = fileLabel.querySelector("span");
        if (label) {
            label.textContent = audioMode
                ? "Subir audio"
                : mode === "imagenes"
                    ? "Seleccionar hasta 10 fotos"
                    : mode === "video"
                        ? "Seleccionar vídeo"
                        : "Seleccionar foto";
        }
    };
    form.querySelectorAll(`input[name="${typeName}"]`).forEach((input) => input.addEventListener("change", actualizar));
    fileInput.addEventListener("change", () => {
        const files = [...fileInput.files];
        const mode = form.querySelector(`input[name="${typeName}"]:checked`).value;
        const label = fileLabel.querySelector("span");
        if (formId === "formulario-estado" && mode === "audio") blobAudioEstado = null;
        if (mode === "imagenes" && files.length > 10) {
            fileInput.value = "";
            document.getElementById("error-estado-social").textContent = "Puedes seleccionar hasta 10 fotos.";
            return;
        }
        if (label) label.textContent = files.map((file) => file.name).join(", ") || "Seleccionar archivo";
    });
    actualizar();
}

configurarSelectorMedio("formulario-estado", "etiqueta-archivo-estado", "archivo-estado", "tipo-estado", "texto-estado", "controles-grabar-audio");
configurarSelectorMedio("formulario-publicacion", "etiqueta-archivo-publicacion", "archivo-publicacion", "tipo-publicacion", "texto-publicacion");

document.getElementById("boton-iniciar-audio").addEventListener("click", async () => {
    try {
        flujoAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
        grabadoraAudio = new MediaRecorder(flujoAudio, mimeType ? { mimeType } : undefined);
        const chunks = [];
        grabadoraAudio.addEventListener("dataavailable", (evento) => { if (evento.data.size) chunks.push(evento.data); });
        grabadoraAudio.addEventListener("stop", () => {
            blobAudioEstado = new Blob(chunks, { type: grabadoraAudio.mimeType || "audio/webm" });
            const preview = document.getElementById("vista-previa-audio");
            preview.src = URL.createObjectURL(blobAudioEstado);
            preview.hidden = false;
            flujoAudio?.getTracks().forEach((track) => track.stop());
            flujoAudio = null;
        }, { once: true });
        grabadoraAudio.start();
        limiteGrabacionAudio = setTimeout(() => {
            if (grabadoraAudio?.state === "recording") grabadoraAudio.stop();
            document.getElementById("boton-iniciar-audio").disabled = false;
            document.getElementById("boton-detener-audio").disabled = true;
        }, 210000);
        document.getElementById("boton-iniciar-audio").disabled = true;
        document.getElementById("boton-detener-audio").disabled = false;
    } catch (error) {
        document.getElementById("error-estado-social").textContent = error.message || "No se pudo acceder al micrófono.";
    }
});

document.getElementById("boton-detener-audio").addEventListener("click", () => {
    if (limiteGrabacionAudio) clearTimeout(limiteGrabacionAudio);
    if (grabadoraAudio?.state === "recording") grabadoraAudio.stop();
    document.getElementById("boton-iniciar-audio").disabled = false;
    document.getElementById("boton-detener-audio").disabled = true;
});

document.getElementById("formulario-estado").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    if (form.dataset.enviando === "true") return;
    form.dataset.enviando = "true";
    const botonPublicar = form.querySelector("button[type=submit]");
    botonPublicar.disabled = true;
    const mode = form.querySelector("input[name=tipo-estado]:checked").value;
    const error = document.getElementById("error-estado-social");
    error.textContent = "";
    try {
        if (mode === "texto") {
            await solicitarGrupo("/api/estados", {
                method: "POST",
                body: JSON.stringify({ texto: document.getElementById("texto-estado").value, visibilidad: document.getElementById("visibilidad-estado").value })
            });
        } else {
            const files = mode === "audio" && blobAudioEstado
                ? [new File([blobAudioEstado], `estado-audio.${blobAudioEstado.type.includes("ogg") ? "ogg" : "webm"}`, { type: blobAudioEstado.type })]
                : [...document.getElementById("archivo-estado").files];
            const body = new FormData();
            body.append("tipo", mode);
            body.append("visibilidad", document.getElementById("visibilidad-estado").value);
            files.forEach((file) => body.append("archivo", file));
            await solicitarGrupo("/api/estados/multimedia", { method: "POST", body });
        }
        form.reset();
        blobAudioEstado = null;
        await cargarContenidoInicio();
        modalEstado.hidden = true;
    } catch (failure) {
        error.textContent = failure.message;
    } finally {
        delete form.dataset.enviando;
        botonPublicar.disabled = false;
    }
});

document.getElementById("formulario-publicacion").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    if (form.dataset.enviando === "true") return;
    form.dataset.enviando = "true";
    const botonPublicar = form.querySelector("button[type=submit]");
    botonPublicar.disabled = true;
    const mode = form.querySelector("input[name=tipo-publicacion]:checked").value;
    const error = document.getElementById("error-publicacion-social");
    error.textContent = "";
    try {
        if (mode === "texto") {
            await solicitarGrupo("/api/publicaciones", {
                method: "POST",
                body: JSON.stringify({ texto: document.getElementById("texto-publicacion").value, visibilidad: document.getElementById("visibilidad-publicacion").value })
            });
        } else {
            const files = [...document.getElementById("archivo-publicacion").files];
            const body = new FormData();
            body.append("tipo", mode);
            body.append("visibilidad", document.getElementById("visibilidad-publicacion").value);
            files.forEach((file) => body.append("archivo", file));
            await solicitarGrupo("/api/publicaciones/multimedia", { method: "POST", body });
        }
        form.reset();
        await cargarContenidoInicio();
        modalPublicacion.hidden = true;
    } catch (failure) {
        error.textContent = failure.message;
    } finally {
        delete form.dataset.enviando;
        botonPublicar.disabled = false;
    }
});

document.getElementById("visor-estados").addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-eliminar-estado]");
    if (!boton || !confirm("¿Eliminar este estado?")) return;
    try {
        await solicitarGrupo(`/api/estados/${encodeURIComponent(boton.dataset.eliminarEstado)}`, { method: "DELETE" });
        await cargarContenidoInicio();
        mostrarMisEstados();
    } catch (error) {
        document.getElementById("error-estado-social").textContent = error.message;
    }
});

async function cargarComentariosPublicacion(publicacionId, contenedor) {
    const datos = await solicitarGrupo(`/api/publicaciones/${encodeURIComponent(publicacionId)}/comentarios`);
    contenedor.innerHTML = `
        <div class="lista-comentarios-actuales">
            ${datos.comentarios.map((comentario) => `
                <p><strong style="${estiloNombre(comentario.color_nombre)}">${escapeHtml(comentario.autor_nombre)}</strong> ${escapeHtml(comentario.texto)}</p>
            `).join("") || '<p class="estado-amigos">Sé la primera persona en comentar.</p>'}
        </div>
        <form class="formulario-comentario-actual" data-publicacion="${escapeHtml(publicacionId)}">
            <input name="texto" type="text" maxlength="1000" placeholder="Escribe un comentario..." required>
            <button type="submit">ENVIAR</button>
        </form>
    `;
}

function conectarFeed(contenedor) {
    contenedor.addEventListener("click", async (evento) => {
        const perfil = evento.target.closest("[data-abrir-perfil]");
        const corazon = evento.target.closest("[data-corazon-publicacion]");
        const comentarios = evento.target.closest("[data-comentarios-publicacion]");
        const historias = evento.target.closest("[data-ver-historias]");
        const eliminarPublicacion = evento.target.closest("[data-eliminar-publicacion]");
        const eliminarEstado = evento.target.closest("[data-eliminar-estado]");
        const puntoCarrusel = evento.target.closest("[data-punto-carrusel]");
        const enPerfil = Boolean(contenedor.closest("#modal-perfil"));
        try {
            if (puntoCarrusel) {
                irADiapositivaCarruselFoto(puntoCarrusel.closest("[data-carrusel-publicacion]"), puntoCarrusel.dataset.puntoCarrusel);
            } else if (perfil) {
                abrirPerfil(perfil.dataset.abrirPerfil);
            } else if (corazon) {
                // Se actualiza solo el botón: recargar el feed devolvería el carrusel a la primera foto.
                const meGusta = !corazon.classList.contains("boton-corazon-publicacion-activo");
                const contador = corazon.querySelector("[data-contador-corazon]");
                const corazonesPrevios = Number(contador?.textContent);
                reflejarCorazonPublicacion(corazon, meGusta);
                let estadoServidor = meGusta;
                try {
                    const respuesta = await solicitarGrupo(`/api/publicaciones/${encodeURIComponent(corazon.dataset.corazonPublicacion)}/corazon`, { method: "POST" });
                    if (typeof respuesta?.me_gusta === "boolean") estadoServidor = respuesta.me_gusta;
                } catch (error) {
                    reflejarCorazonPublicacion(corazon, !meGusta);
                    throw error;
                }
                reflejarCorazonPublicacion(corazon, estadoServidor);
                if (contador && Number.isFinite(corazonesPrevios)) {
                    const diferencia = (estadoServidor ? 1 : 0) - (meGusta ? 0 : 1);
                    contador.textContent = String(Math.max(0, corazonesPrevios + diferencia));
                }
            } else if (comentarios) {
                const articulo = comentarios.closest(".publicacion-actual");
                const panel = articulo.querySelector(".comentarios-publicacion");
                panel.hidden = !panel.hidden;
                if (!panel.hidden) await cargarComentariosPublicacion(comentarios.dataset.comentariosPublicacion, panel);
            } else if (historias) {
                abrirHistorias(historias.dataset.verHistorias);
            } else if (eliminarPublicacion && confirm("¿Eliminar esta publicación?")) {
                await solicitarGrupo(`/api/publicaciones/${encodeURIComponent(eliminarPublicacion.dataset.eliminarPublicacion)}`, { method: "DELETE" });
                if (enPerfil) await cargarPublicacionesPerfil();
                else await cargarContenidoInicio();
            } else if (eliminarEstado && confirm("¿Eliminar este estado?")) {
                await solicitarGrupo(`/api/estados/${encodeURIComponent(eliminarEstado.dataset.eliminarEstado)}`, { method: "DELETE" });
                await cargarContenidoInicio();
            }
        } catch (error) {
            const destino = contenedor.closest(".pagina-publico")
                ? document.getElementById("estado-publico")
                : enPerfil
                    ? document.getElementById("estado-perfil")
                    : document.getElementById("estado-publicacion");
            if (destino) destino.textContent = error.message;
        }
    });

    // El punto activo sigue el deslizamiento: "scroll" no burbujea, se escucha en captura.
    contenedor.addEventListener("scroll", (evento) => {
        const carrusel = evento.target.closest?.("[data-carrusel-publicacion]");
        if (carrusel) actualizarPuntosCarruselFoto(carrusel);
    }, true);

    contenedor.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType !== "mouse" || evento.button !== 0 || arrastreCarruselFoto) return;
        const pista = evento.target.closest("[data-carrusel-pista]");
        if (!pista || evento.target.closest("video, audio")) return;
        const carrusel = pista.closest("[data-carrusel-publicacion]");
        if (!carrusel) return;
        arrastreCarruselFoto = {
            carrusel,
            pista,
            puntero: evento.pointerId,
            inicioX: evento.clientX,
            inicioScroll: pista.scrollLeft
        };
        pista.classList.add("carrusel-arrastrando");
        try {
            pista.setPointerCapture(evento.pointerId);
        } catch {
            // Si el navegador no permite capturar el puntero, el arrastre se completa igualmente.
        }
    });

    contenedor.addEventListener("pointermove", (evento) => {
        if (!arrastreCarruselFoto || evento.pointerId !== arrastreCarruselFoto.puntero) return;
        evento.preventDefault();
        arrastreCarruselFoto.pista.scrollLeft = arrastreCarruselFoto.inicioScroll - (evento.clientX - arrastreCarruselFoto.inicioX);
    });

    const soltarArrastreCarruselFoto = (evento) => {
        if (!arrastreCarruselFoto || evento.pointerId !== arrastreCarruselFoto.puntero) return;
        const { carrusel, pista } = arrastreCarruselFoto;
        arrastreCarruselFoto = null;
        pista.classList.remove("carrusel-arrastrando");
        const ancho = pista.clientWidth || 1;
        irADiapositivaCarruselFoto(carrusel, Math.round(pista.scrollLeft / ancho));
    };

    contenedor.addEventListener("pointerup", soltarArrastreCarruselFoto);
    contenedor.addEventListener("pointercancel", soltarArrastreCarruselFoto);

    contenedor.addEventListener("submit", async (evento) => {
        const formulario = evento.target.closest(".formulario-comentario-actual");
        if (!formulario) return;
        evento.preventDefault();
        if (formulario.dataset.enviando === "true") return;
        formulario.dataset.enviando = "true";
        const botonEnviar = formulario.querySelector("button[type=submit]");
        botonEnviar.disabled = true;
        const entrada = formulario.elements.namedItem("texto");
        try {
            await solicitarGrupo(`/api/publicaciones/${encodeURIComponent(formulario.dataset.publicacion)}/comentarios`, {
                method: "POST",
                body: JSON.stringify({ texto: entrada.value })
            });
            const panel = formulario.closest(".comentarios-publicacion");
            await cargarComentariosPublicacion(formulario.dataset.publicacion, panel);
        } catch (error) {
            entrada.setCustomValidity(error.message);
            entrada.reportValidity();
            entrada.setCustomValidity("");
        } finally {
            if (formulario.isConnected) {
                delete formulario.dataset.enviando;
                botonEnviar.disabled = false;
            }
        }
    });
}

conectarFeed(document.getElementById("lista-publicaciones-amigos"));
conectarFeed(document.getElementById("lista-publicaciones-publicas"));
conectarFeed(document.getElementById("lista-estados-amigos"));
conectarFeed(document.getElementById("lista-estados-publicos"));
conectarFeed(document.getElementById("contenido-perfil"));


// ========================================
// PERFIL DE USUARIO
// ========================================

let perfilActual = null;

const modalPerfil =
    document.getElementById("modal-perfil");

const contenidoPerfil =
    document.getElementById("contenido-perfil");

const estadoPerfil =
    document.getElementById("estado-perfil");

const modalAccionesPerfil =
    document.getElementById("modal-acciones-perfil");

const modalAmigosPerfil =
    document.getElementById("modal-amigos-perfil");

const listaAmigosPerfil =
    document.getElementById("lista-amigos-perfil");

const estadoAmigosPerfil =
    document.getElementById("estado-amigos-perfil");

async function abrirPerfil(usuarioId) {
    if (!usuarioId || !contenidoPerfil || !modalPerfil) {
        return;
    }

    perfilActual = { id: usuarioId };
    estadoPerfil.textContent = "";
    contenidoPerfil.innerHTML =
        '<p class="estado-amigos">Cargando perfil...</p>';
    modalPerfil.hidden = false;

    try {
        const datos = await solicitarGrupo(
            `/api/perfil/${encodeURIComponent(usuarioId)}`
        );

        perfilActual = datos.perfil;

        document.getElementById("titulo-modal-perfil").textContent =
            datos.perfil.es_mio ? "Mi perfil" : datos.perfil.nombre;

        renderizarPerfil(datos);

        await cargarPublicacionesPerfil();

    } catch (error) {
        perfilActual = null;
        contenidoPerfil.innerHTML = "";
        estadoPerfil.textContent = error.message;
    }
}

function renderizarPerfil(datos) {
    const perfil = datos.perfil;
    const conteos = datos.conteos || {};

    contenidoPerfil.innerHTML = `
        <div class="cabecera-perfil">
            <button class="avatar-perfil con-anillo-nombre" type="button" style="--anillo-avatar:${colorDeAnillo(perfil.color_nombre)}" data-acciones-perfil aria-label="Opciones de la foto de perfil">
                ${perfil.avatar_url
                    ? `<img src="/${escapeHtml(perfil.avatar_url)}" alt="">`
                    : '<span class="avatar-perfil-vacio"></span>'}
            </button>
            <strong class="nombre-perfil" style="${estiloNombre(perfil.color_nombre)}">${escapeHtml(perfil.nombre)}</strong>
            ${perfil.descripcion
                ? `<p class="descripcion-perfil">${escapeHtml(perfil.descripcion)}</p>`
                : '<p class="descripcion-perfil descripcion-perfil-vacia">Sin descripción.</p>'}
        </div>

        <div class="estadisticas-perfil">
            <button class="estadistica-perfil" type="button" data-amigos-perfil aria-label="Ver las amistades de ${escapeHtml(perfil.nombre)}">
                <strong>${Number(conteos.amigos ?? 0)}</strong>
                <span>Amistades</span>
            </button>
            <div class="estadistica-perfil">
                <strong>${Number(conteos.solicitudes_recibidas ?? 0)}</strong>
                <span>Solicitudes recibidas</span>
            </div>
            <div class="estadistica-perfil">
                <strong>${Number(conteos.solicitudes_enviadas ?? 0)}</strong>
                <span>Solicitudes enviadas</span>
            </div>
        </div>

        <h3 class="titulo-publicaciones-perfil">Publicaciones</h3>

        <div id="lista-publicaciones-perfil" class="lista-publicaciones-perfil">
            <p class="estado-amigos">Cargando publicaciones...</p>
        </div>
    `;
}

async function cargarPublicacionesPerfil() {
    if (!perfilActual?.id) {
        return;
    }

    const contenedor =
        document.getElementById("lista-publicaciones-perfil");

    if (!contenedor) {
        return;
    }

    try {
        const datos = await solicitarGrupo(
            `/api/perfil/${encodeURIComponent(perfilActual.id)}/publicaciones`
        );

        guardarPosicionesCarruselFoto(contenedor);

        contenedor.innerHTML =
            datos.publicaciones
                .map((publicacion) => renderizarPublicacion(publicacion))
                .join("") ||
            '<p class="estado-amigos">Todavía no hay publicaciones.</p>';

        restaurarPosicionesCarruselFoto(contenedor);

    } catch (error) {
        contenedor.innerHTML =
            `<p class="estado-amigos">${escapeHtml(error.message)}</p>`;
    }
}

async function abrirAmigosPerfil() {
    if (!perfilActual?.id || !modalAmigosPerfil) {
        return;
    }

    listaAmigosPerfil.innerHTML = "";
    estadoAmigosPerfil.textContent = "Cargando amistades...";
    modalAmigosPerfil.hidden = false;

    try {
        const datos = await solicitarGrupo(
            `/api/perfil/${encodeURIComponent(perfilActual.id)}/amigos`
        );

        const amigos = datos.amigos || [];

        if (!amigos.length) {
            estadoAmigosPerfil.textContent = "Todavía no tiene amistades.";
            return;
        }

        estadoAmigosPerfil.textContent =
            amigos.length === 1 ? "1 amistad" : `${amigos.length} amistades`;

        listaAmigosPerfil.innerHTML = amigos.map((amigo) => `
            <button class="amigo-perfil" type="button" data-abrir-perfil="${escapeHtml(amigo.id)}">
                <span class="amigo-perfil-avatar">
                    ${amigo.avatar_url
                        ? `<img src="/${escapeHtml(amigo.avatar_url)}" alt="">`
                        : ""}
                </span>
                <span class="amigo-perfil-nombre" style="${estiloNombre(amigo.color_nombre)}">${escapeHtml(amigo.nombre)}</span>
            </button>
        `).join("");

    } catch (error) {
        estadoAmigosPerfil.textContent = error.message;
    }
}

function abrirAccionesPerfil() {
    if (!perfilActual || !modalAccionesPerfil) {
        return;
    }

    const botonEstados =
        document.getElementById("boton-perfil-ver-estados");

    if (botonEstados) {
        botonEstados.hidden = perfilActual.tiene_estados !== true;
    }

    modalAccionesPerfil.hidden = false;
}

async function verEstadosPerfil() {
    if (!perfilActual?.id) {
        return;
    }

    modalAccionesPerfil.hidden = true;

    try {
        const datos = await solicitarGrupo(
            `/api/perfil/${encodeURIComponent(perfilActual.id)}/estados`
        );

        const estados = (datos.estados || []).sort(
            (primero, segundo) =>
                new Date(primero.creado_en) - new Date(segundo.creado_en)
        );

        if (!estados.length) {
            estadoPerfil.textContent =
                "Esta persona no tiene estados activos.";
            return;
        }

        const clave = `perfil-${perfilActual.id}`;

        secuenciasEstadosFeed.set(clave, estados);
        modalPerfil.hidden = true;
        abrirHistorias(clave);

    } catch (error) {
        estadoPerfil.textContent = error.message;
    }
}

function verFotoPerfil() {
    if (!perfilActual || !modalAccionesPerfil) {
        return;
    }

    modalAccionesPerfil.hidden = true;

    if (!perfilActual.avatar_url) {
        estadoPerfil.textContent =
            "Esta persona no tiene foto de perfil.";
        return;
    }

    fotoPerfilGrande.src = `/${perfilActual.avatar_url}`;
    modalFotoGrande.hidden = false;
}

function cerrarPerfil() {
    if (modalPerfil) modalPerfil.hidden = true;
    if (modalAccionesPerfil) modalAccionesPerfil.hidden = true;
    if (modalAmigosPerfil) modalAmigosPerfil.hidden = true;

    perfilActual = null;
}

contenidoPerfil?.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-acciones-perfil]")) {
        abrirAccionesPerfil();
    } else if (evento.target.closest("[data-amigos-perfil]")) {
        abrirAmigosPerfil();
    }
});

listaAmigosPerfil?.addEventListener("click", (evento) => {
    const persona = evento.target.closest("[data-abrir-perfil]");

    if (!persona) {
        return;
    }

    modalAmigosPerfil.hidden = true;
    abrirPerfil(persona.dataset.abrirPerfil);
});

document.getElementById("boton-cerrar-modal-perfil")
    ?.addEventListener("click", cerrarPerfil);

document.getElementById("boton-cerrar-acciones-perfil")
    ?.addEventListener("click", () => { modalAccionesPerfil.hidden = true; });

document.getElementById("boton-cerrar-amigos-perfil")
    ?.addEventListener("click", () => { modalAmigosPerfil.hidden = true; });

document.getElementById("boton-perfil-ver-estados")
    ?.addEventListener("click", verEstadosPerfil);

document.getElementById("boton-perfil-ver-foto")
    ?.addEventListener("click", verFotoPerfil);

modalPerfil?.addEventListener("click", (evento) => {
    if (evento.target === modalPerfil) cerrarPerfil();
});

modalAccionesPerfil?.addEventListener("click", (evento) => {
    if (evento.target === modalAccionesPerfil) {
        modalAccionesPerfil.hidden = true;
    }
});

modalAmigosPerfil?.addEventListener("click", (evento) => {
    if (evento.target === modalAmigosPerfil) {
        modalAmigosPerfil.hidden = true;
    }
});

document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape") return;

    if (modalAmigosPerfil && !modalAmigosPerfil.hidden) {
        modalAmigosPerfil.hidden = true;
        return;
    }

    if (modalAccionesPerfil && !modalAccionesPerfil.hidden) {
        modalAccionesPerfil.hidden = true;
        return;
    }

    if (modalPerfil && !modalPerfil.hidden) {
        cerrarPerfil();
    }
});

document.getElementById("boton-ver-perfil-chat")
    ?.addEventListener("click", () => {
        if (amigoChatActual) {
            abrirPerfil(amigoChatActual.id);
        }
    });

document.getElementById("boton-perfil-historia")
    ?.addEventListener("click", () => {
        const estado = secuenciaHistoriaActual[indiceHistoriaActual];

        if (!estado?.autor_id) {
            return;
        }

        const autorId = estado.autor_id;

        cerrarVisorHistorias();
        abrirPerfil(autorId);
    });


/* ==============================
   INICIAR
   ============================== */

comprobarSesion();
