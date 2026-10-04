/* ========================================
   EMOJIS DE ATUISTAS

   Lista corta y usable: unas 240 piezas en seis grupos con su
   nombre en español, para poder buscarlas escribiendo. Cada entrada
   es [emoji, nombre]. Se carga antes que app.js y entra en la caché
   del service worker como el resto de ficheros estáticos.
   ======================================== */

const EMOJIS_ATUISTAS = [
    {
        grupo: "caras",
        etiqueta: "Caras",
        items: [
            ["😀", "sonrisa"], ["😃", "sonrisa grande"], ["😄", "sonrisa con ojos"],
            ["😁", "sonrisa de lado"], ["😆", "risa"], ["😅", "risa sudando"],
            ["🤣", "risa con lagrimas"], ["😂", "llanto de risa"], ["🙂", "sonrisa suave"],
            ["🙃", "sonrisa al reves"], ["😉", "guino"], ["😊", "sonrisasonrojada"],
            ["😇", "cara de angel"], ["🥰", "cara con corazones"], ["😍", "enamorado"],
            ["🤩", "cara de estrellas"], ["😘", "beso con corazones"], ["😗", "beso"],
            ["😚", "beso cerrado"], ["😙", "beso por debajo"], ["😋", "lengua"],
            ["😛", "lengua y ojo"], ["😜", "lengua guino"], ["🤪", "cara de broma"],
            ["🤨", "ceja levantada"], ["🧐", "con lupa"], ["🤓", "nerd"], ["😎", "gafas de sol"],
            ["🥳", "fiesta"], ["🥺", "por favor"], ["😢", "llanto"], ["😭", "llanto fuerte"],
            ["😤", "enfado"], ["😠", "enfadado"], ["😡", "muy enfadado"], ["🤬", "maldecir"],
            ["😳", "sorprendido"], ["😱", "grito"], ["😨", "miedo"], ["😰", "miedo con sudor"],
            ["😔", "cara pensativa"], ["🤔", "pensando"], ["🤯", "cabeza explotando"],
            ["😴", "dormido"], ["🤤", "baboseando"], ["🥱", "bostezo"], ["🤒", "fiebre"],
            ["🤕", "dolor de cabeza"], ["🤢", "mareado"], ["🤮", "vomitando"], ["🥵", "caliente"],
            ["🥶", "congelado"], ["😷", "conectable"], ["😵", "aturdido"],
            ["😶", "sin boca"], ["😐", "neutro"], ["😑", "sin expresion"], ["😏", "lengua de lado"],
            ["🙄", "ojos arriba"], ["😬", "dientes apretados"], ["🤐", "boca cerrada"],
            ["🤑", "dinero en la cara"], ["🤠", "cowboy"], ["🥸", "gafas"], ["🫠", "cara derretida"]
        ]
    },

{
        grupo: "personas",
        etiqueta: "Personas",
        items: [
            ["👋", "hola"], ["🤚", "mano levantada"], ["🖐️", "mano abierta"], ["✋", "mano en alto"],
            ["🖖", "mano de vulcano"], ["👌", "ok"], ["🤌", "dedos juntos"], ["🤏", "pinza"],
            ["✌️", "victoria"], ["🤞", "dedos cruzados"], ["🤟", "te quiero"], ["🤘", "rock"],
            ["🤙", "llamame"], ["👈", "apunta izquierda"], ["👉", "apunta derecha"],
            ["👆", "arriba"], ["👇", "abajo"], ["☝️", "dedo arriba"], ["👍", "pulgar arriba"],
            ["👎", "pulgar abajo"], ["✊", "puno"], ["👊", "golpe de puno"], ["👏", "aplauso"],
            ["🙌", "manos arriba"], ["🤝", "apreton de manos"], ["🙏", "gracias"], ["✍️", "escribiendo"],
            ["💪", "fuerza"], ["🦾", "brazo robot"], ["👀", "ojos"], ["🧠", "cerebro"],
            ["❤️", "corazon rojo"], ["🧡", "corazon naranja"], ["💛", "corazon amarillo"],
            ["💚", "corazon verde"], ["💙", "corazon azul"], ["💜", "corazon morado"],
            ["🖤", "corazon negro"], ["🤍", "corazon blanco"], ["💔", "corazon roto"],
            ["👨‍👩‍👧", "familia"], ["👩‍❤️‍👨", "pareja"], ["👶", "bebe"], ["🚶", "caminando"],
            ["🏃", "corriendo"], ["💃", "bailando"], ["🕺", "hombre bailando"],
            ["🧘", "meditando"], ["🛌", "durmiendo"], ["👮", "policia"], ["🧑‍💻", "programando"],
            ["🧑‍🍳", "cocinando"], ["🧑‍🌾", "agricultor"], ["🧑‍🎨", "artista"], ["👷", "obrero"],
            ["🤷", "no se"], ["🤦", "me cago"], ["🤷‍♂️", "hombre no se"], ["💁", "explicando"]
        ]
    },

{
        grupo: "animales",
        etiqueta: "Animales",
        items: [
            ["🐶", "perro"], ["🐱", "gato"], ["🐭", "raton"], ["🐹", "hamster"], ["🐰", "conejo"],
            ["🦊", "zorro"], ["🐻", "oso"], ["🐼", "panda"], ["🐨", "koala"], ["🐯", "tigre"],
            ["🦁", "leon"], ["🐮", "vaca"], ["🐷", "cerdo"], ["🐸", "rana"], ["🐵", "mono"],
            ["🐔", "gallina"], ["🐧", "pinguino"], ["🐦", "pajaro"], ["🦆", "pato"], ["🦉", "buho"],
            ["🦇", "murcielago"], ["🐺", "lobo"], ["🐗", "jabali"], ["🐴", "caballo"], ["🦄", "unicornio"],
            ["🐝", "abeja"], ["🐛", "oruga"], ["🦋", "mariposa"], ["🐌", "caracol"], ["🐞", "mariquita"],
            ["🐢", "tortuga"], ["🐍", "serpiente"], ["🦖", "dinosaurio"], ["🦎", "lagarto"],
            ["🐙", "pulpo"], ["🦑", "calamar"], ["🦀", "cangrejo"], ["🐠", "pez"], ["🐬", "delfin"],
            ["🐳", "ballena"], ["🦈", "tiburon"], ["🐊", "cocodrilo"], ["🐘", "elefante"],
            ["🦒", "jirafa"], ["🦓", "cebra"], ["🦘", "canguro"], ["🦌", "ciervo"], ["🐑", "oveja"],
            ["🐐", "cabra"], ["🐕", "perro alto"], ["🐈", "gato alto"], ["🐓", "gallo"]
        ]
    },

{
        grupo: "comida",
        etiqueta: "Comida",
        items: [
            ["🍏", "manzana verde"], ["🍎", "manzana"], ["🍐", "pera"], ["🍊", "mandarina"],
            ["🍋", "limon"], ["🍌", "platano"], ["🍉", "sandia"], ["🍇", "uvas"], ["🍓", "fresa"],
            ["🫐", "arandanos"], ["🍒", "cereza"], ["🍑", "melocoton"], ["🥭", "mango"], ["🍍", "pina"],
            ["🥝", "kiwi"], ["🍅", "tomate"], ["🥑", "aguacate"], ["🍕", "pizza"], ["🍔", "hamburguesa"],
            ["🍟", "patatas"], ["🌭", "perro caliente"], ["🥪", "sanguche"], ["🌮", "taco"],
            ["🍣", "sushi"], ["🍜", "noodles"], ["🍝", "pasta"], ["🍚", "arroz"], ["🍛", "curry"],
            ["🍤", "gambas"], ["🍦", "helado"], ["🍩", "dona"], ["🍪", "galleta"], ["🎂", "pastel"],
            ["🍰", "tarta"], ["🧁", "magdalena"], ["🍫", "chocolate"], ["🍬", "caramelo"],
            ["☕", "cafe"], ["🍵", "te"], ["🥤", "refresco"], ["🧋", "bubble tea"], ["🍺", "cerveza"],
            ["🍷", "vino"], ["🍸", "coctel"], ["🧃", "zumo"], ["🥛", "leche"], ["🍽️", "tenedor"],
            ["🥣", "bol"], ["🍲", "olla"], ["🥘", "paella"], ["🧀", "queso"]
        ]
    },

{
        grupo: "actividades",
        etiqueta: "Actividades",
        items: [
            ["⚽", "futbol"], ["🏀", "baloncesto"], ["🏈", "futbol americano"], ["⚾", "beisbol"],
            ["🎾", "tenis"], ["🏐", "voley"], ["🏉", "rugby"], ["🎱", "billar"], ["🏓", "tenis de mesa"],
            ["🏸", "badminto"], ["🥊", "boxeo"], ["🛹", "monopatin"], ["⛷️", "esqui"], ["🏂", "snowboard"],
            ["🏋️", "gimnasio"], ["🤸", "gimnasia"], ["🏄", "surf"], ["🚴", "bici"], ["🏆", "trofeo"],
            ["🥇", "medalla oro"], ["🥈", "medalla plata"], ["🥉", "medalla bronce"], ["🎮", "videojuego"],
            ["🎲", "dado"], ["🎯", "diana"], ["🎤", "microfono"], ["🎧", "auriculares"],
            ["🎸", "guitarra"], ["🥁", "tambor"], ["🎹", "piano"], ["🎬", "clapper"], ["🎭", "teatro"],
            ["🎨", "paleta"], ["🎟️", "entrada"], ["🎪", "circo"], ["🎉", "fiesta"],
            ["🎊", "confeti"], ["🎁", "regalo"], ["🎈", "globo"], ["🔥", "fuego"],
            ["🧩", "rompecabezas"], ["♟️", "ajedrez"], ["🃏", "naipes"], ["🎣", "pesca"]
        ]
    },

{
        grupo: "objetos",
        etiqueta: "Objetos",
        items: [
            ["💻", "ordenador"], ["🖥️", "monitor"], ["📱", "movil"], ["⌨️", "teclado"], ["🖱️", "raton"],
            ["💾", "disco"], ["📷", "camara"], ["📸", "foto"], ["🎥", "camara de video"],
            ["📺", "television"], ["📻", "radio"], ["⏰", "reloj"], ["⌚", "reloj de pulsera"],
            ["💡", "bombilla"], ["🔦", "linterna"], ["🕯️", "vela"], ["🔋", "bateria"], ["🔌", "enchufe"],
            ["💰", "cartera"], ["💳", "tarjeta"], ["💎", "diamante"], ["🔧", "llave inglesa"],
            ["🔨", "martillo"], ["🛠️", "herramientas"], ["⚙️", "engranaje"], ["🧰", "caja herramientas"],
            ["🧲", "iman"], ["💊", "pastilla"], ["📦", "paquete"], ["✏️", "lapiz"], ["📝", "cuaderno"],
            ["📌", "chincheta"], ["📎", "clip"], ["📅", "calendario"], ["✅", "hecho"], ["❌", "error"],
            ["❓", "interrogacion"], ["❗", "importante"], ["💯", "cien por ciento"], ["🔔", "campana"],
            ["🔕", "campana muda"], ["🎵", "nota musical"], ["➕", "mas"], ["➖", "menos"], ["🔗", "enlace"],
            ["♻️", "reciclar"], ["🆗", "ok"], ["🆕", "nuevo"], ["🔝", "arriba"], ["💬", "bocadillo"],
            ["👁️", "ojo"], ["🌙", "luna"], ["☀️", "sol"], ["⭐", "estrella"], ["🌈", "arcoiris"],
            ["🗺️", "mapa"], ["📍", "ubicacion"], ["🚗", "coche"], ["🚌", "autobus"], ["✈️", "avion"],
            ["🏠", "casa"], ["🌍", "mundo"], ["🌎", "tierra"]
        ]
    }
];