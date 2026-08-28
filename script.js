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


        // Comprobar código
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


        // Guardar usuario actual
        usuarioActualId = usuarioId;


        // Entrar en la aplicación
        mostrarAplicacion();


        // Cargar perfil
        cargarPerfil(usuarioId);


        // Limpiar código
        codigoLogin.value = "";

    }
);

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

let usuarioActualId = null;

// Avatar
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
// REGISTRO — PRIMER PASO
// ========================================

botonRegistro.addEventListener("click", () => {

    const nombre = nombreRegistro.value.trim();

    if (!nombre) {
        alert("Escribe tu nombre.");
        return;
    }

    pantallaPrincipal.style.display = "none";
    pantallaRegistro.style.display = "block";

});


// ========================================
// REGISTRO — VOLVER
// ========================================

botonVolverRegistro.addEventListener("click", () => {

    pantallaRegistro.style.display = "none";
    pantallaPrincipal.style.display = "block";

});


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
            alert("Los códigos no coinciden.");
            return;
        }


        botonConfirmarRegistro.disabled = true;


        // Crear usuario
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


        // Entrar directamente
        mostrarAplicacion();

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


    // En móvil comenzamos mostrando el menú
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

    tituloSeccionMovil.textContent = "El Grupo";

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

    // Ocultar todas las secciones
    seccionesApp.forEach(seccion => {

        seccion.classList.remove("activa");

    });


    // Buscar la sección
    const seccionSeleccionada =
        document.getElementById(
            `seccion-${nombre}`
        );


    if (!seccionSeleccionada) {
        return;
    }


    // Mostrarla
    seccionSeleccionada.classList.add(
        "activa"
    );


    // Actualizar botones PC
    botonesNav.forEach(boton => {

        boton.classList.toggle(
            "activo",
            boton.dataset.seccion === nombre
        );

    });


    // Actualizar título móvil
    tituloSeccionMovil.textContent =
        nombresSecciones[nombre] || "El Grupo";


    // Si estamos en móvil,
    // salir del menú
    if (window.innerWidth <= 700) {

        ocultarMenuMovil();

    }

}


// ========================================
// NAVEGACIÓN PC
// ========================================

botonesNav.forEach(boton => {

    boton.addEventListener(
        "click",
        () => {

            const seccion =
                boton.dataset.seccion;

            mostrarSeccion(seccion);

        }
    );

});


// ========================================
// NAVEGACIÓN MÓVIL
// ========================================

botonesNavMovil.forEach(boton => {

    boton.addEventListener(
        "click",
        () => {

            const seccion =
                boton.dataset.seccion;

            mostrarSeccion(seccion);

        }
    );

});


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


    // ====================================
    // NOMBRE
    // ====================================

    document.getElementById(
        "nombre-perfil"
    ).textContent = data.nombre;


    // ====================================
    // DESCRIPCIÓN
    // ====================================

    document.getElementById(
        "descripcion-perfil"
    ).textContent =
        data.descripcion || "Sin descripción";


    // ====================================
    // ESTADO
    // ====================================

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


    // ====================================
    // COLOR DEL NOMBRE
    // ====================================

    document.getElementById(
        "color-nombre"
    ).value =
        data.color_nombre || "#ffffff";


    // ====================================
    // AVATAR
    // ====================================

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

        if (nombrePerfil.querySelector("input")) {
            return;
        }

        const nombreActual =
            nombrePerfil.textContent.trim();

        const input =
            document.createElement("input");

        input.type = "text";
        input.value = nombreActual;
        input.maxLength = 30;

        input.className = "editar-perfil-input";

        nombrePerfil.textContent = "";
        nombrePerfil.appendChild(input);

        input.focus();
        input.select();


        async function guardarNombre() {

            const nuevoNombre =
                input.value.trim();

            if (!nuevoNombre) {
                nombrePerfil.textContent = nombreActual;
                return;
            }

            if (nuevoNombre === nombreActual) {
                nombrePerfil.textContent = nombreActual;
                return;
            }


            const navegadorId =
                localStorage.getItem("navegador_id");

            const token =
                localStorage.getItem("sesion_token");


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

descripcionPerfil.addEventListener(
    "click",
    () => {

        if (descripcionPerfil.querySelector("textarea")) {
            return;
        }

        const descripcionActual =
            descripcionPerfil.textContent.trim();

        const textarea =
            document.createElement("textarea");

        textarea.value =
            descripcionActual === "Sin descripción"
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


            if (
                nuevaDescripcion ===
                (
                    descripcionActual ===
                    "Sin descripción"
                        ? ""
                        : descripcionActual
                )
            ) {

                descripcionPerfil.textContent =
                    descripcionActual;

                return;
            }


            const navegadorId =
                localStorage.getItem("navegador_id");

            const token =
                localStorage.getItem("sesion_token");


            const {
                data,
                error
            } = await supabaseClient.rpc(
                "cambiar_descripcion",
                {
                    p_navegador_id: navegadorId,
                    p_token: token,
                    p_descripcion: nuevaDescripcion
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

        const navegadorId =
            localStorage.getItem("navegador_id");

        const token =
            localStorage.getItem("sesion_token");


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

            alert("No se ha podido identificar tu cuenta.");

            return;
        }


        // Comprobar tipo de archivo
        const tiposPermitidos = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (!tiposPermitidos.includes(archivo.type)) {

            alert(
                "Solo puedes utilizar imágenes PNG, JPG o WEBP."
            );

            inputAvatar.value = "";

            return;
        }


        // Comprobar tamaño
        if (archivo.size > 5 * 1024 * 1024) {

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


        // Nombre único para el archivo
        const extension =
            archivo.name.split(".").pop();

        const nombreArchivo =
            `${usuarioActualId}.${extension}`;


        // Subir imagen
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


        // Obtener URL pública
        const {
            data: urlData
        } = supabaseClient.storage
            .from("avatars")
            .getPublicUrl(nombreArchivo);


        const avatarUrl =
            urlData.publicUrl;


        // Guardar URL en usuarios
        const navegadorId =
            localStorage.getItem("navegador_id");

        const token =
            localStorage.getItem("sesion_token");


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

            console.error(
                "La sesión no es válida."
            );

            alert(
                "Tu sesión ya no es válida."
            );

            return;
        }


        // Mostrar inmediatamente el nuevo avatar
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


        // Limpiar input
        inputAvatar.value = "";

    }
);


// ========================================
// COMPROBAR SESIÓN AL CARGAR
// ========================================

comprobarSesion();

// ========================================
// CERRAR SESIÓN
// ========================================

botonCerrarSesion.addEventListener(
    "click",
    async () => {

        const confirmar =
            confirm("¿Seguro que quieres cerrar sesión?");

        if (!confirmar) {
            return;
        }


        const navegadorId =
            localStorage.getItem("navegador_id");

        const token =
            localStorage.getItem("sesion_token");


        // Eliminar avatar del perfil
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


            if (!data) {

                console.error(
                    "La sesión ya no es válida."
                );

            }

        }


        // Borrar sesión del navegador
        localStorage.removeItem(
            "navegador_id"
        );

        localStorage.removeItem(
            "sesion_token"
        );


        // Limpiar usuario actual
        usuarioActualId = null;


        // Volver a la pantalla de acceso
        mostrarPantallaAcceso();


        // Limpiar código de acceso
        codigoLogin.value = "";


        console.log(
            "Sesión cerrada correctamente."
        );

    }
);