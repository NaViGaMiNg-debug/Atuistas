// ========================================
// SUPABASE
// ========================================

const SUPABASE_URL = "https://kqkdhbjirkdhhpajxnfq.supabase.co";
const SUPABASE_KEY = "sb_publishable_fpz6bYnN8G2QHgJXfTAhoQ_GOSVnFos";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

console.log("Supabase conectado");


// ========================================
// ELEMENTOS
// ========================================

// Pantallas de acceso
const pantallaAcceso = document.getElementById("pantalla-acceso");
const pantallaPrincipal = document.getElementById("pantalla-principal");
const pantallaRegistro = document.getElementById("pantalla-registro");

// Aplicación
const appPrincipal = document.getElementById("app-principal");

// Registro
const botonRegistro = document.getElementById("boton-registro");
const nombreRegistro = document.getElementById("nombre-registro");

const botonConfirmarRegistro =
    document.getElementById("boton-confirmar-registro");

const codigoRegistro =
    document.getElementById("codigo-registro");

const codigoRegistroRepetir =
    document.getElementById("codigo-registro-repetir");

const botonVolverRegistro =
    document.getElementById("boton-volver-registro");

// Login
const botonLogin = document.getElementById("boton-login");
const codigoLogin = document.getElementById("codigo-login");


// ========================================
// VARIABLES GLOBALES
// ========================================

let usuarioActualId = null;
let colorNombreActual = "#ffffff";
let canalChatPrivado = null;

let usuarioPrivadoActual = null;
let chatPrivadoActual = null;

// Actualización automática de respaldo
let intervaloMensajesPrivados = null;

// Evitar varias cargas simultáneas
let cargandoMensajesPrivados = false;


// ========================================
// ELEMENTOS — NAVEGACIÓN
// ========================================

// Navegación PC
const botonesNav =
    document.querySelectorAll(".menu-lateral .boton-nav");

// Navegación móvil
const botonesNavMovil =
    document.querySelectorAll(".boton-nav-movil");

// Secciones
const seccionesApp =
    document.querySelectorAll(".seccion-app");

// Menú móvil
const menuMovil =
    document.getElementById("menu-movil");

const botonVolverMenu =
    document.getElementById("boton-volver-menu");

const tituloSeccionMovil =
    document.getElementById("titulo-seccion-movil");

const botonPerfil =
    document.getElementById("boton-perfil");

const botonPerfilMovil =
    document.getElementById("boton-perfil-movil");


// ========================================
// ELEMENTOS — PERFIL
// ========================================

const avatarPerfil =
    document.getElementById("avatar-perfil");

const inputAvatar =
    document.getElementById("input-avatar");

const colorNombre =
    document.getElementById("color-nombre");

const nombrePerfil =
    document.getElementById("nombre-perfil");

const descripcionPerfil =
    document.getElementById("descripcion-perfil");

const botonCerrarSesion =
    document.getElementById("boton-cerrar-sesion");


// ========================================
// ELEMENTOS — CHATS PRIVADOS
// ========================================

const privadosLista =
    document.getElementById("privados-lista");

const listaUsuariosPrivados =
    document.getElementById("lista-usuarios-privados");

const privadoChat =
    document.getElementById("privado-chat");

const privadoAvatar =
    document.getElementById("privado-avatar");

const privadoNombre =
    document.getElementById("privado-nombre");

const privadoEstado =
    document.getElementById("privado-estado");

const privadoMensajes =
    document.getElementById("privado-mensajes");

const privadoInput =
    document.getElementById("privado-input");

const botonEnviarPrivado =
    document.getElementById("boton-enviar-privado");

const botonVolverPrivados =
    document.getElementById("boton-volver-privados");


// ========================================
// NOMBRES DE LAS SECCIONES
// ========================================

const nombresSecciones = {
    chat: "Chat",
    chismes: "Chismes",
    privados: "Privados",
    quedadas: "Quedadas",
    perfil: "Mi perfil"
};


// ========================================
// INICIAR SESIÓN
// ========================================

botonLogin.addEventListener(
    "click",
    async () => {

        const codigo =
            codigoLogin.value.trim();

        if (!codigo) {
            alert("Escribe tu código.");
            return;
        }

        botonLogin.disabled = true;

        const {
            data: usuarioId,
            error
        } = await supabaseClient.rpc(
            "iniciar_sesion",
            {
                p_codigo: codigo
            }
        );

        if (error) {

            console.error(
                "Error al iniciar sesión:",
                error
            );

            botonLogin.disabled = false;

            alert("Código incorrecto.");

            return;
        }

        console.log(
            "Usuario identificado:",
            usuarioId
        );


        // ====================================
        // CREAR SESIÓN DEL NAVEGADOR
        // ====================================

        const navegadorId =
            crypto.randomUUID();

        const {
            data: token,
            error: errorSesion
        } = await supabaseClient.rpc(
            "vincular_navegador",
            {
                p_usuario_id: usuarioId,
                p_identificador: navegadorId
            }
        );

        if (errorSesion) {

            console.error(
                "Error al crear la sesión:",
                errorSesion
            );

            botonLogin.disabled = false;

            alert(
                "El código es correcto, pero no se pudo iniciar la sesión."
            );

            return;
        }


        // Guardar sesión
        localStorage.setItem(
            "navegador_id",
            navegadorId
        );

        localStorage.setItem(
            "sesion_token",
            token
        );


        console.log(
            "Sesión iniciada correctamente."
        );


        botonLogin.disabled = false;


        // Usuario actual
        usuarioActualId = usuarioId;


        // Entrar
        mostrarAplicacion();


        // Cargar perfil
        cargarPerfil(usuarioId);


        // Limpiar código
        codigoLogin.value = "";

    }
);


// ========================================
// REGISTRO — PRIMER PASO
// ========================================

botonRegistro.addEventListener(
    "click",
    () => {

        const nombre =
            nombreRegistro.value.trim();

        if (!nombre) {

            alert("Escribe tu nombre.");

            return;
        }

        pantallaPrincipal.style.display = "none";
        pantallaRegistro.style.display = "block";

    }
);


// ========================================
// REGISTRO — VOLVER
// ========================================

botonVolverRegistro.addEventListener(
    "click",
    () => {

        pantallaRegistro.style.display = "none";
        pantallaPrincipal.style.display = "block";

    }
);


// ========================================
// REGISTRO — CREAR CUENTA
// ========================================

botonConfirmarRegistro.addEventListener(
    "click",
    async () => {

        const nombre =
            nombreRegistro.value.trim();

        const codigo =
            codigoRegistro.value;

        const codigoRepetido =
            codigoRegistroRepetir.value;


        if (!nombre) {

            alert("Escribe tu nombre.");

            return;
        }


        if (codigo.length < 4) {

            alert(
                "El código debe tener al menos 4 caracteres."
            );

            return;
        }


        if (codigo !== codigoRepetido) {

            alert(
                "Los códigos no coinciden."
            );

            return;
        }


        botonConfirmarRegistro.disabled = true;


        const {
            data,
            error
        } = await supabaseClient.rpc(
            "crear_usuario",
            {
                p_nombre: nombre,
                p_codigo: codigo
            }
        );


        if (error) {

            console.error(
                "Error al crear usuario:",
                error
            );

            botonConfirmarRegistro.disabled = false;

            alert(
                "No se ha podido crear la cuenta."
            );

            return;
        }


        console.log(
            "Usuario creado correctamente:",
            data
        );


        // ====================================
        // CREAR SESIÓN
        // ====================================

        const navegadorId =
            crypto.randomUUID();


        const {
            data: token,
            error: errorSesion
        } = await supabaseClient.rpc(
            "vincular_navegador",
            {
                p_usuario_id: data,
                p_identificador: navegadorId
            }
        );


        if (errorSesion) {

            console.error(
                "Error al crear la sesión:",
                errorSesion
            );

            botonConfirmarRegistro.disabled = false;

            alert(
                "La cuenta se creó, pero no se pudo iniciar la sesión."
            );

            return;
        }


        localStorage.setItem(
            "navegador_id",
            navegadorId
        );

        localStorage.setItem(
            "sesion_token",
            token
        );


        console.log(
            "Sesión guardada correctamente."
        );


        botonConfirmarRegistro.disabled = false;


        usuarioActualId = data;


        // Entrar directamente
        mostrarAplicacion();

        // Cargar perfil
        cargarPerfil(data);

    }
);


// ========================================
// COMPROBAR SESIÓN
// ========================================

async function comprobarSesion() {

    const navegadorId =
        localStorage.getItem("navegador_id");

    const token =
        localStorage.getItem("sesion_token");


    if (!navegadorId || !token) {

        mostrarPantallaAcceso();

        return;
    }


    const {
        data,
        error
    } = await supabaseClient.rpc(
        "verificar_sesion",
        {
            p_identificador: navegadorId,
            p_token: token
        }
    );


    if (error) {

        console.error(
            "Error al comprobar sesión:",
            error
        );

        mostrarPantallaAcceso();

        return;
    }


    if (!data) {

        console.log(
            "Sesión no válida."
        );


        localStorage.removeItem(
            "navegador_id"
        );

        localStorage.removeItem(
            "sesion_token"
        );


        mostrarPantallaAcceso();

        return;
    }


    console.log(
        "Sesión válida. Usuario:",
        data
    );


    usuarioActualId = data;


    mostrarAplicacion();


    cargarPerfil(data);

}


// ========================================
// MOSTRAR PANTALLA DE ACCESO
// ========================================

function mostrarPantallaAcceso() {

    pantallaAcceso.style.display = "flex";

    appPrincipal.style.display = "none";

}


// ========================================
// MOSTRAR APLICACIÓN
// ========================================

function mostrarAplicacion() {

    pantallaAcceso.style.display = "none";

    appPrincipal.style.display = "flex";


    if (window.innerWidth <= 700) {

        mostrarMenuMovil();

    } else {

        mostrarSeccion("chat");

    }

}


// ========================================
// MOSTRAR MENÚ MÓVIL
// ========================================

function mostrarMenuMovil() {

    menuMovil.style.display = "flex";

    tituloSeccionMovil.textContent =
        "Atuistas";

}


// ========================================
// OCULTAR MENÚ MÓVIL
// ========================================

function ocultarMenuMovil() {

    menuMovil.style.display = "none";

}


// ========================================
// MOSTRAR SECCIÓN
// ========================================

function mostrarSeccion(nombre) {

    seccionesApp.forEach(
        seccion => {

            seccion.classList.remove(
                "activa"
            );

        }
    );


    const seccionSeleccionada =
        document.getElementById(
            `seccion-${nombre}`
        );


    if (!seccionSeleccionada) {
        return;
    }


    seccionSeleccionada.classList.add(
        "activa"
    );


    botonesNav.forEach(
        boton => {

            boton.classList.toggle(
                "activo",
                boton.dataset.seccion === nombre
            );

        }
    );


    tituloSeccionMovil.textContent =
        nombresSecciones[nombre] ||
        "Atuistas";


    if (window.innerWidth <= 700) {

        ocultarMenuMovil();

    }


    if (nombre === "privados") {

        cargarUsuariosPrivados();

    }

}


// ========================================
// NAVEGACIÓN PC
// ========================================

botonesNav.forEach(
    boton => {

        boton.addEventListener(
            "click",
            () => {

                const seccion =
                    boton.dataset.seccion;

                mostrarSeccion(seccion);

            }
        );

    }
);


// ========================================
// NAVEGACIÓN MÓVIL
// ========================================

botonesNavMovil.forEach(
    boton => {

        boton.addEventListener(
            "click",
            () => {

                const seccion =
                    boton.dataset.seccion;

                mostrarSeccion(seccion);

            }
        );

    }
);


// ========================================
// VOLVER AL MENÚ MÓVIL
// ========================================

botonVolverMenu.addEventListener(
    "click",
    () => {

        mostrarMenuMovil();

    }
);


// ========================================
// PERFIL — PC
// ========================================

botonPerfil.addEventListener(
    "click",
    () => {

        mostrarSeccion("perfil");

    }
);


// ========================================
// PERFIL — MÓVIL
// ========================================

botonPerfilMovil.addEventListener(
    "click",
    () => {

        mostrarSeccion("perfil");

    }
);


// ========================================
// PERFIL — CARGAR DATOS
// ========================================

async function cargarPerfil(usuarioId) {

    const {
        data,
        error
    } = await supabaseClient
        .from("usuarios")
        .select(`
            nombre,
            descripcion,
            avatar_url,
            es_admin,
            color_nombre
        `)
        .eq("id", usuarioId)
        .single();


    if (error) {

        console.error(
            "Error al cargar perfil:",
            error
        );

        return;
    }


    console.log(
        "Perfil cargado:",
        data
    );


    // Nombre
    document.getElementById(
        "nombre-perfil"
    ).textContent = data.nombre;


    // Descripción
    document.getElementById(
        "descripcion-perfil"
    ).textContent =
        data.descripcion ||
        "Sin descripción";


    // Estado
    const estadoPerfil =
        document.getElementById(
            "estado-perfil"
        );


    if (data.es_admin) {

        estadoPerfil.textContent =
            "🛠️ Developer";

    } else {

        estadoPerfil.textContent =
            "Usuario";

    }


    // Color
    colorNombreActual =
        data.color_nombre || "#ffffff";

    document.getElementById(
        "color-nombre"
    ).value =
        colorNombreActual;


    // Avatar
    const avatar =
        document.getElementById(
            "avatar-perfil"
        );


    if (data.avatar_url) {

        avatar.innerHTML = "";


        const imagen =
            document.createElement("img");


        imagen.src =
            data.avatar_url;


        avatar.appendChild(
            imagen
        );

    } else {

        avatar.textContent =
            "👤";

    }

}


// ========================================
// EDITAR NOMBRE
// ========================================

nombrePerfil.addEventListener(
    "click",
    () => {

        if (
            nombrePerfil.querySelector(
                "input"
            )
        ) {
            return;
        }


        const nombreActual =
            nombrePerfil.textContent.trim();


        const input =
            document.createElement("input");


        input.type = "text";
        input.value = nombreActual;
        input.maxLength = 30;

        input.className =
            "editar-perfil-input";


        nombrePerfil.textContent = "";

        nombrePerfil.appendChild(
            input
        );


        input.focus();
        input.select();


        async function guardarNombre() {

            const nuevoNombre =
                input.value.trim();


            if (!nuevoNombre) {

                nombrePerfil.textContent =
                    nombreActual;

                return;
            }


            if (nuevoNombre === nombreActual) {

                nombrePerfil.textContent =
                    nombreActual;

                return;
            }


            const navegadorId =
                localStorage.getItem(
                    "navegador_id"
                );

            const token =
                localStorage.getItem(
                    "sesion_token"
                );


            const {
                data,
                error
            } = await supabaseClient.rpc(
                "cambiar_nombre",
                {
                    p_navegador_id: navegadorId,
                    p_token: token,
                    p_nombre: nuevoNombre
                }
            );


            if (error) {

                console.error(
                    "Error al cambiar nombre:",
                    error
                );

                alert(
                    "No se ha podido cambiar el nombre."
                );

                nombrePerfil.textContent =
                    nombreActual;

                return;
            }


            if (!data) {

                alert(
                    "Tu sesión ya no es válida."
                );

                nombrePerfil.textContent =
                    nombreActual;

                return;
            }


            nombrePerfil.textContent =
                nuevoNombre;


            console.log(
                "Nombre actualizado:",
                nuevoNombre
            );

        }


        input.addEventListener(
            "blur",
            guardarNombre,
            { once: true }
        );


        input.addEventListener(
            "keydown",
            event => {

                if (event.key === "Enter") {

                    input.blur();

                }


                if (event.key === "Escape") {

                    nombrePerfil.textContent =
                        nombreActual;

                }

            }
        );

    }
);


// ========================================
// EDITAR DESCRIPCIÓN
// ========================================

descripcionPerfil.addEventListener(
    "click",
    () => {

        if (
            descripcionPerfil.querySelector(
                "textarea"
            )
        ) {
            return;
        }


        const descripcionActual =
            descripcionPerfil.textContent.trim();


        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            descripcionActual ===
            "Sin descripción"
                ? ""
                : descripcionActual;


        textarea.maxLength = 200;

        textarea.className =
            "editar-perfil-textarea";


        descripcionPerfil.textContent = "";

        descripcionPerfil.appendChild(
            textarea
        );


        textarea.focus();


        async function guardarDescripcion() {

            const nuevaDescripcion =
                textarea.value.trim();


            const descripcionOriginal =
                descripcionActual ===
                "Sin descripción"
                    ? ""
                    : descripcionActual;


            if (
                nuevaDescripcion ===
                descripcionOriginal
            ) {

                descripcionPerfil.textContent =
                    descripcionActual;

                return;
            }


            const navegadorId =
                localStorage.getItem(
                    "navegador_id"
                );

            const token =
                localStorage.getItem(
                    "sesion_token"
                );


            const {
                data,
                error
            } = await supabaseClient.rpc(
                "cambiar_descripcion",
                {
                    p_navegador_id: navegadorId,
                    p_token: token,
                    p_descripcion:
                        nuevaDescripcion
                }
            );


            if (error) {

                console.error(
                    "Error al cambiar descripción:",
                    error
                );

                alert(
                    "No se ha podido cambiar la descripción."
                );

                descripcionPerfil.textContent =
                    descripcionActual;

                return;
            }


            if (!data) {

                alert(
                    "Tu sesión ya no es válida."
                );

                descripcionPerfil.textContent =
                    descripcionActual;

                return;
            }


            descripcionPerfil.textContent =
                nuevaDescripcion ||
                "Sin descripción";


            console.log(
                "Descripción actualizada."
            );

        }


        textarea.addEventListener(
            "blur",
            guardarDescripcion,
            { once: true }
        );


        textarea.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    textarea.blur();

                }


                if (event.key === "Escape") {

                    descripcionPerfil.textContent =
                        descripcionActual;

                }

            }
        );

    }
);


// ========================================
// CAMBIAR COLOR DEL NOMBRE
// ========================================

colorNombre.addEventListener(
    "input",
    async () => {

        const color =
            colorNombre.value;

        colorNombreActual = color;

        const navegadorId =
            localStorage.getItem(
                "navegador_id"
            );

        const token =
            localStorage.getItem(
                "sesion_token"
            );


        if (!navegadorId || !token) {
            return;
        }


        const {
            data,
            error
        } = await supabaseClient.rpc(
            "cambiar_color_nombre",
            {
                p_navegador_id: navegadorId,
                p_token: token,
                p_color: color
            }
        );


        if (error) {

            console.error(
                "Error al cambiar color:",
                error
            );

            return;
        }


        if (!data) {

            console.error(
                "La sesión no es válida."
            );

            return;
        }


        console.log(
            "Color actualizado:",
            color
        );

    }
);


// ========================================
// CAMBIAR AVATAR
// ========================================

avatarPerfil.addEventListener(
    "click",
    () => {

        inputAvatar.click();

    }
);


inputAvatar.addEventListener(
    "change",
    async () => {

        const archivo =
            inputAvatar.files[0];


        if (!archivo) {
            return;
        }


        if (!usuarioActualId) {

            alert(
                "No se ha podido identificar tu cuenta."
            );

            return;
        }


        const tiposPermitidos = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];


        if (
            !tiposPermitidos.includes(
                archivo.type
            )
        ) {

            alert(
                "Solo puedes utilizar imágenes PNG, JPG o WEBP."
            );

            inputAvatar.value = "";

            return;
        }


        if (
            archivo.size >
            5 * 1024 * 1024
        ) {

            alert(
                "La imagen no puede superar los 5 MB."
            );

            inputAvatar.value = "";

            return;
        }


        console.log(
            "Subiendo avatar:",
            archivo.name
        );


        const extension =
            archivo.name
                .split(".")
                .pop();


        const nombreArchivo =
            `${usuarioActualId}.${extension}`;


        const {
            error: errorSubida
        } = await supabaseClient.storage
            .from("avatars")
            .upload(
                nombreArchivo,
                archivo,
                {
                    upsert: true,
                    contentType: archivo.type
                }
            );


        if (errorSubida) {

            console.error(
                "Error al subir avatar:",
                errorSubida
            );

            alert(
                "No se ha podido subir el avatar."
            );

            return;
        }


        const {
            data: urlData
        } = supabaseClient.storage
            .from("avatars")
            .getPublicUrl(
                nombreArchivo
            );


        const avatarUrl =
            urlData.publicUrl;


        const navegadorId =
            localStorage.getItem(
                "navegador_id"
            );

        const token =
            localStorage.getItem(
                "sesion_token"
            );


        const {
            data: avatarGuardado,
            error: errorUsuario
        } = await supabaseClient.rpc(
            "cambiar_avatar",
            {
                p_navegador_id: navegadorId,
                p_token: token,
                p_avatar_url: avatarUrl
            }
        );


        if (errorUsuario) {

            console.error(
                "Error al guardar avatar:",
                errorUsuario
            );

            alert(
                "No se ha podido guardar el avatar."
            );

            return;
        }


        if (!avatarGuardado) {

            alert(
                "Tu sesión ya no es válida."
            );

            return;
        }


        avatarPerfil.innerHTML = "";


        const imagen =
            document.createElement("img");


        imagen.src =
            `${avatarUrl}?t=${Date.now()}`;


        avatarPerfil.appendChild(
            imagen
        );


        console.log(
            "Avatar actualizado correctamente."
        );


        inputAvatar.value = "";

    }
);


// ========================================
// CERRAR SESIÓN
// ========================================

botonCerrarSesion.addEventListener(
    "click",
    async () => {

        const confirmar =
            confirm(
                "¿Seguro que quieres cerrar sesión?"
            );


        if (!confirmar) {
            return;
        }


        // Cerrar Realtime y actualización automática
        detenerActualizacionMensajesPrivados();


        if (canalChatPrivado) {

            await supabaseClient.removeChannel(
                canalChatPrivado
            );

            canalChatPrivado = null;

        }


        const navegadorId =
            localStorage.getItem(
                "navegador_id"
            );

        const token =
            localStorage.getItem(
                "sesion_token"
            );


        if (navegadorId && token) {

            const {
                data,
                error
            } = await supabaseClient.rpc(
                "eliminar_avatar",
                {
                    p_navegador_id: navegadorId,
                    p_token: token
                }
            );


            if (error) {

                console.error(
                    "Error al eliminar avatar:",
                    error
                );

                alert(
                    "No se ha podido cerrar la sesión correctamente."
                );

                return;
            }

        }


        localStorage.removeItem(
            "navegador_id"
        );

        localStorage.removeItem(
            "sesion_token"
        );


        usuarioActualId = null;


        mostrarPantallaAcceso();


        codigoLogin.value = "";


        console.log(
            "Sesión cerrada correctamente."
        );

    }
);


// ========================================
// CHATS PRIVADOS
// ========================================


// ========================================
// CARGAR USUARIOS PRIVADOS
// ========================================

async function cargarUsuariosPrivados() {

    const navegadorId =
        localStorage.getItem(
            "navegador_id"
        );

    const token =
        localStorage.getItem(
            "sesion_token"
        );


    if (!navegadorId || !token) {
        return;
    }


    const {
        data,
        error
    } = await supabaseClient.rpc(
        "obtener_usuarios_privados",
        {
            p_navegador_id: navegadorId,
            p_token: token
        }
    );


    if (error) {

        console.error(
            "Error al cargar usuarios privados:",
            error
        );

        return;
    }


    listaUsuariosPrivados.innerHTML = "";


    if (
        !data ||
        data.length === 0
    ) {

        listaUsuariosPrivados.innerHTML = `
            <p style="color:#999999;">
                No hay otros usuarios en el grupo.
            </p>
        `;

        return;
    }


    data.forEach(
        usuario => {

            const boton =
                document.createElement(
                    "button"
                );


            boton.className =
                "usuario-privado";


            // Avatar
            const avatar =
                document.createElement(
                    "div"
                );


            avatar.className =
                "usuario-privado-avatar";


            if (usuario.avatar_url) {

                const imagen =
                    document.createElement(
                        "img"
                    );


                imagen.src =
                    usuario.avatar_url;


                avatar.appendChild(
                    imagen
                );

            } else {

                avatar.textContent =
                    "👤";

            }


            // Información
            const informacion =
                document.createElement(
                    "div"
                );


            informacion.className =
                "usuario-privado-info";


            const nombre =
                document.createElement(
                    "div"
                );


            nombre.className =
                "usuario-privado-nombre";


            nombre.textContent =
                usuario.nombre;


            nombre.style.color =
                usuario.color_nombre ||
                "#ffffff";


            const descripcion =
                document.createElement(
                    "div"
                );


            descripcion.className =
                "usuario-privado-descripcion";


            descripcion.textContent =
                usuario.descripcion ||
                "Sin descripción";


            informacion.appendChild(
                nombre
            );

            informacion.appendChild(
                descripcion
            );


            boton.appendChild(
                avatar
            );

            boton.appendChild(
                informacion
            );


            boton.addEventListener(
                "click",
                () => {

                    abrirChatPrivado(
                        usuario
                    );

                }
            );


            listaUsuariosPrivados.appendChild(
                boton
            );

        }
    );

}


// ========================================
// ABRIR CHAT PRIVADO
// ========================================

async function abrirChatPrivado(usuario) {

    const navegadorId =
        localStorage.getItem(
            "navegador_id"
        );

    const token =
        localStorage.getItem(
            "sesion_token"
        );


    if (!navegadorId || !token) {
        return;
    }


    // ====================================
    // CERRAR CHAT ANTERIOR
    // ====================================

    detenerActualizacionMensajesPrivados();


    if (canalChatPrivado) {

        console.log(
            "Cerrando canal anterior..."
        );


        await supabaseClient.removeChannel(
            canalChatPrivado
        );


        canalChatPrivado = null;

    }


    usuarioPrivadoActual =
        usuario;


    // ====================================
    // CREAR U OBTENER CHAT
    // ====================================

    const {
        data: chatId,
        error
    } = await supabaseClient.rpc(
        "obtener_o_crear_chat",
        {
            p_navegador_id: navegadorId,
            p_token: token,
            p_otro_usuario: usuario.id
        }
    );


    if (error) {

        console.error(
            "Error al abrir chat:",
            error
        );

        alert(
            "No se ha podido abrir el chat."
        );

        return;
    }


    if (!chatId) {

        alert(
            "No se ha podido abrir el chat."
        );

        return;
    }


    chatPrivadoActual =
        chatId;


    // ====================================
    // CABECERA
    // ====================================

    privadoNombre.textContent =
        usuario.nombre;


    privadoNombre.style.color =
        usuario.color_nombre ||
        "#ffffff";


    privadoEstado.textContent =
        usuario.es_admin
            ? "🛠️ Developer"
            : "Usuario";


    privadoAvatar.innerHTML = "";


    if (usuario.avatar_url) {

        const imagen =
            document.createElement(
                "img"
            );


        imagen.src =
            usuario.avatar_url;


        privadoAvatar.appendChild(
            imagen
        );

    } else {

        privadoAvatar.textContent =
            "👤";

    }


    // ====================================
    // CAMBIAR VISTA
    // ====================================

    privadosLista.style.display =
        "none";

    privadoChat.style.display =
        "flex";


    // ====================================
    // CARGAR MENSAJES
    // ====================================

    await cargarMensajesPrivados();


    // ====================================
    // ACTIVAR REALTIME
    // ====================================

    escucharMensajesPrivados(
        chatPrivadoActual
    );


    // ====================================
    // ACTIVAR ACTUALIZACIÓN AUTOMÁTICA
    // ====================================

    iniciarActualizacionMensajesPrivados();


    // ====================================
    // ENFOCAR
    // ====================================

    privadoInput.focus();

}


// ========================================
// CARGAR MENSAJES PRIVADOS
// ========================================

async function cargarMensajesPrivados() {

    const navegadorId =
        localStorage.getItem(
            "navegador_id"
        );

    const token =
        localStorage.getItem(
            "sesion_token"
        );


    if (
        !navegadorId ||
        !token ||
        !chatPrivadoActual
    ) {
        return;
    }


    // Evitar dos cargas simultáneas
    if (cargandoMensajesPrivados) {
        return;
    }


    cargandoMensajesPrivados = true;


    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "obtener_mensajes_privados",
            {
                p_navegador_id: navegadorId,
                p_token: token,
                p_chat_id: chatPrivadoActual
            }
        );


        if (error) {

            console.error(
                "Error al cargar mensajes:",
                error
            );

            return;
        }


        if (!data) {
            return;
        }


        // ====================================
        // SI ES LA PRIMERA CARGA
        // ====================================

        if (
            privadoMensajes.children.length === 0
        ) {

            privadoMensajes.innerHTML = "";


            if (data.length === 0) {

                const vacio =
                    document.createElement(
                        "div"
                    );


                vacio.className =
                    "mensajes-privados-vacio";


                vacio.textContent =
                    "Todavía no hay mensajes.";


                privadoMensajes.appendChild(
                    vacio
                );

            } else {

                data.forEach(
                    mensaje => {

                        crearMensajePrivado(
                            mensaje
                        );

                    }
                );

            }

        } else {

            // ====================================
            // ACTUALIZACIÓN INCREMENTAL
            // ====================================

            data.forEach(
                mensaje => {

                    crearMensajePrivado(
                        mensaje
                    );

                }
            );


            const vacio =
                privadoMensajes.querySelector(
                    ".mensajes-privados-vacio"
                );


            if (
                vacio &&
                data.length > 0
            ) {

                vacio.remove();

            }

        }


        // Scroll al final
        privadoMensajes.scrollTop =
            privadoMensajes.scrollHeight;

    } finally {

        cargandoMensajesPrivados = false;

    }

}


// ========================================
// CREAR MENSAJE VISUAL
// ========================================

function crearMensajePrivado(mensaje) {

    // ====================================
    // Evitar duplicados
    // ====================================

    if (mensaje.id) {

        const existente =
            privadoMensajes.querySelector(
                `[data-mensaje-id="${mensaje.id}"]`
            );

        if (existente) {
            return;
        }

    }


    // ====================================
    // ¿ES MÍO?
    // ====================================

    const esMio =
        String(mensaje.usuario_id) ===
        String(usuarioActualId);


    // ====================================
    // COMPROBAR MENSAJE ANTERIOR
    // ====================================

    const mensajesAnteriores =
        privadoMensajes.querySelectorAll(
            ".mensaje-privado"
        );

    const ultimoMensaje =
        mensajesAnteriores[
            mensajesAnteriores.length - 1
        ];


    let mismoRemitente = false;


    if (ultimoMensaje) {

        mismoRemitente =
            ultimoMensaje.dataset.usuarioId ===
            String(mensaje.usuario_id);

    }


    // ====================================
    // CREAR ELEMENTO
    // ====================================

    const mensajeElemento =
        document.createElement("div");


    mensajeElemento.className =
        esMio
            ? "mensaje-privado mio"
            : "mensaje-privado otro";


    // Guardar ID
    if (mensaje.id) {

        mensajeElemento.dataset.mensajeId =
            mensaje.id;

    }


    // Guardar usuario que envió el mensaje
    mensajeElemento.dataset.usuarioId =
        String(mensaje.usuario_id);


    // ====================================
    // NOMBRE
    // ====================================

    if (!mismoRemitente) {

        const nombre =
            document.createElement("div");

        nombre.className =
            "mensaje-privado-nombre";


        // ==================================
        // TEXTO DEL NOMBRE
        // ==================================

        nombre.textContent =
            esMio
                ? "Tú"
                : (
                    mensaje.nombre ||
                    usuarioPrivadoActual?.nombre ||
                    "Usuario"
                );


        // ==================================
        // COLOR DEL NOMBRE
        // ==================================

        nombre.style.color =
            esMio
                ? colorNombreActual
                : (
                    mensaje.color_nombre ||
                    usuarioPrivadoActual?.color_nombre ||
                    "#ffffff"
                );


        mensajeElemento.appendChild(
            nombre
        );

    }


    // ====================================
    // CONTENIDO
    // ====================================

    const contenido =
        document.createElement("div");

    contenido.className =
        "mensaje-privado-contenido";


    contenido.textContent =
        mensaje.contenido;


    mensajeElemento.appendChild(
        contenido
    );


    // ====================================
    // AÑADIR AL CHAT
    // ====================================

    privadoMensajes.appendChild(
        mensajeElemento
    );

}

// ========================================
// REALTIME — MENSAJES PRIVADOS
// ========================================

function escucharMensajesPrivados(chatId) {

    // ====================================
    // CERRAR CANAL ANTERIOR
    // ====================================

    if (canalChatPrivado) {

        console.log(
            "Cerrando canal Realtime anterior..."
        );


        supabaseClient.removeChannel(
            canalChatPrivado
        );


        canalChatPrivado = null;

    }


    console.log(
        "Activando Realtime para chat:",
        chatId
    );


    // ====================================
    // CREAR CANAL
    // ====================================

    canalChatPrivado =
        supabaseClient
            .channel(
                `chat-privado-${chatId}-${Date.now()}`
            )


            // ==================================
            // ESCUCHAR INSERTS
            // ==================================

            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "mensajes_privados",
                    filter:
                        `chat_id=eq.${chatId}`
                },


                payload => {

                    console.log(
                        "🔥 REALTIME RECIBIDO:",
                        payload.new
                    );


                    const nuevoMensaje =
                        payload.new;


                    if (!nuevoMensaje) {
                        return;
                    }


                    // ==================================
                    // COMPROBAR CHAT ACTUAL
                    // ==================================

                    if (
                        String(
                            nuevoMensaje.chat_id
                        ) !==
                        String(
                            chatPrivadoActual
                        )
                    ) {

                        return;

                    }


                    // ==================================
                    // COMPROBAR SI ES MÍO
                    // ==================================

                    const esMio =
                        String(
                            nuevoMensaje.usuario_id
                        ) ===
                        String(
                            usuarioActualId
                        );


                    // ==================================
                    // DATOS VISUALES
                    // ==================================

                    const mensajeCompleto = {

                        id:
                            nuevoMensaje.id,

                        chat_id:
                            nuevoMensaje.chat_id,

                        usuario_id:
                            nuevoMensaje.usuario_id,

                        contenido:
                            nuevoMensaje.contenido,

                        creado_en:
                            nuevoMensaje.creado_en,

                        nombre:
                            esMio
                                ? "Tú"
                                : usuarioPrivadoActual?.nombre ||
                                  "Usuario",

                        color_nombre:
                            esMio
                                ? colorNombreActual
                                : usuarioPrivadoActual?.color_nombre ||
                                "#ffffff"

                    };


                    // ==================================
                    // MOSTRAR
                    // ==================================

                    crearMensajePrivado(
                        mensajeCompleto
                    );


                    // ==================================
                    // ELIMINAR "SIN MENSAJES"
                    // ==================================

                    const vacio =
                        privadoMensajes.querySelector(
                            ".mensajes-privados-vacio"
                        );


                    if (vacio) {
                        vacio.remove();
                    }


                    // ==================================
                    // SCROLL
                    // ==================================

                    privadoMensajes.scrollTop =
                        privadoMensajes.scrollHeight;

                }
            )


            // ==================================
            // SUSCRIBIR
            // ==================================

            .subscribe(
                status => {

                    console.log(
                        "Realtime chat privado:",
                        status
                    );


                    if (status === "SUBSCRIBED") {

                        console.log(
                            "✅ Realtime conectado correctamente."
                        );

                    }


                    if (status === "CHANNEL_ERROR") {

                        console.error(
                            "❌ Error en el canal Realtime."
                        );

                    }


                    if (status === "TIMED_OUT") {

                        console.error(
                            "⏱️ Realtime agotó el tiempo de espera."
                        );

                    }

                }
            );

}


// ========================================
// ACTUALIZACIÓN AUTOMÁTICA DE RESPALDO
// ========================================

function iniciarActualizacionMensajesPrivados() {

    // Por seguridad, detener cualquier intervalo anterior
    detenerActualizacionMensajesPrivados();


    console.log(
        "🔄 Activando actualización automática de mensajes."
    );


    intervaloMensajesPrivados =
        setInterval(
            async () => {

                // Si ya no estamos dentro de un chat,
                // no hacer nada
                if (!chatPrivadoActual) {
                    return;
                }


                // Cargar mensajes nuevos
                await cargarMensajesPrivados();

            },
            2000
        );

}


// ========================================
// DETENER ACTUALIZACIÓN AUTOMÁTICA
// ========================================

function detenerActualizacionMensajesPrivados() {

    if (
        intervaloMensajesPrivados
    ) {

        clearInterval(
            intervaloMensajesPrivados
        );


        intervaloMensajesPrivados =
            null;


        console.log(
            "🛑 Actualización automática detenida."
        );

    }

}


// ========================================
// ENVIAR MENSAJE PRIVADO
// ========================================

async function enviarMensajePrivado() {

    const contenido =
        privadoInput.value.trim();


    // ====================================
    // COMPROBACIONES
    // ====================================

    if (
        !contenido ||
        !chatPrivadoActual
    ) {
        return;
    }


    const navegadorId =
        localStorage.getItem(
            "navegador_id"
        );

    const token =
        localStorage.getItem(
            "sesion_token"
        );


    if (!navegadorId || !token) {

        console.error(
            "No existe sesión."
        );

        return;
    }


    // ====================================
    // DESACTIVAR BOTÓN
    // ====================================

    botonEnviarPrivado.disabled =
        true;


    try {

        // ====================================
        // ENVIAR A SUPABASE
        // ====================================

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "enviar_mensaje_privado",
            {
                p_navegador_id: navegadorId,
                p_token: token,
                p_chat_id: chatPrivadoActual,
                p_contenido: contenido
            }
        );


        // ====================================
        // ERROR
        // ====================================

        if (error) {

            console.error(
                "Error al enviar mensaje:",
                error
            );


            alert(
                "No se ha podido enviar el mensaje."
            );


            return;
        }


        // ====================================
        // SESIÓN INVÁLIDA
        // ====================================

        if (!data) {

            alert(
                "Tu sesión ya no es válida."
            );


            return;
        }


        // ====================================
        // LIMPIAR INPUT
        // ====================================

        privadoInput.value = "";


        // ====================================
        // ACTUALIZACIÓN INMEDIATA
        // ====================================

        // No dependemos únicamente de Realtime.
        //
        // Si Realtime tarda o no funciona,
        // esta carga recuperará el mensaje
        // automáticamente.

        await cargarMensajesPrivados();


        privadoMensajes.scrollTop =
            privadoMensajes.scrollHeight;


        console.log(
            "✅ Mensaje enviado correctamente."
        );

    } catch (error) {

        console.error(
            "Error inesperado al enviar mensaje:",
            error
        );

        alert(
            "Ha ocurrido un error al enviar el mensaje."
        );

    } finally {

        botonEnviarPrivado.disabled =
            false;

    }

}


// ========================================
// BOTÓN ENVIAR
// ========================================

botonEnviarPrivado.addEventListener(
    "click",
    enviarMensajePrivado
);


// ========================================
// ENTER PARA ENVIAR
// ========================================

privadoInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            enviarMensajePrivado();

        }

    }
);


// ========================================
// VOLVER A LA LISTA DE PRIVADOS
// ========================================

botonVolverPrivados.addEventListener(
    "click",
    async () => {

        // ==================================
        // DETENER ACTUALIZACIÓN AUTOMÁTICA
        // ==================================

        detenerActualizacionMensajesPrivados();


        // ==================================
        // CERRAR REALTIME
        // ==================================

        if (canalChatPrivado) {

            console.log(
                "Cerrando Realtime del chat..."
            );


            await supabaseClient.removeChannel(
                canalChatPrivado
            );


            canalChatPrivado =
                null;

        }


        // ==================================
        // CAMBIAR VISTA
        // ==================================

        privadoChat.style.display =
            "none";


        privadosLista.style.display =
            "block";


        // ==================================
        // LIMPIAR ESTADO
        // ==================================

        usuarioPrivadoActual =
            null;

        chatPrivadoActual =
            null;


        privadoMensajes.innerHTML =
            "";

        privadoInput.value =
            "";

    }
);


// ========================================
// COMPROBAR SESIÓN AL CARGAR
// ========================================

comprobarSesion();

// ========================================
// NOTIFICACIONES — SERVICE WORKER
// ========================================

async function registrarServiceWorker() {

    if (!("serviceWorker" in navigator)) {

        console.error(
            "Este navegador no soporta Service Workers."
        );

        return null;
    }


    try {

        const registro =
            await navigator.serviceWorker.register(
                "./sw.js"
            );


        console.log(
            "✅ Service Worker registrado:",
            registro
        );


        return registro;

    } catch (error) {

        console.error(
            "❌ Error registrando Service Worker:",
            error
        );

        return null;

    }

}

registrarServiceWorker();

async function pedirPermisoNotificaciones() {

    if (!("Notification" in window)) {

        console.error(
            "Este navegador no soporta notificaciones."
        );

        return false;
    }


    if (Notification.permission === "granted") {

        return true;

    }


    if (Notification.permission === "denied") {

        console.warn(
            "Las notificaciones están bloqueadas."
        );

        return false;

    }


    const permiso =
        await Notification.requestPermission();


    if (permiso === "granted") {

        console.log(
            "✅ Permiso para notificaciones concedido."
        );

        return true;

    }


    console.log(
        "❌ Permiso para notificaciones rechazado."
    );

    return false;

}