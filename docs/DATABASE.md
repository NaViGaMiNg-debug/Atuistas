# Atuistas — Base de datos

## 1. Propósito

Este documento describe el modelo de datos de Atuistas y las reglas que deben respetarse al trabajar con PostgreSQL.

La base de datos es responsabilidad exclusiva del backend.

El frontend nunca debe acceder directamente a PostgreSQL.

Este documento debe mantenerse sincronizado con `src/db/schema.sql`.

---

# 2. Tecnología

Atuistas utiliza:

- PostgreSQL.
- UUID.
- Extensión `pgcrypto`.

Los UUID se generan mediante:

```sql
gen_random_uuid()
```

---

# 3. Entidades actuales

El esquema contempla actualmente:

```text
usuarios
archivos
sesiones
dispositivos
notificaciones
configuracion_notificaciones
solicitudes_amistad
amistades
bloqueos
conversaciones_privadas
mensajes_privados
grupos
miembros_grupo
mensajes_grupo
encuestas
opciones_encuesta
votos_encuesta
publicaciones
multimedia_publicacion
comentarios
corazones_publicacion
estados
multimedia_estado
```

---

# 4. Usuarios

## Tabla `usuarios`

Representa una cuenta de Atuistas.

Campos principales:

| Campo | Tipo | Función |
|---|---|---|
| `id` | UUID | Identificador |
| `nombre` | VARCHAR | Nombre visible |
| `nombre_normalizado` | VARCHAR | Nombre usado para unicidad/búsqueda |
| `descripcion` | VARCHAR(500) | Descripción |
| `avatar_archivo_id` | UUID | Avatar |
| `color_nombre` | VARCHAR(7) | Color hexadecimal |
| `codigo_*` | TEXT | Credencial de vinculación |
| `creado_en` | TIMESTAMPTZ | Creación |
| `activo` | BOOLEAN | Estado de cuenta |

## Reglas

El nombre:

- No puede estar vacío.
- Es único.
- Puede cambiarse.
- Tiene un máximo definitivo de **25 caracteres**.

La descripción:

- Máximo 500 caracteres.

El color:

```text
#RRGGBB
```

---

# 5. Código de vinculación

El código de vinculación no es una contraseña tradicional.

La implementación actual necesita conservar dos representaciones:

```text
código
 ├── hash HMAC-SHA256
 └── cifrado AES-256-GCM
```

El hash se utiliza para comprobar códigos introducidos.

La versión cifrada permite recuperar el código para mostrárselo al usuario autenticado.

La clave criptográfica procede de una variable de entorno.

El esquema de instalación y la migración de arranque utilizan `codigo_vinculacion_cifrado` y `codigo_vinculacion_hash`, en coherencia con `auth.service.ts`.

---

# 6. Archivos

## Tabla `archivos`

Representa los archivos multimedia utilizados por Atuistas.

Los bytes del archivo no se almacenan en PostgreSQL.

Se guarda información y referencia al almacenamiento físico.

Campos:

- `id`
- `propietario_id`
- `tipo`
- `mime_type`
- `nombre_original`
- `tamano`
- `ruta`
- `creado_en`

Tipos permitidos actualmente:

```text
avatar
grupo_imagen
publicacion_imagen
publicacion_video
mensaje_imagen
mensaje_audio
estado_imagen
estado_video
```

La ruta física debe ser generada de forma segura por el backend.

---

# 7. Propietario de archivos

Cada archivo pertenece a un usuario.

```text
usuarios 1 ─── N archivos
```

La eliminación del usuario elimina los registros de archivos mediante `ON DELETE CASCADE`.

La eliminación física del archivo debe realizarse también en el almacenamiento.

No deben quedar archivos huérfanos.

---

# 8. Sesiones

## Tabla `sesiones`

Representa una sesión autenticada.

Una cuenta puede tener varias sesiones.

La implementación actual espera disponer de:

- `usuario_id`
- `dispositivo_id`
- `identificador`
- `token_hash`
- `creado_en`
- `expira_en`
- `ultimo_uso`
- `revocado_en`

El esquema y la migración de arranque definen estas columnas, incluida la relación con `dispositivos`.

El secreto del token no se almacena directamente.

Se utiliza Argon2 para almacenar su hash.

Las sesiones expiran actualmente después de aproximadamente 30 días.

---

# 9. Dispositivos

## Tabla `dispositivos`

Representa un dispositivo o cliente utilizado por un usuario.

Campos:

- `id`
- `usuario_id`
- `identificador`
- `nombre`
- `plataforma`
- `push_token`
- `creado_en`
- `ultimo_uso`

Un usuario puede tener varios dispositivos.

La combinación:

```text
usuario_id + identificador
```

es única.

---

# 10. Notificaciones

## Tabla `notificaciones`

Representa una notificación interna.

Campos principales:

- usuario destinatario
- tipo
- título
- contenido
- datos JSON
- estado de lectura
- fecha

Las notificaciones están vinculadas al usuario mediante `usuario_id`.

---

# 11. Configuración de notificaciones

## Tabla `configuracion_notificaciones`

Existe una configuración por usuario.

Actualmente contempla:

- solicitudes de amistad
- amistades aceptadas
- mensajes privados
- mensajes de grupo
- respuestas
- corazones
- comentarios
- encuestas

Cada opción es booleana.

---

# 12. Solicitudes de amistad

## Tabla `solicitudes_amistad`

Representa una solicitud.

Campos principales:

```text
emisor_id
receptor_id
estado
creado_en
respondido_en
```

Estados:

```text
pendiente
aceptada
rechazada
```

No se permiten solicitudes hacia uno mismo.

Existe un índice único parcial para impedir solicitudes pendientes duplicadas independientemente del sentido.

---

# 13. Amistades

## Tabla `amistades`

Representa una amistad confirmada.

La relación se guarda de forma ordenada:

```text
usuario_a_id < usuario_b_id
```

Esto permite representar:

```text
A ↔ B
```

con una sola fila.

No se almacenan listas de amigos dentro de `usuarios`.

---

# 14. Bloqueos

## Tabla `bloqueos`

Representa un bloqueo direccional.

Ejemplo:

```text
A bloquea a B
```

se almacena como:

```text
bloqueador_id = A
bloqueado_id = B
```

No se permite bloquearse a uno mismo.

Los bloqueos afectan a las reglas de amistad y mensajes.

---

# 15. Conversaciones privadas

## Tabla `conversaciones_privadas`

Representa una conversación entre dos usuarios.

Los participantes se almacenan de forma canónica:

```text
usuario_a_id < usuario_b_id
```

La combinación es única.

Una conversación no debe crearse para un usuario consigo mismo.

La lógica de negocio comprueba que los participantes sean amigos y no estén bloqueados antes de utilizarla.

---

# 16. Mensajes privados

## Tabla `mensajes_privados`

Campos principales:

- `id`
- `conversacion_id`
- `autor_id`
- `tipo`
- `contenido`
- `archivo_id`
- `mensaje_respondiendo_id`
- `creado_en`
- `editado_en`
- `leido_en`

Tipos:

```text
texto
imagen
audio
```

Un mensaje de texto necesita contenido.

Un mensaje multimedia necesita un archivo asociado.

`leido_en` guarda el momento en que el otro usuario abrió el chat. Mientras
vale NULL el mensaje cuenta como sin leer y la lista de amigos pinta punto
rojo; el índice parcial `idx_mensajes_privados_conversacion_sin_leer` acelera
ese recuento.

---

# 17. Respuestas de mensajes

`mensaje_respondiendo_id` permite que un mensaje haga referencia a otro mensaje de la misma conversación.

La referencia utiliza:

```text
ON DELETE SET NULL
```

Esto permite eliminar el mensaje original sin eliminar automáticamente el mensaje que lo respondía.

---

# 18. Edición de mensajes

Los mensajes de texto pueden editarse.

La edición actualizada guarda:

```text
editado_en
```

El mensaje no necesita crear una nueva fila para cada edición.

La edición debe estar restringida al autor.

---

# 19. Eliminación de mensajes

La eliminación de mensajes debe ser real.

No debe existir un registro visible equivalente a:

```text
Mensaje eliminado
```

La eliminación de un mensaje multimedia debe tener en cuenta el archivo asociado.

Los archivos físicos deben limpiarse cuando ya no tengan ninguna referencia válida.

---

# 20. Imágenes de mensajes

Reglas de producto:

```text
> 8 MB
    ↓
intentar compresión

máximo absoluto
12 MB
```

Estas reglas deben comprobarse en backend.

La base de datos solamente almacena el tamaño y metadatos del archivo; la validación real del archivo corresponde al servidor.

---

# 21. Audio de mensajes

Duración máxima:

```text
3 minutos 30 segundos
```

El backend debe validar la duración real del archivo.

La columna `tamano` no sustituye a la comprobación de duración.

---

# 22. Grupos

## Tabla `grupos`

Representa un servidor/grupo.

Campos:

- `id`
- `creador_id`
- `nombre`
- `descripcion`
- `imagen_archivo_id`
- `tipo`
- `encuesta_fijada`
- `creado_en`
- `desaparece_en`

Tipos:

```text
normal
amistades
```

El nombre tiene un máximo de:

```text
25 caracteres
```

y es único.

---

# 23. Grupos de tipo `amistades`

Un grupo de tipo `amistades` permite vincular determinadas pertenencias con la amistad del creador.

En `miembros_grupo` se guarda:

```text
origen = amistad
```

para estas pertenencias.

Si el creador elimina una amistad que originó una pertenencia automática, la persona debe abandonar el grupo.

En un grupo `normal`, perder una amistad no implica automáticamente abandonar el grupo.

---

# 24. Miembros de grupos

## Tabla `miembros_grupo`

Relaciona usuarios con grupos.

Un usuario puede pertenecer a varios grupos.

Un grupo puede tener muchos usuarios.

Campos:

- `grupo_id`
- `usuario_id`
- `origen`
- `rol`
- `unido_en`

`origen`:

```text
manual
amistad
```

`rol`:

```text
creador
miembro
```

---

# 25. Eliminación de grupos

Los miembros y mensajes dependen del grupo mediante claves externas.

La eliminación de un grupo puede provocar eliminaciones en cascada de:

- miembros
- mensajes
- encuestas
- opciones
- votos
- multimedia asociada

Los archivos físicos requieren además limpieza del almacenamiento.

---

# 26. Mensajes de grupo

## Tabla `mensajes_grupo`

Actualmente admite:

```text
texto
imagen
audio
```

Tiene soporte para:

- autor
- archivo
- respuesta
- fecha

La regla de producto contempla una duración máxima de 48 horas.

El SQL no elimina automáticamente mensajes por el mero hecho de alcanzar esa edad.

Debe existir un proceso de limpieza del backend para aplicar esa regla.

---

# 27. Encuestas

## Tabla `encuestas`

Una encuesta pertenece a un grupo.

Campos:

- `id`
- `grupo_id`
- `creador_id`
- `pregunta`
- `tipo_votacion`
- `creada_en`
- `cierra_en`
- `cerrada_en`

Tipos de votación:

```text
una
varias
```

Un grupo puede tener como máximo una encuesta activa debido al índice:

```text
encuestas_una_activa_por_grupo
```

No significa que todos los grupos deban tener una encuesta.

La creación de encuesta fijada es opcional.

---

# 28. Opciones de encuesta

## Tabla `opciones_encuesta`

Cada encuesta puede tener varias opciones.

Campos:

- `id`
- `encuesta_id`
- `texto`
- `orden`

La combinación:

```text
encuesta_id + orden
```

es única.

---

# 29. Votos

## Tabla `votos_encuesta`

Representa un voto.

La clave primaria actual es:

```text
encuesta_id
opcion_id
usuario_id
```

Esto evita duplicar el mismo voto sobre la misma opción.

Las reglas exactas sobre cómo se permiten votos en encuestas de una o varias opciones deben respetarse desde el backend.

---

# 30. Publicaciones

## Tabla `publicaciones`

Campos:

- `id`
- `autor_id`
- `texto`
- `visibilidad`
- `creada_en`

Visibilidad:

```text
amigos
publica
```

La primera versión de la aplicación utiliza principalmente:

```text
amigos
```

La opción pública queda preparada para una fase posterior.

---

# 31. Modo de contenido de publicaciones

Una publicación debe utilizar un único modo de contenido:

```text
texto
```

o:

```text
imágenes
```

o:

```text
vídeo
```

No se debe crear una publicación que combine simultáneamente texto, imágenes y vídeo.

El SQL actual no impone por sí solo todas estas reglas.

El backend debe validarlas.

---

# 32. Multimedia de publicaciones

## Tabla `multimedia_publicacion`

Relaciona publicaciones con archivos.

Tipos:

```text
imagen
video
```

Cada publicación puede tener:

```text
máximo 10 imágenes
máximo 1 vídeo
```

Un vídeo puede durar como máximo:

```text
4 minutos
```

El backend debe impedir que una publicación combine imágenes y vídeo.

El SQL actual no impone por sí solo todos estos límites.

---

# 33. Comentarios

## Tabla `comentarios`

Cada comentario pertenece a:

- una publicación
- un usuario

Tiene:

- texto
- fecha

El texto no puede estar vacío.

Longitud máxima:

```text
1000 caracteres
```

---

# 34. Corazones

## Tabla `corazones_publicacion`

Relaciona usuarios con publicaciones.

La clave primaria:

```text
publicacion_id
usuario_id
```

impide que un usuario tenga dos corazones simultáneos sobre la misma publicación.

---

# 35. Estados

## Tabla `estados`

Representa estados temporales.

Campos:

- `id`
- `autor_id`
- `texto`
- `visibilidad`
- `creado_en`
- `expira_en`

La visibilidad puede ser:

```text
amigos
publica
```

La primera versión utiliza principalmente amigos.

Los estados admiten contenido de texto o multimedia ordenada. La decisión de producto actual limita cada estado a un vídeo de hasta 4 minutos, hasta 10 fotos o un audio de hasta 3 minutos y 30 segundos. Los archivos se almacenan fuera de PostgreSQL y se enlazan mediante `multimedia_estado`.

El estado siempre debe tener una fecha de expiración posterior a su creación.

---

# 36. Multimedia de estados

## Tabla `multimedia_estado`

Relaciona estados con archivos.

Tipos:

```text
imagen
video
audio
```

El orden permite organizar varios archivos. Las fotos tienen un máximo de 12 MB cada una; los vídeos y audios, 50 MB cada uno. El backend valida la duración real con `ffprobe`.

---

# 37. Relaciones de archivos

Los archivos pueden estar relacionados con:

```text
usuario
 └── avatar

grupo
 └── imagen

mensaje privado
 └── imagen/audio

mensaje de grupo
 └── imagen/audio

publicación
 └── imagen/video

estado
 └── imagen/video
```

No debe existir un sistema independiente de almacenamiento general de archivos dentro de Atuistas.

---

# 38. Eliminación de usuarios

La eliminación definitiva de una cuenta debe eliminar todos los datos pertenecientes al usuario.

El objetivo del producto es:

> eliminar absolutamente todo lo asociado a la cuenta.

Las claves `ON DELETE CASCADE` existentes ayudan a conseguirlo.

Sin embargo, los archivos físicos almacenados fuera de PostgreSQL requieren una limpieza adicional por parte del backend.

La eliminación de una cuenta debe comprobar especialmente:

- archivos físicos
- sesiones
- dispositivos
- amistades
- solicitudes
- bloqueos
- conversaciones
- mensajes
- grupos creados
- miembros de grupos
- publicaciones
- comentarios
- corazones
- estados
- notificaciones
- configuraciones

---

# 39. Índices

El esquema actual incluye índices para las consultas principales.

Entre ellos:

- sesiones por usuario
- expiración de sesiones
- dispositivos por usuario
- notificaciones por usuario
- notificaciones no leídas
- solicitudes por receptor/emisor y estado
- bloqueos
- conversaciones
- mensajes privados
- miembros de grupos
- mensajes de grupos
- encuestas
- opciones
- votos
- publicaciones
- multimedia
- comentarios
- corazones
- estados
- archivos

Los índices nuevos deben añadirse únicamente cuando exista una necesidad real de consulta o rendimiento.

---

# 40. Integridad de datos

Las reglas importantes deben estar protegidas mediante una combinación de:

- `FOREIGN KEY`
- `PRIMARY KEY`
- `UNIQUE`
- `CHECK`
- índices
- validación del backend

No todas las reglas de producto pueden expresarse de forma sencilla mediante SQL.

Por ejemplo:

```text
máximo 10 imágenes
máximo 1 vídeo
vídeo máximo 4 minutos
```

requieren lógica adicional del backend y/o validación del archivo.

---

# 41. Reglas que NO deben confiarse únicamente al frontend

Nunca debe confiarse únicamente en JavaScript para:

- autenticación
- permisos
- amistades
- bloqueos
- límites de archivos
- duración de audio
- duración de vídeo
- cantidad de imágenes
- visibilidad
- edición de mensajes
- eliminación
- votos
- pertenencia a grupos

El backend debe volver a comprobar estas reglas.

---

# 42. Diferencias conocidas entre SQL y código

Antes de utilizar el esquema como definitivo deben corregirse estas diferencias.

## 42.1 Código de vinculación

El SQL actual contiene:

```text
usuarios.codigo_hash
```

pero `auth.service.ts` utiliza:

```text
codigo_vinculacion_cifrado
codigo_vinculacion_hash
```

El diseño definitivo debe reflejar la implementación real del sistema de código.

---

## 42.2 Sesiones

`auth.service.ts` utiliza:

```text
dispositivo_id
identificador
token_hash
```

pero el SQL actual solamente define:

```text
usuario_id
token_hash
creado_en
expira_en
ultimo_uso
revocado_en
```

Por tanto, `sesiones` necesita sincronización entre código y esquema.

---

## 42.3 Nombre de usuario

Regla definitiva:

```text
25 caracteres
```

SQL actual:

```text
VARCHAR(24)
```

Debe sincronizarse.

---

# 43. Regla para modificar el esquema

Antes de modificar una tabla existente:

1. Comprobar qué código utiliza la tabla.
2. Comprobar qué rutas dependen de ella.
3. Comprobar las claves externas.
4. Comprobar los datos existentes.
5. Determinar si se necesita migración.
6. Actualizar `schema.sql`.
7. Actualizar `DATABASE.md`.
8. Probar el backend.

No se deben eliminar columnas o tablas simplemente porque actualmente parezcan no utilizarse.

---

# 44. Estado de la base de datos

La base de datos ya tiene un esquema considerablemente avanzado.

Por tanto, este documento **no representa un diseño teórico desde cero**.

Representa la estructura actual y las reglas que deben guiar su evolución.

Las funcionalidades todavía no implementadas deben considerarse pendientes aunque sus tablas ya existan.

Por ejemplo:

```text
tener tabla publicaciones
≠
tener publicaciones completamente implementadas
```

y:

```text
tener tabla encuestas
≠
tener encuestas completamente implementadas
```

---

# 45. Regla para herramientas de IA

Cualquier IA que modifique Atuistas debe utilizar este documento junto con:

```text
docs/ARCHITECTURE.md
```

y revisar siempre:

```text
src/db/schema.sql
```

antes de realizar cambios estructurales.

La IA no debe:

- inventar tablas que ya existen;
- crear sistemas duplicados;
- introducir contraseñas tradicionales;
- sustituir el sistema de código de vinculación sin autorización;
- eliminar funcionalidades existentes;
- asumir que WebSocket ya está implementado;
- asumir que PWA ya está implementada;
- convertir funcionalidades futuras en funcionalidades obligatorias;
- modificar reglas de producto sin indicarlo;
- romper relaciones existentes;
- cambiar nombres de columnas sin revisar todo el backend.

Si encuentra una contradicción entre documentación, código y SQL, debe señalarla y resolverla de forma controlada.

---

# 46. Principio final

La base de datos debe mantenerse como una representación coherente de las reglas de negocio de Atuistas.

Los cambios importantes deben realizarse de forma coordinada:

```text
Regla de producto
       ↓
Arquitectura
       ↓
Backend
       ↓
Base de datos
       ↓
Frontend
       ↓
Pruebas
       ↓
Documentación
```

Ninguna de estas capas debe modificarse de forma aislada cuando el cambio afecte al comportamiento del sistema.