function generarUUID() {
    // crypto.randomUUID solo existe en Chrome 92+ (Android 7+ al día): en
    // Android viejos se genera uno compatible para que la app arranque.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    const aleatorio = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return `${aleatorio()}${aleatorio()}-${aleatorio()}-4${aleatorio().slice(1)}-${((Math.random() * 4) | 8).toString(16)}${aleatorio().slice(1)}-${aleatorio()}${aleatorio()}${aleatorio()}`;
}

function obtenerIdentificadorDispositivo() {
    let identificador =
        localStorage.getItem("atuistas_dispositivo");

    if (!identificador) {
        identificador = generarUUID();

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
        <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2Z" fill="currentColor"/>
    </svg>
`;

const ICONO_COMPOSER_MICROFONO = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"></rect>
        <path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 17v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
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

    // Botón PARAR y tira de ondas de cada fila de grabación (chat o servidor).
    const botonParar = document.getElementById(
        filaGrabacion?.id === "fila-grabacion-servidor"
            ? "boton-parar-grabacion-servidor"
            : "boton-parar-grabacion-chat"
    );
    const ondasGrabacion = document.getElementById(
        filaGrabacion?.id === "fila-grabacion-servidor"
            ? "ondas-grabacion-servidor"
            : "ondas-grabacion-chat"
    );

    // Máximo de audio que acepta el servidor (3:30): al llegar se para sola.
    const MAXIMO_GRABACION_SEG = 3 * 60 + 30;
    // Las ondas de la fila son 24 barras: se van encendiendo según pasa el
    // tiempo para que se vea cuánto falta para el corte automático.
    const BARRAS_GRABACION = 24;

    let adjunto = null;
    let grabadora = null;
    let flujoLocal = null;
    let mimeActual = "audio/webm";
    let trozos = [];
    let intervalo = null;
    let segundos = 0;
    let descartarGrabacion = false;
    let temporizadorAviso = null;
    // Si el usuario pulsa enviar mientras graba, al parar el audio se manda
    // solo: no hay que pulsar dos veces.
    let enviarAlParar = false;
    // Medidor de voz en vivo: el analizador lee lo fuerte que hablas y el
    // intervalo pinta las barras encendidas con esa altura.
    let contextoVoz = null;
    let analizadorVoz = null;
    let datosVoz = null;
    let intervaloVoz = null;
    let nivelVoz = 0;

    const grabando = () => Boolean(grabadora) && grabadora.state === "recording";
    const hayTexto = () => Boolean(entrada.value.trim());

    function pintarChip() {
        if (!adjunto) {
            chipAdjunto.hidden = true;
            chipAdjunto.textContent = "";
            return;
        }
        chipAdjunto.hidden = false;
        if (adjunto.archivos?.length > 1) {
            const etiqueta = ETIQUETA_ADJUNTO[adjunto.tipo] ?? "ARCHIVOS";
            chipAdjunto.textContent = `${etiqueta} (${adjunto.archivos.length}): ${adjunto.archivos.map((archivo) => archivo.name).join(", ")}`;
            return;
        }
        chipAdjunto.textContent = `${ETIQUETA_ADJUNTO[adjunto.tipo] ?? "ARCHIVO"}: ${(adjunto.archivos?.[0] ?? adjunto.archivo).name}`;
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

    // Tira de ondas de la fila: 24 barras con altura fija que respiran con tu
    // voz. Se van encendiendo según pasa el tiempo (al llenarse del todo la
    // grabación se para sola). El encendido se cuenta desde la última barra
    // visible: la tira crece hacia la derecha conforme hablas.
    const ALTURAS_GRABACION = [38, 62, 45, 80, 55, 92, 48, 70, 35, 66, 84, 50, 74, 42, 95, 58, 68, 40, 78, 52, 88, 46, 64, 36];

    function prepararOndasGrabacion() {
        if (!ondasGrabacion) return;
        ondasGrabacion.replaceChildren();
        for (let i = 0; i < BARRAS_GRABACION; i += 1) {
            const barra = document.createElement("span");
            barra.style.height = `${ALTURAS_GRABACION[i % ALTURAS_GRABACION.length]}%`;
            ondasGrabacion.appendChild(barra);
        }
    }

    function pintarOndasGrabacion() {
        if (!ondasGrabacion) return;
        const barras = ondasGrabacion.children;
        if (!barras.length) return;
        // Las barras se encienden de izquierda a derecha con el paso del
        // tiempo; la última encendida late con el volumen de tu voz.
        const encendidas = Math.min(
            barras.length,
            Math.floor((segundos / MAXIMO_GRABACION_SEG) * barras.length)
        );
        for (let i = 0; i < barras.length; i += 1) {
            const barra = barras[i];
            barra.classList.toggle("encendida", i < encendidas);
            // Solo la barra "viva" respira con la voz; el resto mantiene su
            // altura fija para que se lea el progreso.
            if (i === encendidas - 1) {
                barra.style.setProperty("--latido-voz", String(0.35 + nivelVoz * 0.65));
                barra.classList.add("viva");
            } else {
                barra.classList.remove("viva");
                barra.style.removeProperty("--latido-voz");
            }
        }
    }

    function arrancarMedidorVoz() {
        pararMedidorVoz();
        if (!flujoLocal || typeof AudioContext === "undefined") return;
        try {
            if (!contextoVoz) contextoVoz = new AudioContext();
            else if (contextoVoz.state === "suspended") contextoVoz.resume();
            const fuente = contextoVoz.createMediaStreamSource(flujoLocal);
            analizadorVoz = contextoVoz.createAnalyser();
            analizadorVoz.fftSize = 512;
            fuente.connect(analizadorVoz);
            datosVoz = new Uint8Array(analizadorVoz.frequencyBinCount);
            intervaloVoz = setInterval(() => {
                if (!analizadorVoz) return;
                analizadorVoz.getByteTimeDomainData(datosVoz);
                let pico = 0;
                for (let i = 0; i < datosVoz.length; i += 1) {
                    pico = Math.max(pico, Math.abs(datosVoz[i] - 128) / 128);
                }
                // Suavizado: sube rápido al hablar y baja despacio en silencio.
                nivelVoz = Math.max(pico, nivelVoz * 0.75);
                pintarOndasGrabacion();
            }, 120);
        } catch {
            contextoVoz = null;
            analizadorVoz = null;
        }
    }

    // La grabadora se pone en pausa (no se termina): queda escuchable en ese
    // punto y se reanuda desde ahí. No muestra el chip del nombre del archivo.
    function pausaGrabacion() {
        if (!grabadora || grabadora.state === "inactive") return;
        if (grabadora.state === "paused") {
            grabadora.resume();
            pararMedidorVoz();
            arrancarMedidorVoz();
        } else {
            grabadora.pause();
            pararMedidorVoz();
        }
        pintarOndasGrabacion();
        actualizarBoton();
    }

    function pararMedidorVoz() {
        if (intervaloVoz) clearInterval(intervaloVoz);
        intervaloVoz = null;
        analizadorVoz = null;
        datosVoz = null;
        nivelVoz = 0;
        if (contextoVoz?.close) contextoVoz.close().catch(() => {});
        contextoVoz = null;
    }

    function limpiarGrabacion() {
        if (intervalo) clearInterval(intervalo);
        intervalo = null;
        segundos = 0;
        pararMedidorVoz();
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
        ajustarAlturaEntrada();
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
        // Las fotos pasan por el editor universal (recortar, pintar, texto).
        // Si se cierra sin confirmar, no se adjunta nada.
        if (tipo === "imagen") {
            abrirEditorFoto(archivo, (resultado) => {
                adjunto = { archivo: resultado, tipo };
                pintarChip();
                actualizarBoton();
            });
            return;
        }
        adjunto = { archivo, tipo };
        pintarChip();
        actualizarBoton();
    }

    // Varias fotos a la vez: se quedan juntas en un unico adjunto y cada una
    // subira su propio mensaje al enviar. La compresion de las que pasen del
    // limite se hace al subirlas, en subirAdjuntoPrivado.
    function prepararAdjuntos(elegidos) {
        if (!elegidos.length) return;
        if (elegidos.length === 1 || !config.multiplesFotos) {
            prepararAdjunto(elegidos[0]);
            return;
        }
        const fotos = elegidos.filter((archivo) => tipoDeMime(archivo.type) === "imagen");
        if (fotos.length !== elegidos.length) {
            avisar("Entre varias fotos solo se pueden adjuntar imágenes");
            return;
        }
        adjunto = { archivos: fotos, tipo: "imagen" };
        pintarChip();
        actualizarBoton();
    }

    // Al terminar la grabación el audio queda como adjunto listo para enviar, o
    // se tira si el usuario pulsó BORRAR mientras grababa.
    function alDetenerGrabacion() {
        flujoLocal?.getTracks().forEach((pista) => pista.stop());
        flujoLocal = null;
        pararMedidorVoz();

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
        // Venía de pulsar enviar grabando: se manda solo, sin segundo clic.
        if (enviarAlParar) {
            enviarAlParar = false;
            botonAccion.disabled = true;
            Promise.resolve()
                .then(() => enviar(entrada.value.trim(), adjunto))
                .then(() => limpiarTodo())
                .catch((error) => {
                    console.error("No se pudo enviar el mensaje:", error);
                    avisar(error?.message || "No se pudo enviar el mensaje");
                })
                .finally(() => {
                    botonAccion.disabled = false;
                    actualizarBoton();
                });
        }
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
        prepararOndasGrabacion();
        pintarOndasGrabacion();
        arrancarMedidorVoz();
        filaGrabacion.hidden = false;
        formulario.classList.add("grabando");
        intervalo = setInterval(() => {
            segundos += 1;
            pintarTiempo();
            pintarOndasGrabacion();
            // Al llegar al máximo del servidor se para sola: queda lista
            // para enviar (no se tira).
            if (segundos >= MAXIMO_GRABACION_SEG && grabando()) {
                detenerGrabacion(false);
            }
        }, 1000);
        actualizarBoton();
    }

    // El cuadro de escritura crece con el texto hasta tres lineas; a partir de
    // ahi el CSS lo limita con max-height y solo hace scroll vertical dentro
    // de el (overflow-x: hidden impide cualquier scroll hacia los lados).
    function ajustarAlturaEntrada() {
        if (!entrada || !entrada.style) return;
        entrada.style.height = "auto";
        let maximo = 92;
        if (typeof getComputedStyle === "function") {
            const leido = Number.parseFloat(getComputedStyle(entrada).maxHeight);
            if (Number.isFinite(leido) && leido > 0) maximo = leido;
        }
        const medida = Number(entrada.scrollHeight) || 0;
        entrada.style.height = `${Math.min(medida, maximo)}px`;
    }

    entrada.addEventListener("input", () => {
        actualizarBoton();
        ajustarAlturaEntrada();
    });

    // En un textarea Enter salta linea en vez de enviar: aqui se recupera el
    // comportamiento de antes (Enter envia, Shift+Enter hace salto de linea).
    entrada.addEventListener("keydown", (evento) => {
        if (evento.key !== "Enter" || evento.shiftKey) return;
        evento.preventDefault();
        if (typeof formulario.requestSubmit === "function") {
            formulario.requestSubmit(botonAccion);
        }
    });

    ajustarAlturaEntrada();

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

        // La ubicación no es un archivo: se comparte en directo, no se adjunta.
        if (clase === "ubicacion") {
            abrirModalUbicacion(config.compartirUbicacion);
            return;
        }

        limpiarAdjunto();
        inputArchivo.accept = ACEPTA_ADJUNTO[clase] ?? "";
        // En el chat privado se pueden elegir todas las fotos de una vez;
        // videos y audios (y todo en el servidor) siguen siendo de uno en uno.
        inputArchivo.multiple = Boolean(config.multiplesFotos) && clase === "imagen";
        inputArchivo.click();
    });

    inputArchivo.addEventListener("change", () => {
        const elegidos = [...(inputArchivo.files ?? [])];
        // Se vacia el input para que elegir otra vez la misma foto siga
        // funcionando: si no, el navegador no da cambio y no se adjunta nada.
        inputArchivo.value = "";
        prepararAdjuntos(elegidos);
    });

    botonDescartar.addEventListener("click", () => {
        if (grabando()) {
            detenerGrabacion(true);
            return;
        }
        limpiarAdjunto();
    });

    // Botón PARAR de la fila: pausa/reanuda la grabación (no la termina).
    botonParar?.addEventListener("click", () => {
        if (!grabando()) return;
        pausaGrabacion();
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

        // Grabando, el botón corta el audio; si además hay intención de
        // enviar (texto o submit del botón), al parar se manda solo.
        if (grabando()) {
            if (entrada.value.trim() || evento.submitter === botonAccion) {
                enviarAlParar = true;
            }
            detenerGrabacion(false);
            return;
        }

        // Si la graba está pausada (o en curso, por si acaso) se termina para que
        // el audio quede como adjunto y se pueda enviar con un clic.
        if (grabadora && (grabadora.state === "paused" || grabadora.state === "recording")) {
            detenerGrabacion(false);
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
        // Ademas de refrescar el boton, recoloca la altura del cuadro: lo usa
        // el chat al poner el texto de un mensaje para editar.
        refrescar: () => {
            actualizarBoton();
            ajustarAlturaEntrada();
        },
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
        enviar: enviarMensajeChat,
        compartirUbicacion: (minutos) => compartirUbicacionChat(minutos),
        // Solo el chat privado admite subir todas las fotos de una vez.
        multiplesFotos: true
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
        // Con varias fotos a la vez, cada una sube la suya y el texto (y la cita
        // de respuesta) se quedan en la primera.
        const porSubir = adjunto ? (adjunto.archivos ?? [adjunto.archivo]) : [];
        const subidos = [];
        for (const archivo of porSubir) {
            subidos.push(await subirAdjuntoPrivado(archivo));
        }

        if (!contenido && !subidos.length) return;

        for (let indice = 0; indice < Math.max(subidos.length, 1); indice += 1) {
            const enviado = subidos[indice];
            const respuesta = await fetch(
                `/api/mensajes/conversacion/${amigoChatActual.id}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        contenido: indice === 0 ? contenido : "",
                        respuestaId: indice === 0 ? mensajeRespuestaChat : undefined,
                        tipo: enviado ? enviado.tipo : undefined,
                        archivoId: enviado ? enviado.archivo_id : undefined
                    })
                }
            );

            const datos = await respuesta.json().catch(() => ({}));

            if (!respuesta.ok) {
                throw new Error(datos.error || "No se pudo enviar el mensaje");
            }
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

        // El límite de siempre por foto: si pesa más de 12 MB se comprime
        // aquí, antes de subirla (también cubre lo que sale del editor).
        if (archivo.type?.startsWith("image/") && archivo.size > LIMITE_FOTO_BYTES) {
            archivo = await comprimirFoto(archivo);
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
// Mapa id -> mensaje para saber si lo marcado se puede borrar (solo míos
// de texto) o solo reenviar (cualquiera visible).
const mensajesChatPorId = new Map();
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
// Mensajes de servidor marcados con pulsación larga para reenviarlos o
// borrarlos, igual que la selección del chat privado.
let mensajesSeleccionadosServidor = new Set();
// Mapa id -> mensaje para decidir si la papelera se enseña.
const mensajesServidorPorId = new Map();
const modalEstado = document.getElementById("modal-estado");
const modalPublicacion = document.getElementById("modal-publicacion");
const modalEditorFoto = document.getElementById("modal-editor-foto");
let grabadoraAudio = null;
let flujoAudio = null;
let blobAudioEstado = null;
let misEstadosActuales = [];
let limiteGrabacionAudio = null;
let descartarGrabacionAudio = false;
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
const ayudaInstalar = document.getElementById("ayuda-instalar");

let instalacionPendiente = null;

// Androides viejos (y navegadores sin el aviso de instalacion) nunca emiten
// beforeinstallprompt: si a los pocos segundos no ha llegado ninguno, se
// muestra el boton igual y al pulsarlo se explica como instalar a mano
// desde el menu del navegador.
if (!appYaInstalada()) {
    setTimeout(() => {
        if (!instalacionPendiente && botonInstalarApp && botonInstalarApp.hidden) {
            botonInstalarApp.hidden = false;
        }
    }, 6000);
}

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
    // Sin aviso del navegador (Android viejo): se enseña como instalar
    // desde el menu, que es la via que si existe en todas las versiones.
    if (!instalacionPendiente) {
        if (ayudaInstalar) ayudaInstalar.hidden = !ayudaInstalar.hidden;
        return;
    }
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

// Cuando hay una version nueva esperando, se aplica sola en cuanto la app
// queda en segundo plano o se recarga: esperar al clic manual dejaba a la
// gente (sobre todo en movil) mirando la version vieja eternamente aunque
// recargara la pagina. Si el usuario esta escribiendo algo, se espera a que
// termine para no perderle el texto.
function avisarActualizacion(registration) {
    if (!avisoActualizacion) return;

    const hayTextoSinEnviar = () => {
        const cajas = [
            document.getElementById("entrada-mensaje"),
            document.getElementById("entrada-mensaje-servidor")
        ];
        return cajas.some((caja) => Boolean(caja && String(caja.value || "").trim()));
    };

    const aplicar = () => {
        if (hayTextoSinEnviar()) {
            // Se reintenta en 10 s: no se pierde lo que se esta escribiendo.
            setTimeout(() => {
                try { aplicar(); } catch { /* reintento siguiente */ }
            }, 10 * 1000);
            return;
        }
        avisarActualizacion.hidden = true;
        botonActualizarApp.disabled = true;
        if (registration.waiting) {
            registration.waiting.postMessage({ tipo: "activar-version" });
        } else {
            window.location.reload();
        }
    };

    // Se sigue enseñando el aviso por si alguien quiere forzarla ya, pero la
    // aplicacion tambien avanza sola sin esperar al clic.
    avisoActualizacion.hidden = false;
    botonActualizarApp.onclick = aplicar;
    botonActualizarApp.disabled = false;
    try { aplicar(); } catch { /* el boton manual sigue disponible */ }
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
        // Un aviso Push pulsado con la app ya abierta: se salta al chat.
        if (event.data?.tipo === "abrir-notificacion") {
            const datos = event.data.data || {};
            if (datos.type === "mensaje_privado" && datos.usuarioId) {
                abrirChatPorId(datos.usuarioId);
            }
            return;
        }
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

    // Chrome avisa cuando la app cumple los requisitos de instalacion: se
    // guarda el aviso y se muestra el boton para lanzarlo cuando el usuario
    // lo pida. Si la pagina no llega a registrarlo a tiempo (navegadores
    // antiguos), ya se encarga el boton en modo manual de arriba.
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

    // Al salir de la cuenta se olvida qué estaba viendo: los avisos vuelven.
    avisarSinVista();


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

/* ==============================
   APODOS
   El nombre que le pongo yo a cada persona. Es privado: solo lo veo yo, la
   otra persona sigue viendo su nombre de verdad. Se aplica en todas partes
   con nombreVisible(), salvo en "Agregar amigos", donde se busca gente nueva y
   se ve el nombre real.
   ============================== */

const apodosPorUsuario = new Map();

// Nombres reales de los que tengo apodo, para la lista de Cuenta.
const nombreRealPorId = new Map();

async function cargarApodos() {
    try {
        const datos = await solicitarGrupo("/api/apodos");
        apodosPorUsuario.clear();
        (datos.apodos || []).forEach((entrada) => apodosPorUsuario.set(entrada.otro_id, entrada.apodo));
        await cargarNombresApodados();
    } catch {
        // Sin apodos cargados se ven los nombres reales: no se rompe nada.
    }
}

// Para la lista de Cuenta hacen falta también los nombres reales, que no
// vienen en /api/apodos. Se piden de los amigos que ya se conocen.
async function cargarNombresApodados() {
    if (apodosPorUsuario.size === 0) return;
    const pedidos = [...apodosPorUsuario.keys()].map((id) =>
        solicitarGrupo(`/api/perfil/${encodeURIComponent(id)}`)
            .then((datos) => {
                if (datos.perfil?.nombre) nombreRealPorId.set(id, datos.perfil.nombre);
            })
            .catch(() => {})
    );
    await Promise.all(pedidos);
}

// Nombre que hay que pintar para esa persona.
function nombreVisible(usuarioId, nombreReal) {
    if (!usuarioId) return nombreReal;
    return apodosPorUsuario.get(usuarioId) || nombreReal;
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
   UBICACIÓN EN DIRECTO
   Compartir es enviar un mensaje normal con la posición dentro; a partir
   de ahí se sigue la posición con watchPosition y la misma tarjeta se va
   moviendo, sin llenar el chat de mensajes nuevos. Solo quien comparte
   puede pararla.
   ============================== */

const MINUTO_AUTOR_UBICACION = 60000;
const METROS_MINIMO_MOVIMIENTO = 12;

let compartiendoUbicacion = null;
let vigilanteUbicacion = null;
let ultimaPosicion = null;
let temporizadorCaducidad = null;
let enviarUbicacionPendiente = null;

function textoDuracionUbicacion(minutos) {
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.round(minutos / 60);
    return horas === 1 ? "1 hora" : `${horas} horas`;
}

function abrirModalUbicacion(compartir) {
    enviarUbicacionPendiente = compartir;

    const modal = document.getElementById("modal-ubicacion");
    const estado = document.getElementById("estado-modal-ubicacion");
    const botonParar = document.getElementById("boton-parar-ubicacion");
    const botonEnviar = document.getElementById("boton-enviar-ubicacion");

    if (!modal) return;

    // Si ya se está compartiendo, la ventanita ofrece parar en lugar de
    // empezar otra vez: en un chat solo hay una ubicación propia en directo.
    const activa = Boolean(compartiendoUbicacion);
    botonParar.hidden = !activa;
    botonEnviar.hidden = activa;
    estado.textContent = activa
        ? "Estás compartiendo ahora mismo. Se parará sola al terminar el tiempo."
        : "";

    modal.hidden = false;
}

function cerrarModalUbicacion() {
    const modal = document.getElementById("modal-ubicacion");
    if (modal) modal.hidden = true;
}

function distanciaEntre(a, b) {
    if (!a || !b) return Infinity;
    const radioTierra = 6371000;
    const rad = (grado) => (grado * Math.PI) / 180;

    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const x = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;

    return 2 * radioTierra * Math.asin(Math.sqrt(x));
}

/* ==============================
   TARJETA DE UBICACIÓN
   Una tarjeta pequeña: un trozo de mapa de OpenStreetMap, el estado
   (en vivo o terminada) y un botón para abrirla en el mapa del móvil.
   No hace falta ninguna clave ni servicio de pago: los mosaicos son
   los públicos de OpenStreetMap.
   ============================== */

/* El mapa se monta con las teselas públicas de OpenStreetMap, que son
   imágenes de verdad. Antes se usaba el "embed" del mapa, que devuelve una
   página HTML: eso dentro de un <img> no se ve nunca y solo salía su texto
   alternativo, parpadeando con cada refresco.

   Se hacen cuatro teselas (2x2) reducidas a la mitad y se colocan como fondos
   CSS, con la chincheta encima. El resultado se guarda en memoria: el chat se
   repinta cada dos segundos y sin esta caché se volverían a pedir las mismas
   teselas una y otra vez. */
const ZOOM_UBICACION = 16;
const LADO_TESELA_PANTALLA = 128;

function teselaDe(lat, lon, zoom, desfaseX, desfaseY) {
    const total = 2 ** zoom;
    const rad = (grado) => (grado * Math.PI) / 180;

    const xExacto = ((lon + 180) / 360) * total;
    const yExacto = (
        (1 - Math.log(Math.tan(rad(lat)) + 1 / Math.cos(rad(lat))) / Math.PI) / 2
    ) * total;

    const x = Math.floor(xExacto) + desfaseX;
    const y = Math.floor(yExacto) + desfaseY;

    // Posición de la tesela dentro de la caja de 256x256 de la tarjeta.
    const izquierda = Math.round((x - xExacto) * LADO_TESELA_PANTALLA);
    const arriba = Math.round((y - yExacto) * LADO_TESELA_PANTALLA);

    return {
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        izquierda,
        arriba
    };
}

const mapasEnMemoria = new Map();

function pintarMapaUbicacion(lat, lon) {
    // Se redondea la posición: si la tarjeta se repinta con el mismo punto
    // aproximado, se reutiliza lo ya calculado.
    const clave = `${lat.toFixed(4)}|${lon.toFixed(4)}|${ZOOM_UBICACION}`;
    const guardada = mapasEnMemoria.get(clave);
    if (guardada) return guardada;

    const teselas = [
        teselaDe(lat, lon, ZOOM_UBICACION, 0, 0),
        teselaDe(lat, lon, ZOOM_UBICACION, 1, 0),
        teselaDe(lat, lon, ZOOM_UBICACION, 0, 1),
        teselaDe(lat, lon, ZOOM_UBICACION, 1, 1)
    ];

    // La chincheta va en el centro de la caja, que es donde cae el punto exacto
    // porque la tesela de arriba a la izquierda se posiciona por su desfase.
    const estilo = teselas.map((tesela) => {
        return (
            `url("${tesela.url}") ${tesela.izquierda}px ${tesela.arriba}px / ` +
            `${LADO_TESELA_PANTALLA}px ${LADO_TESELA_PANTALLA}px no-repeat`
        );
    }).join(", ");

    const mapa = { estilo, teselas };
    mapasEnMemoria.set(clave, mapa);
    return mapa;
}

function htmlTarjetaUbicacion(mensaje) {
    const datos = mensaje.datos?.ubicacion;
    if (!datos) return "";

    const caduca = datos.expiraEn ? new Date(datos.expiraEn).getTime() : 0;
    const enVivo = datos.enVivo === true && (!caduca || caduca > Date.now());

    const lat = Number(datos.lat);
    const lon = Number(datos.lon);
    const precision = Number(datos.precision) > 0
        ? ` · ±${Math.round(Number(datos.precision))} m`
        : "";

    const mapa = pintarMapaUbicacion(lat, lon);
    const mias = mensaje.es_mio === true;

    return `
        <div class="tarjeta-ubicacion ${enVivo ? "en-vivo" : "detenida"}" data-lat="${lat}" data-lon="${lon}">
            <div class="ubicacion-mapa" style="${mapa.estilo}">
                <span class="ubicacion-chincheta" aria-hidden="true"></span>
            </div>
            <div class="ubicacion-pie">
                <span class="ubicacion-estado">${enVivo ? "● En vivo" : "■ Ubicación"}</span>
                <span class="ubicacion-detalle">${escapeHtml(datos.nombre || "Ubicación en directo")}${escapeHtml(precision)}</span>
            </div>
            <div class="ubicacion-acciones">
                <a class="ubicacion-abrir-mapa" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener noreferrer">ABRIR EN EL MAPA</a>
                ${mias && enVivo ? `<button type="button" class="ubicacion-parar" data-parar-ubicacion="${escapeHtml(mensaje.id)}">DEJAR DE COMPARTIR</button>` : ""}
            </div>
            <a class="ubicacion-credito" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
        </div>`;
}

function pedirPosicionActual() {
    return new Promise((resolver, rechazar) => {
        if (!navigator.geolocation) {
            rechazar(new Error("Este navegador no sabe decir dónde estás"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (posicion) => resolver({
                lat: posicion.coords.latitude,
                lon: posicion.coords.longitude,
                precision: posicion.coords.accuracy ?? 0
            }),
            (error) => {
                const mensajes = {
                    1: "Has denegado la ubicación. Actívala en los ajustes del navegador.",
                    2: "No se pudoTu ubicacion. Intentalo de nuevo en unos segundos.",
                    3: "No se pudo saber tu ubicacion. Intentalo otra vez."
                };
                rechazar(new Error(mensajes[error.code] || "No se pudo obtener la ubicacion"));
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });
}

// El arnés recibe una función con tres acciones: crear el mensaje, moverlo y
// pararlo. Cada sitio (chat o servidor) aporta sus propias rutas.
async function compartirUbicacionChat(minutos) {
    if (!amigoChatActual) return;

    await iniciarCompartido(minutos, async (accion, datos) => {
        const token = localStorage.getItem("atuistas_token");

        if (accion === "parar") {
            const respuesta = await fetch(
                `/api/mensajes/${encodeURIComponent(datos.mensajeId)}/ubicacion/detener`,
                { method: "POST", headers: { Authorization: `Bearer ${token}` } }
            );
            return respuesta.ok ? null : null;
        }

        if (accion === "mover") {
            const respuesta = await fetch(
                `/api/mensajes/${encodeURIComponent(datos.mensajeId)}/ubicacion`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(datos.posicion)
                }
            );
            const cuerpo = await respuesta.json().catch(() => ({}));
            if (!respuesta.ok) throw new Error(cuerpo.error || "La ubicacion ya no esta en directo");
            return cuerpo.mensaje;
        }

        const respuesta = await fetch(
            `/api/mensajes/conversacion/${encodeURIComponent(amigoChatActual.id)}/ubicacion`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ ...datos.posicion, minutos })
            }
        );

        const cuerpo = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo compartir la ubicacion");
        return cuerpo.mensaje;
    });
}

// Compartir en el canal abierto de un servidor.
async function compartirUbicacionServidor(minutos) {
    if (!grupoActual) return;

    await iniciarCompartido(minutos, async (accion, datos) => {
        const ruta = `/api/grupos/${encodeURIComponent(grupoActual.id)}/ubicacion`;

        if (accion === "parar") {
            const cuerpo = await solicitarGrupo(
                `${ruta}/${encodeURIComponent(datos.mensajeId)}/detener`,
                { method: "POST" }
            );
            return cuerpo.mensaje;
        }

        if (accion === "mover") {
            const cuerpo = await solicitarGrupo(
                `${ruta}/${encodeURIComponent(datos.mensajeId)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify(datos.posicion)
                }
            );
            return cuerpo.mensaje;
        }

        const cuerpo = await solicitarGrupo(ruta, {
            method: "POST",
            body: JSON.stringify({
                ...datos.posicion,
                minutos,
                canalId: canalActual ? canalActual.id : undefined
            })
        });
        return cuerpo.mensaje;
    });
}

async function iniciarCompartido(minutos, enviar) {
    const estado = document.getElementById("estado-modal-ubicacion");
    const boton = document.getElementById("boton-enviar-ubicacion");

    try {
        if (estado) estado.textContent = "Buscando tu posicion...";
        boton.disabled = true;

        const posicion = await pedirPosicionActual();
        const mensaje = await enviar("crear", { posicion });

        compartiendoUbicacion = {
            mensajeId: mensaje.id,
            expiraEn: Date.now() + minutos * MINUTO_AUTOR_UBICACION,
            actualizar: (nueva) => enviar("mover", { posicion: nueva, mensajeId: mensaje.id }),
            parar: () => enviar("parar", { mensajeId: mensaje.id })
        };

        ultimaPosicion = posicion;
        seguirUbicacion();
        programarCaducidad();

        cerrarModalUbicacion();
        if (amigoChatActual) await cargarMensajesChat();
        else await cargarMensajesServidor();
    } catch (error) {
        if (estado) estado.textContent = error.message || "No se pudo compartir la ubicacion";
    } finally {
        boton.disabled = false;
    }
}

// watchPosition entrega punto cada pocos segundos; aqui solo se avisa al
// servidor cuando la persona se ha movido de verdad, para no gastar.
function seguirUbicacion() {
    if (!navigator.geolocation || !compartiendoUbicacion) return;

    if (vigilanteUbicacion !== null) {
        navigator.geolocation.clearWatch(vigilanteUbicacion);
    }

    vigilanteUbicacion = navigator.geolocation.watchPosition(
        async (posicion) => {
            if (!compartiendoUbicacion) return;

            const nueva = {
                lat: posicion.coords.latitude,
                lon: posicion.coords.longitude,
                precision: posicion.coords.accuracy ?? 0
            };

            const movido = distanciaEntre(ultimaPosicion, nueva) >= METROS_MINIMO_MOVIMIENTO;
            if (!movido) return;

            ultimaPosicion = nueva;

            try {
                await compartiendoUbicacion.actualizar(nueva);
            } catch (error) {
                // Si ya no esta en directo (caduco o se paro), se deja de vigilar.
                await detenerCompartido();
            }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
}

function programarCaducidad() {
    if (temporizadorCaducidad) clearTimeout(temporizadorCaducidad);
    if (!compartiendoUbicacion) return;

    const restante = Math.max(0, compartiendoUbicacion.expiraEn - Date.now());
    temporizadorCaducidad = setTimeout(() => {
        detenerCompartido();
    }, restante);
}

async function detenerCompartido() {
    if (!compartiendoUbicacion) return;

    const enCurso = compartiendoUbicacion;
    compartiendoUbicacion = null;

    if (vigilanteUbicacion !== null) {
        navigator.geolocation?.clearWatch(vigilanteUbicacion);
        vigilanteUbicacion = null;
    }
    if (temporizadorCaducidad) {
        clearTimeout(temporizadorCaducidad);
        temporizadorCaducidad = null;
    }
    ultimaPosicion = null;

    try {
        await enCurso.parar();
    } catch (error) {
        // Si ya estaba parada en el servidor, no hay nada que arreglar.
    }
}

async function pararCompartido() {
    await detenerCompartido();
    cerrarModalUbicacion();

    if (amigoChatActual) await cargarMensajesChat();
    else if (grupoActual) await cargarMensajesServidor();
}

// El botón "DEJAR DE COMPARTIR" va en la propia tarjeta, para poder pararlo
// sin tener que abrir la ventanita de la ubicación otra vez.
document.addEventListener("click", async (evento) => {
    const boton = evento.target.closest?.("[data-parar-ubicacion]");
    if (!boton) return;

    evento.preventDefault();
    boton.disabled = true;
    boton.textContent = "PARANDO...";

    await pararCompartido();
});

/* ==============================
   EL CÓDIGO QR
   Atajo: mantener pulsadas la Q y la R a la vez durante cinco segundos
   dentro de la web. En móvil, donde no hay teclado, hay un botón en la
   cabecera que solo aparece dentro de Cuenta.
   ============================== */

const IMAGEN_CODIGO = "/qratuistas.png";
const SEGUNDOS_ATAJO_CODIGO = 5;
const TECLAS_ATAJO_CODIGO = ["q", "r"];

const teclasAtajoPulsadas = new Set();
let temporizadorAtajo = null;

function construirVentanaCodigo() {
    if (document.getElementById("modal-codigo")) return;

    const ventana = document.createElement("div");
    ventana.id = "modal-codigo";
    ventana.className = "modal modal-codigo";
    ventana.hidden = true;
    ventana.innerHTML = `
        <div class="dialogo-codigo" role="dialog" aria-modal="true" aria-label="Código QR">
            <button
                id="cerrar-codigo"
                class="cerrar-codigo"
                type="button"
                aria-label="Cerrar"
            >✕</button>
            <img src="${IMAGEN_CODIGO}" alt="Código QR de Atuistas">
        </div>`;

    document.body.appendChild(ventana);

    ventana.querySelector("#cerrar-codigo").addEventListener("click", cerrarCodigo);
    ventana.addEventListener("click", (evento) => {
        // Pulsar en el fondo también lo cierra; en la imagen no.
        if (evento.target === ventana) cerrarCodigo();
    });
}

function abrirCodigo() {
    construirVentanaCodigo();
    document.getElementById("modal-codigo").hidden = false;
}

function cerrarCodigo() {
    const ventana = document.getElementById("modal-codigo");
    if (ventana) ventana.hidden = true;
}

function cancelarAtajoCodigo() {
    if (temporizadorAtajo) {
        clearTimeout(temporizadorAtajo);
        temporizadorAtajo = null;
    }
    teclasAtajoPulsadas.clear();
}

document.addEventListener("keydown", (evento) => {
    // Con Ctrl u Alt no cuenta: si no, recargar con Ctrl+R saltaría el atajo.
    if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

    const tecla = String(evento.key).toLowerCase();
    if (!TECLAS_ATAJO_CODIGO.includes(tecla)) return;

    teclasAtajoPulsadas.add(tecla);

    // Solo cuando están las dos a la vez, y solo una cuenta de 5 segundos.
    if (teclasAtajoPulsadas.size === TECLAS_ATAJO_CODIGO.length && !temporizadorAtajo) {
        temporizadorAtajo = setTimeout(() => {
            temporizadorAtajo = null;
            abrirCodigo();
        }, SEGUNDOS_ATAJO_CODIGO * 1000);
    }
});

document.addEventListener("keyup", (evento) => {
    teclasAtajoPulsadas.delete(String(evento.key).toLowerCase());
    if (temporizadorAtajo) cancelarAtajoCodigo();
});

// Si se cambia de ventana con las teclas pulsadas, el atajo se cancela solo.
window.addEventListener("blur", cancelarAtajoCodigo);

document.getElementById("boton-qr-cuenta")?.addEventListener("click", abrirCodigo);

/* ==============================
   SELECTOR DE EMOJIS, GIF Y STICKERS
   Un único panel sirve para los cuatro sitios donde se escribe: chat
   privado, servidor, comentarios de reels y comentarios de
   publicaciones. Se abre sobre el campo de escritura sin robarle el
   foco, para que en el móvil no salte el teclado de golpe.
   ============================== */

const CLAVE_EMOJIS_RECIENTES = "atuistas_emoji_recientes";
const MAXIMO_EMOJIS_RECIENTES = 32;

let destinoSelector = null;
let pestanaSelector = "emojis";
let temporizadorBusqueda = null;
let consultaEnCurso = 0;
let emojisRecientes = leerEmojiRecientes();

function leerEmojiRecientes() {
    try {
        const guardado = JSON.parse(
            localStorage.getItem(CLAVE_EMOJIS_RECIENTES) || "[]"
        );
        return Array.isArray(guardado)
            ? guardado.filter((pieza) => Array.isArray(pieza) && pieza[0])
            : [];
    } catch (error) {
        return [];
    }
}

function recordarEmoji(emoji, nombre) {
    emojisRecientes = [[emoji, nombre], ...emojisRecientes.filter((pieza) => pieza[0] !== emoji)]
        .slice(0, MAXIMO_EMOJIS_RECIENTES);

    try {
        localStorage.setItem(CLAVE_EMOJIS_RECIENTES, JSON.stringify(emojisRecientes));
    } catch (error) {
        // Si el navegador no deja guardar, los recientes duran esta sesión.
    }
}

// El botón se inserta antes del campo de escritura en cada sitio. Se crea
// siempre igual para no repetir el dibujo cuatro veces.
function asegurarBotonEmoji(idEntrada, destino) {
    if (document.getElementById(`boton-emoji-${destino}`)) return;

    const entrada = document.getElementById(idEntrada);
    if (!entrada || !entrada.parentNode) return;

    const boton = document.createElement("button");
    boton.type = "button";
    boton.id = `boton-emoji-${destino}`;
    boton.className = "boton-emoji";
    boton.title = "Emojis, GIF y stickers";
    boton.setAttribute("aria-label", "Emojis, GIF y stickers");
    boton.innerHTML = `
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>
            <circle cx="9" cy="10" r="1.3" fill="currentColor"/>
            <circle cx="15" cy="10" r="1.3" fill="currentColor"/>
            <path d="M8 14.2a5 5 0 0 0 8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;

    // Sin preventDefault el móvil cierra el teclado al pulsar el botón.
    boton.addEventListener("mousedown", (evento) => evento.preventDefault());
    boton.addEventListener("click", (evento) => {
        evento.preventDefault();
        alternarSelector(destino, idEntrada);
    });

    entrada.parentNode.insertBefore(boton, entrada);
}

function construirSelector() {
    if (document.getElementById("selector-medio")) return;

    const panel = document.createElement("div");
    panel.id = "selector-medio";
    panel.className = "selector-medio";
    panel.hidden = true;
    panel.innerHTML = `
        <div class="selector-medio-pestanas">
            <button type="button" data-pestana="emojis" class="activa">EMOJIS</button>
            <button type="button" data-pestana="gifs">GIF</button>
            <button type="button" data-pestana="stickers">STICKERS</button>
            <button type="button" id="selector-medio-cerrar" aria-label="Cerrar el selector">✕</button>
        </div>
        <input
            id="selector-medio-buscar"
            class="selector-medio-buscar"
            type="search"
            placeholder="Buscar emoji, GIF o sticker"
            autocomplete="off"
        >
        <div id="selector-medio-categorias" class="selector-medio-categorias"></div>
        <div id="selector-medio-rejilla" class="selector-medio-rejilla"></div>`;

    document.body.appendChild(panel);

    panel.querySelectorAll("[data-pestana]").forEach((boton) => {
        boton.addEventListener("click", () => {
            pestanaSelector = boton.dataset.pestana;
            panel.querySelectorAll("[data-pestana]").forEach((otro) => {
                otro.classList.toggle("activa", otro === boton);
            });
            pintarSelector();
        });
    });

    panel.querySelector("#selector-medio-cerrar").addEventListener("click", cerrarSelector);

    const buscador = panel.querySelector("#selector-medio-buscar");
    buscador.addEventListener("input", () => {
        clearTimeout(temporizadorBusqueda);
        temporizadorBusqueda = setTimeout(pintarSelector, 250);
    });

    document.addEventListener("mousedown", (evento) => {
        if (panel.hidden) return;
        if (panel.contains(evento.target)) return;
        if (evento.target.closest?.(".boton-emoji")) return;
        cerrarSelector();
    });

    document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && !panel.hidden) cerrarSelector();
    });
}

function posicionarSelector(ancla) {
    const panel = document.getElementById("selector-medio");
    if (!ancla || !panel) return;

    const caja = ancla.getBoundingClientRect();

    panel.style.left = "8px";
    panel.style.right = "8px";
    panel.style.bottom = `${Math.max(8, window.innerHeight - caja.top + 6)}px`;
    panel.style.maxHeight = `${Math.min(340, window.innerHeight * 0.5)}px`;
}

function alternarSelector(destino, idEntrada) {
    const panel = document.getElementById("selector-medio");

    if (panel && !panel.hidden && destinoSelector?.destino === destino) {
        cerrarSelector();
        return;
    }

    construirSelector();
    const nuevo = document.getElementById("selector-medio");
    destinoSelector = {
        destino,
        idEntrada,
        ancla: document.getElementById(`boton-emoji-${destino}`)
    };

    posicionarSelector(destinoSelector.ancla);
    nuevo.hidden = false;
    pintarSelector();
}

function cerrarSelector() {
    const panel = document.getElementById("selector-medio");
    if (panel) panel.hidden = true;
    destinoSelector = null;
}

// Inserta texto donde esté el cursor, no al final: se nota al escribir a
// mitad de un mensaje ya empezado.
function insertarEnEntrada(entrada, texto) {
    const inicio = entrada.selectionStart ?? entrada.value.length;
    const fin = entrada.selectionEnd ?? inicio;

    entrada.value = entrada.value.slice(0, inicio) + texto + entrada.value.slice(fin);

    const cursor = inicio + texto.length;
    entrada.focus();
    try {
        entrada.setSelectionRange(cursor, cursor);
    } catch (error) {
        // Algunos navegadores de móvil no dejan colocar el cursor así.
    }

    entrada.dispatchEvent(new Event("input", { bubbles: true }));
}

function normalizarBusqueda(texto) {
    return String(texto ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function pintarSelector() {
    const panel = document.getElementById("selector-medio");
    if (!panel || !destinoSelector) return;

    const buscador = panel.querySelector("#selector-medio-buscar");
    const categorias = panel.querySelector("#selector-medio-categorias");
    const rejilla = panel.querySelector("#selector-medio-rejilla");
    const texto = normalizarBusqueda(buscador.value.trim());

    if (pestanaSelector !== "emojis") {
        categorias.hidden = true;
        buscarMedioEnProveedor(texto);
        return;
    }

    // Buscando: una sola lista de resultados, sin cabeceras de grupo.
    if (texto) {
        const piezas = [];
        for (const grupo of EMOJIS_ATUISTAS) {
            for (const pieza of grupo.items) {
                if (normalizarBusqueda(pieza[1]).includes(texto)) piezas.push(pieza);
            }
        }

        categorias.hidden = true;
        rejilla.innerHTML = piezas.length
            ? piezas.map(([emoji, nombre]) => `
                <button type="button" class="selector-emoji" data-emoji="${emoji}" data-nombre="${escapeHtml(nombre)}" title="${escapeHtml(nombre)}">
                    ${emoji}
                </button>`).join("")
            : '<p class="selector-medio-vacio">No hay ningún emoji con ese nombre.</p>';
        return;
    }

    const grupos = [];
    if (emojisRecientes.length) {
        grupos.push({ etiqueta: "Recientes", items: emojisRecientes });
    }
    grupos.push(...EMOJIS_ATUISTAS);

    categorias.hidden = false;
    categorias.innerHTML = grupos.map((grupo) => `
        <button type="button" data-grupo="${escapeHtml(grupo.etiqueta)}">${escapeHtml(grupo.etiqueta)}</button>`).join("");

    rejilla.innerHTML = grupos.map((grupo) => `
        <h4 class="selector-medio-titulo">${escapeHtml(grupo.etiqueta)}</h4>
        <div class="selector-medio-fila">
            ${grupo.items.map(([emoji, nombre]) => `
                <button type="button" class="selector-emoji" data-emoji="${emoji}" data-nombre="${escapeHtml(nombre)}" title="${escapeHtml(nombre)}">
                    ${emoji}
                </button>`).join("")}
        </div>`).join("");
}

// GIF y stickers llegan de Giphy. La clave la tiene el servidor: si no está
// puesta, el panel lo dice claro en vez de quedarse en blanco.
async function buscarMedioEnProveedor(texto) {
    const panel = document.getElementById("selector-medio");
    if (!panel) return;

    const rejilla = panel.querySelector("#selector-medio-rejilla");
    const consulta = ++consultaEnCurso;

    if (!texto) {
        rejilla.innerHTML = `<p class="selector-medio-vacio">Escribe arriba qué ${pestanaSelector === "gifs" ? "GIF" : "sticker"} buscas.</p>`;
        return;
    }

    rejilla.innerHTML = '<p class="selector-medio-vacio">Buscando…</p>';

    try {
        const token = localStorage.getItem("atuistas_token");
        const respuesta = await fetch(
            `/api/medios/buscar?buscar=${encodeURIComponent(texto)}&tipo=${pestanaSelector}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const cuerpo = await respuesta.json().catch(() => ({}));

        if (consulta !== consultaEnCurso) return;

        if (respuesta.status === 503 && cuerpo.faltaClave) {
            rejilla.innerHTML = `
                <p class="selector-medio-vacio">
                    Falta la clave de Giphy en el servidor.<br>
                    Los emojis funcionan; para GIF y stickers hay que poner
                    ATUISTAS_GIPHY_API_KEY en el .env y reiniciar.
                </p>`;
            return;
        }

        if (!respuesta.ok) {
            rejilla.innerHTML = `<p class="selector-medio-vacio">${escapeHtml(cuerpo.error || "No se pudo buscar")}</p>`;
            return;
        }

        if (!cuerpo.medio?.length) {
            rejilla.innerHTML = '<p class="selector-medio-vacio">Sin resultados.</p>';
            return;
        }

        rejilla.innerHTML = `
            <div class="selector-medio-medios">
                ${cuerpo.medio.map((item) => `
                    <button type="button" class="selector-medio-pieza" data-url="${escapeHtml(item.url)}" title="${escapeHtml(item.titulo || "Enviar")}">
                        <img src="${escapeHtml(item.mini || item.url)}" alt="${escapeHtml(item.titulo || "")}" loading="lazy">
                    </button>`).join("")}
            </div>`;
    } catch (error) {
        if (consulta !== consultaEnCurso) return;
        rejilla.innerHTML = '<p class="selector-medio-vacio">Sin conexión para buscar.</p>';
    }
}

// Pulsar un emoji lo pone en el campo; un GIF o sticker se envía tal cual,
// como si la persona lo hubiera subido desde el móvil.
function manejarClicSelector(evento) {
    const botonEmoji = evento.target.closest(".selector-emoji");
    if (botonEmoji && destinoSelector) {
        const entrada = document.getElementById(destinoSelector.idEntrada);
        if (entrada) {
            insertarEnEntrada(entrada, botonEmoji.dataset.emoji);
            recordarEmoji(botonEmoji.dataset.emoji, botonEmoji.dataset.nombre || "");
        }
        return;
    }

    const pieza = evento.target.closest(".selector-medio-pieza");
    if (pieza && destinoSelector) {
        enviarMedioSeleccionado(
            pieza.dataset.url,
            destinoSelector.destino,
            destinoSelector.idEntrada
        );
    }
}

async function enviarMedioSeleccionado(url, destino, idEntrada) {
    cerrarSelector();

    try {
        const respuesta = await fetch(url);
        if (!respuesta.ok) throw new Error("No se pudo descargar el GIF");

        const blob = await respuesta.blob();
        const esImagen = (blob.type || "").startsWith("image/");
        const extension = esImagen ? "gif" : (blob.type?.split("/")[1] || "bin");
        const archivo = new File([blob], `medio.${extension}`, { type: blob.type });

        // En los comentarios solo hay texto: se manda el enlace del GIF.
        if (destino === "comentario-reel" || destino === "comentario-publicacion") {
            const entrada = document.getElementById(idEntrada);
            if (entrada) insertarEnEntrada(entrada, url);
            return;
        }

        if (destino === "servidor") {
            await enviarMensajeServidor("", { archivo });
            return;
        }

        await enviarMensajeChat("", { archivo });
    } catch (error) {
        alert(error.message || "No se pudo enviar el GIF");
    }
}

/* ==============================
   VISOR DE FOTOS DEL CHAT
   Pulsar la foto de un mensaje la abre
   en grande: se amplia con la rueda,
   doble pulsación o pellizco, se cambia
   de foto deslizando a los lados (o con
   las flechas, en ratón) y se sale con
   la X de arriba a la izquierda o
   deslizando arriba o abajo.
   ============================== */

let fotosChatAbiertas = [];
let indiceFotoChat = 0;
let escalaFotoChat = 1;
let desplazFotoChat = { x: 0, y: 0 };
const punterosFotoChat = new Map();
let arrastreFotoChat = null;

function aplicarTransformFotoChat() {
    const imagen = document.getElementById("foto-chat-grande");
    if (!imagen || !imagen.style) return;
    imagen.style.transform =
        `translate(${desplazFotoChat.x}px, ${desplazFotoChat.y}px) scale(${escalaFotoChat})`;
    restablecerSalidaFotoChat();
}

function obtenerDialogoFotosChat() {
    return document.querySelector("#modal-fotos-chat .dialogo-fotos-chat");
}

/* Al arrastrar en vertical se atenúa el fondo para avisar de que al soltar
   se sale del visor, como en los estados. */
function vistaPreviaSalidaFotoChat(deltaX, deltaY) {
    const imagen = document.getElementById("foto-chat-grande");
    const dialogo = obtenerDialogoFotosChat();
    if (imagen?.style) {
        imagen.style.transition = "none";
        imagen.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1)`;
    }
    if (dialogo?.style) {
        const vertical = Math.abs(deltaY);
        const horizontal = Math.abs(deltaX);
        const arrastreVertical = vertical > horizontal ? vertical : 0;
        dialogo.style.background = `rgba(0, 0, 0, ${Math.max(0, 1 - arrastreVertical / 320)})`;
    }
}

function restablecerSalidaFotoChat() {
    const imagen = document.getElementById("foto-chat-grande");
    const dialogo = obtenerDialogoFotosChat();
    if (imagen?.style) imagen.style.transition = "";
    if (dialogo?.style) dialogo.style.background = "";
}

function pintarFotoChat(indice) {
    const modal = document.getElementById("modal-fotos-chat");
    if (!fotosChatAbiertas.length) {
        if (modal) modal.hidden = true;
        return;
    }
    indiceFotoChat = Math.max(0, Math.min(fotosChatAbiertas.length - 1, indice));
    escalaFotoChat = 1;
    desplazFotoChat = { x: 0, y: 0 };
    aplicarTransformFotoChat();

    document.getElementById("foto-chat-grande").src = fotosChatAbiertas[indiceFotoChat];
    document.getElementById("foto-chat-indice").textContent =
        fotosChatAbiertas.length > 1 ? `${indiceFotoChat + 1} / ${fotosChatAbiertas.length}` : "";
    document.getElementById("foto-chat-anterior").hidden = indiceFotoChat === 0;
    document.getElementById("foto-chat-siguiente").hidden =
        indiceFotoChat === fotosChatAbiertas.length - 1;
}

function abrirFotosChat(contenedorId, imagen) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor || !contenedor.querySelectorAll) return;
    // Las fotos de la conversación entera, en el orden en que se ven.
    fotosChatAbiertas = [...contenedor.querySelectorAll(".adjunto-mensaje img")]
        .map((foto) => foto.getAttribute?.("src") || foto.src || "")
        .filter(Boolean);
    const actual = imagen?.getAttribute?.("src") || imagen?.src || "";
    pintarFotoChat(Math.max(0, fotosChatAbiertas.indexOf(actual)));
    document.getElementById("modal-fotos-chat").hidden = false;
}

function cerrarFotosChat() {
    punterosFotoChat.clear();
    arrastreFotoChat = null;
    fotosChatAbiertas = [];
    restablecerSalidaFotoChat();
    document.getElementById("modal-fotos-chat").hidden = true;
}

function cambiarFotoChat(paso) {
    pintarFotoChat(indiceFotoChat + paso);
}

function acercarFotoChat(factor) {
    escalaFotoChat = Math.max(1, Math.min(6, escalaFotoChat * factor));
    if (escalaFotoChat === 1) desplazFotoChat = { x: 0, y: 0 };
    aplicarTransformFotoChat();
}

document.getElementById("cerrar-fotos-chat")?.addEventListener("click", cerrarFotosChat);
document.getElementById("foto-chat-anterior")?.addEventListener("click", () => cambiarFotoChat(-1));
document.getElementById("foto-chat-siguiente")?.addEventListener("click", () => cambiarFotoChat(1));

document.getElementById("modal-fotos-chat")?.addEventListener("click", (evento) => {
    if (evento.target === document.getElementById("modal-fotos-chat")) cerrarFotosChat();
});

document.addEventListener("keydown", (evento) => {
    const modal = document.getElementById("modal-fotos-chat");
    if (!modal || modal.hidden) return;
    if (evento.key === "Escape") cerrarFotosChat();
    else if (evento.key === "ArrowRight") cambiarFotoChat(1);
    else if (evento.key === "ArrowLeft") cambiarFotoChat(-1);
});

// Pulsar una foto de cualquier conversación (privada o de servidor) la abre.
// OJO: el gesto del mensaje hace setPointerCapture en pointerdown, así que
// cuando el clic llega el evento.target ya no es la foto sino el mensaje.
// Por eso se busca también bajo el puntero y, si el mensaje solo trae una
// foto, se usa esa.
for (const contenedorId of ["lista-mensajes", "mensajes-servidor"]) {
    document.getElementById(contenedorId)?.addEventListener("click", (evento) => {
        // Con la selección de mensajes activa, el toque selecciona: no se abre.
        if (typeof mensajesSeleccionadosChat !== "undefined" && mensajesSeleccionadosChat.size > 0) return;
        if (typeof mensajesSeleccionadosServidor !== "undefined" && mensajesSeleccionadosServidor.size > 0) return;
        let imagen = evento.target.closest?.(".adjunto-mensaje img") ?? null;
        if (!imagen && typeof document.elementFromPoint === "function"
            && Number.isFinite(evento.clientX) && Number.isFinite(evento.clientY)) {
            const bajoPuntero = document.elementFromPoint(evento.clientX, evento.clientY);
            imagen = bajoPuntero?.closest?.(".adjunto-mensaje img") ?? null;
        }
        if (!imagen) {
            const mensaje = evento.target.closest?.(".mensaje-chat");
            const fotos = mensaje ? [...mensaje.querySelectorAll(".adjunto-mensaje img")] : [];
            if (fotos.length === 1) imagen = fotos[0];
        }
        if (imagen) abrirFotosChat(contenedorId, imagen);
    });
}

const pistaFotosChat = document.querySelector(".fotos-chat-pista");

if (pistaFotosChat) {
    // Doble pulsación: ampliar y volver al tamaño normal.
    pistaFotosChat.addEventListener("dblclick", (evento) => {
        evento.preventDefault();
        if (escalaFotoChat > 1) {
            escalaFotoChat = 1;
            desplazFotoChat = { x: 0, y: 0 };
            aplicarTransformFotoChat();
        } else {
            escalaFotoChat = 2.5;
            aplicarTransformFotoChat();
        }
    });

    // Rueda del ratón: acercar y alejar.
    pistaFotosChat.addEventListener("wheel", (evento) => {
        if (!fotosChatAbiertas.length) return;
        evento.preventDefault();
        acercarFotoChat(evento.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    pistaFotosChat.addEventListener("pointerdown", (evento) => {
        pistaFotosChat.setPointerCapture?.(evento.pointerId);
        punterosFotoChat.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
        if (punterosFotoChat.size === 2) {
            const [a, b] = [...punterosFotoChat.values()];
            arrastreFotoChat = {
                pinch: true,
                distancia: Math.hypot(a.x - b.x, a.y - b.y),
                escalaBase: escalaFotoChat
            };
        } else if (punterosFotoChat.size === 1) {
            arrastreFotoChat = {
                pinch: false,
                inicioX: evento.clientX,
                inicioY: evento.clientY,
                origenX: desplazFotoChat.x,
                origenY: desplazFotoChat.y,
                movido: false
            };
        }
    });

    pistaFotosChat.addEventListener("pointermove", (evento) => {
        if (!punterosFotoChat.has(evento.pointerId) || !arrastreFotoChat) return;
        punterosFotoChat.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

        if (arrastreFotoChat.pinch && punterosFotoChat.size >= 2) {
            const [a, b] = [...punterosFotoChat.values()];
            const distancia = Math.hypot(a.x - b.x, a.y - b.y);
            const base = arrastreFotoChat.distancia || 1;
            escalaFotoChat = Math.max(1, Math.min(6, arrastreFotoChat.escalaBase * (distancia / base)));
            if (escalaFotoChat === 1) desplazFotoChat = { x: 0, y: 0 };
            aplicarTransformFotoChat();
            return;
        }

        const deltaX = evento.clientX - arrastreFotoChat.inicioX;
        const deltaY = evento.clientY - arrastreFotoChat.inicioY;
        if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) arrastreFotoChat.movido = true;

        // Ampliada, el dedo arrastra la foto; al tamaño normal se guarda el
        // movimiento para decidir al soltar si se cambia de foto (a los
        // lados) o se sale del visor (arriba o abajo).
        if (escalaFotoChat > 1) {
            desplazFotoChat = {
                x: arrastreFotoChat.origenX + deltaX,
                y: arrastreFotoChat.origenY + deltaY
            };
            aplicarTransformFotoChat();
        } else {
            vistaPreviaSalidaFotoChat(deltaX, deltaY);
        }
    });

    const soltarPunteroFotoChat = (evento) => {
        if (!punterosFotoChat.has(evento.pointerId)) return;
        punterosFotoChat.delete(evento.pointerId);

        const eraDesliz = Boolean(
            arrastreFotoChat && !arrastreFotoChat.pinch && escalaFotoChat === 1 && arrastreFotoChat.movido
        );
        const deltaX = arrastreFotoChat ? evento.clientX - arrastreFotoChat.inicioX : 0;
        const deltaY = arrastreFotoChat ? evento.clientY - arrastreFotoChat.inicioY : 0;

        if (punterosFotoChat.size === 0) {
            arrastreFotoChat = null;
            // Al tamaño normal, deslizar a un lado y a otro pasa de foto y
            // deslizar arriba o abajo sale del visor, en cualquier foto.
            if (eraDesliz) {
                if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 70) {
                    cerrarFotosChat();
                    return;
                }
                if (Math.abs(deltaX) > 60) cambiarFotoChat(deltaX < 0 ? 1 : -1);
                else aplicarTransformFotoChat();
            } else aplicarTransformFotoChat();
            if (escalaFotoChat < 1) {
                escalaFotoChat = 1;
                aplicarTransformFotoChat();
            }
        } else if (punterosFotoChat.size === 1) {
            // Queda un dedo: el arrastre sigue desde donde está.
            const [restante] = [...punterosFotoChat.values()];
            arrastreFotoChat = {
                pinch: false,
                inicioX: restante.x,
                inicioY: restante.y,
                origenX: desplazFotoChat.x,
                origenY: desplazFotoChat.y,
                movido: true
            };
        }
    };
    pistaFotosChat.addEventListener("pointerup", soltarPunteroFotoChat);
    pistaFotosChat.addEventListener("pointercancel", soltarPunteroFotoChat);
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
    actualizarPuntoNotificaciones();
    comprobarPoderesDesarrollador();
    cargarApodos();

    // Enlace directo de un aviso Push (/?chat=<id>): se abre ese chat y la
    // dirección se limpia para que no se reabra al recargar.
    const chatPendiente = new URLSearchParams(window.location?.search || "").get("chat");
    if (chatPendiente) {
        window.history?.replaceState?.(null, "", window.location?.pathname || "/");
        setTimeout(() => abrirChatPorId(chatPendiente), 800);
    }

    solicitarGrupo("/api/auth/me")
        .then((datos) => {
            localStorage.setItem("atuistas_cache_cuenta", JSON.stringify(datos.usuario));
            actualizarTarjetaMiEstado();
            marcarEstadoDesarrollador(datos.usuario?.es_desarrollador);
        })
        .catch(() => {});

}

// Las preferencias no tienen botón de guardar: se guardan solas cuando se
// cierra la ventanita de notificaciones. La bandera avisa si hubo cambios.
let preferenciasNotificacionesSucias = false;

async function cargarConfiguracionNotificaciones() {
    const estado = document.getElementById("estado-notificaciones");
    try {
        const datos = await solicitarGrupo("/api/notificaciones/configuracion");
        document.querySelectorAll("[data-preferencia]").forEach((entrada) => {
            entrada.checked = datos.configuracion[entrada.dataset.preferencia] === true;
        });
        preferenciasNotificacionesSucias = false;
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
        actualizarBotonActivarDispositivo();
    } catch (error) {
        estado.textContent = error.message || "No se pudieron activar los avisos.";
    }
});

// Las casillas se marcan como sucias al tocarlas y se guardan al cerrar.
document.querySelectorAll("[data-preferencia]").forEach((entrada) => {
    entrada.addEventListener("change", () => {
        preferenciasNotificacionesSucias = true;
    });
});

async function guardarConfiguracionNotificaciones() {
    if (!preferenciasNotificacionesSucias) return;
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
        preferenciasNotificacionesSucias = false;
        estado.textContent = "Preferencias guardadas.";
    } catch (error) {
        estado.textContent = error.message;
    }
}

/* ---------- Ventanita de notificaciones ---------- */

const modalNotificaciones = document.getElementById("modal-notificaciones");

function fechaAviso(iso) {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return "";
    return fecha.toLocaleString(undefined, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function pintarPuntoNotificaciones(cantidad) {
    // Solo queda un sitio donde mirar: la campanita de la cabecera.
    const punto = document.getElementById("punto-notificaciones");
    if (punto) punto.hidden = !(Number(cantidad) > 0);
}

// Solo se ofrece activar el dispositivo mientras el navegador no haya dado ya
// permiso: con el permiso concedido el botón deja de salir.
function actualizarBotonActivarDispositivo() {
    const boton = document.getElementById("boton-activar-notificaciones-dispositivo");
    const estado = document.getElementById("estado-notificaciones-dispositivo");
    if (!boton || !("Notification" in window)) return;
    const concedido = Notification.permission === "granted";
    boton.hidden = concedido;
    if (concedido && estado && !estado.textContent) {
        estado.textContent = "Los avisos ya están activos en este dispositivo.";
    }
}

/* ==============================
   PRESENCIA: QUÉ ESTÁ VIENDO
   Se le dice al servidor qué chat o servidor está abierto para que no
   mande avisos de lo que la persona ya tiene delante. Caduca solo a los
   tres minutos, así que si cierra el navegador no se queda callado.
   ============================== */

let vistaAvisada = null;

function avisarVista(vista) {
    const clave = JSON.stringify(vista);
    if (clave === vistaAvisada) return;
    vistaAvisada = clave;
    solicitarGrupo("/api/presencia", {
        method: "POST",
        body: JSON.stringify(vista)
    }).catch(() => {
        // Sin presencia no pasa nada grave: solo puede llegar un aviso de más.
    });
}

function avisarChatVisto(usuarioId) {
    avisarVista({ chatId: usuarioId || null, servidorId: null });
}

function avisarServidorVisto(grupoId) {
    avisarVista({ chatId: null, servidorId: grupoId || null });
}

function avisarSinVista() {
    avisarVista({ chatId: null, servidorId: null });
}

// Mientras haya un chat o un servidor abierto se refresca la presencia antes de
// que caduque, por si la conversación dura más de tres minutos.
setInterval(() => {
    if (vistaAvisada && vistaAvisada !== JSON.stringify({ chatId: null, servidorId: null })) {
        solicitarGrupo("/api/presencia", {
            method: "POST",
            body: vistaAvisada
        }).catch(() => {});
    }
}, 60 * 1000);

window.addEventListener("pagehide", avisarSinVista);

async function cargarListaNotificaciones() {
    const lista = document.getElementById("lista-notificaciones-app");
    if (!lista) return;
    try {
        const datos = await solicitarGrupo("/api/notificaciones");
        const notificaciones = datos.notificaciones || [];
        const noLeidas = Number(datos.no_leidas) || 0;
        pintarPuntoNotificaciones(noLeidas);
        lista.innerHTML = "";
        if (notificaciones.length === 0) {
            lista.innerHTML = `<p class="sin-contenido">Todavía no hay avisos.</p>`;
            return;
        }
        notificaciones.forEach((aviso) => {
            const elemento = document.createElement("button");
            elemento.type = "button";
            elemento.className = aviso.leida ? "aviso-notificacion" : "aviso-notificacion sin-leer";
            // Los avisos repetidos de la misma persona llegan agrupados: aquí
            // se ve cuántos son en vez de una fila por cada uno.
            const veces = Number(aviso.cantidad) || 1;
            const contador = veces > 1 ? `<em class="contador-aviso">${veces}</em>` : "";
            elemento.innerHTML = `
                <strong>${escapeHtml(aviso.titulo || "")}${contador}</strong>
                <span>${escapeHtml(aviso.contenido || "")}</span>
                <small>${fechaAviso(aviso.creada_en)}</small>
            `;
            elemento.addEventListener("click", () => marcarAvisoLeido(aviso));
            lista.appendChild(elemento);
        });
    } catch (error) {
        lista.innerHTML = `<p class="sin-contenido">${escapeHtml(error.message || "No se pudieron cargar los avisos.")}</p>`;
    }
}

// Al tocar un aviso se marca como leída y, si viene de un mensaje privado,
// se salta directamente a esa conversación.
async function marcarAvisoLeido(aviso) {
    try {
        await solicitarGrupo(`/api/notificaciones/${aviso.id}/leer`, { method: "POST" });
    } catch {
        // Aunque falle el marcado, el enlace sigue siendo útil.
    }
    const usuarioId = aviso.datos?.usuarioId;
    if (aviso.tipo === "mensaje_privado" && usuarioId) {
        cerrarModalNotificaciones();
        await abrirChatPorId(usuarioId);
        return;
    }
    await cargarListaNotificaciones();
}

// Punto rojo del menú y del botón de Cuenta: solo hace falta el recuento.
async function actualizarPuntoNotificaciones() {
    try {
        const datos = await solicitarGrupo("/api/notificaciones");
        pintarPuntoNotificaciones(datos.no_leidas);
    } catch {
        // Sin conexión no hay recuento que actualizar.
    }
}

// Al abrir el panel los avisos se dan por vistos solos: no hay ningún botón
// de "marcar como leídas". Si el marcado falla por un momento, la lista se
// enseña igualmente y el punto rojo se corrige al recargar.
async function abrirModalNotificaciones() {
    if (!modalNotificaciones) return;
    modalNotificaciones.hidden = false;
    cargarConfiguracionNotificaciones();
    actualizarBotonActivarDispositivo();

    try {
        await solicitarGrupo("/api/notificaciones/leer-todas", { method: "POST" });
        pintarPuntoNotificaciones(0);
    } catch {
        // Sin conexión se muestran tal cual; no pasa nada por no marcar.
    }

    await cargarListaNotificaciones();
}

function cerrarModalNotificaciones() {
    if (!modalNotificaciones) return;
    // Se guardan las casillas pendientes justo al cerrar: no hay botón.
    guardarConfiguracionNotificaciones();
    modalNotificaciones.hidden = true;
}

document.getElementById("boton-campana-notificaciones")?.addEventListener("click", abrirModalNotificaciones);
document.getElementById("boton-cerrar-notificaciones")?.addEventListener("click", cerrarModalNotificaciones);
modalNotificaciones?.addEventListener("click", (evento) => {
    if (evento.target === modalNotificaciones) cerrarModalNotificaciones();
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

    nombreChat.textContent = nombreVisible(amigo.id, amigo.nombre);
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

    // Con el chat delante, los mensajes de esta persona no generan aviso.
    avisarChatVisto(amigo.id);

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

        // El teclado NO se abre solo: en el móvil abriría la pantalla del
        // teclado nada más entrar en un chat. Se abre cuando la persona pulsa
        // el campo de escritura.

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

/* ---------- Pintar los mensajes del chat privado ----------

   Antes la lista se borraba entera y se volvía a construir en cada refresco
   (cada dos segundos). Eso hacía parpadear fotos, audios y el mapa de la
   ubicación, y se perdían los estados de los reproductores.

   Ahora se reutiliza el nodo de cada mensaje si lo que muestra no ha
   cambiado: solo se rehace lo que de verdad es distinto. Un chat normal no
   toca ningún nodo, así que el refresco no se ve. */

function firmaMensaje(mensaje) {
    const ubicacion = mensaje.datos?.ubicacion;
    return JSON.stringify([
        mensaje.tipo,
        mensaje.contenido,
        mensaje.editado_en ?? null,
        mensaje.archivo_ruta ?? null,
        mensaje.mensaje_respuesta_contenido ?? null,
        ubicacion
            ? [Number(ubicacion.lat), Number(ubicacion.lon), ubicacion.enVivo === true]
            : null
    ]);
}

function crearNodoMensajeChat(mensaje) {
    const elemento = document.createElement("div");

    elemento.className = mensaje.es_mio
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
            // Reproductor propio (funciona aunque el gesto del mensaje capture
            // el puntero: se controla con clic delegado, no con controles nativos).
            adjunto.insertAdjacentHTML("beforeend", reproductorAudioHTML(fuente));
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

    // La ubicación en vivo es un mensaje de texto con datos dentro: se pinta la
    // tarjeta del mapa en vez del texto pelado.
    if (mensaje.datos?.ubicacion) {
        envoltura.insertAdjacentHTML("beforeend", htmlTarjetaUbicacion(mensaje));
    }

    const contenido = document.createElement("p");
    contenido.textContent = mensaje.contenido || "";
    if (mensaje.editado_en) {
        const marca = document.createElement("small");
        marca.className = "mensaje-chat-editado";
        marca.textContent = " (editado)";
        contenido.appendChild(marca);
    }

    // Un mensaje solo con archivo no necesita un párrafo vacío debajo. La
    // ubicación tampoco: el texto ("📍 ...") solo haría ruido bajo el mapa.
    const conUbicacion = Boolean(mensaje.datos?.ubicacion);
    if ((mensaje.contenido || mensaje.editado_en) && !conUbicacion) {
        envoltura.appendChild(contenido);
    }

    elemento.appendChild(envoltura);
    elemento.dataset.firma = firmaMensaje(mensaje);

    return elemento;
}

function pintarMensajesChat(listaMensajes, mensajes) {
    // Los nodos que ya están en pantalla, indexados por id de mensaje.
    const existentes = new Map();
    for (const nodo of listaMensajes.children) {
        if (nodo.dataset?.mensajeId) existentes.set(nodo.dataset.mensajeId, nodo);
    }

    mensajes.forEach((mensaje) => {
        const previo = existentes.get(mensaje.id);
        existentes.delete(mensaje.id);
        // Ficha para la barra de selección: decide si la papelera se enseña.
        mensajesChatPorId.set(mensaje.id, mensaje);

        // Mismo mensaje y mismo contenido: no se toca el nodo, y con él se
        // quedan intactos la foto, el audio en marcha y el mapa ya descargado.
        if (previo && previo.dataset.firma === firmaMensaje(mensaje)) return;

        const nodo = crearNodoMensajeChat(mensaje);
        configurarGestoMensajeChat(nodo, mensaje);

        if (previo) {
            listaMensajes.replaceChild(nodo, previo);
        } else {
            listaMensajes.appendChild(nodo);
        }
    });

    // Los que quedan sin usar son mensajes que ya no existen (borrados).
    for (const sobra of existentes.values()) {
        sobra.remove();
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

        pintarMensajesChat(listaMensajes, datos.mensajes);

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

    // Al salir, los mensajes de este chat vuelven a avisar.
    avisarSinVista();

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
    mensajesChatPorId.clear();
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
    // Reenviar vale para cualquiera visible; borrar se filtra en la barra.
    if (mensajesSeleccionadosChat.has(mensaje.id)) {
        mensajesSeleccionadosChat.delete(mensaje.id);
        elemento?.classList.remove("mensaje-chat-seleccionado");
    } else {
        mensajesChatPorId.set(mensaje.id, mensaje);
        mensajesSeleccionadosChat.add(mensaje.id);
        elemento?.classList.add("mensaje-chat-seleccionado");
    }
    actualizarBarraSeleccionChat();
}

function puedeBorrarSeleccionChat() {
    if (mensajesSeleccionadosChat.size === 0) return false;
    for (const id of mensajesSeleccionadosChat) {
        const mensaje = mensajesChatPorId.get(id);
        // Sin ficha (nodo viejo): solo se deja reenviar, no borrar.
        if (!mensaje || !mensaje.es_mio || (mensaje.tipo || "texto") !== "texto") return false;
    }
    return true;
}

function actualizarBarraSeleccionChat() {
    const barra = document.getElementById("barra-seleccion-chat");
    const contador = document.getElementById("contador-seleccion-chat");
    const botonReenviar = document.getElementById("boton-reenviar-seleccion-chat");
    const botonBorrar = document.getElementById("boton-borrar-seleccion-chat");
    if (!barra || !contador) return;
    const total = mensajesSeleccionadosChat.size;
    barra.hidden = total === 0;
    contador.textContent = total === 1 ? "1 seleccionado" : `${total} seleccionados`;
    // Reenviar: cualquiera marcado. Borrar: solo míos de texto.
    if (botonReenviar) botonReenviar.hidden = total === 0;
    if (botonBorrar) botonBorrar.hidden = !puedeBorrarSeleccionChat();
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
        // El reproductor de audio tiene sus propios controles (play y salto):
        // el gesto del mensaje no debe capturar ese toque ni marcar nada.
        if (evento.target.closest?.(".reproductor-audio")) return;
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
            if (!movido && punteroActivo === idPuntero) {
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
            if (mensajesSeleccionadosChat.size > 0) {
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
        mensajesChatPorId.clear();
        actualizarBarraSeleccionChat();
        await cargarMensajesChat();
    } catch (error) {
        alert(error.message);
    }
}

document.getElementById("boton-borrar-seleccion-chat")?.addEventListener("click", eliminarSeleccionChat);

document.getElementById("boton-cancelar-seleccion-chat")?.addEventListener("click", () => {
    mensajesSeleccionadosChat = new Set();
    mensajesChatPorId.clear();
    document.querySelectorAll(".mensaje-chat-seleccionado").forEach((nodo) => {
        nodo.classList.remove("mensaje-chat-seleccionado");
    });
    actualizarBarraSeleccionChat();
});

/* ==============================
   REENVIAR MENSAJES A UN AMIGO
   Vale desde el chat privado y desde el servidor. El destino es
   siempre un chat privado: se elige al amigo en el modal.
   ============================== */

// Origen pendiente: { tipo: "privado" } o { tipo: "servidor", grupoId }.
let reenvioPendiente = null;

function limpiarReenvioPendiente() {
    reenvioPendiente = null;
    const estado = document.getElementById("estado-reenviar-mensaje");
    if (estado) estado.textContent = "";
}

function cerrarModalReenviar() {
    const modal = document.getElementById("modal-reenviar-mensaje");
    if (modal) modal.hidden = true;
    limpiarReenvioPendiente();
}

function limpiarSeleccionReenvio() {
    mensajesSeleccionadosChat = new Set();
    mensajesChatPorId.clear();
    mensajesSeleccionadosServidor = new Set();
    mensajesServidorPorId.clear();
    document.querySelectorAll(".mensaje-chat-seleccionado").forEach((nodo) => {
        nodo.classList.remove("mensaje-chat-seleccionado");
    });
    actualizarBarraSeleccionChat();
    actualizarBarraSeleccionServidor();
}

async function abrirModalReenviar(origen) {
    const total = origen.tipo === "servidor"
        ? mensajesSeleccionadosServidor.size
        : mensajesSeleccionadosChat.size;
    if (total === 0) return;
    reenvioPendiente = {
        tipo: origen.tipo,
        grupoId: origen.grupoId ?? null,
        total
    };
    const modal = document.getElementById("modal-reenviar-mensaje");
    const lista = document.getElementById("lista-reenviar-mensaje");
    const estado = document.getElementById("estado-reenviar-mensaje");
    if (!modal || !lista) return;
    if (estado) estado.textContent = "";
    const titulo = document.getElementById("titulo-reenviar-mensaje");
    if (titulo) {
        titulo.textContent = total === 1
            ? "Reenviar 1 mensaje a..."
            : `Reenviar ${total} mensajes a...`;
    }
    lista.innerHTML = '<p class="estado-amigos">Cargando amigos...</p>';
    modal.hidden = false;
    try {
        const datos = await solicitarGrupo("/api/amigos");
        const amigos = datos.amigos || [];
        if (!amigos.length) {
            lista.innerHTML = '<p class="estado-amigos">Todavía no tienes amigos.</p>';
            return;
        }
        lista.innerHTML = "";
        for (const amigo of amigos) {
            const fila = document.createElement("button");
            fila.type = "button";
            fila.className = "persona-resultado";
            fila.innerHTML = `
                <span class="persona-resultado-info">
                    <span class="persona-resultado-avatar">${
                        amigo.avatar_url
                            ? `<img src="/${escapeHtml(amigo.avatar_url)}" alt="">`
                            : ""
                    }</span>
                    <span class="persona-resultado-datos">
                        <strong style="${estiloNombre(amigo.color_nombre)}">${escapeHtml(nombreVisible(amigo.id, amigo.nombre))}</strong>
                    </span>
                </span>`;
            fila.addEventListener("click", () => reenviarA(amigo));
            lista.appendChild(fila);
        }
    } catch (error) {
        lista.innerHTML = "";
        if (estado) estado.textContent = error.message || "No se pudieron cargar los amigos";
    }
}

async function reenviarA(amigo) {
    const estado = document.getElementById("estado-reenviar-mensaje");
    if (!reenvioPendiente || !amigo?.id) return;
    const ids = reenvioPendiente.tipo === "servidor"
        ? [...mensajesSeleccionadosServidor]
        : [...mensajesSeleccionadosChat];
    if (!ids.length) {
        cerrarModalReenviar();
        return;
    }
    if (estado) estado.textContent = "Reenviando...";
    try {
        const cuerpo = {
            mensajeIds: ids,
            destinatarioId: amigo.id,
            origen: reenvioPendiente.tipo === "servidor"
                ? { tipo: "servidor", grupoId: reenvioPendiente.grupoId }
                : { tipo: "privado" }
        };
        const datos = await solicitarGrupo("/api/mensajes/reenviar", {
            method: "POST",
            body: JSON.stringify(cuerpo)
        });
        const eraServidor = reenvioPendiente.tipo === "servidor";
        cerrarModalReenviar();
        limpiarSeleccionReenvio();
        // Si el destino es el chat abierto, se recarga para verlo llegar.
        if (!eraServidor && amigoChatActual && amigoChatActual.id === amigo.id) {
            await cargarMensajesChat();
        }
        alert(datos?.mensaje || "Mensaje reenviado");
    } catch (error) {
        if (estado) estado.textContent = error.message || "No se pudo reenviar";
    }
}

document.getElementById("boton-reenviar-seleccion-chat")?.addEventListener("click", () => {
    abrirModalReenviar({ tipo: "privado" });
});

document.getElementById("boton-reenviar-seleccion-servidor")?.addEventListener("click", () => {
    if (!grupoActual) return;
    abrirModalReenviar({ tipo: "servidor", grupoId: grupoActual.id });
});

document.getElementById("boton-cerrar-reenviar-mensaje")?.addEventListener("click", cerrarModalReenviar);

document.getElementById("modal-reenviar-mensaje")?.addEventListener("click", (evento) => {
    if (evento.target === document.getElementById("modal-reenviar-mensaje")) cerrarModalReenviar();
});

document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape") return;
    const modal = document.getElementById("modal-reenviar-mensaje");
    if (modal && !modal.hidden) cerrarModalReenviar();
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

        // Chats con mensaje primero, del más reciente al más antiguo; los que
        // nunca se han escrito van al final. Como el backend ya los manda por
        // nombre y sort es estable, los que no tienen fecha conservan ese orden
        // alfabético entre sí.
        datos.amigos.sort((a, b) => {
            const fechaA = a.ultimo_mensaje_en ? new Date(a.ultimo_mensaje_en).getTime() : 0;
            const fechaB = b.ultimo_mensaje_en ? new Date(b.ultimo_mensaje_en).getTime() : 0;
            if (fechaA && fechaB) return fechaB - fechaA;
            if (fechaA) return -1;
            if (fechaB) return 1;
            return 0;
        });

        datos.amigos.forEach((amigo) => {

            const elemento =
                document.createElement("div");

            elemento.className =
                "chat-amigo";

            const sinLeer = Number(amigo.mensajes_sin_leer) || 0;

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
                        ${escapeHtml(nombreVisible(amigo.id, amigo.nombre))}
                    </strong>

                </div>

                ${
                    sinLeer > 0
                        ? `<span class="chat-amigo-punto" aria-label="Mensajes sin leer"></span>`
                        : ""
                }
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

/* =============================
   ABRIR CHAT POR ID
   Sirve para los enlaces de los avisos Push (/?chat=<id>) y para cuando se
   pulsa un aviso de mensaje privado con la app ya abierta.
   ============================== */

async function abrirChatPorId(usuarioId) {
    const token = localStorage.getItem("atuistas_token");

    if (!token || !usuarioId) {
        return;
    }

    try {
        const respuesta = await fetch(
            "/api/amigos",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );
        const datos = await respuesta.json();
        const amigo = (datos.amigos || []).find((persona) => persona.id === usuarioId);

        if (!amigo) {
            return;
        }

        mostrarSeccion("entrar");
        await abrirChat(amigo);
    } catch (error) {
        console.error("No se pudo abrir el chat:", error);
    }
}


/* ==============================
   CAMBIAR SECCIÓN
   ============================== */

let seccionActual = "entrar";

function mostrarSeccion(seccion, opciones = {}) {
    trazaHistorial("seccion", seccion);
    const panelChat = document.getElementById("panel-chat");

    if (panelChat) {
        panelChat.hidden = true;
    }

    amigoChatActual = null;

    // Fuera del chat los mensajes vuelven a generar aviso.
    avisarSinVista();

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

    // Los botones de la barra son iconos: se marca con "activa" el de la
    // sección abierta para saber siempre dónde estás.
    [
        [botonEntrarApp, "entrar"],
        [botonAmigos, "amigos"],
        [botonServidores, "servidores"],
        [botonCuenta, "cuenta"]
    ].forEach(([boton, nombre]) => {
        if (boton) boton.classList.toggle("activa", nombre === seccion);
    });


    if (seccion === "entrar") {
        panelInicioEntrar.hidden = false;
        contenidoEntrar.hidden = false;
        contenidoPublico.hidden = true;
        cambiarFeedEntrada(false);

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
        mostrarPestanaServidor("chats");
        cargarAmigos();
    }

    seccionActual = seccion;

    // El botón del QR solo tiene sentido en Cuenta, y en el móvil.
    const botonCodigo = document.getElementById("boton-qr-cuenta");
    if (botonCodigo) botonCodigo.hidden = seccion !== "cuenta";

    // El historial se sincroniza con la sección, salvo que el cambio venga
    // del propio botón atrás (entonces ya se ha descontado).
    if (!opciones.desdeAtras) {
        sincronizarAtrasSeccion(seccion);
    }
}

/* ==============================================================
   BOTÓN ATRÁS DEL MÓVIL
   Cada cosa que se abre encima (una ventana, un reel, un chat, un
   servidor) apila una entrada del historial. Así el botón del móvil
   va cerrando de arriba abajo y, desde Entrar sin nada abierto, sale
   de la aplicación porque no queda nada apilado.
   ============================================================== */

let capasApiladas = 0;
let gestionandoAtras = false;
let backEnCurso = false;
let backsPendientes = 0;

// Diagnóstico temporal del botón atrás: cada paso manda un beacon cuya URL
// queda registrada en el log del servidor (POST /__hist?...). Sirve para ver
// desde el móvil qué historial real está manejando la app mientras se cierra
// el fallo de la fuga a Google. Se quita cuando quede cerrado.
function trazaHistorial(accion, detalle) {
    try {
        const q = new URLSearchParams({
            a: accion,
            s: JSON.stringify(window.history?.state ?? null) ?? "null",
            c: String(capasApiladas),
            p: String(backsPendientes),
            u: location.href
        });
        if (detalle) q.set("d", detalle);
        navigator.sendBeacon?.(`/__hist?${q.toString()}`, "");
    } catch {
        // El diagnóstico nunca puede romper la app.
    }
}

function apilarCapa() {
    try {
        window.history?.pushState?.({ capa: "capa" }, "");
        capasApiladas += 1;
        trazaHistorial("push", "capa");
    } catch {
        // Sin historial (incrustado, PWA rara): no se apila nada.
    }
}

// Gasta una entrada del historial con UN solo history.back(). Reglas:
//  1. Solo si la entrada actual la apiló la app (state.capa). Si no, o si el
//     contador está en 0, NO se toca el historial: un back() sobre la entrada
//     inicial sacaría al usuario de Atuistas (a Google, a la pestaña anterior).
//  2. Nunca hay dos back() en vuelo a la vez: si se lanzan juntos en el mismo
//     lote, el segundo atraviesa la comprobación de estado sin pasar por aquí
//     y sale de la app. Los que queden pendientes se gastan desde popstate,
//     de uno en uno y siempre revalidando el estado.
function gastarEntradaPropia() {
    if (backEnCurso || gestionandoAtras || capasApiladas <= 0) {
        trazaHistorial("back-saltado", backEnCurso ? "en-vuelo" : (gestionandoAtras ? "gestionando" : "sin-contador"));
        return;
    }
    const estado = window.history?.state;
    const esNuestra = estado &&
        (estado.capa === true || estado.capa === "capa" || estado.capa === "seccion");
    if (!esNuestra) {
        // Entrada ajena (la inicial o la de otro sitio): se resincroniza el
        // contador sin navegar para no expulsar al usuario.
        trazaHistorial("back-rechazado", "estado-ajeno");
        capasApiladas = 0;
        backsPendientes = 0;
        return;
    }
    // Segunda barrera: aunque el state sea nuestro, si el navegador dice que
    // no hay entrada debajo (historial podado al recuperar la pestaña), un
    // back() cerraria la pestana y dejaria en Google. navigation.canGoBack
    // existe desde Chrome 102; en navegadores viejos se omite este control.
    if (typeof navigation !== "undefined" && navigation && navigation.canGoBack === false) {
        trazaHistorial("back-rechazado", "sin-atras-posible");
        capasApiladas = 0;
        backsPendientes = 0;
        return;
    }
    trazaHistorial("back", "en-vuelo");
    backEnCurso = true;
    try {
        window.history?.back?.();
    } catch {
        backEnCurso = false;
    }
}

// Al cerrar con el botón o la × de la propia capa, la entrada del historial
// se gasta sola para que el botón atrás no la encuentre por detrás. El
// contador se descuenta en popstate (único punto de descuento).
function desapilarCapa() {
    if (gestionandoAtras || capasApiladas <= 0) return;
    backsPendientes = Math.min(backsPendientes + 1, capasApiladas);
    gastarEntradaPropia();
}

// El historial y las secciones se cuadran solos: si no estamos en Entrar hay
// una entrada; al volver a Entrar se gasta. Igual que desapilarCapa: nunca se
// vuelve atrás sobre una entrada ajena ni con dos back() en vuelo (eso sacaría
// al usuario de Atuistas).
function sincronizarAtrasSeccion(seccion) {
    const hayEntradaDeSeccion = window.history?.state?.capa === "seccion";
    if (seccion !== "entrar" && !hayEntradaDeSeccion) {
        try {
            window.history?.pushState?.({ capa: "seccion" }, "");
            capasApiladas += 1;
            trazaHistorial("push", "seccion");
        } catch {
            // Sin historial: no se apila nada.
        }
        return;
    }
    if (seccion === "entrar" && hayEntradaDeSeccion && capasApiladas > 0) {
        backsPendientes = Math.min(backsPendientes + 1, capasApiladas);
        gastarEntradaPropia();
    }
}

// Cierra lo que haya abierto encima: primero las pantallas completas y
// después la última ventana abierta, usando su propio botón de cerrar.
function cerrarCapaSuperior() {
    // El selector va el primero: es lo que está encima de todo (z-index 3500).
    const selector = document.getElementById("selector-medio");
    if (selector && selector.hidden === false) {
        cerrarSelector();
        return true;
    }

    const visorReels = document.getElementById("visor-reels");
    if (visorReels && visorReels.hidden === false) {
        cerrarVisorReels();
        return true;
    }
    if (document.getElementById("visor-historias-pantalla")?.hidden === false) {
        cerrarVisorHistorias();
        return true;
    }
    if (document.getElementById("panel-chat")?.hidden === false) {
        cerrarChat();
        return true;
    }
    if (document.getElementById("panel-servidor")?.hidden === false && vistaServidorActual !== "lista") {
        mostrarFaseServidor("lista");
        return true;
    }

    const ventanas = [...document.querySelectorAll(".modal")].filter((ventana) => !ventana.hidden);
    if (ventanas.length) {
        const ventana = ventanas[ventanas.length - 1];
        const boton = ventana.querySelector("[id^='boton-cerrar'], .boton-cerrar-modal");
        if (boton) boton.click();
        else ventana.hidden = true;
        return true;
    }

    if (document.getElementById("visor-estados")?.hidden === false) {
        mostrarMisEstados();
        return true;
    }

    return false;
}

window.addEventListener("popstate", () => {
    // Travesía lanzada por la propia app (gastarEntradaPropia): la interfaz ya
    // se actualizó sola al cerrar la capa. Solo se descuenta y, si quedaban
    // entradas por gastar en el mismo lote, se encadena la siguiente de una
    // en una: nunca dos back() en vuelo a la vez.
    if (backEnCurso) {
        backEnCurso = false;
        capasApiladas = Math.max(0, capasApiladas - 1);
        backsPendientes = Math.max(0, backsPendientes - 1);
        trazaHistorial("pop", "propio");
        if (backsPendientes > 0) {
            setTimeout(gastarEntradaPropia, 0);
        }
        return;
    }

    // Botón atrás del sistema: la entrada gastada se descuenta aquí (único
    // punto de descuento junto con el de arriba).
    capasApiladas = Math.max(0, capasApiladas - 1);
    trazaHistorial("pop", "usuario");

    gestionandoAtras = true;
    try {
        // Si hay algo abierto encima se cierra; si no, se vuelve a Entrar.
        if (!cerrarCapaSuperior() && seccionActual !== "entrar") {
            mostrarSeccion("entrar", { desdeAtras: true });
        }
    } finally {
        gestionandoAtras = false;
    }
});

// Las capas que se abren y se cierran solas (cualquier ventana) apilan y
// desapilan solas: así no hay que tocar una por una. Solo se mira el atributo
// `hidden`, que es lo único que cambia al abrirlas; con attributeFilter el
// navegador no llega a encolar el resto de mutaciones, así que una lista de
// mensajes que se repinta cada dos segundos no cuesta nada.
// Ojo con subtree: sin esto solo se vigila <body> y el observador no dispara.
function observarCapas() {
    if (typeof MutationObserver !== "function") return;
    const selectores = ".modal, #selector-medio, #visor-reels, #visor-historias-pantalla, #panel-chat, #panel-servidor";
    const observador = new MutationObserver((cambios) => {
        for (const cambio of cambios) {
            if (cambio.type !== "attributes") continue;
            const elemento = cambio.target;
            if (!elemento.matches?.(selectores)) continue;
            if (elemento.hidden) {
                desapilarCapa();
            } else {
                apilarCapa();
            }
        }
    });
    observador.observe(document.body, {
        attributes: true,
        attributeFilter: ["hidden"],
        subtree: true
    });
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
        // Pantalla de lista: sin titulo, la cabecera se queda limpia.
        titulo.textContent = "";
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

    // La barra de contexto (nombre, canales) solo aparece con un servidor
    // abierto. En la lista se esconde para que las pestañas no bajen.
    const barraContexto = document.getElementById("barra-contexto-servidor");
    if (barraContexto) barraContexto.hidden = fase === "lista";

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
        // Al salir del servidor, sus mensajes vuelven a avisar.
        avisarSinVista();
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
    // "chats" va el primero y es la pestana de entrada: los chats
    // viven aqui, no en Entrar.
    const secciones = {
        chats: document.getElementById("seccion-chats"),
        propios: document.getElementById("seccion-mis-servidores"),
        buscar: document.getElementById("seccion-buscar-servidores")
    };
    const botones = {
        chats: document.getElementById("boton-chats"),
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

    // Con el servidor delante, sus mensajes no generan aviso.
    avisarServidorVisto(grupo.id);
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
const autorId = mensaje.autor_id;
    const estiloAutor = mensaje.autor_nombre ? estiloNombre(mensaje.color_nombre) : "color:#999;";
    const gestor = Boolean(detalleGrupo) && (detalleGrupo.mi_rol === "creador" || detalleGrupo.mi_rol === "moderador");

    let adjunto = "";
    if (mensaje.archivo_ruta) {
        const fuente = escapeHtml(mensaje.archivo_ruta);
        if (mensaje.tipo === "imagen") {
            adjunto = `<div class="adjunto-mensaje"><img src="${fuente}" alt="${escapeHtml(mensaje.contenido || "imagen")}" loading="lazy"></div>`;
        } else if (mensaje.tipo === "audio") {
            adjunto = `<div class="adjunto-mensaje">${reproductorAudioHTML(fuente)}</div>`;
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
               <strong style="${estiloAutor}">${escapeHtml(nombreVisible(autorId, nombreAutor))}</strong>
           </div>`
        : "";

    const cuerpo = mensaje.contenido && !mensaje.datos?.ubicacion
        ? `<p>${escapeHtml(mensaje.contenido)}</p>`
        : "";

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
                ${htmlTarjetaUbicacion(mensaje)}
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
            if (!mensaje) continue;
            // Ficha para la barra de selección (papelera sí / papelera no).
            mensajesServidorPorId.set(mensaje.id, mensaje);
            configurarGestoMensajeServidor(elemento, mensaje);
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

document.getElementById("boton-chats").addEventListener("click", () => { mostrarPestanaServidor("chats"); cargarAmigos(); });
document.getElementById("boton-mis-servidores").addEventListener("click", () => { mostrarPestanaServidor("propios"); cargarServidores(); });
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
        enviar: enviarMensajeServidor,
        compartirUbicacion: (minutos) => compartirUbicacionServidor(minutos)
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
        // Igual que en el privado: el reproductor se controla solo.
        if (evento.target.closest?.(".reproductor-audio")) return;
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
            // Pulsación larga: marca el mensaje para reenviarlo o borrarlo.
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

// Selección de mensajes de servidor: la pulsación larga marca mensajes para
// reenviarlos (cualquiera visible) o borrarlos (míos o de gestor).
// Un toque con la selección activa la activa o desactiva.
function puedeEliminarMensajeServidor(mensaje) {
    const gestor = Boolean(detalleGrupo) && (detalleGrupo.mi_rol === "creador" || detalleGrupo.mi_rol === "moderador");
    return Boolean(mensaje.es_mio) || gestor;
}

// Oculto ajeno: su contenido está enmascarado y no se puede reenviar.
function puedeReenviarMensajeServidor(mensaje) {
    if (!mensaje) return false;
    if (mensaje.oculto && !mensaje.es_mio) return false;
    if (mensaje.oculto && !mensaje.autor_nombre && !mensaje.contenido && !mensaje.archivo_ruta) return false;
    return true;
}

function alternarSeleccionMensajeServidor(mensaje, elemento) {
    if (!puedeReenviarMensajeServidor(mensaje)) return false;
    if (mensajesSeleccionadosServidor.has(mensaje.id)) {
        mensajesSeleccionadosServidor.delete(mensaje.id);
        elemento?.classList.remove("mensaje-chat-seleccionado");
    } else {
        mensajesServidorPorId.set(mensaje.id, mensaje);
        mensajesSeleccionadosServidor.add(mensaje.id);
        elemento?.classList.add("mensaje-chat-seleccionado");
    }
    actualizarBarraSeleccionServidor();
    return true;
}

function puedeBorrarSeleccionServidor() {
    if (mensajesSeleccionadosServidor.size === 0) return false;
    for (const id of mensajesSeleccionadosServidor) {
        const mensaje = mensajesServidorPorId.get(id);
        if (!mensaje || !puedeEliminarMensajeServidor(mensaje)) return false;
    }
    return true;
}

function actualizarBarraSeleccionServidor() {
    const barra = document.getElementById("barra-seleccion-servidor");
    const contador = document.getElementById("contador-seleccion-servidor");
    const botonReenviar = document.getElementById("boton-reenviar-seleccion-servidor");
    const botonBorrar = document.getElementById("boton-borrar-seleccion-servidor");
    if (!barra || !contador) return;
    const total = mensajesSeleccionadosServidor.size;
    barra.hidden = total === 0;
    contador.textContent = total === 1 ? "1 seleccionado" : `${total} seleccionados`;
    // Reenviar: cualquiera marcado. Borrar: solo borrables.
    if (botonReenviar) botonReenviar.hidden = total === 0;
    if (botonBorrar) botonBorrar.hidden = !puedeBorrarSeleccionServidor();
}

function limpiarSeleccionServidor() {
    mensajesSeleccionadosServidor = new Set();
    mensajesServidorPorId.clear();
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
                        <strong style="${estiloNombre(miembro.color_nombre)}">${escapeHtml(nombreVisible(miembro.usuario_id, miembro.nombre))}${miembro.es_mio ? " (tú)" : ""}</strong>
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
                .map((miembro) => `<option value="${escapeHtml(miembro.usuario_id)}">${escapeHtml(nombreVisible(miembro.usuario_id, miembro.nombre))}</option>`)
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
        case "ubicacion_actualizada": {
            // La tarjeta se repinta entera: el mapa cambia de posición y el
            // estado puede haber pasado de "en vivo" a "terminada".
            if (canalActual && evento.canalId !== canalActual.id) return;
            const mensaje = mensajesServidor.querySelector(`[data-mensaje-id="${CSS.escape(evento.mensaje.id)}"]`);
            if (!mensaje) {
                agregarMensajeServidor(evento.mensaje);
                return;
            }
            const contenido = mensaje.querySelector(".mensaje-chat-contenido");
            const nueva = htmlTarjetaUbicacion(evento.mensaje);
            if (contenido && nueva) {
                contenido.querySelector(".tarjeta-ubicacion")?.remove();
                contenido.insertAdjacentHTML("afterbegin", nueva);
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

    const textoLimpio = (texto || "").trim();

    // Sin texto se enseña la lista entera de personas; con texto se filtra.
    estadoBusquedaAmigos.textContent =
        textoLimpio ? "Buscando..." : "Cargando personas...";

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
                textoLimpio
                    ? "No se han encontrado personas."
                    : "Todavía no hay más cuentas en la web.";

            return;
        }

        // Arriba va el número de cuentas en la web. Cuando no hay filtro el
        // backend devuelve las activas; con filtro hace falta aparte porque
        // el total del filtro solo cuenta lo que coincide.
        let totalCuentas = Number(datos.total ?? 0) || datos.usuarios.length;
        if (textoLimpio) {
            try {
                const conteo = await fetch(
                    "/api/amigos/buscar?texto=",
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
                const cuentas = await conteo.json().catch(() => ({}));
                totalCuentas = Number(cuentas.total ?? 0) || totalCuentas;
            } catch {
                // Sin el total exacto se enseña el de esta búsqueda.
            }
        }
        estadoBusquedaAmigos.textContent =
            `${totalCuentas} ${totalCuentas === 1 ? "cuenta" : "cuentas"} en la web`;

        datos.usuarios.forEach((usuario) => {
            const elemento =
                document.createElement("div");

            elemento.className = "persona-resultado";
            elemento.setAttribute("role", "button");
            elemento.setAttribute("tabindex", "0");
            elemento.dataset.abrirPerfil = usuario.id;

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

            // Pulsar la tarjeta abre el perfil (así el Creador puede meterse a
            // ver cualquier cuenta); el botón AGREGAR no abre nada.
            elemento.addEventListener("click", (evento) => {
                if (evento.target.closest(".boton-enviar-solicitud")) return;
                abrirPerfil(usuario.id);
            });

            elemento.addEventListener("keydown", (evento) => {
                if (evento.key !== "Enter" && evento.key !== " ") return;
                if (evento.target.closest(".boton-enviar-solicitud")) return;
                evento.preventDefault();
                abrirPerfil(usuario.id);
            });

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
                            ${escapeHtml(nombreVisible(solicitud.id, solicitud.nombre))}
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
        // Al abrir Amigos ya se enseña la lista entera con el total arriba.
        buscarPersonas(buscadorPersonas.value);

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

    // Si la lista está vacía se rellena ahora, con el total arriba.
    if (!listaResultadosAmigos.children.length) {
        buscarPersonas(buscadorPersonas.value);
    }
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
         * EDITOR ANTES DE SUBIR
         * La foto pasa por el editor universal (recortar, pintar, texto) y
         * solo lo que se confirma aquí se sube al servidor. El input se
         * limpia ya, para que cancelar no impida volver a elegir la misma
         * imagen.
         */

        inputFotoPerfil.value = "";

        abrirEditorFoto(archivo, subirAvatarEditada);

    }
);


/* ==============================
   SUBIDA DE LA FOTO DE PERFIL
   Recibe la imagen ya editada, la previsualiza en la cuenta y la sube.
   ============================== */

async function subirAvatarEditada(archivo) {
    const url = URL.createObjectURL(archivo);

    fotoPerfilCuenta.src = url;
    fotoPerfilGrande.src = url;

    const token = localStorage.getItem("atuistas_token");

    if (!token) {
        alert("Tu sesión ha expirado.");
        return;
    }

    const formulario = new FormData();
    formulario.append("avatar", archivo);

    try {
        botonCambiarFoto.disabled = true;

        const respuesta = await fetch("/api/auth/avatar", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formulario
        });
        const datos = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(datos.error || "No se pudo subir la imagen");
        }

        alert("Foto de perfil actualizada correctamente.");
    } catch (error) {
        console.error("Error subiendo avatar:", error);
        alert(error.message || "Error al subir la foto de perfil");
    } finally {
        botonCambiarFoto.disabled = false;
    }
}


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
            usuario.es_desarrollador
                ? "Desarrollador: en cualquier perfil puedes pulsar el nombre, la etiqueta o la descripción para cambiarla, y mantener pulsado el contenido para borrarlo."
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
   FONDO DEL PERFIL
   ============================== */

renderizarFondoPerfil(usuario);


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
    if (colorNombreCuenta) {
        // El botón del color se rodea de un borde claro cuando el color elegido
        // es oscuro, para que no se pierda sobre el fondo de la aplicación.
        colorNombreCuenta.style.borderColor = colorDeAnillo(color);
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


        // Lo escrito se queda tal cual: si se borrase, escribir acentos,
        // simbolos o emoji pareceria que estan prohibidos. El motivo del
        // rechazo se muestra arriba y el siguiente cambio vuelve a intentarlo.
        pintarNombreCuenta(nombreCuentaEditar.value.trim(), colorNombreCuenta.value);


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
        cargarPublicaciones("publica", document.getElementById("lista-publicaciones-publicas")),
        cargarPistaReels("amigos", document.getElementById("pista-reels-amigos")),
        cargarPistaReels("publica", document.getElementById("pista-reels-publicos"))
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
                <button class="tarjeta-estado tarjeta-historia" type="button" data-ver-historias="${escapeHtml(clave)}" aria-label="Ver los ${historias} estados de ${escapeHtml(nombreVisible(persona.autor_id, persona.autor_nombre))}">
                    ${portada}
                    ${persona.avatar_url ? `<img class="avatar-historia con-anillo-nombre" style="--anillo-avatar:${colorDeAnillo(persona.color_nombre)}" src="/${escapeHtml(persona.avatar_url)}" alt="">` : '<span class="avatar-historia avatar-historia-vacio"></span>'}
                    <span class="nombre-historia" style="${estiloNombre(persona.color_nombre)}">${escapeHtml(nombreVisible(persona.autor_id, persona.autor_nombre))}</span>
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
                <button class="boton-perfil-publicacion" type="button" data-abrir-perfil="${escapeHtml(publicacion.autor_id)}" aria-label="Ver el perfil de ${escapeHtml(nombreVisible(publicacion.autor_id, publicacion.autor_nombre))}">
                    ${publicacion.avatar_url ? `<img class="con-anillo-nombre" style="--anillo-avatar:${colorDeAnillo(publicacion.color_nombre)}" src="/${escapeHtml(publicacion.avatar_url)}" alt="">` : '<span class="avatar-publicacion-vacio"></span>'}
                    <span class="datos-publicacion-actual">
                        <strong style="${estiloNombre(publicacion.color_nombre)}">${escapeHtml(nombreVisible(publicacion.autor_id, publicacion.autor_nombre))}</strong>
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
    if (medio.tipo === "audio") return reproductorAudioHTML(ruta);
    return "";
}

function renderizarMedios(multimedia = []) {
    return (multimedia || []).map((medio) => renderizarMedio(medio)).join("");
}

/* ---------- Reproductor de audio propio (estados, publicaciones, historias)
   Sustituye al <audio controls> nativo con un reproductor que lleva ondas
   animadas al reproducir y una barra de progreso con brillo, usando el color
   de acento y el fondo oscuro de la web. Se controla con delegación de
   eventos en el documento para funcionar también con el contenido que se
   repinta (el <audio> real queda oculto dentro y es el que suena). */
function reproductorAudioHTML(ruta) {
    // 30 barras con altura fija variada (forma de onda): al sonar se van
    // encendiendo en color de acento según el avance. La tira entera ES el
    // audio y se rellena al terminar. El tiempo muestra la duración total.
    const alturas = [38, 62, 45, 80, 55, 92, 48, 70, 35, 66, 84, 50, 74, 42, 95, 58, 68, 40, 78, 52, 88, 46, 64, 36, 72, 56, 82, 44, 60, 76];
    const ondas = alturas.map((h) => `<span style="height:${h}%"></span>`).join("");
    return `
        <div class="reproductor-audio contenido-multimedia-social">
            <audio src="${ruta}" preload="metadata"></audio>
            <button type="button" class="reproductor-audio-boton" aria-label="Reproducir audio">
                <svg class="reproductor-audio-icono reproducir" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>
                <svg class="reproductor-audio-icono pausa" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
            </button>
            <div class="reproductor-audio-ondas" aria-hidden="true">${ondas}</div>
            <div class="reproductor-audio-pista" data-reproductor-pista><i class="reproductor-audio-relleno"></i></div>
            <span class="reproductor-audio-tiempo">0:00</span>
        </div>`;
}

function formatearTiempoReproductor(segundos) {
    if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
    const min = Math.floor(segundos / 60);
    const seg = Math.floor(segundos % 60);
    return `${min}:${String(seg).padStart(2, "0")}`;
}

function pintarProgresoReproductor(audio) {
    const contenedor = audio.closest(".reproductor-audio");
    if (!contenedor) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const avance = dur ? Math.min(audio.currentTime / dur, 1) : 0;
    const relleno = contenedor.querySelector(".reproductor-audio-relleno");
    if (relleno) relleno.style.width = `${avance * 100}%`;
    // Las ondas se encienden con el avance: lo ya sonado en acento, lo que
    // falta apagado. Al acabar queda la tira entera encendida.
    const barras = contenedor.querySelectorAll(".reproductor-audio-ondas span");
    const encendidas = Math.round(avance * barras.length);
    barras.forEach((barra, indice) => barra.classList.toggle("encendida", indice < encendidas));
    // El tiempo enseña la duración total (no 00:00): mientras suena muestra
    // lo que queda por escuchar.
    const tiempo = contenedor.querySelector(".reproductor-audio-tiempo");
    if (tiempo) {
        const mostrar = dur && (audio.currentTime > 0 || !audio.paused) ? Math.max(0, dur - audio.currentTime) : dur;
        tiempo.textContent = formatearTiempoReproductor(mostrar);
    }
}

function alternarReproductorAudio(boton) {
    const contenedor = boton.closest(".reproductor-audio");
    const audio = contenedor?.querySelector("audio");
    if (!audio) return;
    if (audio.paused || audio.ended) {
        // Que solo suene uno a la vez.
        document.querySelectorAll(".reproductor-audio audio").forEach((otro) => { if (otro !== audio) otro.pause(); });
        audio.play().catch(() => {});
    } else {
        audio.pause();
    }
}

document.addEventListener("click", (evento) => {
    const boton = evento.target.closest?.(".reproductor-audio-boton");
    if (boton) {
        evento.preventDefault();
        evento.stopPropagation();
        alternarReproductorAudio(boton);
        return;
    }
    // El salto funciona tocando la barra baja o las propias ondas.
    const pista = evento.target.closest?.("[data-reproductor-pista], .reproductor-audio-ondas");
    if (pista) {
        const contenedor = pista.closest(".reproductor-audio");
        const audio = contenedor?.querySelector("audio");
        if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            const rect = contenedor.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * audio.duration;
            pintarProgresoReproductor(audio);
        }
    }
});

// timeupdate/play/pause no burbujean, así que se escuchan en fase de captura.
document.addEventListener("timeupdate", (e) => { if (e.target instanceof HTMLAudioElement) pintarProgresoReproductor(e.target); }, true);
document.addEventListener("loadedmetadata", (e) => { if (e.target instanceof HTMLAudioElement) pintarProgresoReproductor(e.target); }, true);
document.addEventListener("play", (e) => {
    if (!(e.target instanceof HTMLAudioElement)) return;
    e.target.closest(".reproductor-audio")?.classList.add("sonando");
    pintarProgresoReproductor(e.target);
}, true);
document.addEventListener("pause", (e) => {
    if (!(e.target instanceof HTMLAudioElement)) return;
    e.target.closest(".reproductor-audio")?.classList.remove("sonando");
}, true);
document.addEventListener("ended", (e) => {
    if (!(e.target instanceof HTMLAudioElement)) return;
    const contenedor = e.target.closest(".reproductor-audio");
    contenedor?.classList.remove("sonando");
    const relleno = contenedor?.querySelector(".reproductor-audio-relleno");
    if (relleno) relleno.style.width = "100%";
    // Al acabar, la tira entera queda encendida: se ve que se rellenó del todo.
    contenedor?.querySelectorAll(".reproductor-audio-ondas span").forEach((barra) => barra.classList.add("encendida"));
}, true);

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
    // Si los comentarios estaban abiertos, se cierran con el estado.
    const comentariosEstado = document.getElementById("modal-comentarios-estado");
    if (comentariosEstado) comentariosEstado.hidden = true;
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
    nombreAutorHistoria.textContent = nombreVisible(estado.autor_id, estado.autor_nombre);
    nombreAutorHistoria.setAttribute("style", estiloNombre(estado.color_nombre));

    // El botón de comentarios enseña cuántos tiene este estado.
    pintarCantidadComentariosEstado(estado.comentarios || 0);

    const progreso = document.getElementById("progreso-historias");
    progreso.innerHTML = secuenciaHistoriaActual.map((_, indice) => `
        <span class="progreso-historia ${indice < indiceHistoriaActual ? "completado" : ""}">
            <i class="${indice === indiceHistoriaActual ? "activo" : ""}"></i>
        </span>
    `).join("");

    const contenido = document.getElementById("contenido-historia-pantalla");
    // Si el estado lleva texto y además multimedia, el texto se muestra como
    // título sobre el contenido; si es solo texto, ocupa la pantalla centrado.
    const hayMultimedia = (estado.multimedia || []).length > 0;
    const claseTexto = hayMultimedia ? "titulo-historia-pantalla" : "texto-historia-pantalla";
    contenido.innerHTML = `${renderizarMedios(estado.multimedia)}${estado.texto ? `<p class="${claseTexto}">${escapeHtml(estado.texto)}</p>` : ""}`;
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

/* Mantener pulsado el centro del visor despeja la pantalla (se ocultan la
   cabecera, el progreso y la barra de comentarios) y se para el vídeo o el
   audio; al soltar, vuelve todo como estaba. Si la persona es desarrolladora,
   esta pulsación anula la de borrar: en el centro manda despejar. */
let temporizadorDespejeHistoria = null;
let mediosDespejados = [];

function despejarHistoria() {
    temporizadorDespejeHistoria = null;
    if (typeof soyDesarrollador !== "undefined" && soyDesarrollador) terminarPulsacionLarga();
    const visor = document.getElementById("visor-historias-pantalla");
    visor.classList.add("historia-despejada");
    mediosDespejados = [];
    visor.querySelectorAll("#contenido-historia-pantalla video, #contenido-historia-pantalla audio").forEach((medio) => {
        if (!medio.paused) {
            mediosDespejados.push(medio);
            medio.pause();
        }
    });
}

function restaurarHistoria() {
    if (temporizadorDespejeHistoria) {
        clearTimeout(temporizadorDespejeHistoria);
        temporizadorDespejeHistoria = null;
    }
    const visor = document.getElementById("visor-historias-pantalla");
    if (!visor.classList.contains("historia-despejada")) return;
    visor.classList.remove("historia-despejada");
    mediosDespejados.forEach((medio) => medio.play().catch(() => {}));
    mediosDespejados = [];
}

const contenidoVisorHistorias = document.getElementById("contenido-historia-pantalla");
contenidoVisorHistorias.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    if (temporizadorDespejeHistoria) clearTimeout(temporizadorDespejeHistoria);
    // 450 ms: es una pulsación sostenida a propósito, no un toque normal, y
    // sigue por debajo de la de borrar (550 ms) para que en el centro mande
    // despejar cuando la persona es desarrolladora.
    temporizadorDespejeHistoria = setTimeout(despejarHistoria, 450);
});
for (const tipoFinal of ["pointerup", "pointercancel", "pointerleave"]) {
    contenidoVisorHistorias.addEventListener(tipoFinal, restaurarHistoria);
}

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
    pintarControlesGrabacion();
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
// Publicaciones: ahora se suben desde el boton central "+".
function abrirFormularioPublicacion() {
    const form = document.getElementById("formulario-publicacion");
    form.reset();
    form.querySelector("input[name=tipo-publicacion]:checked").dispatchEvent(new Event("change"));
    document.getElementById("archivo-publicacion").value = "";
    modalPublicacion.hidden = false;
}
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

function configurarSelectorMedio(formId, fileLabelId, fileInputId, typeName, textAreaId, audioControlsId = null, vistaPreviaId = null, modoPorDefecto = "imagenes") {
    const form = document.getElementById(formId);
    const fileLabel = document.getElementById(fileLabelId);
    const fileInput = document.getElementById(fileInputId);
    const textArea = document.getElementById(textAreaId);
    const audioControls = audioControlsId ? document.getElementById(audioControlsId) : null;
    const vistaPrevia = vistaPreviaId ? document.getElementById(vistaPreviaId) : null;
    // Fotos ya comprimidas o editadas que sustituyen a lo elegido en el input.
    // Clave: nombre original del archivo. Sin esto, el input seguiría subiendo
    // el original pesado aunque la vista previa muestre la versión comprimida.
    let fotosProcesadas = new Map();
    const actualizar = () => {
        const mode = form.querySelector(`input[name="${typeName}"]:checked`).value;
        const audioMode = mode === "audio";
        const needsFile = ["imagen", "imagenes", "video", "audio"].includes(mode);
        const soloTexto = !needsFile;
        // El botón de subir archivos se ve siempre, incluso en modo Texto: si
        // se pulsa ahí, el tipo pasa a fotos y el texto deja de ser obligatorio.
        fileLabel.hidden = false;
        // El texto acompaña a la foto, vídeo o audio: nunca se oculta,
        // solo deja de ser obligatorio cuando ya hay archivo.
        textArea.hidden = false;
        textArea.required = soloTexto;
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
                        : soloTexto
                            ? "Subir fotos o vídeo"
                            : "Seleccionar foto";
        }
    };
    form.querySelectorAll(`input[name="${typeName}"]`).forEach((input) => input.addEventListener("change", () => {
        fotosProcesadas = new Map();
        fileInput.value = "";
        pintarVistaPrevia();
        actualizar();
    }));
    // Pulsar el botón estando en modo Texto pasa a fotos: es lo que espera
    // quien quiere "subir archivos" sin cambiar antes el tipo a mano.
    fileLabel.addEventListener("click", (evento) => {
        const marcada = form.querySelector(`input[name="${typeName}"]:checked`);
        if (!marcada || marcada.value !== "texto") return;
        const destino = form.querySelector(`input[name="${typeName}"][value="${modoPorDefecto}"]`);
        if (!destino) return;
        evento.preventDefault();
        destino.checked = true;
        destino.dispatchEvent(new Event("change"));
        fileInput.click();
    });

    actualizar();

    fileInput.addEventListener("change", async () => {
        const mode = form.querySelector(`input[name="${typeName}"]:checked`).value;
        const esFoto = mode === "imagen" || mode === "imagenes";
        fotosProcesadas = new Map();
        const errorId = formId === "formulario-estado" ? "error-estado-social" : "error-publicacion-social";
        const destinoError = document.getElementById(errorId);
        if (destinoError) destinoError.textContent = "";
        if (formId === "formulario-estado" && mode === "audio") blobAudioEstado = null;
        let files = [...fileInput.files];
        if (mode === "imagenes" && files.length > 10) {
            fileInput.value = "";
            if (destinoError) destinoError.textContent = "Puedes seleccionar hasta 10 fotos.";
            pintarVistaPrevia();
            return;
        }
        if (esFoto && files.length) {
            try {
                await comprimirFotosSiHaceFalta(fileInput, fotosProcesadas);
                files = [...fileInput.files];
            } catch (error) {
                if (destinoError) destinoError.textContent = error.message || "No se pudieron preparar las fotos.";
                fileInput.value = "";
                pintarVistaPrevia();
                return;
            }
        }
        pintarVistaPrevia();
        actualizar();
    });
    function pintarVistaPrevia() {
        if (!vistaPrevia) return;
        vistaPrevia.innerHTML = "";
        const mode = form.querySelector(`input[name="${typeName}"]:checked`).value;
        const esFoto = mode === "imagen" || mode === "imagenes";
        const files = [...fileInput.files];
        if (!esFoto || !files.length) {
            vistaPrevia.hidden = true;
            return;
        }
        vistaPrevia.hidden = false;
        files.forEach((file) => {
            const proc = fotosProcesadas.get(file.name);
            const url = URL.createObjectURL(proc?.archivo ?? file);
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "miniatura-social";
            boton.setAttribute("aria-label", `Editar ${file.name}`);
            boton.innerHTML = `<img src="${url}" alt=""><span>${escapeHtml(file.name)}${proc ? " · comprimida" : ""}</span>`;
            boton.addEventListener("click", () => {
                abrirEditorFoto(proc?.archivo ?? file, (resultado) => {
                    fotosProcesadas.set(file.name, { archivo: resultado });
                    pintarVistaPrevia();
                });
            });
            vistaPrevia.appendChild(boton);
        });
        const n = files.filter((file) => fotosProcesadas.has(file.name)).length;
        if (n > 0) {
            const aviso = document.createElement("p");
            aviso.className = "aviso-compresion-social";
            aviso.textContent = n === 1
                ? "Una foto superaba el tamaño máximo y se ha comprimido con menos calidad para poder subirla."
                : `${n} fotos superaban el tamaño máximo y se han comprimido con menos calidad para poder subirlas.`;
            vistaPrevia.appendChild(aviso);
        }
    }

    function archivosFinales() {
        const files = [...fileInput.files];
        if (!files.length) return files;
        const data = new DataTransfer();
        files.forEach((file) => {
            const proc = fotosProcesadas.get(file.name);
            data.items.add(proc?.archivo ?? file);
        });
        return [...data.files];
    }

    // Punto único de verdad para publicar: devuelve los archivos procesados
    // (comprimidos o editados). Sin esto, el envío usaría fileInput.files, que
    // sigue siendo el original pesado.
    fileInput.archivosFinales = archivosFinales;

    return { archivosFinales, repintarVistaPrevia: pintarVistaPrevia };
}

// Los dos formularios, el de estado y el de publicación, comparten este
// comportamiento. Sin estas llamadas el botón de archivos se quedaba oculto
// y el texto seguía siendo obligatorio aunque se subiera una foto o un vídeo.
configurarSelectorMedio(
    "formulario-estado",
    "etiqueta-archivo-estado",
    "archivo-estado",
    "tipo-estado",
    "texto-estado",
    "controles-grabar-audio",
    "vista-previa-estado"
);

configurarSelectorMedio(
    "formulario-publicacion",
    "etiqueta-archivo-publicacion",
    "archivo-publicacion",
    "tipo-publicacion",
    "texto-publicacion",
    null,
    "vista-previa-publicacion"
);

const LIMITE_FOTO_BYTES = 12 * 1024 * 1024;

async function comprimirFoto(archivo) {
    let bitmap = null;
    try {
        bitmap = await createImageBitmap(archivo);
    } catch {
        throw new Error(`"${archivo.name}" no se pudo leer como imagen.`);
    }
    const escalas = [1920, 1600, 1280, 960];
    const calidades = [0.82, 0.7, 0.6, 0.5];
    for (const maxLado of escalas) {
        const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * escala));
        const h = Math.max(1, Math.round(bitmap.height * escala));
        const lienzo = document.createElement("canvas");
        lienzo.width = w;
        lienzo.height = h;
        lienzo.getContext("2d").drawImage(bitmap, 0, 0, w, h);
        for (const calidad of calidades) {
            const blob = await new Promise((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
            if (!blob) continue;
            if (blob.size <= LIMITE_FOTO_BYTES) {
                const nombre = (archivo.name || "foto").replace(/\.\w+$/, "") + ".jpg";
                return new File([blob], nombre, { type: "image/jpeg" });
            }
        }
    }
    throw new Error(`"${archivo.name}" pesa demasiado incluso comprimida.`);
}

async function comprimirFotosSiHaceFalta(fileInput, mapa) {
    const files = [...fileInput.files];
    for (const file of files) {
        if (!file.type?.startsWith("image/")) continue;
        if (file.size <= LIMITE_FOTO_BYTES) continue;
        if (mapa.has(file.name)) continue;
        const comprimida = await comprimirFoto(file);
        mapa.set(file.name, { archivo: comprimida });
    }
}

let editorFotoCallback = null;
let editorFotoNombre = "foto.jpg";
let editorFotoTipo = "image/jpeg";
let editorHerramienta = "pincel";
let editorHistorial = [];
let editorDibujando = false;
let editorUltimo = null;
let editorRecorte = null;

function editorLienzo() {
    return document.getElementById("lienzo-editor-foto");
}

function editorGuardarPaso() {
    const lienzo = editorLienzo();
    if (!lienzo) return;
    editorHistorial.push(lienzo.toDataURL("image/png"));
    if (editorHistorial.length > 20) editorHistorial.shift();
}

function editorRepintarDesde(url) {
    return new Promise((resolver, rechazar) => {
        const lienzo = editorLienzo();
        const img = new Image();
        img.onload = () => {
            lienzo.width = img.naturalWidth;
            lienzo.height = img.naturalHeight;
            lienzo.getContext("2d").drawImage(img, 0, 0);
            URL.revokeObjectURL(img.src);
            resolver();
        };
        img.onerror = () => rechazar(new Error("No se pudo cargar la foto."));
        img.src = url;
    });
}

function editorMarcarHerramienta() {
    const mapa = {
        recorte: document.getElementById("editor-herramienta-recorte"),
        pincel: document.getElementById("editor-herramienta-pincel"),
        texto: document.getElementById("editor-herramienta-texto")
    };
    for (const [clave, boton] of Object.entries(mapa)) {
        if (boton) boton.setAttribute("aria-pressed", String(clave === editorHerramienta));
    }
}

async function abrirEditorFoto(archivo, alConfirmar) {
    const lienzo = editorLienzo();
    if (!lienzo || !modalEditorFoto) return;
    editorFotoCallback = typeof alConfirmar === "function" ? alConfirmar : null;
    editorFotoNombre = (archivo?.name || "foto").replace(/\.\w+$/, "") + ".jpg";
    editorFotoTipo = "image/jpeg";
    editorHistorial = [];
    editorDibujando = false;
    editorRecorte = null;
    editorHerramienta = "pincel";
    editorMarcarHerramienta();
    try {
        await editorRepintarDesde(URL.createObjectURL(archivo));
    } catch (error) {
        alert(error.message || "No se pudo abrir la foto.");
        return;
    }
    modalEditorFoto.hidden = false;
}

function editorPosicion(evento) {
    const lienzo = editorLienzo();
    const rect = lienzo.getBoundingClientRect();
    const x = (evento.clientX - rect.left) * (lienzo.width / rect.width);
    const y = (evento.clientY - rect.top) * (lienzo.height / rect.height);
    return { x, y };
}

function editorIniciarTrazo(evento) {
    const lienzo = editorLienzo();
    if (!lienzo || modalEditorFoto.hidden) return;
    evento.preventDefault();
    const pos = editorPosicion(evento);
    if (editorHerramienta === "texto") {
        const texto = window.prompt("Texto para la foto:");
        if (!texto) return;
        editorGuardarPaso();
        const ctx = lienzo.getContext("2d");
        ctx.fillStyle = document.getElementById("editor-color")?.value || "#ff3344";
        ctx.font = `700 ${Math.max(24, Number(document.getElementById("editor-grosor")?.value || 6) * 6)}px sans-serif`;
        ctx.fillText(texto, pos.x, pos.y);
        return;
    }
    editorDibujando = true;
    editorUltimo = pos;
    editorRecorte = editorHerramienta === "recorte" ? { ...pos, w: 0, h: 0 } : null;
    if (editorHerramienta === "pincel") editorGuardarPaso();
}

function editorMoverTrazo(evento) {
    if (!editorDibujando) return;
    const lienzo = editorLienzo();
    evento.preventDefault();
    const pos = editorPosicion(evento);
    const ctx = lienzo.getContext("2d");
    if (editorHerramienta === "pincel") {
        ctx.strokeStyle = document.getElementById("editor-color")?.value || "#ff3344";
        ctx.lineWidth = Number(document.getElementById("editor-grosor")?.value || 6);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(editorUltimo.x, editorUltimo.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        editorUltimo = pos;
    } else if (editorHerramienta === "recorte" && editorRecorte) {
        editorRecorte.w = pos.x - editorRecorte.x;
        editorRecorte.h = pos.y - editorRecorte.y;
    }
}

function editorTerminarTrazo() {
    if (!editorDibujando) return;
    editorDibujando = false;
    if (editorHerramienta === "recorte" && editorRecorte) {
        const lienzo = editorLienzo();
        const x = Math.round(Math.min(editorRecorte.x, editorRecorte.x + editorRecorte.w));
        const y = Math.round(Math.min(editorRecorte.y, editorRecorte.y + editorRecorte.h));
        const w = Math.round(Math.abs(editorRecorte.w));
        const h = Math.round(Math.abs(editorRecorte.h));
        editorRecorte = null;
        if (w >= 10 && h >= 10 && x + w <= lienzo.width && y + h <= lienzo.height) {
            editorGuardarPaso();
            const copia = document.createElement("canvas");
            copia.width = w;
            copia.height = h;
            copia.getContext("2d").drawImage(lienzo, x, y, w, h, 0, 0, w, h);
            lienzo.width = w;
            lienzo.height = h;
            lienzo.getContext("2d").drawImage(copia, 0, 0);
        }
    }
    editorUltimo = null;
}

// Cierre y botones del editor: sin esto, el modal se abría pero ningún botón
// respondía (ni herramientas, ni deshacer, ni usar foto). El lienzo también
// se queda sin puntero si no se conectan los eventos táctiles y de ratón.
if (modalEditorFoto) {
    modalEditorFoto.addEventListener("click", (evento) => {
        if (evento.target === modalEditorFoto) modalEditorFoto.hidden = true;
    });
    document.getElementById("boton-cerrar-editor-foto")?.addEventListener("click", () => {
        modalEditorFoto.hidden = true;
        editorFotoCallback = null;
    });
    document.getElementById("editor-herramienta-recorte")?.addEventListener("click", () => {
        editorHerramienta = "recorte";
        editorMarcarHerramienta();
    });
    document.getElementById("editor-herramienta-pincel")?.addEventListener("click", () => {
        editorHerramienta = "pincel";
        editorMarcarHerramienta();
    });
    document.getElementById("editor-herramienta-texto")?.addEventListener("click", () => {
        editorHerramienta = "texto";
        editorMarcarHerramienta();
    });
    document.getElementById("boton-editor-deshacer")?.addEventListener("click", () => {
        const lienzo = editorLienzo();
        const paso = editorHistorial.pop();
        if (!lienzo || !paso) return;
        const img = new Image();
        img.onload = () => {
            lienzo.width = img.naturalWidth;
            lienzo.height = img.naturalHeight;
            lienzo.getContext("2d").drawImage(img, 0, 0);
        };
        img.src = paso;
    });
    document.getElementById("boton-editor-restablecer")?.addEventListener("click", () => {
        const lienzo = editorLienzo();
        const primero = editorHistorial[0];
        if (!lienzo || !primero) return;
        editorHistorial = [primero];
        const img = new Image();
        img.onload = () => {
            lienzo.width = img.naturalWidth;
            lienzo.height = img.naturalHeight;
            lienzo.getContext("2d").drawImage(img, 0, 0);
        };
        img.src = primero;
    });
    document.getElementById("boton-editor-confirmar")?.addEventListener("click", () => {
        const lienzo = editorLienzo();
        if (!lienzo) return;
        lienzo.toBlob((blob) => {
            if (!blob) {
                modalEditorFoto.hidden = true;
                return;
            }
            const resultado = new File([blob], editorFotoNombre, { type: editorFotoTipo });
            modalEditorFoto.hidden = true;
            if (editorFotoCallback) {
                const continuar = editorFotoCallback;
                editorFotoCallback = null;
                continuar(resultado);
            }
        }, editorFotoTipo, 0.92);
    });
    const lienzoEditor = editorLienzo();
    if (lienzoEditor) {
        lienzoEditor.addEventListener("pointerdown", editorIniciarTrazo);
        lienzoEditor.addEventListener("pointermove", editorMoverTrazo);
        lienzoEditor.addEventListener("pointerup", editorTerminarTrazo);
        lienzoEditor.addEventListener("pointerleave", editorTerminarTrazo);
        lienzoEditor.addEventListener("pointercancel", editorTerminarTrazo);
    }
}
// Pinta los botones del grabador de audio según el estado de la grabación:
// mientras suena aparecen PAUSAR (o REANUDAR) y BORRAR, sin necesidad de
// haber terminado de grabar.
function pintarControlesGrabacion() {
    const activo = Boolean(grabadoraAudio) && grabadoraAudio.state !== "inactive";
    const enPausa = Boolean(grabadoraAudio) && grabadoraAudio.state === "paused";
    const conAudio = activo || Boolean(blobAudioEstado);
    document.getElementById("boton-iniciar-audio").disabled = activo;
    document.getElementById("boton-detener-audio").disabled = !activo;
    const pausar = document.getElementById("boton-pausar-audio");
    const borrar = document.getElementById("boton-borrar-audio");
    pausar.hidden = !activo;
    pausar.disabled = !activo;
    pausar.textContent = enPausa ? "REANUDAR" : "PAUSAR";
    borrar.hidden = !conAudio;
    borrar.disabled = !conAudio;
}

document.getElementById("boton-iniciar-audio").addEventListener("click", async () => {
    try {
        descartarGrabacionAudio = false;
        blobAudioEstado = null;
        document.getElementById("vista-previa-audio").hidden = true;
        flujoAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
        grabadoraAudio = new MediaRecorder(flujoAudio, mimeType ? { mimeType } : undefined);
        const chunks = [];
        grabadoraAudio.addEventListener("dataavailable", (evento) => { if (evento.data.size) chunks.push(evento.data); });
        grabadoraAudio.addEventListener("stop", () => {
            const descartar = descartarGrabacionAudio;
            descartarGrabacionAudio = false;
            grabadoraAudio = null;
            flujoAudio?.getTracks().forEach((track) => track.stop());
            flujoAudio = null;
            const preview = document.getElementById("vista-previa-audio");
            if (descartar || !chunks.length) {
                blobAudioEstado = null;
                preview.hidden = true;
                preview.removeAttribute("src");
            } else {
                blobAudioEstado = new Blob(chunks, { type: mimeType || "audio/webm" });
                preview.src = URL.createObjectURL(blobAudioEstado);
                preview.hidden = false;
            }
            pintarControlesGrabacion();
        });
        grabadoraAudio.start();
        limiteGrabacionAudio = setTimeout(() => {
            if (grabadoraAudio && grabadoraAudio.state !== "inactive") grabadoraAudio.stop();
        }, 210000);
        pintarControlesGrabacion();
    } catch (error) {
        document.getElementById("error-estado-social").textContent = error.message || "No se pudo acceder al micrófono.";
        pintarControlesGrabacion();
    }
});

document.getElementById("boton-detener-audio").addEventListener("click", () => {
    if (limiteGrabacionAudio) clearTimeout(limiteGrabacionAudio);
    descartarGrabacionAudio = false;
    if (grabadoraAudio && grabadoraAudio.state !== "inactive") grabadoraAudio.stop();
    pintarControlesGrabacion();
});

// Pausar y reanudar sin tener que terminar la grabación.
document.getElementById("boton-pausar-audio").addEventListener("click", () => {
    if (!grabadoraAudio || grabadoraAudio.state === "inactive") return;
    if (grabadoraAudio.state === "recording") grabadoraAudio.pause();
    else if (grabadoraAudio.state === "paused") grabadoraAudio.resume();
    pintarControlesGrabacion();
});

// Borrar la grabación en cualquier momento, sin terminarla si está en marcha.
document.getElementById("boton-borrar-audio").addEventListener("click", () => {
    if (limiteGrabacionAudio) clearTimeout(limiteGrabacionAudio);
    if (grabadoraAudio && grabadoraAudio.state !== "inactive") {
        descartarGrabacionAudio = true;
        grabadoraAudio.stop();
    } else {
        blobAudioEstado = null;
        const preview = document.getElementById("vista-previa-audio");
        preview.hidden = true;
        preview.removeAttribute("src");
        pintarControlesGrabacion();
    }
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
            const inputEstado = document.getElementById("archivo-estado");
            const files = mode === "audio" && blobAudioEstado
                ? [new File([blobAudioEstado], `estado-audio.${blobAudioEstado.type.includes("ogg") ? "ogg" : "webm"}`, { type: blobAudioEstado.type })]
                : (typeof inputEstado.archivosFinales === "function" ? inputEstado.archivosFinales() : [...inputEstado.files]);
            // El texto acompaña al archivo, pero no lo sustituye: sin archivo
            // no hay nada que publicar.
            if (!files.length) {
                throw new Error("Selecciona al menos un archivo o graba un audio.");
            }
            const body = new FormData();
            body.append("tipo", mode);
            body.append("visibilidad", document.getElementById("visibilidad-estado").value);
            body.append("texto", document.getElementById("texto-estado").value);
            files.forEach((file) => body.append("archivo", file));
            await solicitarGrupo("/api/estados/multimedia", { method: "POST", body });
        }
        form.reset();
        blobAudioEstado = null;
        pintarControlesGrabacion();
        await cargarContenidoInicio();
        modalEstado.hidden = true;
    } catch (failure) {
        error.textContent = failure.message;
    } finally {
        delete form.dataset.enviando;
        botonPublicar.disabled = false;
    }
});

/* ---------- Comentarios del reel ---------- */

async function abrirComentariosReel(reelId, contador) {
    const lista = document.getElementById("lista-comentarios-reel");
    const entrada = document.getElementById("texto-comentario-reel");
    modalComentariosReel.hidden = false;
    lista.innerHTML = `<p class="estado-amigos">Cargando...</p>`;
    try {
        const datos = await solicitarGrupo(`/api/reels/${reelId}/comentarios`);
        lista.innerHTML = datos.comentarios.map((comentario) => `
            <p class="comentario-reel">
                <strong style="${estiloNombre(comentario.color_nombre)}">${escapeHtml(nombreVisible(comentario.autor_id, comentario.autor_nombre))}</strong>
                ${escapeHtml(comentario.texto)}
            </p>
        `).join("") || `<p class="estado-amigos">Todavía no hay comentarios.</p>`;
    } catch (fallo) {
        lista.innerHTML = `<p class="estado-amigos">${escapeHtml(fallo.message)}</p>`;
    }
    if (contador) {
        const total = await solicitarGrupo(`/api/reels/${reelId}`);
        if (total.reel) contador.textContent = total.reel.comentarios ?? 0;
    }
    // El visor se queda detrás: los comentarios se leen encima y el vídeo
    // sigue sonando de fondo sin perder el hilo.
    entrada?.focus();
}

// El botón solo se activa cuando hay algo escrito.
const entradaComentarioReel = document.getElementById("texto-comentario-reel");
const botonComentarReel = document.getElementById("boton-comentar-reel");

function refrescarBotonComentar() {
    if (!botonComentarReel || !entradaComentarioReel) return;
    botonComentarReel.disabled = entradaComentarioReel.value.trim().length === 0;
}

entradaComentarioReel?.addEventListener("input", refrescarBotonComentar);

document.getElementById("boton-cerrar-comentarios-reel")?.addEventListener("click", () => {
    modalComentariosReel.hidden = true;
});

document.getElementById("formulario-comentario-reel")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const entrada = document.getElementById("texto-comentario-reel");
    const pantalla = document.querySelector(`#pista-reels-visor [data-reel-id="${reelAbierto}"]`);
    const texto = entrada.value.trim();
    if (!texto || !pantalla) return;
    try {
        await solicitarGrupo(`/api/reels/${reelAbierto}/comentarios`, {
            method: "POST",
            body: JSON.stringify({ texto })
        });
        entrada.value = "";
        refrescarBotonComentar();
        await abrirComentariosReel(reelAbierto, pantalla.querySelector(".cuenta-comentarios"));
    } catch (fallo) {
        console.warn("No se pudo comentar:", fallo);
    }
});

/* ---------- Comentarios del estado ---------- */

// Mismo funcionamiento que los del reel: se abren desde el visor de estados y
// se borran en el servidor en cuanto se borra el estado (borrado en cascada).
let estadoComentariosAbierto = null;

function pintarCantidadComentariosEstado(total) {
    const marca = document.getElementById("cantidad-comentarios-estado");
    if (!marca) return;
    marca.hidden = !total;
    marca.textContent = total ? String(total) : "";
}

async function abrirComentariosEstado(estadoId) {
    if (!estadoId) return;
    estadoComentariosAbierto = estadoId;
    const modal = document.getElementById("modal-comentarios-estado");
    const lista = document.getElementById("lista-comentarios-estado");
    const entrada = document.getElementById("texto-comentario-estado");
    const boton = document.getElementById("boton-comentar-estado");
    modal.hidden = false;
    lista.innerHTML = `<p class="estado-amigos">Cargando...</p>`;
    try {
        const datos = await solicitarGrupo(`/api/estados/${encodeURIComponent(estadoId)}/comentarios`);
        lista.innerHTML = datos.comentarios.map((comentario) => `
            <p class="comentario-reel">
                <strong style="${estiloNombre(comentario.color_nombre)}">${escapeHtml(nombreVisible(comentario.autor_id, comentario.autor_nombre))}</strong>
                ${escapeHtml(comentario.texto)}
            </p>
        `).join("") || `<p class="estado-amigos">Todavía no hay comentarios.</p>`;
        pintarCantidadComentariosEstado(datos.comentarios.length);
    } catch (fallo) {
        lista.innerHTML = `<p class="estado-amigos">${escapeHtml(fallo.message)}</p>`;
    }
    if (entrada) entrada.value = "";
    if (boton) boton.disabled = true;
    entrada?.focus();
}

document.getElementById("boton-comentarios-estado")?.addEventListener("click", () => {
    const estado = secuenciaHistoriaActual[indiceHistoriaActual];
    abrirComentariosEstado(estado?.id);
});

document.getElementById("boton-cerrar-comentarios-estado")?.addEventListener("click", () => {
    document.getElementById("modal-comentarios-estado").hidden = true;
});

const entradaComentarioEstado = document.getElementById("texto-comentario-estado");
const botonComentarEstado = document.getElementById("boton-comentar-estado");

entradaComentarioEstado?.addEventListener("input", () => {
    botonComentarEstado.disabled = entradaComentarioEstado.value.trim().length === 0;
});

document.getElementById("formulario-comentario-estado")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const entrada = document.getElementById("texto-comentario-estado");
    const texto = entrada.value.trim();
    if (!texto || !estadoComentariosAbierto) return;
    try {
        await solicitarGrupo(`/api/estados/${encodeURIComponent(estadoComentariosAbierto)}/comentarios`, {
            method: "POST",
            body: JSON.stringify({ texto })
        });
        entrada.value = "";
        botonComentarEstado.disabled = true;
        await abrirComentariosEstado(estadoComentariosAbierto);
    } catch (fallo) {
        console.warn("No se pudo comentar:", fallo);
    }
});

/* ==============================
   CUENTA: HISTORIAS Y PUBLICACIONES
   ============================== */

async function actualizarBurbujasHistorias() {
    const contenedor = document.getElementById("burbujas-historias");
    if (!contenedor) return;
    try {
        const datos = await solicitarGrupo("/api/historias/mias");
        contenedor.innerHTML = datos.historias.map((historia) => `
            <button class="burbuja-historia" data-historia="${escapeHtml(historia.id)}" type="button">
                ${historia.portada
                    ? `<img src="${escapeHtml(historia.portada)}" alt="" loading="lazy">`
                    : `<span class="burbuja-historia-vacia" aria-hidden="true"></span>`}
                <span class="nombre-historia-carpeta">${escapeHtml(historia.nombre)}</span>
            </button>
        `).join("") || `<p class="estado-amigos">Todavía no tienes historias.</p>`;
    } catch {
        contenedor.innerHTML = `<p class="estado-amigos">No se pudieron cargar tus historias.</p>`;
    }
}

document.getElementById("burbujas-historias")?.addEventListener("click", (evento) => {
    const burbuja = evento.target.closest("[data-historia]");
    if (!burbuja) return;
    const id = burbuja.dataset.historia;
    const nombre = burbuja.querySelector(".nombre-historia-carpeta")?.textContent ?? "";
    abrirModalHistoria({ id, nombre });
});

async function actualizarPistaReelsCuenta() {
    const pista = document.getElementById("pista-reels-cuenta");
    if (!pista) return;
    try {
        const datos = await solicitarGrupo("/api/reels/mios");
        pintarPistaReels(pista, datos.reels || []);
    } catch {
        pista.innerHTML = `<p class="estado-amigos">Todavía no hay reels.</p>`;
    }
}

async function actualizarListaPublicacionesCuenta() {
    const lista = document.getElementById("lista-mis-publicaciones");
    if (!lista) return;
    try {
        const datos = await solicitarGrupo("/api/publicaciones?seccion=amigos");
        // En Cuenta solo interesan las propias: las de los amigos ya salen en
        // el feed de Entrar.
        const mias = (datos.publicaciones || []).filter((publicacion) => publicacion.es_mia);
        lista.innerHTML = mias.map((publicacion) => renderizarPublicacion(publicacion)).join("")
            || `<p class="estado-amigos">Todavía no tienes publicaciones.</p>`;
        conectarFeed(lista);
    } catch {
        lista.innerHTML = `<p class="estado-amigos">No se pudieron cargar tus publicaciones.</p>`;
    }
}

document.getElementById("boton-cuenta-historias")?.addEventListener("click", async () => {
    document.getElementById("titulo-mi-contenido").textContent = "Historias";
    document.getElementById("burbujas-historias").hidden = false;
    document.getElementById("contenido-mis-reels").hidden = true;
    document.getElementById("contenido-mis-publicaciones").hidden = true;
    modalMiContenido.hidden = false;
    await actualizarBurbujasHistorias();
});

document.getElementById("boton-cuenta-publicaciones")?.addEventListener("click", async () => {
    document.getElementById("titulo-mi-contenido").textContent = "Publicaciones";
    document.getElementById("burbujas-historias").hidden = true;
    document.getElementById("contenido-mis-reels").hidden = false;
    document.getElementById("contenido-mis-publicaciones").hidden = false;
    modalMiContenido.hidden = false;
    await actualizarPistaReelsCuenta();
    await actualizarListaPublicacionesCuenta();
});

document.getElementById("boton-cerrar-mi-contenido")?.addEventListener("click", () => {
    modalMiContenido.hidden = true;
});
/* ==============================
   HISTORIAS (pantalla)
   ============================== */

const modalHistoria = document.getElementById("modal-historia");
let historiaAbierta = null;
let historiaViendo = null;

function actualizarSelectorItemHistoria() {
    const tipo = document.querySelector('input[name="tipo-item-historia"]:checked')?.value ?? "texto";
    const texto = document.getElementById("texto-item-historia");
    const etiqueta = document.getElementById("etiqueta-archivo-historia");
    const entrada = document.getElementById("archivo-historia");
    texto.hidden = tipo !== "texto";
    etiqueta.hidden = tipo === "texto";
    if (tipo === "imagen") {
        entrada.accept = "image/*";
        entrada.multiple = true;
    } else if (tipo === "video") {
        entrada.accept = "video/mp4,video/webm,video/quicktime";
        entrada.multiple = false;
    } else {
        entrada.accept = "audio/*";
        entrada.multiple = false;
    }
}

document.querySelectorAll('input[name="tipo-item-historia"]').forEach((entrada) => {
    entrada.addEventListener("change", () => {
        document.getElementById("archivo-historia").value = "";
        actualizarSelectorItemHistoria();
    });
});

document.getElementById("formulario-item-historia")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const error = document.getElementById("error-historia");
    error.textContent = "";

    if (!historiaAbierta) {
        try {
            const datos = await solicitarGrupo("/api/historias", {
                method: "POST",
                body: JSON.stringify({ nombre: document.getElementById("nombre-historia").value })
            });
            historiaAbierta = datos.historia.id;
        } catch (fallo) {
            error.textContent = fallo.message;
            return;
        }
    }

    const tipo = document.querySelector('input[name="tipo-item-historia"]:checked').value;
    const body = new FormData();
    body.append("tipo", tipo);
    body.append("texto", document.getElementById("texto-item-historia").value);
    const archivos = [...document.getElementById("archivo-historia").files];
    archivos.forEach((archivo) => body.append("archivo", archivo));

    try {
        await solicitarGrupo(`/api/historias/${historiaAbierta}/items`, { method: "POST", body });
        document.getElementById("texto-item-historia").value = "";
        document.getElementById("archivo-historia").value = "";
        await pintarItemsHistoria();
        await actualizarBurbujasHistorias();
    } catch (fallo) {
        error.textContent = fallo.message;
    }
});

async function pintarItemsHistoria() {
    const id = historiaAbierta ?? historiaViendo;
    if (!id) return;
    const lista = document.getElementById("lista-items-historia");
    try {
        const datos = await solicitarGrupo(`/api/historias/${id}`);
        const puedeEditar = Boolean(historiaAbierta);
        lista.innerHTML = (datos.historia.items || []).map((item) => `
            <div class="item-historia">
                ${item.url
                    ? `<img src="${escapeHtml(item.url)}" alt="" loading="lazy">`
                    : `<p>${escapeHtml(item.texto || "")}</p>`}
                ${puedeEditar
                    ? `<button type="button" data-borrar-item="${escapeHtml(item.id)}" aria-label="Borrar elemento">×</button>`
                    : ""}
            </div>
        `).join("") || `<p class="estado-amigos">La historia todavía está vacía.</p>`;
    } catch (fallo) {
        lista.innerHTML = `<p class="estado-amigos">${escapeHtml(fallo.message)}</p>`;
    }
}

document.getElementById("lista-items-historia")?.addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-borrar-item]");
    if (!boton || !historiaAbierta) return;
    try {
        await solicitarGrupo(
            `/api/historias/${historiaAbierta}/items/${boton.dataset.borrarItem}`,
            { method: "DELETE" }
        );
        await pintarItemsHistoria();
        await actualizarBurbujasHistorias();
    } catch (fallo) {
        document.getElementById("error-historia").textContent = fallo.message;
    }
});

document.getElementById("boton-guardar-historia")?.addEventListener("click", async () => {
    const error = document.getElementById("error-historia");
    const nombre = document.getElementById("nombre-historia").value;
    if (!historiaAbierta) {
        try {
            const datos = await solicitarGrupo("/api/historias", {
                method: "POST",
                body: JSON.stringify({ nombre })
            });
            historiaAbierta = datos.historia.id;
        } catch (fallo) {
            error.textContent = fallo.message;
            return;
        }
    } else {
        try {
            await solicitarGrupo(`/api/historias/${historiaAbierta}`, {
                method: "PUT",
                body: JSON.stringify({ nombre })
            });
        } catch (fallo) {
            error.textContent = fallo.message;
            return;
        }
    }
    await actualizarBurbujasHistorias();
    modalHistoria.hidden = true;
});

document.getElementById("boton-borrar-historia")?.addEventListener("click", async () => {
    if (!historiaAbierta || !confirm("¿Borrar esta historia?")) return;
    try {
        await solicitarGrupo(`/api/historias/${historiaAbierta}`, { method: "DELETE" });
        historiaAbierta = null;
        modalHistoria.hidden = true;
        await actualizarBurbujasHistorias();
    } catch (fallo) {
        document.getElementById("error-historia").textContent = fallo.message;
    }
});

document.getElementById("boton-cerrar-historia")?.addEventListener("click", () => {
    modalHistoria.hidden = true;
});

function abrirModalHistoria(historia = null, soloLectura = false) {
    historiaAbierta = soloLectura ? null : (historia?.id ?? null);
    document.getElementById("formulario-item-historia").hidden = soloLectura;
    document.getElementById("acciones-historia").hidden = soloLectura;
    historiaViendo = historia?.id ?? null;
    document.getElementById("nombre-historia").value = historia?.nombre ?? "";
    document.getElementById("error-historia").textContent = "";
    document.getElementById("texto-item-historia").value = "";
    document.getElementById("archivo-historia").value = "";
    document.getElementById("boton-borrar-historia").hidden = !historiaAbierta || soloLectura;
    actualizarSelectorItemHistoria();
    modalHistoria.hidden = false;
    pintarItemsHistoria();
}
/* ==============================
   REELS
   ============================== */

const modalCrear = document.getElementById("modal-crear");
const modalReel = document.getElementById("modal-reel");
const visorReels = document.getElementById("visor-reels");
const modalComentariosReel = document.getElementById("modal-comentarios-reel");
const modalMiContenido = document.getElementById("modal-mi-contenido");

let reelsVisor = [];
let reelAbierto = null;

// Un producto del menú central abre el modal correspondiente.
document.getElementById("boton-crear")?.addEventListener("click", () => {
    modalCrear.hidden = false;
});

document.getElementById("boton-cerrar-crear")?.addEventListener("click", () => {
    modalCrear.hidden = true;
});

modalCrear?.addEventListener("click", (evento) => {
    if (evento.target === modalCrear) modalCrear.hidden = true;
});

document.querySelectorAll("[data-crear]").forEach((boton) => {
    boton.addEventListener("click", () => {
        modalCrear.hidden = true;
        const tipo = boton.dataset.crear;
        if (tipo === "reel") {
            document.getElementById("formulario-reel").reset();
            document.getElementById("archivo-reel").value = "";
            document.getElementById("error-reel").textContent = "";
            modalReel.hidden = false;
        } else if (tipo === "historia") {
            abrirModalHistoria();
        } else {
            abrirFormularioPublicacion();
        }
    });
});

document.getElementById("boton-cerrar-reel")?.addEventListener("click", () => {
    modalReel.hidden = true;
});

modalReel?.addEventListener("click", (evento) => {
    if (evento.target === modalReel) modalReel.hidden = true;
});

/* ---------- Subir un reel ---------- */

document.getElementById("formulario-reel")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const error = document.getElementById("error-reel");
    const archivo = document.getElementById("archivo-reel").files?.[0];
    error.textContent = "";
    if (!archivo) {
        error.textContent = "Selecciona un vídeo.";
        return;
    }
    const body = new FormData();
    body.append("titulo", document.getElementById("titulo-reel").value);
    body.append("visibilidad", document.getElementById("visibilidad-reel").value);
    body.append("archivo", archivo);
    try {
        await solicitarGrupo("/api/reels", { method: "POST", body });
        modalReel.hidden = true;
        await cargarContenidoInicio();
        await actualizarPistaReelsCuenta();
    } catch (fallo) {
        error.textContent = fallo.message;
    }
});

/* ---------- Tiras horizontales de reels ---------- */

function pintarPistaReels(contenedor, reels) {
    if (!contenedor) return;
    contenedor.innerHTML = "";
    if (!reels.length) {
        contenedor.innerHTML = `<p class="estado-amigos">Todavía no hay reels.</p>`;
        return;
    }
    reels.forEach((reel) => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "miniatura-reel";
        boton.dataset.reelId = reel.id;
        boton.setAttribute("aria-label", reel.titulo);
        boton.innerHTML = `
            <video src="${escapeHtml(reel.video_url)}" muted playsinline preload="metadata" aria-hidden="true"></video>
            <span class="miniatura-reel-titulo">${escapeHtml(reel.titulo)}</span>
        `;
        // Se pasa la tira entera: en el visor se desliza de un reel al siguiente.
        boton.addEventListener("click", () => abrirVisorReels(reels, reel.id));
        contenedor.appendChild(boton);
    });
}

async function cargarPistaReels(seccion, contenedor) {
    try {
        const datos = await solicitarGrupo(`/api/reels?seccion=${seccion}`);
        pintarPistaReels(contenedor, datos.reels || []);
    } catch {
        // Sin reels todavia: se deja el hueco vacio.
    }
}

/* ---------- Visor a pantalla completa ---------- */

function abrirVisorReels(reels, reelId) {
    reelsVisor = reels;
    reelAbierto = reelId;
    const pista = document.getElementById("pista-reels-visor");
    pista.innerHTML = "";
    reels.forEach((reel) => {
        const pantalla = document.createElement("article");
        pantalla.className = "pantalla-reel";
        pantalla.dataset.reelId = reel.id;
        pantalla.innerHTML = `
            <video class="video-reel" src="${escapeHtml(reel.video_url)}" loop muted playsinline
                preload="metadata"></video>
            <h3 class="titulo-reel">${escapeHtml(reel.titulo)}</h3>
            <div class="acciones-reel">
                <div class="acciones-reel-contador">
                    <strong class="cuenta-likes">${reel.likes ?? 0}</strong>
                    <button class="boton-like" data-me-gusta="${reel.me_gusta ? "1" : "0"}" type="button"
                        aria-label="Me gusta">
                        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
                            <path class="corazon-reel" d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"
                                fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div class="acciones-reel-contador">
                    <strong class="cuenta-comentarios">${reel.comentarios ?? 0}</strong>
                    <button class="boton-comentarios" type="button" aria-label="Comentarios">
                        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
                            <path d="M20 4H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 16h3v4l4.5-4H20a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 20 4z"
                                fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <button class="boton-sonido-reel" type="button" aria-pressed="false" aria-label="Quitar el sonido">
                    <svg class="icono-sonido" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
                        <path d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                        <path class="ondas-sonido" d="M15 9.2a4 4 0 0 1 0 5.6M17.4 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                        <path class="raya-sonido" d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="boton-autor-reel" data-abrir-perfil="${escapeHtml(reel.autor_id)}" type="button"
                    aria-label="Ver perfil de ${escapeHtml(nombreVisible(reel.autor_id, reel.autor_nombre))}">
                    ${reel.avatar_url
                        ? `<img class="avatar-autor-reel" src="/${escapeHtml(reel.avatar_url)}" alt="">`
                        : `<span class="avatar-autor-reel avatar-autor-reel-vacio" aria-hidden="true"></span>`}
                </button>
            </div>
            <div class="barra-reel">
                <span class="barra-reel-tiempo">0:00</span>
                <div
                    class="barra-reel-pista"
                    role="slider"
                    tabindex="0"
                    aria-label="Avanzar o retroceder en el vídeo"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="0"
                >
                    <span class="barra-reel-relleno"></span>
                </div>
            </div>
            <button class="aviso-reproduccion" type="button" hidden aria-label="Reproducir">
                <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true" focusable="false">
                    <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/>
                </svg>
            </button>
        `;
        pista.appendChild(pantalla);
        configurarPantallaReel(pantalla);
    });

    visorReels.hidden = false;
    const destino = pista.querySelector(`[data-reel-id="${reelId}"]`);
    pintarCorazonReels();
    if (destino) {
        destino.scrollIntoView({ block: "start" });
        // El evento pone el reel en marcha con el sonido que se haya pedido: si
        // el navegador no deja, se queda en silencio en vez de quedarse parado.
        destino.dispatchEvent(new Event("reel-en-pantalla"));
    }
}

function cerrarVisorReels() {
    visorReels.hidden = true;
    document.querySelectorAll("#pista-reels-visor video").forEach((video) => video.pause());
}

/* ---------- El sonido de los reels ----------
   Los navegadores no dejan reproducir con sonido sin que la persona haya
   pulsado algo, así que los reels arrancan en silencio (como en Instagram) y
   hay un botón para quitarlo. La decisión se recuerda: si lo quitas una vez,
   los siguientes reels suenan solos. */

const PREF_SONIDO_REELS = "atuistas_reels_sonido";

function leerPreferenciaSonido() {
    try {
        return localStorage.getItem(PREF_SONIDO_REELS) === "1";
    } catch {
        return false;
    }
}

function guardarPreferenciaSonido(activo) {
    try {
        localStorage.setItem(PREF_SONIDO_REELS, activo ? "1" : "0");
    } catch {
        // Sin almacenamiento se suena solo en esta visita.
    }
}

// ---------- Tocar para pausar y barra de avance ----------

// El tiempo se ve corto y claro: 0:07.
function tiempoReel(segundos) {
    const total = Math.max(0, Math.floor(Number(segundos) || 0));
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    return `${minutos}:${String(resto).padStart(2, "0")}`;
}

// Cada pantalla del visor trae su barra y su botón de pausa: se configuran al
// pintarse, para no tener que buscarlos después.
function configurarPantallaReel(pantalla) {
    const video = pantalla.querySelector(".video-reel");
    if (!video) return;

    const pista = pantalla.querySelector(".barra-reel-pista");
    const relleno = pantalla.querySelector(".barra-reel-relleno");
    const tiempo = pantalla.querySelector(".barra-reel-tiempo");
    const aviso = pantalla.querySelector(".aviso-reproduccion");
    const botonSonido = pantalla.querySelector(".boton-sonido-reel");

    let punteroBuscando = null;

    const pintar = () => {
        const total = video.duration || 0;
        const porcentaje = total ? Math.min(100, (video.currentTime / total) * 100) : 0;
        if (relleno) relleno.style.width = `${porcentaje}%`;
        if (tiempo) tiempo.textContent = `${tiempoReel(video.currentTime)} / ${tiempoReel(total)}`;
        if (pista) pista.setAttribute("aria-valuenow", String(Math.round(porcentaje)));
    };

    const mostrarAviso = (pausado) => {
        if (aviso) aviso.hidden = !pausado;
    };

    // El icono del botón refleja siempre el estado real del vídeo: con ondas
    // cuando suena, con la raya cuando está en silencio.
    const pintarSonido = () => {
        if (!botonSonido) return;
        const sonando = !video.muted;
        botonSonido.classList.toggle("activo", sonando);
        botonSonido.setAttribute("aria-pressed", String(sonando));
        botonSonido.setAttribute("aria-label", sonando ? "Quitar el sonido" : "Poner el sonido");
        const ondas = botonSonido.querySelector(".ondas-sonido");
        const raya = botonSonido.querySelector(".raya-sonido");
        if (ondas) ondas.style.display = sonando ? "" : "none";
        if (raya) raya.style.display = sonando ? "none" : "";
    };

    // Reproducir con sonido puede estar bloqueado por el navegador (política de
    // reproducción automática). Si pasa, se queda en silencio antes que quedarse
    // parado sin explicar nada.
    const reproducir = async () => {
        try {
            await video.play();
        } catch {
            video.muted = true;
            pintarSonido();
        }
    };

    if (botonSonido) {
        video.muted = !leerPreferenciaSonido();
        pintarSonido();
        botonSonido.addEventListener("click", (evento) => {
            evento.stopPropagation();
            const queriendo = video.muted;
            video.muted = !queriendo;
            guardarPreferenciaSonido(!video.muted);
            pintarSonido();
            // Es un toque de la persona: aquí el navegador sí deja sonar.
            if (video.paused) {
                video.play().catch(() => {
                    video.muted = true;
                    guardarPreferenciaSonido(false);
                    pintarSonido();
                });
            }
        });
    }

    video.addEventListener("timeupdate", pintar);
    video.addEventListener("loadedmetadata", pintar);
    video.addEventListener("ended", pintar);

    // Un toque en el vídeo lo pausa o lo reanuda. Los botones y la barra
    // tienen su propia función y no cuentan como toque en el vídeo.
    pantalla.addEventListener("click", (evento) => {
        if (evento.target.closest(".acciones-reel, .barra-reel, .titulo-reel, .aviso-reproduccion")) {
            return;
        }
        if (video.paused) {
            reproducir();
            mostrarAviso(false);
        } else {
            video.pause();
            mostrarAviso(true);
        }
    });

    aviso?.addEventListener("click", (evento) => {
        evento.stopPropagation();
        reproducir();
        mostrarAviso(false);
    });

    // Al pasar a otro reel no se queda pausado: cada uno arranca en marcha y
    // con el sonido que se haya pedido.
    pantalla.addEventListener("reel-en-pantalla", () => {
        video.currentTime = 0;
        reproducir();
        mostrarAviso(false);
        pintar();
    });

    if (!pista) return;

    const saltarA = (clientX) => {
        const total = video.duration || 0;
        if (!total) return;
        const caja = pista.getBoundingClientRect();
        const proporcion = Math.min(1, Math.max(0, (clientX - caja.left) / caja.width));
        video.currentTime = proporcion * total;
        pintar();
    };

    pista.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return;
        punteroBuscando = evento.pointerId;
        pista.setPointerCapture?.(evento.pointerId);
        saltarA(evento.clientX);
        evento.stopPropagation();
    });

    pista.addEventListener("pointermove", (evento) => {
        if (punteroBuscando !== evento.pointerId) return;
        saltarA(evento.clientX);
    });

    const soltar = (evento) => {
        if (punteroBuscando !== evento.pointerId) return;
        punteroBuscando = null;
    };

    pista.addEventListener("pointerup", soltar);
    pista.addEventListener("pointercancel", soltar);

    // Con teclado también se puede mover: flechas de 5 segundos, inicio y fin.
    pista.addEventListener("keydown", (evento) => {
        const saltos = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 };
        if (evento.key in saltos) {
            evento.preventDefault();
            video.currentTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + saltos[evento.key]));
            pintar();
            return;
        }
        if (evento.key === "Home" || evento.key === "End") {
            evento.preventDefault();
            video.currentTime = evento.key === "Home" ? 0 : video.duration || 0;
            pintar();
        }
    });
}

document.getElementById("boton-cerrar-visor-reels")?.addEventListener("click", cerrarVisorReels);

// Al deslizar se reproduce el reel que queda en pantalla.
document.getElementById("pista-reels-visor")?.addEventListener("scroll", () => {
    const pista = document.getElementById("pista-reels-visor");
    const pantalla = pista.firstElementChild?.clientHeight || 1;
    const indice = Math.round(pista.scrollTop / pantalla);
    pista.querySelectorAll(".pantalla-reel").forEach((panel, posicion) => {
        const video = panel.querySelector("video");
        if (posicion === indice) {
            // El reel nuevo empieza en marcha y desde el principio.
            if (video && video.paused) panel.dispatchEvent(new Event("reel-en-pantalla"));
        } else if (video) {
            video.pause();
        }
    });
});

document.getElementById("pista-reels-visor")?.addEventListener("click", async (evento) => {
    const pantalla = evento.target.closest(".pantalla-reel");
    if (!pantalla) return;
    const reelId = pantalla.dataset.reelId;

    const like = evento.target.closest(".boton-like");
    if (like) {
        try {
            const datos = await solicitarGrupo(`/api/reels/${reelId}/like`, { method: "POST" });
            like.dataset.meGusta = datos.me_gusta ? "1" : "0";
            like.classList.toggle("activo", Boolean(datos.me_gusta));
            pantalla.querySelector(".cuenta-likes").textContent = datos.likes;
        } catch (fallo) {
            console.warn("No se pudo guardar el corazón:", fallo);
        }
        return;
    }

    const comentarios = evento.target.closest(".boton-comentarios");
    if (comentarios) {
        await abrirComentariosReel(reelId, pantalla.querySelector(".cuenta-comentarios"));
        return;
    }

    const autor = evento.target.closest(".boton-autor-reel");
    if (autor) {
        cerrarVisorReels();
        abrirPerfil(autor.dataset.abrirPerfil);
    }
});

// El corazón relleno se pinta desde el atributo, para que sobreviva al scroll.
function pintarCorazonReels() {
    document.querySelectorAll("#pista-reels-visor .boton-like").forEach((boton) => {
        boton.classList.toggle("activo", boton.dataset.meGusta === "1");
    });
}
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
            const inputPublicacion = document.getElementById("archivo-publicacion");
            const files = typeof inputPublicacion.archivosFinales === "function" ? inputPublicacion.archivosFinales() : [...inputPublicacion.files];
            // Con fotos o vídeo el texto es opcional; el archivo es lo que no
            // puede faltar.
            if (!files.length) {
                throw new Error("Selecciona al menos un archivo.");
            }
            const body = new FormData();
            body.append("tipo", mode);
            body.append("visibilidad", document.getElementById("visibilidad-publicacion").value);
            body.append("texto", document.getElementById("texto-publicacion").value);
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
    const idEntrada = `entrada-comentario-${publicacionId}`;
    contenedor.innerHTML = `
        <div class="lista-comentarios-actuales">
            ${datos.comentarios.map((comentario) => `
                <p><strong style="${estiloNombre(comentario.color_nombre)}">${escapeHtml(nombreVisible(comentario.autor_id, comentario.autor_nombre))}</strong> ${escapeHtml(comentario.texto)}</p>
            `).join("") || '<p class="estado-amigos">Sé la primera persona en comentar.</p>'}
        </div>
        <form class="formulario-comentario-actual" data-publicacion="${escapeHtml(publicacionId)}">
            <input id="${escapeHtml(idEntrada)}" name="texto" type="text" maxlength="1000" placeholder="Escribe un comentario..." required>
            <button type="submit">ENVIAR</button>
        </form>
    `;

    asegurarBotonEmoji(idEntrada, "comentario-publicacion");
}

function conectarFeed(contenedor) {
    contenedor.addEventListener("click", async (evento) => {
        // El reproductor de audio se maneja por su cuenta (play, pausa y barra
        // de progreso): un clic suyo no debe abrir el estado ni la publicación
        // en la que va dentro, aunque comparta la tarjeta con data-ver-historias.
        if (evento.target.closest?.(".reproductor-audio")) return;
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
        await cargarContenidoPerfil(usuarioId);

    } catch (error) {
        perfilActual = null;
        contenidoPerfil.innerHTML = "";
        estadoPerfil.textContent = error.message;
    }
}

function renderizarPerfil(datos) {
    const perfil = datos.perfil;
    const conteos = datos.conteos || {};
    // Con poderes de desarrollador los tres datos del perfil (nombre, etiqueta
    // y descripción) se pulsan y se editan ahí mismo, sin ventanas de por
    // medio. Para el resto de cuentas son texto normal.
    const editable = perfil.soy_desarrollador === true;
    const campo = (tipo, clase, contenido, etiqueta) => editable
        ? `<button class="campo-perfil editable ${clase}" type="button" data-editar-campo="${tipo}"
                aria-label="${escapeHtml(etiqueta)}">${contenido}</button>`
        : contenido;

    const nombreMarkup = `<strong class="nombre-perfil" style="${estiloNombre(perfil.color_nombre)}">${escapeHtml(perfil.nombre)}</strong>`;

    // La etiqueta va entre el nombre y la descripción, como una pastilla.
    const etiquetaMarkup = `
        ${perfil.etiqueta
            ? `<span class="etiqueta-perfil">${escapeHtml(perfil.etiqueta)}</span>`
            : editable
                ? '<span class="etiqueta-perfil vacia">+ Etiqueta</span>'
                : ""}
    `;

    const descripcionMarkup = perfil.descripcion
        ? `<p class="descripcion-perfil">${escapeHtml(perfil.descripcion)}</p>`
        : '<p class="descripcion-perfil descripcion-perfil-vacia">Sin descripción.</p>';

    // El avatar y el nombre van juntos: centrado en tu propio perfil y a la
// izquierda en el de otra persona, como en las redes de siempre.
const clasesCabecera = ["cabecera-perfil", perfil.es_mio ? "propio" : "ajeno"]
    .concat(perfil.fondo_url ? "con-fondo" : "")
    .join(" ");

contenidoPerfil.innerHTML = `
        <div class="${clasesCabecera}"${
            perfil.fondo_url
                ? ` style="--fondo-perfil:url('/${escapeHtml(perfil.fondo_url)}')"`
                : ""
        }>
            <div class="portada-perfil" aria-hidden="true"></div>
            <div class="fila-cabecera">
                <button class="avatar-perfil con-anillo-nombre" type="button" style="--anillo-avatar:${colorDeAnillo(perfil.color_nombre)}" data-acciones-perfil aria-label="Opciones de la foto de perfil">
                    ${perfil.avatar_url
                        ? `<img src="/${escapeHtml(perfil.avatar_url)}" alt="">`
                        : '<span class="avatar-perfil-vacio"></span>'}
                </button>
                <div class="datos-cabecera">
                    ${campo("nombre", "campo-nombre-perfil", nombreMarkup, "Cambiar el nombre")}
                    ${campo("etiqueta", "campo-etiqueta-perfil", etiquetaMarkup, "Cambiar la etiqueta")}
                </div>
            </div>
            ${campo("descripcion", "campo-descripcion-perfil", descripcionMarkup, "Cambiar la descripción")}
            <p id="estado-edicion-perfil" class="estado-edicion-perfil" aria-live="polite"></p>
            ${perfil.es_mio
                ? ""
                : campoApodo(perfil)}
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

        <h3 class="titulo-publicaciones-perfil">HISTORIAS</h3>

        <div id="burbujas-historias-perfil"></div>

        <h3 class="titulo-publicaciones-perfil">Reels</h3>

        <div id="pista-reels-perfil" class="pista-reels"></div>

        <h3 class="titulo-publicaciones-perfil">Publicaciones</h3>

        <div id="lista-publicaciones-perfil" class="lista-publicaciones-perfil">
            <p class="estado-amigos">Cargando publicaciones...</p>
        </div>
    `;
}

// Historias y reels de quien se está mirando: las burbujas llevan el nombre
// de la carpeta debajo y la tira va con los reels más nuevos a la izquierda.
async function cargarContenidoPerfil(usuarioId) {
    const burbujas = document.getElementById("burbujas-historias-perfil");
    const pista = document.getElementById("pista-reels-perfil");
    if (burbujas) {
        try {
            const datos = await solicitarGrupo(`/api/usuarios/${encodeURIComponent(usuarioId)}/historias`);
            burbujas.innerHTML = (datos.historias || []).map((historia) => `
                <button class="burbuja-historia" data-historia="${escapeHtml(historia.id)}" type="button">
                    ${historia.portada
                        ? `<img src="${escapeHtml(historia.portada)}" alt="" loading="lazy">`
                        : '<span class="burbuja-historia-vacia" aria-hidden="true"></span>'}
                    <span class="nombre-historia-carpeta">${escapeHtml(historia.nombre)}</span>
                </button>
            `).join("");
        } catch {
            burbujas.innerHTML = "";
        }
    }
    if (pista) {
        try {
            const datos = await solicitarGrupo(`/api/usuarios/${encodeURIComponent(usuarioId)}/reels`);
            pintarPistaReels(pista, datos.reels || []);
        } catch {
            pista.innerHTML = "";
        }
    }
}

document.getElementById("contenido-perfil")?.addEventListener("click", (evento) => {
    // El apodo se escribe en el perfil de la persona que se está mirando.
    const campoApodo = evento.target.closest("[data-editar-apodo]");
    if (campoApodo) {
        editarApodoDePerfil(campoApodo);
        return;
    }

    // Con poderes de desarrollador, el nombre, la etiqueta y la descripción se
    // editan ahí mismo, en el sitio.
    const campoEditable = evento.target.closest("[data-editar-campo]");
    if (campoEditable) {
        editarCampoPerfil(campoEditable);
        return;
    }

    const burbuja = evento.target.closest("[data-historia]");
    if (!burbuja) return;
    const nombre = burbuja.querySelector(".nombre-historia-carpeta")?.textContent ?? "";
    abrirModalHistoria({ id: burbuja.dataset.historia, nombre }, true);
});

// El apodo es el nombre que le pongo yo a esta persona: solo lo veo yo. Se
// escribe pulsando encima y se guarda al salir del campo o con Enter.
function campoApodo(perfil) {
    const guardado = apodosPorUsuario.get(perfil.id) || "";
    const etiqueta = guardado
        ? escapeHtml(guardado)
        : '<span class="apodo-perfil vacio">+ Apodo</span>';

    return `
        <p class="bloque-apodo-perfil">
            <span class="titulo-apodo-perfil">Tu apodo para ${escapeHtml(perfil.nombre)}</span>
            <button class="campo-apodo-perfil" type="button" data-editar-apodo="${escapeHtml(perfil.id)}">
                ${etiqueta}
            </button>
            <span class="ayuda-apodo-perfil">Solo lo ves tú. Máximo 25 caracteres.</span>
        </p>
    `;
}

// ---------- APODO DE UNA PERSONA ----------

const LIMITE_APODO = 25;

async function editarApodoDePerfil(elemento) {
    if (!perfilActual?.id || !elemento) return;
    if (elemento.dataset.editando === "1") return;

    const personaId = perfilActual.id;
    const guardado = apodosPorUsuario.get(personaId) || "";

    const editor = document.createElement("input");
    editor.type = "text";
    editor.className = "editor-apodo-perfil";
    editor.value = guardado;
    editor.maxLength = LIMITE_APODO;
    editor.placeholder = "Escribe un apodo";

    elemento.dataset.editando = "1";
    elemento.replaceChildren(editor);
    editor.focus();

    let terminado = false;

    const terminar = async (guardar) => {
        if (terminado) return;
        terminado = true;
        const valor = editor.value.trim();

        if (!guardar || valor === guardado) {
            await abrirPerfil(personaId);
            return;
        }

        try {
            const respuesta = await solicitarGrupo(
                `/api/apodos/${encodeURIComponent(personaId)}`,
                { method: "PUT", body: JSON.stringify({ apodo: valor }) }
            );
            // Con el apodo vacío el servidor lo quita: se borra de la lista.
            if (respuesta.apodo?.apodo) {
                apodosPorUsuario.set(personaId, respuesta.apodo.apodo);
            } else {
                apodosPorUsuario.delete(personaId);
                nombreRealPorId.delete(personaId);
            }
            await abrirPerfil(personaId);
            cargarAmigos();
        } catch (error) {
            await abrirPerfil(personaId);
            const estado = document.getElementById("estado-edicion-perfil");
            if (estado) {
                estado.textContent = error.message;
                estado.classList.add("error-social");
            }
        }
    };

    editor.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
            evento.preventDefault();
            terminar(false);
            return;
        }
        if (evento.key === "Enter") {
            evento.preventDefault();
            terminar(true);
        }
    });

    editor.addEventListener("blur", () => terminar(true));
}

// ---------- TUS APODOS (Cuenta) ----------

const modalApodos = document.getElementById("modal-apodos");
const listaApodos = document.getElementById("lista-apodos");

function pintarListaApodos() {
    if (!listaApodos) return;
    if (apodosPorUsuario.size === 0) {
        listaApodos.innerHTML = '<p class="sin-contenido">Todavía no le has puesto un apodo a nadie.</p>';
        return;
    }

    listaApodos.innerHTML = [...apodosPorUsuario.entries()].map(([id, apodo]) => {
        const real = nombreRealPorId.get(id) || "Esta persona";
        const inicial = apodo.trim().charAt(0).toLocaleUpperCase();
        return `
            <div class="fila-apodo">
                <span class="avatar-apodo" aria-hidden="true">${escapeHtml(inicial)}</span>
                <span class="datos-apodo">
                    <strong>${escapeHtml(apodo)}</strong>
                    <small>${escapeHtml(real)}</small>
                </span>
                <button type="button" data-quitar-apodo="${escapeHtml(id)}">QUITAR</button>
            </div>
        `;
    }).join("");
}

function abrirListaApodos() {
    if (!modalApodos) return;
    modalApodos.hidden = false;
    pintarListaApodos();
}

listaApodos?.addEventListener("click", async (evento) => {
    const boton = evento.target.closest("[data-quitar-apodo]");
    if (!boton) return;
    const id = boton.dataset.quitarApodo;
    try {
        await solicitarGrupo(`/api/apodos/${encodeURIComponent(id)}`, { method: "DELETE" });
        apodosPorUsuario.delete(id);
        nombreRealPorId.delete(id);
        pintarListaApodos();
        cargarAmigos();
    } catch (error) {
        console.error("No se pudo quitar el apodo:", error);
    }
});

document.getElementById("boton-apodos-cuenta")
    ?.addEventListener("click", abrirListaApodos);

document.getElementById("boton-cerrar-apodos")
    ?.addEventListener("click", () => { if (modalApodos) modalApodos.hidden = true; });

modalApodos?.addEventListener("click", (evento) => {
    if (evento.target === modalApodos) modalApodos.hidden = true;
});

// ---------- FONDO DEL PERFIL (Cuenta) ----------

const fondoPerfil = document.getElementById("fondo-perfil-cuenta");

async function subirFondoPerfil(archivo) {
    if (!archivo) return;
    const formulario = new FormData();
    formulario.append("archivo", archivo);
    try {
        const datos = await solicitarGrupo("/api/auth/fondo", { method: "POST", body: formulario });
        if (fondoPerfil) fondoPerfil.src = `/${datos.fondo_url}`;
        const aviso = document.getElementById("estado-cuenta");
        if (aviso) aviso.textContent = "Fondo del perfil guardado.";
        await cargarCuenta();
    } catch (error) {
        const aviso = document.getElementById("estado-cuenta");
        if (aviso) aviso.textContent = error.message;
    }
}

async function quitarFondoPerfil() {
    try {
        await solicitarGrupo("/api/auth/fondo", { method: "DELETE" });
        if (fondoPerfil) fondoPerfil.src = "";
        const aviso = document.getElementById("estado-cuenta");
        if (aviso) aviso.textContent = "Fondo del perfil quitado.";
        await cargarCuenta();
    } catch (error) {
        const aviso = document.getElementById("estado-cuenta");
        if (aviso) aviso.textContent = error.message;
    }
}

document.getElementById("entrada-fondo-cuenta")
    ?.addEventListener("change", (evento) => {
        subirFondoPerfil(evento.target.files?.[0]);
        evento.target.value = "";
    });

document.getElementById("boton-quitar-fondo")
    ?.addEventListener("click", async () => {
        if (modalOpcionesFoto) modalOpcionesFoto.hidden = true;
        await quitarFondoPerfil();
    });

// Escribe encima del dato que se ha pulsado y lo guarda al terminar. Se
// guarda con Enter (o al salir del campo) y se descarta con Escape.
const LIMITES_CAMPO_PERFIL = { nombre: 25, etiqueta: 24, descripcion: 500 };

function editarCampoPerfil(elemento) {
    if (!soyDesarrollador || !perfilActual?.id) return;
    if (elemento.dataset.editando === "1") return;

    const tipo = elemento.dataset.editarCampo;
    const perfil = perfilActual;
    const valorActual = tipo === "nombre"
        ? perfil.nombre || ""
        : tipo === "etiqueta"
            ? perfil.etiqueta || ""
            : perfil.descripcion || "";

    const editor = document.createElement(tipo === "descripcion" ? "textarea" : "input");
    editor.type = "text";
    editor.className = "editor-campo-perfil";
    editor.value = valorActual;
    editor.maxLength = LIMITES_CAMPO_PERFIL[tipo] ?? 500;
    if (tipo === "descripcion") editor.rows = 3;

    elemento.dataset.editando = "1";
    elemento.replaceChildren(editor);

    editor.focus();
    if (tipo !== "descripcion") editor.select();

    let terminado = false;

    const mostrarEstado = (texto, esError) => {
        const estado = document.getElementById("estado-edicion-perfil");
        if (!estado) return;
        estado.textContent = texto;
        estado.classList.toggle("error-social", esError === true);
    };

    const terminar = async (guardar) => {
        if (terminado) return;
        terminado = true;
        const valor = editor.value.trim();
        // Sin cambios (o si se cancela) solo se vuelve a pintar el dato.
        if (!guardar || valor === valorActual) {
            await abrirPerfil(perfil.id);
            return;
        }
        try {
            await solicitarGrupo(
                `/api/desarrollador/usuarios/${encodeURIComponent(perfil.id)}`,
                { method: "PUT", body: JSON.stringify({ [tipo]: valor }) }
            );
            await abrirPerfil(perfil.id);
        } catch (error) {
            // Si el servidor lo rechaza (por ejemplo, nombre repetido) el
            // campo vuelve a su valor original y se explica el motivo.
            await abrirPerfil(perfil.id);
            mostrarEstado(error.message, true);
        }
    };

    editor.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape") {
            evento.preventDefault();
            terminar(false);
            return;
        }
        if (evento.key === "Enter" && (tipo !== "descripcion" || evento.ctrlKey || evento.metaKey)) {
            evento.preventDefault();
            terminar(true);
        }
    });

    editor.addEventListener("blur", () => terminar(true));
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
                <span class="amigo-perfil-nombre" style="${estiloNombre(amigo.color_nombre)}">${escapeHtml(nombreVisible(amigo.id, amigo.nombre))}</span>
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
   PODERES DE DESARROLLADOR
   Solo la cuenta marcada en la base de datos (la que se llama "Iván J.") tiene
   estas herramientas:

   - Pulsación larga sobre cualquier publicación, reel, estado o historia
     para borrarla, aunque sea de otra persona.
   - Editar el nombre, la descripción o la etiqueta de cualquier perfil.

   Si la cuenta no las tiene, no se enseña nada de esto.
   ============================== */

let soyDesarrollador = false;

function marcarEstadoDesarrollador(activo) {
    soyDesarrollador = activo === true;
}

async function comprobarPoderesDesarrollador() {
    try {
        const datos = await solicitarGrupo("/api/desarrollador/estado");
        marcarEstadoDesarrollador(datos.es_desarrollador);
    } catch {
        marcarEstadoDesarrollador(false);
    }
}

/* ---------- Borrado con pulsación larga ---------- */

// Se escucha en todo el documento: el contenido se pinta en sitios muy
// distintos (feed, perfil, tiras de reels, burbujas de historias) y así no hay
// que engancharlo tarjeta por tarjeta.
const TIEMPO_PULSACION_LARGA = 550;
const MARGEN_MOVIMIENTO_PULSACION = 12;

let pulsacionLarga = null;
let pulsacionConsumida = false;

function contenidoPulsable(elemento) {
    if (!elemento?.closest) return null;

    const publicacion = elemento.closest("[data-publicacion]");
    if (publicacion?.dataset.publicacion) {
        return { tipo: "publicacion", id: publicacion.dataset.publicacion };
    }

    const reel = elemento.closest("[data-reel-id]");
    if (reel?.dataset.reelId) {
        return { tipo: "reel", id: reel.dataset.reelId };
    }

    const historia = elemento.closest("[data-historia]");
    if (historia?.dataset.historia) {
        return { tipo: "historia", id: historia.dataset.historia };
    }

    const estado = elemento.closest("[data-eliminar-estado]");
    if (estado?.dataset.eliminarEstado) {
        return { tipo: "estado", id: estado.dataset.eliminarEstado };
    }

    // Dentro del visor de historias el estado actual no lleva atributo: se
    // saca del propio visor.
    if (!document.getElementById("visor-historias-pantalla")?.hidden) {
        const actual = secuenciaHistoriaActual[indiceHistoriaActual];
        if (actual?.id) return { tipo: "estado", id: actual.id };
    }

    return null;
}

function terminarPulsacionLarga() {
    if (!pulsacionLarga) return;
    clearTimeout(pulsacionLarga.temporizador);
    pulsacionLarga = null;
}
document.addEventListener("pointerdown", (evento) => {
    // Cada pulsación nueva reinicia el "clic tragado" del anterior.
    pulsacionConsumida = false;
    if (!soyDesarrollador) return;
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    // Sobre campos de texto no se hace nada: ahí se está escribiendo.
    if (evento.target.closest("input, textarea, select, [contenteditable]")) return;

    const objetivo = contenidoPulsable(evento.target);
    if (!objetivo) return;

    terminarPulsacionLarga();
    pulsacionLarga = {
        temporizador: setTimeout(() => {
            const contenido = pulsacionLarga?.objetivo;
            terminarPulsacionLarga();
            if (!contenido) return;
            // El clic que viene tras la pulsación no debe abrir nada.
            pulsacionConsumida = true;
            // Si al final no llega ningún clic, la marca se cae sola para no
            // tragarse el siguiente.
            setTimeout(() => { pulsacionConsumida = false; }, 1200);
            if (navigator.vibrate) navigator.vibrate(20);
            borrarComoDesarrollador(contenido.tipo, contenido.id);
        }, TIEMPO_PULSACION_LARGA),
        objetivo,
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        idPuntero: evento.pointerId
    };
}, true);

document.addEventListener("pointermove", (evento) => {
    if (!pulsacionLarga || evento.pointerId !== pulsacionLarga.idPuntero) return;
    const movidoX = Math.abs(evento.clientX - pulsacionLarga.inicioX);
    const movidoY = Math.abs(evento.clientY - pulsacionLarga.inicioY);
    // En cuanto se mueve es un deslizar o un scroll, no una pulsación larga.
    if (movidoX > MARGEN_MOVIMIENTO_PULSACION || movidoY > MARGEN_MOVIMIENTO_PULSACION) {
        terminarPulsacionLarga();
    }
}, true);

for (const eventoFin of ["pointerup", "pointercancel", "pointerleave"]) {
    document.addEventListener(eventoFin, terminarPulsacionLarga, true);
}

// Deslizar la página o cambiar de ventana cancela la pulsación.
document.addEventListener("scroll", terminarPulsacionLarga, true);
window.addEventListener("blur", terminarPulsacionLarga);

document.addEventListener("click", (evento) => {
    if (!pulsacionConsumida) return;
    pulsacionConsumida = false;
    evento.stopPropagation();
    evento.preventDefault();
}, true);

const TEXTOS_BORRADO_DESARROLLADOR = {
    publicacion: "¿Eliminar esta publicación?",
    reel: "¿Eliminar este reel?",
    historia: "¿Eliminar esta historia y todo lo que tiene dentro?",
    estado: "¿Eliminar este estado?"
};

async function borrarComoDesarrollador(tipo, id) {
    const pregunta = TEXTOS_BORRADO_DESARROLLADOR[tipo];
    if (!pregunta || !confirm(pregunta)) return;

    const rutas = {
        publicacion: `/api/publicaciones/${encodeURIComponent(id)}`,
        reel: `/api/reels/${encodeURIComponent(id)}`,
        historia: `/api/historias/${encodeURIComponent(id)}`,
        estado: `/api/estados/${encodeURIComponent(id)}`
    };

    try {
        await solicitarGrupo(rutas[tipo], { method: "DELETE" });
    } catch (error) {
        console.error("No se pudo borrar:", error);
        alert(error.message || "No se pudo borrar.");
        return;
    }

    await refrescarTrasBorrar(tipo, id);
}

async function refrescarTrasBorrar(tipo, id) {
    if (tipo === "reel") {
        reelsVisor = (reelsVisor || []).filter((reel) => reel.id !== id);
        document.querySelectorAll(`[data-reel-id="${CSS.escape(id)}"]`).forEach((elemento) => {
            if (elemento.closest(".pista-reels-visor")) elemento.closest(".pantalla-reel")?.remove();
            else elemento.remove();
        });
        const visor = document.getElementById("visor-reels");
        if (visor && !visor.hidden) {
            if (reelsVisor.length) abrirVisorReels(reelsVisor, reelsVisor[0].id);
            else visor.hidden = true;
        }
        return;
    }

    if (tipo === "historia") {
        document.querySelectorAll(`[data-historia="${CSS.escape(id)}"]`).forEach((elemento) => elemento.remove());
        return;
    }

    // Publicaciones y estados se recargan según dónde se estaba mirando.
    const visorHistorias = document.getElementById("visor-historias-pantalla");
    if (tipo === "estado" && visorHistorias && !visorHistorias.hidden) {
        cerrarVisorHistorias();
    }

    const modal = document.getElementById("modal-perfil");
    if (modal && !modal.hidden && perfilActual?.id) {
        await abrirPerfil(perfilActual.id);
        return;
    }

    await cargarContenidoInicio();
}
/* ==============================
   INICIAR
   ============================== */

observarCapas();

// Los botones de emojis viven en cuatro sitios distintos: dos campos fijos y
// dos formularios que se dibujan al abrir. Se preparan una vez aqui.
document.addEventListener("click", manejarClicSelector);
// Al desplazarse solo se cierra si el botón que lo abrió se sale de la
// pantalla. Antes se cerraba con cualquier scroll y como el evento se escuchaba
// en fase de captura, deslizar la propia lista de emojis lo cerraba.
function comprobarSiElSelectorSigueVisible(evento) {
    const panel = document.getElementById("selector-medio");
    if (!panel || panel.hidden) return;

    // Deslizar dentro del panel es justo lo que se quiere hacer con la lista.
    if (evento?.target && panel.contains(evento.target)) return;

    const ancla = destinoSelector?.ancla;
    if (!ancla || !ancla.isConnected) {
        cerrarSelector();
        return;
    }

    const caja = ancla.getBoundingClientRect();
    if (caja.top < 0 || caja.bottom > window.innerHeight) cerrarSelector();
}

document.addEventListener("scroll", comprobarSiElSelectorSigueVisible, true);

asegurarBotonEmoji("entrada-mensaje", "chat");
asegurarBotonEmoji("entrada-mensaje-servidor", "servidor");
asegurarBotonEmoji("texto-comentario-reel", "comentario-reel");

// Modal de ubicación: los chips fijan la duración y el deslizador la ajusta
// fina entre 15 minutos y 8 horas.
const deslizadorUbicacion = document.getElementById("deslizador-ubicacion");
const textoDuracion = document.getElementById("texto-duracion");

function reflejarDuracion() {
    const minutos = Number(deslizadorUbicacion?.value ?? 60);
    if (textoDuracion) textoDuracion.textContent = textoDuracionUbicacion(minutos);

    document.querySelectorAll(".chips-duracion button").forEach((chip) => {
        chip.classList.toggle("activa", Number(chip.dataset.minutos) === minutos);
    });

    return minutos;
}

deslizadorUbicacion?.addEventListener("input", reflejarDuracion);

document.querySelectorAll(".chips-duracion button").forEach((chip) => {
    chip.addEventListener("click", () => {
        if (deslizadorUbicacion) deslizadorUbicacion.value = chip.dataset.minutos;
        reflejarDuracion();
    });
});

document.getElementById("boton-cerrar-modal-ubicacion")?.addEventListener("click", cerrarModalUbicacion);
document.getElementById("boton-enviar-ubicacion")?.addEventListener("click", async () => {
    if (!enviarUbicacionPendiente) return;
    const compartir = enviarUbicacionPendiente;
    await compartir(reflejarDuracion());
});

document.getElementById("boton-parar-ubicacion")?.addEventListener("click", pararCompartido);

reflejarDuracion();

comprobarSesion();
