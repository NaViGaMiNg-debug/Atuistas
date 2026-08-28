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


    mostrarAplicacion();

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
// COMPROBAR SESIÓN AL CARGAR
// ========================================

comprobarSesion();