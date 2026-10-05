/**
 * Prueba del selector de emojis, GIF y stickers: que la lista cargue con sus
 * grupos, que la busqueda encuentre por nombre, que al elegir un emoji se
 * inserte en el campo donde estaba el cursor y que los cuatro sitios de
 * escritura tengan su boton.
 *
 *   node deploy/probar-emoji.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, "..");

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

/* ---------- DOM minimo ---------- */

function crearElemento(id = "") {
    const elemento = {
        id,
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        innerHTML: "",
        className: "",
        style: {},
        dataset: {},
        files: [],
        children: [],
        parentNode: null,
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        appendChild() {},
        append() {},
        remove() {},
        // En el DOM de verdad setAttribute("hidden") y .hidden son lo mismo: sin
        // esto, cerrar una capa no se reflejaba y las pruebas mienten.
        setAttribute(nombre, valor) {
            elemento[nombre] = nombre === "hidden" ? true : valor;
        },
        getAttribute(nombre) {
            return nombre in elemento ? elemento[nombre] : null;
        },
        removeAttribute(nombre) {
            delete elemento[nombre];
        },
        querySelector() { return crearElemento(); },
        querySelectorAll() { return []; },
        prepend() {},
        closest() { return null; },
        focus() {},
        click() {},
        scrollIntoView() {},
        insertAdjacentHTML() {},
        setSelectionRange() {},
        getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
        matches() { return false; }
    };

    return elemento;
}

const codigo = fs.readFileSync(path.join(raiz, "public", "app.js"), "utf8");
const emojis = fs.readFileSync(path.join(raiz, "public", "data", "emojis.js"), "utf8");
const css = fs.readFileSync(path.join(raiz, "public", "style.css"), "utf8");

/* Los ids devuelven siempre el mismo elemento: asi una prueba puede poner
   hidden = false en dos capas a la vez y comprobar cual se cierra. */
const elementosPorId = new Map();

function elementoConId(id) {
    if (!elementosPorId.has(id)) {
        elementosPorId.set(id, crearElemento(id));
    }
    return elementosPorId.get(id);
}

const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {},
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    document: {
        getElementById: (id) => elementoConId(id),
        querySelector: () => crearElemento(),
        querySelectorAll: () => [],
        createElement: (etiqueta) => {
            const elemento = crearElemento();
            // appendChild registra el panel del selector por su id.
            elemento.appendChild = (hijo) => {
                if (hijo?.id) elementosPorId.set(hijo.id, hijo);
            };
            return elemento;
        },
        addEventListener() {},
        body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} }
    },
    window: {
        matchMedia: () => ({ matches: true, addEventListener() {} }),
        addEventListener() {},
        isSecureContext: false,
        innerHeight: 800,
        history: { pushState() {}, back() {}, state: null }
    },
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: "http:", host: "127.0.0.1:3000", href: "http://127.0.0.1:3000/", reload() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    FormData: class { append() {} },
    URL: { createObjectURL: () => "" },
    Blob: class {},
    File: class {},
    MutationObserver: class { observe() {} disconnect() {} },
    crypto: { randomUUID: () => "uuid-de-prueba" },
    Event: class { constructor(tipo, opciones) { this.tipo = tipo; Object.assign(this, opciones); } },
    alert() {},
    confirm() { return false; }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
try {
    vm.createContext(sandbox);
    vm.runInContext(emojis, sandbox, { timeout: 20000 });
    vm.runInContext(codigo, sandbox, { timeout: 20000 });

    // En el DOM de mentira innerHTML siempre devolvia cadena vacia, asi que
    // escapeHtml se comia los valores (los atributos quedaban vacios). Se
    // sustituye por una version fiel: si no, las pruebas mienten.
    vm.runInContext(
        "escapeHtml = (t) => String(t ?? '')" +
            ".replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')",
        sandbox
    );

    comprobar(true, "emojis.js y app.js se ejecutan enteros sin ReferenceError");
} catch (error) {
    comprobar(false, `app.js lanzo ${error.message}`);
}

/* ---------- La lista de emojis ---------- */
/* ---------- La lista de emojis ---------- */

const totalEmojis = vm.runInContext(
    "EMOJIS_ATUISTAS.reduce((total, grupo) => total + grupo.items.length, 0)",
    sandbox
);
const grupos = vm.runInContext("EMOJIS_ATUISTAS.map((grupo) => grupo.grupo)", sandbox);

comprobar(totalEmojis > 200, `La lista trae emojis de verdad (${totalEmojis})`);
comprobar(grupos.length >= 6, `Hay varios grupos (${grupos.join(", ")})`);
comprobar(
    vm.runInContext(
        "EMOJIS_ATUISTAS.every((grupo) => grupo.etiqueta && grupo.items.every((pieza) => pieza[0] && pieza[1]))",
        sandbox
    ),
    "Cada pieza tiene emoji y nombre para poder buscarla"
);

/* ---------- La busqueda por nombre ---------- */

const normalizar = (texto) => vm.runInContext(
    `normalizarBusqueda(${JSON.stringify(texto)})`,
    sandbox
);

comprobar(normalizar("RISAS") === "risas", "La busqueda ignora mayusculas");
comprobar(normalizar("ánimo") === "animo", "La busqueda ignora los acentos");

comprobar(
    vm.runInContext(
        `EMOJIS_ATUISTAS.some((grupo) => grupo.items.some((pieza) => normalizarBusqueda(pieza[1]).includes("fuego")))`,
        sandbox
    ),
    "Se puede buscar por el nombre en espanol"
);

comprobar(
    vm.runInContext(
        `EMOJIS_ATUISTAS.every((grupo) => grupo.items.every((pieza) => !normalizarBusqueda(pieza[1]).includes("zzzz")))`,
        sandbox
    ),
    "Una busqueda sin resultados no inventa nada"
);

/* ---------- Insertar en el campo de escritura ---------- */

const entrada = crearElemento("entrada-mensaje");
entrada.value = "hola ";
entrada.selectionStart = 5;
entrada.selectionEnd = 5;
sandbox.entradaDePrueba = entrada;
vm.runInContext("insertarEnEntrada(entradaDePrueba, '😀')", sandbox);
comprobar(entrada.value === "hola 😀", "El emoji se inserta donde estaba el cursor");

const entradaMedia = crearElemento("entrada");
entradaMedia.value = "abc😀def";
entradaMedia.selectionStart = 5;
entradaMedia.selectionEnd = 5;
sandbox.entradaMedia = entradaMedia;
vm.runInContext("insertarEnEntrada(entradaMedia, '🎉')", sandbox);
comprobar(entradaMedia.value === "abc😀🎉def", "No se come lo que ya estaba escrito");

/* ---------- Los cuatro sitios con boton ---------- */

const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");

comprobar(
    codigo.includes('asegurarBotonEmoji("entrada-mensaje", "chat")'),
    "El chat privado engancha su boton de emojis"
);
comprobar(
    codigo.includes('asegurarBotonEmoji("entrada-mensaje-servidor", "servidor")'),
    "El servidor engancha su boton de emojis"
);
comprobar(
    codigo.includes('asegurarBotonEmoji("texto-comentario-reel", "comentario-reel")'),
    "Los comentarios de reels enganchan su boton"
);
comprobar(
    codigo.includes('asegurarBotonEmoji(idEntrada, "comentario-publicacion")'),
    "Los comentarios de publicaciones enganchan su boton"
);

comprobar(html.includes("/data/emojis.js"), "index.html carga la lista de emojis antes que app.js");

// El boton de ubicacion tiene que estar en los dos menus de adjuntos y con el
// atributo bien escrito: con data-adunto el menu responde y no pasa nada.
const menus = html.match(/<div id="menu-adjuntar-(chat|servidor)"[\s\S]*?<\/div>/g) || [];
comprobar(menus.length === 2, "Los dos menus de adjuntos estan en el HTML");
comprobar(
    menus.every((menu) => menu.includes('data-adjunto="ubicacion"')),
    "Los dos menus ofrecen compartir ubicacion"
);
comprobar(
    !html.includes('data-adunto="'),
    "Ningun boton se queda con el atributo mal escrito (data-adunto)"
);
comprobar(
    menus.every((menu) => !menu.includes('data-adunto="')),
    "El menu de adjuntos no tiene atributos mutados"
);

/* ---------- La campanita de avisos ---------- */

comprobar(
    html.includes('id="boton-campana-notificaciones"'),
    "Hay una campanita en la cabecera"
);
comprobar(
    /<header class="barra-superior">[\s\S]*?boton-campana-notificaciones/.test(html),
    "La campanita esta dentro de la cabecera, junto al titulo"
);
comprobar(
    !html.includes('id="boton-abrir-notificaciones"'),
    "El boton de NOTIFICACIONES de Cuenta ya no esta"
);
comprobar(
    !html.includes('id="punto-notificaciones-cuenta"'),
    "El icono de Cuenta ya no lleva punto rojo de avisos"
);
comprobar(
    !html.includes("boton-leer-todas-notificaciones"),
    "No queda el boton de marcar como leidas"
);
comprobar(
    codigo.includes("boton-campana-notificaciones") &&
        codigo.includes('solicitarGrupo("/api/notificaciones/leer-todas", { method: "POST" })'),
    "Al abrir los avisos se marcan leidos solos"
);
comprobar(
    !codigo.includes("punto-notificaciones-cuenta"),
    "El punto rojo se pinta solo en la campanita"
);
comprobar(css.includes(".boton-campana {"), "La campanita tiene estilos");

/* ---------- El selector no se cierra al deslizar ---------- */

comprobar(
    codigo.includes("panel.contains(evento.target)"),
    "Deslizar dentro del panel no lo cierra"
);
comprobar(
    codigo.includes("destinoSelector?.ancla"),
    "El panel recuerda el boton que lo abrio"
);
comprobar(
    !/addEventListener\("scroll", \(\) => \{[\s\S]{0,80}cerrerSelector\(\)/.test(codigo) &&
        !/addEventListener\("scroll", \(\) => \{[\s\S]{0,80}cerrarSelector\(\)/.test(codigo),
    "Ningun scroll cierra el panel a pelo"
);

/* ---------- El texto vacio ocupa el ancho ---------- */

comprobar(
    /\.selector-medio-vacio\s*\{[^}]*grid-column:\s*1 \/ -1/.test(css),
    "El texto de buscar GIF o sticker ocupa todo el ancho"
);

/* ---------- El teclado del movil no se abre solo ---------- */

comprobar(
    codigo.includes('boton.addEventListener("mousedown", (evento) => evento.preventDefault())'),
    "El boton no roba el foco: en el movil no salta el teclado"
);
const bloqueAbrirChat = codigo.slice(
    codigo.indexOf("async function abrirChat("),
    codigo.indexOf("async function abrirChat(") + 3000
);
comprobar(
    !bloqueAbrirChat.includes(".focus()"),
    "Entrar en un chat ya no enfoca el campo ni abre el teclado"
);

/* ---------- La tarjeta del mapa y el boton de parar ---------- */

// El mapa se monta con teselas de OpenStreetMap, no con el "embed" del mapa:
// aquel devuelve una pagina HTML y dentro de un <img> nunca se veía.
const mapa = vm.runInContext(
    "pintarMapaUbicacion(40.4168, -3.7038)",
    sandbox
);
comprobar(mapa.teselas.length === 4, "La tarjeta monta cuatro teselas de mapa");
comprobar(
    mapa.teselas.every((tesela) =>
        tesela.url.startsWith("https://tile.openstreetmap.org/")
    ),
    "Las teselas salen del servidor público de OpenStreetMap"
);
comprobar(
    mapa.estilo.includes("background") || mapa.estilo.includes("url("),
    "La tarjeta pinta las teselas como fondo"
);
comprobar(
    !codigo.includes("export/embed.html"),
    "No queda ningun embed de mapa puesto como si fuera una imagen"
);

const tarjeta = vm.runInContext(
    `htmlTarjetaUbicacion({
        id: "m1",
        es_mio: true,
        datos: { ubicacion: { lat: 40.4168, lon: -3.7038, enVivo: true,
            expiraEn: new Date(Date.now() + 600000).toISOString(), nombre: "Prueba" } }
    })`,
    sandbox
);

comprobar(tarjeta.includes("ubicacion-chincheta"), "La tarjeta lleva su chincheta");
comprobar(tarjeta.includes("© OpenStreetMap"), "La tarjeta cita a OpenStreetMap");
comprobar(tarjeta.includes("ABRIR EN EL MAPA"), "Se puede abrir el mapa aparte");
comprobar(
    tarjeta.includes('data-parar-ubicacion="m1"'),
    "Quien comparte ve el boton de dejar de compartir"
);
comprobar(tarjeta.includes("● En vivo"), "La tarjeta avisa de que sigue en vivo");

const tarjetaAjena = vm.runInContext(
    `htmlTarjetaUbicacion({
        id: "m2",
        es_mio: false,
        datos: { ubicacion: { lat: 40.4168, lon: -3.7038, enVivo: true,
            expiraEn: new Date(Date.now() + 600000).toISOString(), nombre: "Prueba" } }
    })`,
    sandbox
);

comprobar(
    !tarjetaAjena.includes("data-parar-ubicacion"),
    "Quien no comparte no puede parar la ubicacion ajena"
);

const tarjetaParada = vm.runInContext(
    `htmlTarjetaUbicacion({
        id: "m3",
        es_mio: true,
        datos: { ubicacion: { lat: 40.4168, lon: -3.7038, enVivo: false, nombre: "Prueba" } }
    })`,
    sandbox
);

comprobar(
    !tarjetaParada.includes("data-parar-ubicacion"),
    "Una ubicacion ya parada no ofrece volver a pararla"
);
comprobar(tarjetaParada.includes("■ Ubicación"), "Una ubicacion parada lo dice");

/* ---------- El chat no se repinta entero ---------- */

// El nodo se reutiliza si el mensaje no ha cambiado: es lo que evita que las
// fotos y el mapa parpadeen con cada refresco.
comprobar(
    codigo.includes("function pintarMensajesChat("),
    "El chat tiene su propio pintor de mensajes"
);
comprobar(
    codigo.includes("previo.dataset.firma === firmaMensaje(mensaje)"),
    "Un mensaje que no ha cambiado conserva su nodo"
);
comprobar(
    !codigo.includes('listaMensajes.innerHTML = "";\n\n        datos.mensajes.forEach'),
    "El chat ya no borra la lista entera en cada refresco"
);

/* ---------- Estilos ---------- */

comprobar(css.includes(".selector-medio {"), "El panel del selector tiene estilos");
comprobar(css.includes(".boton-emoji {"), "El boton de emojis tiene estilos");

/* ---------- Los GIF y stickers llenan el ancho del buscador ---------- */

// Buscando GIF o stickers la rejilla pasa a columnas de 38px (no hay titulos
// de grupo): si el contenedor de los resultados no abarca todas las columnas,
// queda en una sola, diminuto y apilado a la izquierda del buscador.
const reglaMedios = css.match(/\.selector-medio-medios\s*\{([^}]*)\}/)?.[1] ?? "";
comprobar(reglaMedios.length > 0, "Los resultados de GIF tienen su regla propia");
comprobar(
    /grid-column:\s*1 \/ -1/.test(reglaMedios),
    "Los GIF y stickers abarcan todas las columnas de la rejilla"
);
comprobar(
    /display:\s*grid/.test(reglaMedios) &&
        /repeat\(auto-fill,\s*minmax\(\d+px,\s*1fr\)\)/.test(reglaMedios),
    "Los resultados se reparten en columnas que llenan el buscador"
);
comprobar(
    !/repeat\(3, 1fr\)/.test(reglaMedios),
    "Ya no estan apilados en tres columnas fijas a la izquierda"
);

/* ---------- Las capas: nada puede esconderse detras del chat ---------- */

// El boton de emojis y el de ubicacion viven dentro del chat, que es un panel
// fijo con z-index 3000. Si el selector o el modal se quedan por debajo,
// abiertas por detras no se ven: el chat sigue ahi y parece que el boton no
// hace nada (o que cierra el chat).
function zIndexDe(selectorCss) {
    const patron = new RegExp(
        `(^|,\\s*|\\}\\s*)${selectorCss.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([^}]*)\\}`,
        "m"
    );
    const bloque = css.match(patron);
    return bloque ? Number(bloque[2].match(/z-index:\s*(\d+)/)?.[1] ?? 0) : 0;
}

const zChat = zIndexDe(".panel-chat");
const zModal = zIndexDe(".modal");
const zUbicacion = zIndexDe("#modal-ubicacion");
const zSelector = zIndexDe(".selector-medio");

comprobar(zChat > 0, `El panel del chat tiene z-index propio (${zChat})`);
comprobar(
    zSelector > zChat,
    `El selector de emojis se ve por encima del chat (${zSelector} > ${zChat})`
);
comprobar(
    zUbicacion > zChat,
    `El modal de ubicacion se ve por encima del chat (${zUbicacion} > ${zChat})`
);
comprobar(
    zUbicacion >= zModal,
    `El modal de ubicacion gana a los modales normales (${zUbicacion} >= ${zModal})`
);
comprobar(
    zUbicacion >= zIndexDe("#modal-editor-foto"),
    "El modal de ubicacion va al mismo peldano que el editor de foto"
);

/* ---------- El boton atras apila y desapila de verdad ---------- */

// El caso que rompia: con el chat abierto y el selector encima, atras tiene que
// cerrar el selector y dejar el chat donde estaba. Las capas que no se nombran
// se marcan como cerradas, porque en el DOM de mentira nacen visibles.
function abrirSolo(...ids) {
    for (const id of [
        "selector-medio",
        "panel-chat",
        "panel-servidor",
        "visor-reels",
        "visor-historias-pantalla"
    ]) {
        elementoConId(id).hidden = !ids.includes(id);
    }
}

abrirSolo("selector-medio", "panel-chat");
const cerrado = vm.runInContext("cerrarCapaSuperior()", sandbox);
comprobar(cerrado === true, "Atras cierra la capa de encima");
comprobar(
    elementoConId("selector-medio").hidden === true,
    "Con el selector abierto, atras cierra el selector"
);
comprobar(
    elementoConId("panel-chat").hidden === false,
    "El chat se queda abierto: atras no lo cierra por error"
);

// Y sin selector, atras tiene que cerrar el chat.
abrirSolo("panel-chat");
vm.runInContext("cerrarCapaSuperior()", sandbox);
comprobar(
    elementoConId("panel-chat").hidden === true,
    "Sin selector abierto, atras vuelve a cerrar el chat"
);

const bloqueObservador = codigo.slice(
    codigo.indexOf("function observarCapas()"),
    codigo.indexOf("function observarCapas()") + 1200
);
comprobar(
    /subtree:\s*true/.test(bloqueObservador),
    "El observador de capas vigila todo el arbol: sin subtree no dispara nada"
);
comprobar(
    bloqueObservador.includes("#selector-medio"),
    "El selector de emojis tambien apila en el historial del boton atras"
);
comprobar(
    codigo.indexOf('document.getElementById("selector-medio")') <
        codigo.indexOf('document.getElementById("panel-chat")?.hidden'),
    "Atras cierra el selector antes que el chat"
);

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");