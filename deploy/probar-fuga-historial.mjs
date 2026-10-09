/**
 * Prueba de fuga de historial en un Chrome REAL (puppeteer).
 *
 * Reproduce el escenario del fallo: el usuario llega a Atuistas desde Google
 * (la pestaña tiene el historial [google, atuistas]) y pulsa los botones del
 * menú inferior. Si la app gasta de mas una entrada del historial, la URL sale
 * de atuistas.com (a google.com) y la prueba falla.
 *
 * Uso:
 *   BASE=http://127.0.0.1:3100 node deploy/probar-fuga-historial.mjs
 *
 * Necesita puppeteer instalado (npm install --no-save puppeteer). Si no
 * está, la prueba se salta con aviso y no falla.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.BASE || "http://127.0.0.1:3100";

let puppeteer;
try {
    puppeteer = (await import("puppeteer")).default;
} catch {
    console.log("SALTADO: puppeteer no está instalado (npm install --no-save puppeteer).");
    process.exit(0);
}

const fallos = [];
const comprobar = (ok, texto) => {
    console.log(`${ok ? "OK  " : "FALLO"} ${texto}`);
    if (!ok) fallos.push(texto);
};

// Cuenta de prueba directa contra la API.
const sufijo = Date.now().toString().slice(-8);
const registro = await fetch(`${base}/api/auth/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: `fuga${sufijo}`, dispositivo_id: `fuga-${sufijo}` })
}).then((r) => r.json());
if (!registro?.usuario?.token) {
    console.log(`SALTADO: no hay servidor local en ${base} (arranca dist/app.js con el puerto de BASE).`);
    process.exit(0);
}
const token = registro.usuario.token;

const navegador = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const pagina = await navegador.newPage();

const navegaciones = [];
pagina.on("framenavigated", (marco) => {
    if (marco === pagina.mainFrame()) navegaciones.push(marco.url());
});

async function entrarDesde(urlOrigen) {
    // La pestaña nace en el origen y NAVEGA a la app, como un usuario real:
    // eso deja la entrada del origen debajo de la de la app.
    await pagina.goto(urlOrigen, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await pagina.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Token en local storage y recarga: la app arranca con sesion iniciada.
    await pagina.evaluate((t) => {
        localStorage.setItem("atuistas_token", t);
    }, token);
    await pagina.reload({ waitUntil: "domcontentloaded" });
    await pagina.waitForFunction(
        () => document.getElementById("pantalla-app")?.hidden === false,
        { timeout: 20000 }
    );
    // De aqui en adelante solo cuenta lo que haga la app.
    navegaciones.length = 0;
}

async function estado() {
    return pagina.evaluate(() => ({
        url: location.href,
        estado: history.state,
        largo: history.length
    }));
}

async function pulsar(id) {
    await pagina.click(`#${id}`);
    await new Promise((r) => setTimeout(r, 600));
}

async function pulsarYDiagnosticar(id) {
    await pulsar(id);
    const e = await estado();
    console.log(
        `    ${id.padEnd(20)} url=${e.url} largo=${e.largo} state=${JSON.stringify(e.estado)}`
    );
    return e;
}

/* ---------- Escenario 1: llegada desde Google, botones del menu ---------- */

console.log("== Escenario 1: desde Google hacia los botones del menu ==");
await entrarDesde("https://www.google.com/");
let e = await estado();
comprobar(
    e.url.startsWith(base),
    `La app arranca en su propia URL (${e.url})`
);

// Recorrido de ida y vuelta por todos los botones de abajo.
for (const boton of ["boton-cuenta", "boton-amigos", "boton-servidores", "boton-entrar-app", "boton-cuenta"]) {
    e = await pulsarYDiagnosticar(boton);
    comprobar(
        e.url.startsWith(base),
        `Tras pulsar ${boton} sigue en la app (${e.url})`
    );
}

// Abrir el modal de Crear y volver a cambiar de pestaña: el caso de dos capas.
await pulsar("boton-crear");
e = await estado();
comprobar(e.url.startsWith(base), `Abrir Crear no sale de la app (${e.url})`);
for (const boton of ["boton-cuenta", "boton-servidores", "boton-entrar-app"]) {
    await pulsar(boton);
    e = await estado();
    comprobar(
        e.url.startsWith(base),
        `Con el modal por medio, ${boton} sigue en la app (${e.url})`
    );
}

// Atras del sistema (como el gesto del movil). Si la entrada actual es
// nuestra (state.capa), un atras tiene que caer DENTRO de la app: el bug era
// que el atras del sistema acababa en google.com sin mas.
e = await estado();
const entradaEsNuestra = e.estado && typeof e.estado.capa !== "undefined";
console.log(`    antes del atras: largo=${e.largo} state=${JSON.stringify(e.estado)}`);
await pagina.goBack().catch(() => {});
await new Promise((r) => setTimeout(r, 500));
e = await estado();
if (entradaEsNuestra) {
    comprobar(
        e.url.startsWith(base),
        `Un atras del sistema desde una entrada de la app se queda en la app (${e.url})`
    );
} else {
    // Estabamos en la primera entrada de la app: salir al origen (Google) es
    // el comportamiento normal del navegador, no un fallo de la app.
    console.log(`INFO: ya estabamos en la primera entrada; el atras sale a ${e.url}`);
    await pagina.goto(base, { waitUntil: "domcontentloaded" });
    await pagina.waitForFunction(
        () => document.getElementById("pantalla-app")?.hidden === false,
        { timeout: 20000 }
    );
}

// El atras deliberado de arriba tambien es montaje: se limpia el rastro.
navegaciones.length = 0;

// Escenario con el chat abierto: ocultar panel-chat al cambiar de pestaña es
// una mutacion real del observador (el caso rico del bug original).
await pagina.evaluate(() => {
    const chat = document.getElementById("panel-chat");
    if (chat) chat.hidden = false;
});
for (const boton of ["boton-cuenta", "boton-servidores", "boton-entrar-app"]) {
    e = await pulsarYDiagnosticar(boton);
    comprobar(
        e.url.startsWith(base),
        `Con el chat abierto, ${boton} sigue en la app (${e.url})`
    );
}

// Y tras ese atras, los botones tienen que seguir funcionando sin fugarse.
for (const boton of ["boton-amigos", "boton-cuenta", "boton-entrar-app"]) {
    await pulsar(boton);
    e = await estado();
    comprobar(
        e.url.startsWith(base),
        `Tras el atras del sistema, ${boton} sigue en la app (${e.url})`
    );
}

/* ---------- Escenario 2: pulsaciones rapidas seguidas ---------- */

console.log("== Escenario 2: pulsaciones rapidas ==");
for (let i = 0; i < 3; i++) {
    for (const boton of ["boton-cuenta", "boton-servidores", "boton-amigos"]) {
        await pagina.click(`#${boton}`).catch(() => {});
        await new Promise((r) => setTimeout(r, 80));
    }
}
await new Promise((r) => setTimeout(r, 800));
e = await estado();
comprobar(
    e.url.startsWith(base),
    `Tras pulsaciones rapidas sigue en la app (${e.url})`
);

// Resumen de todo lo que ha navegado el frameset principal. El historial de
// montaje (Google inicial y el atras deliberado) se limpia en su momento: solo
// cuenta que ninguna pulsacion de la app saque de la app.
const fuera = navegaciones.filter((u) => !u.startsWith(base));
comprobar(
    fuera.length === 0,
    `El navegador no ha salido de la app en ningun momento${fuera.length ? `: ${fuera.join(", ")}` : ""}`
);

await navegador.close();

console.log("");
if (fallos.length) {
    console.log(`${fallos.length} comprobaciones fallidas.`);
    process.exit(1);
}
console.log("Todas las comprobaciones pasan.");
