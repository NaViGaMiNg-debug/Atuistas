// ATUISTS - LOGICA PRINCIPAL DE LA APLICACION

// =============================
// 1. ESTADO GLOBAL
// =============================

let perfilActual = null;
let usuarioActual = null;
let enviandoMensaje = false;
let ultimaCantidadMensajes = 0;

// =============================
// 2. ESTADO DE SELECCION (CHAT DE USUARIO)
// =============================

// IDs de los mensajes seleccionados por el usuario en el chat privado.
// Usa un Set para que cada ID aparezca una sola vez.
let mensajesSeleccionadosChat = new Set();

// Datos completos de los mensajes seleccionados (id -> mensaje)
// Esto permite reenviar o borrar un mensaje sin tener que
// volver a solicitar el mensaje completo por su id.
const datosMensajesSeleccionadosChat = new Map();

// Estado de la seleccion
let seleccionandoChat = false;
let seleccionIniciadaEn = null;
let seleccionFinalEn = null;

// =============================
// 3. ESTADO DE LAS PUBLICACIONES/ESTADO
// =============================

// Secuencia de estados (perfil -> array de estados) guardados para
// poder navegar por ellos con el carrusel de la pantalla de perfil
const secuenciasEstadosFeed = new Map();

// Claves ordenadas de los perfiles que tienen estados
const ordenClavesEstadosFeed = [];

// =============================
// 4. COMUNICACION CON EL SERVIDOR
// =============================

async function solicitar(ruta, opciones = {}) {
    const respuesta = await fetch(`/api${ruta}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opciones,
    });
    if (!respuesta.ok) {
        let mensaje = `Error ${respuesta.status}`;
        try {
            const body = await respuesta.json();
            if (body && body.message) mensaje = body.message;
        } catch (_) {
            // body no es JSON
        }
        throw new Error(mensaje);
    }
    return respuesta.json();
}

function getHeaders(opciones = {}) {
    const headers = new Headers(opciones.headers || {});
    if (usuarioActual && usuarioActual.token) {
        headers.set('Authorization', `Bearer ${usuarioActual.token}`);
    }
    return { headers, ...opciones };

// =============================
// 5. SELECCION DE MENSAJES (CHAT DE USUARIO)
// =============================

// Al marca un mensaje durante un tiempo largo, se resalta
function iniciarSeleccionChat() {
    seleccionandoChat = true;
    seleccionIniciadaEn = null;
    seleccionFinalEn = null;
    document.addEventListener('touchmove', detenerSeleccionChat, { passive: true, once: true });
}

function detenerSeleccionChat() {
    if (seleccionandoChat) {
        finalizarSeleccionChat();
    }
}

function finalizarSeleccionChat() {
    seleccionandoChat = false;
    seleccionIniciadaEn = null;
    seleccionFinalEn = null;
    document.removeEventListener('touchmove', detenerSeleccionChat);
}

// Marca/desmarca un mensaje segun se haga clic
function toggleSeleccionChat(mensajeId, evento) {
    if (!seleccionandoChat) return;

    const esSeñalado = evento && evento.shiftKey;
    const yaSeleccionado = mensajesSeleccionadosChat.has(mensajeId);

    if (esSeñalado && seleccionIniciadaEn !== null) {
        // Señalado con Shift: marca todos entre el primero y este
        const todos = $$('.mensaje-chat');
        const idxPrimero = todos.findIndex(function (el) {
            return el.getAttribute('data-mensaje-id') === String(seleccionIniciadaEn);
        });
        const idxUltimo = todos.findIndex(function (el) {
            return el.getAttribute('data-mensaje-id') === String(mensajeId);
        });
        const min = Math.min(idxPrimero, idxUltimo);
        const max = Math.max(idxPrimero, idxUltimo);

        for (let i = min; i <= max; i += 1) {
            const id = parseInt(todos[i].getAttribute('data-mensaje-id'), 10);
            if (!mensajesSeleccionadosChat.has(id)) {
                mensajesSeleccionadosChat.add(id);
                const datos = mensajes.find(function (m) { return m.id === id; });
                if (datos) {
                    datosMensajesSeleccionadosChat.set(id, datos);
                }
            }
        }
    } else {
        if (yaSeleccionado) {
            mensajesSeleccionadosChat.delete(mensajeId);
            datosMensajesSeleccionadosChat.delete(mensajeId);
        } else {
            mensajesSeleccionadosChat.add(mensajeId);
            const datos = mensajes.find(function (m) { return m.id === mensajeId; });
            if (datos) {
                datosMensajesSeleccionadosChat.set(mensajeId, datos);
            }
        }
    }

    actualizarBarraSeleccion();
}

function actualizarBarraSeleccion() {
    const contador = $('#contador-seleccion-chat');
    const botonCancelar = $('#boton-cancelar-seleccion-chat');
    const botonReenviar = $('#boton-reenviar-seleccion-chat');
    const botonBorrar = $('#boton-borrar-seleccion-chat');

    const total = mensajesSeleccionadosChat.size;

    if (total === 0) {
        contador.textContent = '';
        botonCancelar.hidden = true;
        botonReenviar.hidden = true;
        botonBorrar.hidden = true;
        return;
    }

    contador.textContent = total + ' mensaje' + (total > 1 ? 's' : '') + ' seleccion' + (total > 1 ? 'es' : '');
    botonCancelar.hidden = false;
    botonReenviar.hidden = false;
    botonBorrar.hidden = false;
}

function cancelarSeleccionChat() {
    mensajesSeleccionadosChat.clear();
    datosMensajesSeleccionadosChat.clear();
    actualizarBarraSeleccion();
}

async function reenviarSeleccion() {
    if (mensajesSeleccionadosChat.size === 0) return;

    const ids = Array.from(mensajesSeleccionadosChat);
    const datos = Array.from(datosMensajesSeleccionadosChat.values());

    try {
        const response = await fetch('/api/mensajes/reenviar', {
            method: 'POST',
            headers: getHeaders().headers,
            body: JSON.stringify({ ids }),
        });

        if (response.ok) {
            for (const id of ids) {
                mensajesSeleccionadosChat.delete(id);
                datosMensajesSeleccionadosChat.delete(id);
            }
            actualizarBarraSeleccion();
            mostrarNotificacion('Mensajes reenviados', 'success');
        } else {
            const error = await response.json();
            mostrarNotificacion(error.message || 'No se pudieron reenviar los mensajes', 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error de conexión al reenviar', 'error');
    }
}

async function borrarSeleccion() {
    if (mensajesSeleccionadosChat.size === 0) return;

    if (!confirm('¿Está seguro de que quiere borrar los mensajes seleccionados?')) {
        return;
    }

    const ids = Array.from(mensajesSeleccionadosChat);

// =============================
// 6. VISOR DE FOTOS (FULLSCREEN)
// =============================

let visorAbierto = false;
let fotoActual = 0;
let fotos = [];
let zoom = 1;
let panX = 0;
let panY = 0;
let escalaInicial = 1;

function abrirVisorFotos(indices) {
    if (!Array.isArray(indices) || indices.length === 0) return;
    fotoActual = indices[0];
    fotos = indices;
    zoom = 1;
    panX = 0;
    panY = 0;
    visorAbierto = true;

    const modal = $('#modal-fotos-chat');
    const contenedor = $('#foto-chat-grande');
    const indicador = $('#foto-chat-indice');

    modal.hidden = false;
    modal.classList.add('visibilidad-foto');
    contenedor.classList.add('foto-grande-reactiva');

    indicador.textContent = 'Foto ' + (fotoActual + 1) + ' de ' + fotos.length;

    const url = '/api/medios/' + fotos[fotoActual];
    contenedor.style.backgroundImage = 'url(' + url + ')';
    contenedor.style.backgroundSize = 'cover';
    contenedor.style.backgroundPosition = 'center';

    aplicarPanZoom();
    iniciarDrag();
}

function cerrarVisorFotos() {
    const modal = $('#modal-fotos-chat');
    const contenedor = $('#foto-chat-grande');

    modal.hidden = true;
    visorAbierto = false;

    modal.classList.remove('visibilidad-foto');
    contenedor.classList.remove('foto-grande-reactiva');

    contenedor.style.backgroundImage = '';
    contenedor.style.backgroundSize = '';
    contenedor.style.backgroundPosition = '';

    document.removeEventListener('touchmove', moverImagen, { passive: true });
    document.removeEventListener('touchend', finDrag, { passive: true });
    document.removeEventListener('touchcancel', finDrag, { passive: true });
}

function aplicarPanZoom() {
    const contenedor = $('#foto-chat-grande');
    contenedor.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
}

function moverImagen(evento) {
    if (evento.touches.length === 1 && zoom > 0.5) {
        const toque = evento.touches[0];
        const movimientoX = toque.clientX - esInicialX;
        const movimientoY = toque.clientY - esInicialY;

        if (zoom === escalaInicial) {
            panX = movimientoX;
            panY = movimientoY;
        } else {
            panX = movimientoX * (zoom / escalaInicial);
            panY = movimientoY * (zoom / escalaInicial);
        }

        aplicarPanZoom();
    }
}

let arrastrando = false;
let esInicialX = 0;
let esInicialY = 0;

function iniciarDrag() {
    const contenedor = $('#foto-chat-grande');

    contenedor.addEventListener('touchstart', function (evento) {
        if (evento.touches.length === 1) {
            arrastrando = true;
            esInicialX = evento.touches[0].clientX;
            esInicialY = evento.touches[0].clientY;
            escalaInicial = zoom;
        }
        evento.preventDefault();
    }, { passive: true });

    document.addEventListener('touchmove', moverImagen, { passive: true });
    document.addEventListener('touchend', finDrag, { passive: true });
    document.addEventListener('touchcancel', finDrag, { passive: true });
}


// =============================
// 7. BARRA DE ESTADO (LIKE Y COMENTARIOS)
// =============================

async function alternarLikeEstado(publicacionId) {
    if (!usuarioActual) {
        mostrarNotificacion('Debes iniciar sesión para dar like', 'error');
        return;
    }

    const estaLikedo = publicacionActual?.likes.includes(usuarioActual.id);

    try {
        const response = await fetch('/api/publicaciones/' + publicacionId + '/likes', {
            method: 'POST',
            headers: getHeaders().headers,
            body: JSON.stringify({ usuario_id: usuarioActual.id }),
        });

        if (response.ok) {
            const botonLike = document.querySelector('.boton-like-estado');
            if (botonLike) {
                botonLike.classList.toggle('activo', !estaLikedo);
            }

            if (estaLikedo) {
                const response2 = await fetch('/api/publicaciones/' + publicacionId + '/likes/' + usuarioActual.id, {
                    method: 'DELETE',
                    headers: getHeaders().headers,
                });
                if (response2.ok) {
                    const contador = document.querySelector('.contador-likes-estado');
                    if (contador) {
                        contador.textContent = parseInt(contador.textContent) - 1;
                    }
                }
            } else {
                const contador = document.querySelector('.contador-likes-estado');
                if (contador) {
                    contador.textContent = parseInt(contador.textContent) + 1;
                }
            }
            return true;
        } else {
            const error = await response.json();
            mostrarNotificacion(error.message || 'No se pudo actualizar el like', 'error');
            return false;
        }
    } catch (error) {
        mostrarNotificacion('Error de conexión al actualizar el like', 'error');
        return false;
    }
}

async function enviarComentario(publicacionId, comentario) {
    if (!usuarioActual) {
        mostrarNotificacion('Debes iniciar sesión para comentar', 'error');
        return;
    }

    if (!comentario.trim()) {
        mostrarNotificacion('Escribe un comentario', 'error');
        return;
    }

    try {
        const response = await fetch('/api/publicaciones/' + publicacionId + '/comentarios', {
            method: 'POST',
            headers: getHeaders().headers,
            body: JSON.stringify({
                usuario_id: usuarioActual.id,
                texto: comentario.trim(),
            }),
        });

        if (response.ok) {
            cargarComentarios(publicacionId);
            return true;
        } else {
            const error = await response.json();
            mostrarNotificacion(error.message || 'No se pudo enviar el comentario', 'error');
            return false;
        }
    } catch (error) {
        mostrarNotificacion('Error de conexión al enviar comentario', 'error');
        return false;
    }
}

function cargarComentarios(publicacionId) {
    if (!publicacionId) return;
    // Aquí se cargarían los comentarios desde el servidor
}


// =============================
// 8. NAVEGACION POR EL CARRUSEL DE ESTADOS
// =============================

// Claves de los perfiles que tienen estados (ordenadas por la fecha de creacion)
const clavesOrdenadas = [];

// Secuencia actual del carrusel
let secuenciaActual = null;

function navegarEstados(proxima) {
    if (!secuenciasEstadosFeed.size) return;

    const claves = Array.from(secuenciasEstadosFeed.keys());
    const indiceActual = claves.indexOf(secuenciaActual);
    if (indiceActual === -1) {
        secuenciaActual = claves[0];
        renderizarEstados(secuenciaActual);
        return;
    }

    let nuevoIndice;
    if (proxima) {
        nuevoIndice = (indiceActual + 1) % claves.length;
    } else {
        nuevoIndice = (indiceActual - 1 + claves.length) % claves.length;
    }

    secuenciaActual = claves[nuevoIndice];
    renderizarEstados(secuenciaActual);
}

function renderizarEstados(clave) {
    // Llamada al renderizador de estados (a definir)
    // Esto se debe conectar con la UI de las secciones
}

// =============================
// 9. INICIALIZACION Y EVENTOS
// =============================

document.addEventListener('DOMContentLoaded', function () {
    // Enlace de la barra de estado
    const botonLikeEstado = document.getElementById('boton-like-estado');
    if (botonLikeEstado) {
        botonLikeEstado.addEventListener('click', () => {
            if (publicacionActual) {
                alternarLikeEstado(publicacionActual.id);
            }
        });
    }

    const botonVerComentariosEstado = document.getElementById('boton-ver-comentarios-estado');
    if (botonVerComentariosEstado) {
        botonVerComentariosEstado.addEventListener('click', () => {
            if (publicacionActual) {
                abrirComentariosEstado(publicacionActual.id);
            }
        });
    }

    const entradaComentario = document.getElementById('entrada-comentario-estado');
    const barraComentarioEstado = document.getElementById('barra-comentario-estado');
    const formularioComentarioEstado = document.getElementById('formulario-comentario-estado');

    if (entradaComentario && formularioComentarioEstado) {
        formularioComentarioEstado.addEventListener('submit', function (event) {
            event.preventDefault();
            if (publicacionActual) {
                enviarComentario(publicacionActual.id, entradaComentario.value);
            }
            entradaComentario.value = '';
        });
    } else if (barraComentarioEstado && entradaComentario) {
        barraComentarioEstado.addEventListener('submit', function (event) {
            event.preventDefault();
            if (publicacionActual) {
                enviarComentario(publicacionActual.id, entradaComentario.value);
            }
            entradaComentario.value = '';
        });
    }

    // Listener para cerrar los comentarios al hacer clic fuera
    document.addEventListener('click', function (event) {
        if (event.target.id !== 'boton-ver-comentarios-estado' &&
            event.target.id !== 'boton-like-estado' &&
            event.target.closest('#barra-comentario-estado') === null &&
            event.target.closest('#lista-comentarios-estado') === null &&
            event.target.closest('#formulario-comentario-estado') === null) {
            cerrarComentariosEstado();
        }
    });
});
function abrirComentariosEstado(publicacionId) {
    const comentarios = document.getElementById('lista-comentarios-estado');
    if (!comentarios) return;
    comentarios.hidden = false;
    comentarios.classList.add('aparecer');
}

function cerrarComentariosEstado() {
    const comentarios = document.getElementById('lista-comentarios-estado');
    if (!comentarios) return;
    comentarios.hidden = true;
    comentarios.classList.remove('aparecer');
}
function finDrag() {
    arrastrando = false;
}

function siguienteFoto() {
    if (fotos.length === 0) return;
    fotoActual = (fotoActual + 1) % fotos.length;
    actualizarFoto();
}

function anteriorFoto() {
    if (fotos.length === 0) return;
    fotoActual = (fotoActual - 1 + fotos.length) % fotos.length;
    actualizarFoto();
}

function actualizarFoto() {
    const contenedor = $('#foto-chat-grande');
    const indicador = $('#foto-chat-indice');

    const url = '/api/medios/' + fotos[fotoActual];
    contenedor.style.backgroundImage = 'url(' + url + ')';
    contenedor.style.backgroundSize = 'cover';
    contenedor.style.backgroundPosition = 'center';
    indicador.textContent = 'Foto ' + (fotoActual + 1) + ' de ' + fotos.length;
}

    try {
        const response = await fetch('/api/mensajes/borrar', {
            method: 'POST',
            headers: getHeaders().headers,
            body: JSON.stringify({ ids }),
        });

        if (response.ok) {
            for (const id of ids) {
                mensajesSeleccionadosChat.delete(id);
                datosMensajesSeleccionadosChat.delete(id);
            }
            actualizarBarraSeleccion();
            mostrarNotificacion('Mensajes borrados', 'success');
        } else {
            const error = await response.json();
            mostrarNotificacion(error.message || 'No se pudieron borrar los mensajes', 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error de conexión al borrar', 'error');
    }
}
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
}

function $(selector, context = document) {
    return context.querySelector(selector);
}

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

