# Atuistas — Arquitectura del proyecto

## 1. Propósito de este documento

Este documento describe la arquitectura, las reglas de funcionamiento y el estado técnico del proyecto Atuistas.

Su objetivo principal es servir como referencia para cualquier persona o herramienta que trabaje posteriormente sobre el proyecto.

### Regla fundamental

Antes de modificar una funcionalidad existente, se debe comprobar:

1. Qué comportamiento está definido en este documento.
2. Qué comportamiento existe actualmente en el código.
3. Qué comportamiento existe actualmente en la base de datos.
4. Si la modificación puede afectar a otras partes del sistema.

No se debe sustituir una implementación funcional simplemente porque una funcionalidad futura esté descrita en este documento.

Las funcionalidades marcadas como **futuras** o **pendientes** no deben implementarse automáticamente salvo que se solicite expresamente.

---

# 2. Objetivo de Atuistas

Atuistas es una red social privada destinada inicialmente a un grupo de personas conocidas.

El proyecto está diseñado para evolucionar progresivamente desde una aplicación web hacia:

- Aplicación web.
- PWA.
- Aplicación Android.
- Publicación posterior en Google Play.

La infraestructura está pensada para utilizar un backend y una base de datos propios.

La aplicación está diseñada principalmente para dispositivos móviles.

---

# 3. Arquitectura general

La arquitectura actual sigue este modelo:

```text
Navegador / PWA
       │
       │ HTTP
       ▼
Backend Node.js + Fastify
       │
       │ SQL
       ▼
PostgreSQL
```

El frontend **no debe conectarse directamente a PostgreSQL**.

Todas las operaciones que afecten a datos, autenticación, permisos o reglas de negocio deben pasar por el backend.

---

# 4. Tecnologías actuales

## Backend

Actualmente se utiliza:

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- `pg`
- Argon2
- `dotenv`
- Fastify Multipart
- Fastify Static
- Fastify CORS

## Frontend

Actualmente:

- HTML
- CSS
- JavaScript

La separación entre frontend y backend debe mantenerse para permitir evolucionar posteriormente la interfaz sin tener que rehacer la lógica de servidor.

## Base de datos

- PostgreSQL
- UUID mediante `pgcrypto`

---

# 5. Estructura actual del proyecto

La estructura principal es:

```text
Atuistas/
│
├── docs/
│   ├── ARCHITECTURE.md
│   └── DATABASE.md
│
├── public/
│   ├── app.js
│   ├── index.html
│   └── style.css
│
├── src/
│   ├── app.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   ├── db/
│   │   ├── database.ts
│   │   └── schema.sql
│   │
│   ├── middleware/
│   │   └── auth.middleware.ts
│   │
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── amigos.routes.ts
│   │   └── mensajes.routes.ts
│   │
│   └── services/
│       ├── auth.service.ts
│       ├── amigos.service.ts
│       ├── codigo.service.ts
│       └── mensajes.service.ts
│
├── .env
├── .env.example
├── package.json
├── package-lock.json
└── tsconfig.json
```

---

# 6. Responsabilidad de cada capa

## `public/`

Contiene la interfaz del usuario.

Debe encargarse principalmente de:

- Mostrar información.
- Recibir acciones del usuario.
- Realizar peticiones HTTP a la API.
- Gestionar el estado visual.
- Mostrar errores y resultados.

El frontend **no es una capa de seguridad**.

Nunca debe asumirse que algo es seguro porque un botón no aparezca o porque JavaScript lo impida.

---

## `src/routes/`

Contiene los endpoints HTTP.

Las rutas deben encargarse principalmente de:

- Recibir peticiones.
- Validar la estructura básica de los datos.
- Comprobar autenticación mediante middleware cuando corresponda.
- Llamar a los servicios.
- Devolver respuestas HTTP.

La lógica compleja de negocio debe permanecer en los servicios siempre que sea posible.

---

## `src/services/`

Contiene la lógica de negocio.

Ejemplos:

- Crear usuarios.
- Crear sesiones.
- Comprobar amistades.
- Comprobar bloqueos.
- Crear conversaciones.
- Enviar mensajes.
- Editar mensajes.
- Gestionar códigos de vinculación.

Las reglas de seguridad importantes deben comprobarse aquí aunque el frontend ya las haya comprobado.

---

## `src/middleware/`

Contiene lógica transversal de las peticiones.

Actualmente se utiliza para autenticar sesiones.

---

## `src/db/`

Contiene:

- Conexión con PostgreSQL.
- Esquema SQL.

El backend es el único componente que debe acceder directamente a la base de datos.

---

# 7. Ejecución actual

El proyecto utiliza:

```text
npm run dev
```

para ejecutar el backend mediante `tsx`.

La compilación TypeScript utiliza:

```text
npm run build
```

La aplicación compilada se inicia mediante:

```text
npm start
```

El backend actual utiliza Fastify.

---

# 8. Configuración

La configuración sensible se obtiene mediante variables de entorno.

Entre ellas:

- Puerto del servidor.
- Host.
- Configuración de PostgreSQL.
- Clave utilizada por el sistema de códigos.

Los secretos no deben escribirse directamente en el código fuente.

`.env` no debe incluirse en Git.

---

# 9. Autenticación

Atuistas **no utiliza un sistema tradicional de contraseña**.

La credencial principal de acceso es el **código de vinculación de la cuenta**.

No se debe introducir una arquitectura de:

```text
password
password_hash
contraseña
```

salvo que se tome expresamente una nueva decisión de producto.

---

# 10. Código de vinculación

El código de vinculación tiene actualmente el formato:

```text
ATU-XXXX-XXXX
```

Los caracteres proceden de un conjunto diseñado para evitar caracteres ambiguos.

El código se genera criptográficamente.

El sistema actual utiliza:

- HMAC-SHA256 para obtener un valor de comprobación.
- AES-256-GCM para almacenar una versión cifrada que posteriormente pueda recuperarse para mostrar el código al propio usuario.

Esto significa que el sistema tiene dos necesidades diferentes:

```text
Código original
     │
     ├── HMAC-SHA256 → comprobación de acceso
     │
     └── AES-256-GCM → recuperación del código
```

La clave criptográfica procede de la configuración del servidor.

El código nunca debe almacenarse en texto plano.

---

# 11. Recuperación del código

No existe recuperación mediante correo electrónico u otro sistema externo.

Si el usuario pierde el código y no dispone de otro mecanismo válido para acceder a la cuenta, la cuenta puede quedar inaccesible.

El usuario sí puede solicitar una regeneración del código desde una sesión autenticada.

La regeneración sustituye el código anterior.

---

# 12. Sesiones

Las sesiones permiten mantener autenticado al usuario después de la vinculación.

Una cuenta puede tener sesiones en diferentes dispositivos.

El token actual utiliza conceptualmente:

```text
identificador_de_sesion.secreto_de_sesion
```

El secreto de sesión se almacena en forma de hash mediante Argon2.

La sesión contiene:

- Usuario.
- Identificador.
- Hash del secreto.
- Fecha de creación.
- Fecha de expiración.
- Último uso.
- Revocación.
- Dispositivo asociado.

La duración actualmente implementada es de aproximadamente:

**30 días**

Las sesiones pueden revocarse mediante cierre de sesión.

---

# 13. Dispositivos

Los dispositivos permiten identificar diferentes clientes utilizados por un usuario.

Actualmente se utiliza un identificador proporcionado por el cliente.

La estructura también contempla información para futuras notificaciones Push:

- nombre
- plataforma
- push token

Un usuario puede tener varios dispositivos.

---

# 14. Middleware de autenticación

Los endpoints protegidos utilizan el middleware de autenticación.

El cliente envía:

```text
Authorization: Bearer <token>
```

El backend:

1. Extrae el token.
2. Obtiene el identificador de sesión.
3. Busca la sesión.
4. Comprueba que no esté revocada.
5. Comprueba que no haya expirado.
6. Verifica el secreto mediante Argon2.
7. Obtiene el usuario.
8. Actualiza el último uso.
9. Añade el usuario autenticado a la petición.

El frontend nunca debe poder decidir por sí mismo si una petición está autorizada.

---

# 15. Usuarios

Cada usuario tiene como mínimo:

- ID.
- Nombre.
- Nombre normalizado.
- Descripción.
- Avatar.
- Color del nombre.
- Código de vinculación.
- Fecha de creación.
- Estado activo/inactivo.

## Nombre

Reglas definitivas:

- Máximo **25 caracteres**.
- No puede estar vacío.
- Es único ignorando diferencias de normalización utilizadas por el backend.
- Puede cambiarse posteriormente.

La base de datos y el código deben mantenerse sincronizados con este límite de 25 caracteres.

---

# 16. Descripción

La descripción del usuario puede contener como máximo:

**500 caracteres**.

---

# 17. Avatar

Los avatares se almacenan mediante el sistema común de archivos.

La base de datos conserva la referencia al archivo.

El archivo físico no se almacena dentro de PostgreSQL.

El endpoint actual de avatar utiliza multipart y limita el tamaño de subida.

---

# 18. Amistades

Atuistas utiliza un sistema real de solicitudes y amistades.

Flujo:

```text
Usuario A
   │
   │ solicitud
   ▼
Usuario B
   │
   │ acepta
   ▼
Amistad
```

Las amistades son bidireccionales.

La tabla de amistades utiliza una representación canónica para evitar guardar:

```text
A → B
B → A
```

como dos relaciones diferentes.

---

# 19. Solicitudes de amistad

Las solicitudes tienen los estados:

- pendiente
- aceptada
- rechazada

No se permite tener simultáneamente una solicitud pendiente duplicada entre las mismas dos personas aunque se invierta el sentido.

Actualmente existe una regla adicional en el servicio para permitir volver a enviar una solicitud rechazada después de un período de espera.

El backend debe comprobar estas condiciones.

---

# 20. Bloqueos

Los bloqueos son direccionales.

Si A bloquea a B:

```text
A → B
```

existe un bloqueo.

Un bloqueo impide como mínimo:

- Solicitudes de amistad entre los usuarios afectados.
- Conversaciones privadas entre los usuarios afectados.

El backend debe comprobar los bloqueos.

No se debe confiar en el estado mostrado por el frontend.

---

# 21. Navegación principal

La interfaz principal está diseñada alrededor de cuatro secciones:

```text
ENTRAR
AGREGAR AMIGOS
SERVIDORES
CUENTA
```

`CUENTA` tiene un tratamiento visual ligeramente diferente.

La interfaz está diseñada prioritariamente para móvil.

---

# 22. ENTRAR

La sección ENTRAR está centrada inicialmente en la actividad de los amigos.

La experiencia prevista incluye:

1. Estados de amigos.
2. Conversaciones recientes.
3. Amigos con los que todavía no se ha hablado.
4. Publicaciones de amigos.

La sección pública se plantea como una zona separada y no debe aparecer inicialmente al lado de la sección centrada de amigos.

---

# 23. Estados

Los estados pertenecen a usuarios.

Se muestran principalmente en ENTRAR.

Los estados se organizan visualmente por persona.

Actualmente la base de datos contempla:

- texto
- imágenes
- vídeo
- fecha de expiración
- visibilidad

La visibilidad inicial es para amigos.

La duración exacta y todas las reglas visuales pueden evolucionar posteriormente.

---

# 24. Chats privados

Los chats privados solamente están permitidos entre amigos.

Antes de crear o utilizar una conversación se comprueba:

1. Que no sea el propio usuario.
2. Que ambos usuarios sean amigos.
3. Que no exista un bloqueo entre ellos.

El backend actual ya implementa estas comprobaciones.

---

# 25. Mensajes privados

Los tipos actuales son:

- texto
- imagen
- audio

La base de datos permite asociar un archivo a mensajes multimedia.

Los mensajes también permiten:

- respuesta a otro mensaje
- edición de mensajes de texto
- eliminación
- futura ampliación a otros tipos de contenido

La eliminación debe ser una eliminación real del mensaje, sin mostrar:

```text
Mensaje eliminado
```

ni crear un marcador visible equivalente.

---

# 26. Edición de mensajes

El backend ya dispone de lógica para editar mensajes de texto.

La edición:

- Solo puede realizarla el autor.
- Solo se aplica a mensajes de texto.
- Sustituye el contenido.
- Guarda `editado_en`.

La interfaz y las rutas HTTP necesarias para exponer completamente esta funcionalidad pueden estar todavía pendientes.

No debe asumirse que una función existente en un servicio significa que toda la funcionalidad está terminada.

---

# 27. Imágenes de mensajes

Reglas de producto:

- Más de 8 MB: intentar comprimir.
- Límite absoluto: 12 MB.

La validación debe realizarse en backend.

No se debe confiar únicamente en el límite del navegador.

---

# 28. Audio de mensajes

Duración máxima:

**3 minutos y 30 segundos.**

El backend debe validar la duración real del archivo.

---

# 29. Grupos / SERVIDORES

Los grupos se muestran dentro de la sección SERVIDORES.

Existen dos tipos:

```text
normal
amistades
```

## Grupo normal

La pertenencia no depende de que el miembro continúe siendo amigo del creador.

## Grupo de amistades

La pertenencia de determinados miembros está vinculada a la amistad con el creador.

Si el creador deja de ser amigo de una persona añadida mediante esta relación, dicha persona debe abandonar automáticamente el grupo.

La información `origen` de `miembros_grupo` permite distinguir pertenencias manuales y relacionadas con amistades.

---

# 30. Grupos temporales

Los grupos pueden tener una fecha de desaparición.

La base de datos utiliza:

```text
desaparece_en
```

Cuando llegue esa fecha deberá existir un proceso de limpieza que elimine el grupo y sus datos dependientes.

La limpieza automática todavía debe considerarse una funcionalidad que requiere implementación específica si no existe actualmente.

---

# 31. Encuestas

Un grupo puede configurarse con una encuesta fijada.

La opción es:

```text
encuesta_fijada
```

No todos los grupos están obligados a tener una encuesta.

La base de datos permite como máximo una encuesta activa por grupo mediante un índice único parcial.

Las encuestas permiten:

- Pregunta.
- Opciones.
- Votación de una opción.
- Votación de varias opciones.
- Fecha de cierre.
- Cierre explícito.

Entre las duraciones previstas se incluye:

**5 días**

---

# 32. Mensajes de grupos

La base de datos contempla mensajes de:

- texto
- imagen
- audio

También permite respuestas mediante referencia a otro mensaje.

La regla de producto previamente definida contempla una duración máxima de 48 horas para mensajes de grupos.

La eliminación automática requiere un mecanismo de limpieza del servidor.

Si dicho mecanismo no existe todavía, no debe considerarse una funcionalidad ya implementada.

---

# 33. Publicaciones

Una publicación debe utilizar **un único modo de contenido**.

Los modos conceptuales son:

```text
texto
imágenes
vídeo
```

No se debe implementar una publicación que combine simultáneamente texto, imágenes y vídeo.

## Imágenes

Máximo:

**10 imágenes**

## Vídeo

Máximo:

**1 vídeo**

Duración máxima:

**4 minutos**

Las publicaciones no pueden editarse.

El autor puede eliminarlas.

Las publicaciones permiten:

- comentarios
- corazones

---

# 34. Visibilidad de publicaciones

La primera versión utiliza publicaciones para amigos.

La base de datos ya contempla:

```text
amigos
publica
```

La visibilidad pública es una capacidad preparada para el futuro.

No debe interpretarse que el feed público completo ya está implementado.

---

# 35. Sección pública

Está prevista una sección pública separada.

En ella podrían aparecer contenidos públicos de usuarios que no sean amigos.

La sección pública no debe mezclarse automáticamente con la experiencia central de "Mis amigos".

Es una ampliación posterior de la experiencia inicial.

---

# 36. Multimedia

Atuistas utiliza un sistema común de archivos para los recursos multimedia necesarios para la aplicación.

Tipos contemplados actualmente:

- avatar
- imagen de grupo
- imagen de publicación
- vídeo de publicación
- imagen de mensaje
- audio de mensaje
- imagen de estado
- vídeo de estado

Atuistas **no es un gestor de archivos personal**.

No debe implementarse una sección general para almacenar archivos arbitrarios.

La aplicación independiente de gestión general de archivos queda fuera del proyecto.

---

# 37. Almacenamiento de archivos

Los archivos físicos se almacenan fuera de PostgreSQL.

PostgreSQL almacena:

- ID.
- Propietario.
- Tipo.
- MIME.
- Nombre original.
- Tamaño.
- Ruta.
- Fecha.

El servidor debe generar rutas seguras.

No se debe utilizar directamente el nombre original proporcionado por el usuario como ruta física.

---

# 38. Notificaciones

La base de datos contempla notificaciones para:

- Solicitudes de amistad.
- Amistades aceptadas.
- Mensajes privados.
- Mensajes de grupo.
- Respuestas.
- Corazones.
- Comentarios.
- Encuestas.

También existe una configuración independiente por categoría.

Las notificaciones Push son una funcionalidad futura/importante para PWA y Android.

---

# 39. Tiempo real

Actualmente el chat privado utiliza **polling** para actualizar mensajes.

La arquitectura futura puede evolucionar hacia WebSockets.

Importante:

> WebSocket NO está implementado actualmente y no debe considerarse parte del estado actual.

No se debe sustituir el polling existente por WebSocket automáticamente.

---

# 40. PWA

La conversión a PWA es una fase posterior.

Está previsto incorporar:

- Manifest.
- Service Worker.
- Instalación.
- Iconos.
- Caché.
- Pantalla de carga.
- Push Notifications.

La implementación de PWA no debe romper la API existente.

---

# 41. Android

Después de disponer de una PWA estable se plantea convertir/publicar la aplicación para Android.

La aplicación debe seguir utilizando el backend de Atuistas.

El desarrollo Android es una fase posterior.

---

# 42. Seguridad

Reglas fundamentales:

- PostgreSQL no se expone directamente a Internet.
- Los secretos permanecen fuera del código.
- `.env` no debe subirse a Git.
- Las operaciones sensibles se validan en backend.
- Los permisos se comprueban en backend.
- Los archivos deben validarse.
- Los tamaños de archivos deben limitarse.
- Los tipos de archivos deben comprobarse.
- La autenticación debe utilizar sesiones seguras.
- HTTPS debe utilizarse en producción.
- Deben existir copias de seguridad.

El frontend nunca debe considerarse una fuente de confianza.

---

# 43. Estado actual conocido

## Implementado o parcialmente implementado

Actualmente existe código para:

- Backend Fastify.
- Conexión PostgreSQL.
- Configuración mediante `.env`.
- Registro de usuarios.
- Vinculación mediante código.
- Generación de códigos.
- Cifrado de códigos.
- Hash de códigos.
- Sesiones.
- Dispositivos.
- Middleware de autenticación.
- Consulta de cuenta.
- Actualización de descripción/color.
- Regeneración de código.
- Avatares.
- Búsqueda de usuarios.
- Solicitudes de amistad.
- Aceptación/rechazo de solicitudes.
- Amistades.
- Bloqueos en las reglas de amistad/chat.
- Conversaciones privadas.
- Mensajes privados de texto.
- Adjuntos en el chat privado: fotos (pasan por el editor universal de recorte, pincel y texto), vídeo y audio grabado. El editor de foto se abre por encima del panel del chat (`#modal-editor-foto`, peldaño más alto de la escalera de capas) y lo que sale de él se adjunta al mensaje.
- Lectura de mensajes.
- Polling del chat.
- Edición, respuesta y eliminación de mensajes privados de texto por API e interfaz.
- Servido del frontend desde Fastify.
- Cambio de nombre, descripción, color, avatar y código de vinculación de la cuenta.
- Servidores: búsqueda, creación, entrada, salida y eliminación.
- Chat de texto en servidores con respuestas y retención máxima de 48 horas.
- Encuestas de servidor con opciones, votación simple/múltiple y cierre.
- Selector `Mis amigos / Público` visible únicamente en `Entrar`.
- Estados en tarjetas 9:16; la tarjeta propia aparece primero y utiliza el avatar de la cuenta.
- Estados de texto, foto, hasta 10 fotos, vídeo de hasta 4 minutos y audio subido o grabado de hasta 3:30.
- Cada estado permanece 24 horas; la audiencia puede ser amistades o pública.
- Modal para ver estados activos propios y elegir verlos o añadir otro.
- Publicaciones de texto, hasta 10 fotos o un vídeo de hasta 4 minutos, para amistades o públicas.
- Comentarios y corazones de publicaciones.
- Notificaciones Push del dispositivo con vista previa del contenido, el nombre de quien avisa y un enlace directo al chat o a la pantalla principal.
- Sin avisos de lo que ya se está viendo: al abrir un chat o un servidor el cliente avisa por `POST /api/presencia` y, mientras siga ahí, los mensajes de esa persona o de ese servidor no generan notificación ni Push. La vista se refresca cada minuto y caduca sola a los tres minutos, así que si el navegador se cierra sin avisar los avisos vuelven a llegar.
- Avisos agrupados por persona: los seguidos de la misma persona y del mismo tipo, dentro de diez minutos, se suman al aviso sin leer que ya existía (columna `cantidad`) y el Push se etiqueta con el autor para sustituir el anterior en lugar de apilar varios. La ventanita muestra el contador en rojo.
- Ventanita de notificaciones dentro de Cuenta: avisos recientes, marcar como leídos, activación del dispositivo y preferencias por categoría (se guardan solas al cerrar, sin botón).
- Reels: vídeos cortos (máximo 90 s) con título obligatorio y visibilidad de amigos o público. Se ven en una tira horizontal en Entrar y en un visor a pantalla completa que se desliza en vertical, con corazón, comentarios y acceso al perfil del autor. Un toque en el vídeo lo pausa o lo reanuda, con barra de tiempo abajo para ir adelante o atrás (arrastrando o con las flechas del teclado) y los comentarios se abren encima del visor sin cerrarlo. El sonido arranca en silencio porque los navegadores no dejan reproducir con audio sin un toque previo, y hay un botón de altavoz junto al corazón: al pulsarlo suena y la decisión se recuerda, así que los siguientes reels vienen con sonido; si el navegador lo bloquea al cambiar de reel, ese reel se queda mudo en vez de quedarse parado.
- Historias: carpetas permanentes con nombre, editable y vaciable cuando se quiera, que guardan elementos de texto, fotos, vídeo o audio. Se ven como burbujas con el nombre de la carpeta en Cuenta y en el perfil.
- Botón central de la barra con +: menú para subir reels, historias o publicaciones (las publicaciones ya no se suben desde el feed).- Service worker, manifest y suscripciones Push por dispositivo.
- Poderes de desarrollador para una sola cuenta (la que se llama `Iván J.`, marcada por la migración): con pulsación larga sobre cualquier publicación, reel, estado o historia lo borra aunque sea de otra persona, y en cualquier perfil puede pulsar el nombre, la etiqueta o la descripción para cambiarla en el sitio (Enter o al salir del campo guarda, Escape deshace). La etiqueta es un texto corto entre el nombre y la descripción; la de esa cuenta dice `Creador`. Sin poderes, el perfil es solo texto y no se ven las herramientas.
- Fondo de perfil: cada cuenta elige una imagen que sale de portada en su cabecera, **por detrás** del avatar y del nombre, con la altura justa para acabar en la línea del nombre y difuminándose al llegar abajo. El avatar y el nombre salen a la izquierda en el perfil de otra persona y centrados en el tuyo. Se cambia o se quita desde el botón de su foto en Cuenta.
- Apodos: cada persona le pone el apodo que quiera a quien quiera escribiéndolo en el perfil de esa persona (Enter o al salir guarda, vacío lo quita). El apodo es privado y sustituye al nombre real en toda la app de quien lo puso, incluidos los avisos; en «Agregar amigos» se sigue viendo el nombre real. Cuenta tiene la lista de tus apodos para quitarlos.
- Limpieza periódica de estados vencidos, servidores temporales y mensajes antiguos de servidor.
- Migración de compatibilidad para las columnas de autenticación y sesiones.

## Pendiente o incompleto

Entre otras funcionalidades:

- Gestión avanzada de miembros y moderación de servidores.
- WebSocket.
- Recepción Push en producción mediante un origen HTTPS y configuración persistente de claves VAPID.
- Android.
- Producción.

La interfaz y las funciones actuales de `Servidores` se dejaron deliberadamente sin rediseñar. El rediseño de esa sección queda pendiente según decisión de producto.

Al trasladar la instalación al servidor definitivo se debe conservar PostgreSQL, el contenido de `uploads/` y `data/push-vapid.json`, o configurar un par VAPID persistente mediante variables de entorno. El servidor final debe servir la web por HTTPS para Push fuera de localhost.

Este listado debe actualizarse cuando avance el proyecto.

---

# 44. Compatibilidad entre código y base de datos

El esquema de instalación y la migración de arranque están alineados con el servicio de autenticación actual. El código de vinculación utiliza:

```text
codigo_vinculacion_cifrado
codigo_vinculacion_hash
```

Las sesiones incluyen identificador y dispositivo, y el límite de nombre es de 25 caracteres en servicio y base de datos. Las cuentas heredadas cuyo código solo estaba disponible como hash pueden seguir iniciando sesión; para vincular un dispositivo nuevo deben regenerarlo desde una sesión existente.

---

# 45. Regla para futuras modificaciones

Cuando una herramienta de IA trabaje sobre el proyecto:

1. Leer `ARCHITECTURE.md`.
2. Leer `DATABASE.md`.
3. Revisar el código existente.
4. No asumir que una funcionalidad descrita como futura ya está implementada.
5. No sustituir funcionalidades existentes sin comprobar su comportamiento.
6. Mantener las reglas de producto definidas aquí.
7. Si el código y la documentación se contradicen, señalar la contradicción antes de realizar cambios estructurales importantes.
8. Mantener frontend, backend y base de datos coherentes.
9. Ejecutar TypeScript después de modificaciones del backend.
10. Probar las rutas modificadas antes de considerar terminada una funcionalidad.

La IA debe priorizar cambios pequeños y verificables frente a reescrituras completas innecesarias.