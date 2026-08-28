const SUPABASE_URL = "https://kqkdhbjirkdhhpajxnfq.supabase.co";
const SUPABASE_KEY = "sb_publishable_fpz6bYnN8G2QHgJXfTAhoQ_GOSVnFos";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

console.log("Supabase conectado");


// ========================================
// ELEMENTOS DE LA PANTALLA
// ========================================

const pantallaPrincipal = document.getElementById("pantalla-principal");
const pantallaRegistro = document.getElementById("pantalla-registro");
const pantallaAcceso = document.getElementById("pantalla-acceso");
const appPrincipal = document.getElementById("app-principal");

const botonRegistro = document.getElementById("boton-registro");
const nombreRegistro = document.getElementById("nombre-registro");


// ========================================
// PASAR A CREAR CUENTA
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

const botonVolverRegistro = document.getElementById("boton-volver-registro");

botonVolverRegistro.addEventListener("click", () => {

    pantallaRegistro.style.display = "none";
    pantallaPrincipal.style.display = "block";

});

const botonConfirmarRegistro = document.getElementById("boton-confirmar-registro");
const codigoRegistro = document.getElementById("codigo-registro");
const codigoRegistroRepetir = document.getElementById("codigo-registro-repetir");


botonConfirmarRegistro.addEventListener("click", async () => {

    const nombre = nombreRegistro.value.trim();
    const codigo = codigoRegistro.value;
    const codigoRepetido = codigoRegistroRepetir.value;

    if (codigo.length < 4) {
        alert("El código debe tener al menos 4 caracteres.");
        return;
    }

    if (codigo !== codigoRepetido) {
        alert("Los códigos no coinciden.");
        return;
    }

    botonConfirmarRegistro.disabled = true;

    const { data, error } = await supabaseClient.rpc(
        "crear_usuario",
        {
            p_nombre: nombre,
            p_codigo: codigo
        }
    );

    botonConfirmarRegistro.disabled = false;

    if (error) {
        console.error("Error al crear usuario:", error);
        alert("No se ha podido crear la cuenta.");
        return;
    }

    console.log("Usuario creado correctamente:", data);


    // ========================================
    // GUARDAR SESIÓN EN ESTE NAVEGADOR
    // ========================================

    const navegadorId = crypto.randomUUID();

    const { data: token, error: errorSesion } =
        await supabaseClient.rpc(
            "vincular_navegador",
            {
                p_usuario_id: data,
                p_identificador: navegadorId
            }
        );

    if (errorSesion) {
        console.error("Error al crear la sesión:", errorSesion);
        alert("La cuenta se creó, pero no se pudo iniciar la sesión.");
        return;
    }

    localStorage.setItem("navegador_id", navegadorId);
    localStorage.setItem("sesion_token", token);

    console.log("Sesión guardada correctamente.");

    alert("¡Cuenta creada correctamente!");

});

async function comprobarSesion() {

    const navegadorId = localStorage.getItem("navegador_id");
    const token = localStorage.getItem("sesion_token");

    if (!navegadorId || !token) {
        return;
    }

    const { data, error } = await supabaseClient.rpc(
        "verificar_sesion",
        {
            p_identificador: navegadorId,
            p_token: token
        }
    );

    if (error) {
        console.error("Error al comprobar sesión:", error);
        return;
    }

    if (!data) {
        console.log("Sesión no válida.");

        localStorage.removeItem("navegador_id");
        localStorage.removeItem("sesion_token");

        return;
    }

    console.log("Sesión válida. Usuario:", data);

    pantallaAcceso.style.display = "none";

    appPrincipal.style.display = "block";

}

comprobarSesion();