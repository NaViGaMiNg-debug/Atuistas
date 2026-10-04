-- ============================================================
-- ATUISTAS
-- ESQUEMA PRINCIPAL DE BASE DE DATOS
-- ============================================================

-- Necesario para generar UUIDs de forma segura
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- USUARIOS
-- ============================================================

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nombre VARCHAR(25) NOT NULL,
    nombre_normalizado VARCHAR(25) NOT NULL UNIQUE,

    descripcion VARCHAR(500),

    avatar_archivo_id UUID,

    color_nombre VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',

    codigo_vinculacion_cifrado TEXT NOT NULL,
    codigo_vinculacion_hash TEXT NOT NULL UNIQUE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT usuarios_nombre_no_vacio
        CHECK (length(trim(nombre)) > 0),

    CONSTRAINT usuarios_nombre_normalizado_no_vacio
        CHECK (length(trim(nombre_normalizado)) > 0),

    CONSTRAINT usuarios_color_nombre_check
        CHECK (color_nombre ~ '^#[0-9A-Fa-f]{6}$')
);


-- ============================================================
-- ARCHIVOS
-- ============================================================

CREATE TABLE archivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    propietario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    tipo VARCHAR(30) NOT NULL,

    mime_type VARCHAR(100) NOT NULL,

    nombre_original VARCHAR(255) NOT NULL,

    tamano BIGINT NOT NULL,

    ruta TEXT NOT NULL UNIQUE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT archivos_tamano_check
        CHECK (tamano >= 0),

    CONSTRAINT archivos_tipo_check
        CHECK (
            tipo IN (
                'avatar',
                'grupo_imagen',
                'publicacion_imagen',
                'publicacion_video',
                'mensaje_imagen',
                'mensaje_audio',
                'estado_imagen',
                'estado_video',
                'estado_audio',
                'reel_video',
                'historia_imagen',
                'historia_video',
                'historia_audio'
            )
        )
);


-- ============================================================
-- FK DEL AVATAR DEL USUARIO
-- ============================================================

ALTER TABLE usuarios
ADD CONSTRAINT usuarios_avatar_archivo_fk
FOREIGN KEY (avatar_archivo_id)
REFERENCES archivos(id)
ON DELETE SET NULL;


-- ============================================================
-- SESIONES
-- ============================================================

CREATE TABLE sesiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    dispositivo_id UUID NOT NULL,

    identificador TEXT NOT NULL UNIQUE,

    token_hash TEXT NOT NULL UNIQUE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expira_en TIMESTAMPTZ NOT NULL,

    ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    revocado_en TIMESTAMPTZ
);


-- ============================================================
-- DISPOSITIVOS
-- ============================================================

CREATE TABLE dispositivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    identificador TEXT NOT NULL,

    nombre VARCHAR(100),

    plataforma VARCHAR(30),

    push_token TEXT,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (usuario_id, identificador)
);


ALTER TABLE sesiones
ADD CONSTRAINT sesiones_dispositivo_fk
FOREIGN KEY (dispositivo_id)
REFERENCES dispositivos(id)
ON DELETE CASCADE;


-- ============================================================
-- NOTIFICACIONES
-- ============================================================

CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    -- Quien provoca el aviso. Con esto los avisos seguidos de la misma
    -- persona se agrupan en uno solo con su contador, y el Push usa esta
    -- referencia como etiqueta para no apilar notificaciones en el movil.
    autor_id UUID
        REFERENCES usuarios(id)
        ON DELETE SET NULL,

    tipo VARCHAR(50) NOT NULL,

    titulo VARCHAR(150) NOT NULL,

    contenido VARCHAR(500),

    datos JSONB,

    -- Avisos agrupados: 2 significa que el segundo se sumo al primero.
    cantidad INTEGER NOT NULL DEFAULT 1,

    leida BOOLEAN NOT NULL DEFAULT FALSE,

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notificaciones_usuario_autor
    ON notificaciones (usuario_id, autor_id, leida);


-- ============================================================
-- CONFIGURACIÓN DE NOTIFICACIONES
-- ============================================================

CREATE TABLE configuracion_notificaciones (
    usuario_id UUID PRIMARY KEY
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    solicitudes_amistad BOOLEAN NOT NULL DEFAULT TRUE,

    amistades_aceptadas BOOLEAN NOT NULL DEFAULT TRUE,

    mensajes_privados BOOLEAN NOT NULL DEFAULT TRUE,

    mensajes_grupo BOOLEAN NOT NULL DEFAULT TRUE,

    respuestas BOOLEAN NOT NULL DEFAULT TRUE,

    corazones BOOLEAN NOT NULL DEFAULT TRUE,

    comentarios BOOLEAN NOT NULL DEFAULT TRUE,

    encuestas BOOLEAN NOT NULL DEFAULT TRUE
);


-- ============================================================
-- SOLICITUDES DE AMISTAD
-- ============================================================

CREATE TABLE solicitudes_amistad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    emisor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    receptor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    respondido_en TIMESTAMPTZ,

    CONSTRAINT solicitudes_amistad_estado_check
        CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),

    CONSTRAINT solicitudes_amistad_no_self
        CHECK (emisor_id <> receptor_id)
);


-- ============================================================
-- AMISTADES
-- ============================================================

CREATE TABLE amistades (
    usuario_a_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    usuario_b_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (usuario_a_id, usuario_b_id),

    CONSTRAINT amistades_no_self
        CHECK (usuario_a_id <> usuario_b_id),

    CONSTRAINT amistades_orden
        CHECK (usuario_a_id < usuario_b_id)
);


-- ============================================================
-- BLOQUEOS
-- ============================================================

CREATE TABLE bloqueos (
    bloqueador_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    bloqueado_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (bloqueador_id, bloqueado_id),

    CONSTRAINT bloqueos_no_self
        CHECK (bloqueador_id <> bloqueado_id)
);


-- ============================================================
-- CONVERSACIONES PRIVADAS
-- ============================================================

CREATE TABLE conversaciones_privadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    usuario_a_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    usuario_b_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT conversaciones_privadas_no_self
        CHECK (usuario_a_id <> usuario_b_id),

    CONSTRAINT conversaciones_privadas_orden
        CHECK (usuario_a_id < usuario_b_id),

    UNIQUE (usuario_a_id, usuario_b_id)
);


-- ============================================================
-- MENSAJES PRIVADOS
-- ============================================================

CREATE TABLE mensajes_privados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversacion_id UUID NOT NULL
        REFERENCES conversaciones_privadas(id)
        ON DELETE CASCADE,

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    tipo VARCHAR(20) NOT NULL,

    contenido TEXT,

    archivo_id UUID
        REFERENCES archivos(id)
        ON DELETE SET NULL,

    mensaje_respondiendo_id UUID
        REFERENCES mensajes_privados(id)
        ON DELETE SET NULL,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    editado_en TIMESTAMPTZ,

    -- Momento en que la otra persona abrió el chat: los mensajes con leido_en
    -- a NULL cuentan como sin leer para pintar el punto rojo de la lista.
    leido_en TIMESTAMPTZ,

    CONSTRAINT mensajes_privados_tipo_check
        CHECK (tipo IN ('texto', 'imagen', 'audio')),

    CONSTRAINT mensajes_privados_contenido_check
        CHECK (
            (tipo = 'texto' AND contenido IS NOT NULL AND length(trim(contenido)) > 0)
            OR
            (tipo IN ('imagen', 'audio') AND archivo_id IS NOT NULL)
        )
);


-- ============================================================
-- GRUPOS / SERVIDORES
-- ============================================================

CREATE TABLE grupos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    creador_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    nombre VARCHAR(25) NOT NULL UNIQUE,

    descripcion VARCHAR(500),

    imagen_archivo_id UUID,

    tipo VARCHAR(20) NOT NULL,

    -- chat_unico: un solo canal invisible ('general').
    -- canales: el creador puede crear varios canales. Solo se pasa de chat_unico a canales.
    modelo VARCHAR(20) NOT NULL DEFAULT 'chat_unico',

    -- NULL significa que los mensajes no se borran automáticamente.
    retencion_horas INTEGER,

    -- Permite enviar mensajes ocultos (sin autor visible para nadie).
    permite_ocultos BOOLEAN NOT NULL DEFAULT FALSE,

    canales_activado_en TIMESTAMPTZ,

    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    codigo_invitacion VARCHAR(12),

    codigo_invitacion_expira_en TIMESTAMPTZ,

    codigo_invitacion_creado_en TIMESTAMPTZ,

    codigo_invitacion_creado_por UUID,

    encuesta_fijada BOOLEAN NOT NULL DEFAULT FALSE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    desaparece_en TIMESTAMPTZ,

    CONSTRAINT grupos_nombre_no_vacio
        CHECK (length(trim(nombre)) > 0),

    CONSTRAINT grupos_tipo_check
        CHECK (tipo IN ('normal', 'amistades')),

    CONSTRAINT grupos_modelo_check
        CHECK (modelo IN ('chat_unico', 'canales')),

    CONSTRAINT grupos_retencion_check
        CHECK (
            retencion_horas IS NULL
            OR (retencion_horas >= 1 AND retencion_horas <= 8760)
        ),

    CONSTRAINT grupos_duracion_check
        CHECK (
            desaparece_en IS NULL
            OR desaparece_en > creado_en
        )
);


-- ============================================================
-- FK DE LA IMAGEN DEL GRUPO
-- ============================================================

ALTER TABLE grupos
ADD CONSTRAINT grupos_imagen_archivo_fk
FOREIGN KEY (imagen_archivo_id)
REFERENCES archivos(id)
ON DELETE SET NULL;


ALTER TABLE grupos
ADD CONSTRAINT grupos_codigo_invitacion_creado_por_fk
FOREIGN KEY (codigo_invitacion_creado_por)
REFERENCES usuarios(id)
ON DELETE SET NULL;


-- ============================================================
-- CANALES DE GRUPO
-- Cada grupo nace con un canal 'general'. En los grupos de tipo
-- chat_unico ese canal es el chat y no se muestra como lista.
-- ============================================================

CREATE TABLE canales_grupo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    grupo_id UUID NOT NULL
        REFERENCES grupos(id)
        ON DELETE CASCADE,

    nombre VARCHAR(25) NOT NULL,

    orden INTEGER NOT NULL DEFAULT 0,

    -- NULL significa que los mensajes de este canal no se borran automáticamente.
    retencion_horas INTEGER,

    descripcion VARCHAR(200),

    permite_ocultos BOOLEAN NOT NULL DEFAULT FALSE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    actualizado_en TIMESTAMPTZ,

    CONSTRAINT canales_grupo_nombre_no_vacio
        CHECK (length(trim(nombre)) > 0),

    CONSTRAINT canales_grupo_retencion_check
        CHECK (
            retencion_horas IS NULL
            OR (retencion_horas >= 1 AND retencion_horas <= 8760)
        ),

    UNIQUE (grupo_id, nombre)
);


-- ============================================================
-- MIEMBROS DE GRUPO
-- ============================================================

CREATE TABLE miembros_grupo (
    grupo_id UUID NOT NULL
        REFERENCES grupos(id)
        ON DELETE CASCADE,

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    origen VARCHAR(20) NOT NULL DEFAULT 'manual',

    rol VARCHAR(20) NOT NULL DEFAULT 'miembro',

    -- Silencio de notificaciones de este servidor.
    silenciado BOOLEAN NOT NULL DEFAULT FALSE,

    -- FALSE cuando un moderador ha dejado al miembro en solo lectura.
    puede_escribir BOOLEAN NOT NULL DEFAULT TRUE,

    ultima_lectura_en TIMESTAMPTZ,

    unido_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (grupo_id, usuario_id),

    CONSTRAINT miembros_grupo_origen_check
        CHECK (origen IN ('manual', 'amistad')),

    CONSTRAINT miembros_grupo_rol_check
        CHECK (rol IN ('creador', 'moderador', 'miembro'))
);


-- ============================================================
-- MIEMBROS BLOQUEADOS DE GRUPO
-- Un bloqueo impide volver a entrar. Si el bloqueo se aplica
-- desde un mensaje oculto, oculto = TRUE y nunca se revela quién es.
-- ============================================================

CREATE TABLE miembros_bloqueados_grupo (
    grupo_id UUID NOT NULL
        REFERENCES grupos(id)
        ON DELETE CASCADE,

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    bloqueado_por UUID
        REFERENCES usuarios(id)
        ON DELETE SET NULL,

    motivo VARCHAR(200),

    oculto BOOLEAN NOT NULL DEFAULT FALSE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (grupo_id, usuario_id)
);


-- ============================================================
-- RESTRICCIONES INVISIBLES DE MENSAJES OCULTOS
-- Impide que un miembro vuelva a enviar mensajes ocultos sin
-- expulsarlo y sin que quede rastro de quién es.
-- ============================================================

CREATE TABLE ocultos_restringidos_grupo (
    grupo_id UUID NOT NULL
        REFERENCES grupos(id)
        ON DELETE CASCADE,

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creado_por UUID
        REFERENCES usuarios(id)
        ON DELETE SET NULL,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (grupo_id, usuario_id)
);


-- ============================================================
-- MENSAJES DE GRUPO
-- ============================================================

CREATE TABLE mensajes_grupo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    grupo_id UUID NOT NULL
        REFERENCES grupos(id)
        ON DELETE CASCADE,

    canal_id UUID NOT NULL
        REFERENCES canales_grupo(id)
        ON DELETE CASCADE,

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    tipo VARCHAR(20) NOT NULL,

    contenido TEXT,

    archivo_id UUID
        REFERENCES archivos(id)
        ON DELETE SET NULL,

    mensaje_respondiendo_id UUID
        REFERENCES mensajes_grupo(id)
        ON DELETE SET NULL,

    -- TRUE cuando el mensaje se envió como mensaje oculto: el autor nunca se expone.
    oculto BOOLEAN NOT NULL DEFAULT FALSE,

    editado_en TIMESTAMPTZ,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT mensajes_grupo_tipo_check
        CHECK (tipo IN ('texto', 'imagen', 'audio', 'video')),

    CONSTRAINT mensajes_grupo_contenido_check
        CHECK (
            (tipo = 'texto' AND contenido IS NOT NULL AND length(trim(contenido)) > 0)
            OR
            (tipo IN ('imagen', 'audio', 'video') AND archivo_id IS NOT NULL)
        )
);


-- ============================================================
-- ENCUESTAS
-- ============================================================

CREATE TABLE encuestas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    grupo_id UUID NOT NULL
        REFERENCES grupos(id)
        ON DELETE CASCADE,

    creador_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    pregunta VARCHAR(500) NOT NULL,

    tipo_votacion VARCHAR(20) NOT NULL,

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    cierra_en TIMESTAMPTZ,

    cerrada_en TIMESTAMPTZ,

    CONSTRAINT encuestas_pregunta_no_vacia
        CHECK (length(trim(pregunta)) > 0),

    CONSTRAINT encuestas_tipo_votacion_check
        CHECK (tipo_votacion IN ('una', 'varias')),

    CONSTRAINT encuestas_cierre_check
        CHECK (
            cierra_en IS NULL
            OR cierra_en > creada_en
        )
);


-- ============================================================
-- SOLO UNA ENCUESTA ACTIVA POR GRUPO
-- ============================================================

CREATE UNIQUE INDEX encuestas_una_activa_por_grupo
ON encuestas (grupo_id)
WHERE cerrada_en IS NULL;


-- ============================================================
-- OPCIONES DE ENCUESTA
-- ============================================================

CREATE TABLE opciones_encuesta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    encuesta_id UUID NOT NULL
        REFERENCES encuestas(id)
        ON DELETE CASCADE,

    texto VARCHAR(200) NOT NULL,

    orden INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT opciones_encuesta_texto_no_vacio
        CHECK (length(trim(texto)) > 0),

    UNIQUE (encuesta_id, orden)
);


-- ============================================================
-- VOTOS DE ENCUESTA
-- ============================================================

CREATE TABLE votos_encuesta (
    encuesta_id UUID NOT NULL
        REFERENCES encuestas(id)
        ON DELETE CASCADE,

    opcion_id UUID NOT NULL
        REFERENCES opciones_encuesta(id)
        ON DELETE CASCADE,

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (encuesta_id, opcion_id, usuario_id)
);


-- ============================================================
-- PUBLICACIONES
-- ============================================================

CREATE TABLE publicaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    texto TEXT,

    visibilidad VARCHAR(20) NOT NULL DEFAULT 'amigos',

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT publicaciones_visibilidad_check
        CHECK (visibilidad IN ('amigos', 'publica'))
);


-- ============================================================
-- MULTIMEDIA DE PUBLICACIONES
-- ============================================================

CREATE TABLE multimedia_publicacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    publicacion_id UUID NOT NULL
        REFERENCES publicaciones(id)
        ON DELETE CASCADE,

    archivo_id UUID NOT NULL
        REFERENCES archivos(id)
        ON DELETE CASCADE,

    tipo VARCHAR(20) NOT NULL,

    orden INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT multimedia_publicacion_tipo_check
        CHECK (tipo IN ('imagen', 'video')),

    UNIQUE (publicacion_id, orden)
);


-- ============================================================
-- COMENTARIOS
-- ============================================================

CREATE TABLE comentarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    publicacion_id UUID NOT NULL
        REFERENCES publicaciones(id)
        ON DELETE CASCADE,

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    texto VARCHAR(1000) NOT NULL,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comentarios_texto_no_vacio
        CHECK (length(trim(texto)) > 0)
);


-- ============================================================
-- CORAZONES
-- ============================================================

CREATE TABLE corazones_publicacion (
    publicacion_id UUID NOT NULL
        REFERENCES publicaciones(id)
        ON DELETE CASCADE,

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (publicacion_id, usuario_id)
);


-- ============================================================
-- ESTADOS
-- ============================================================

CREATE TABLE estados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    texto VARCHAR(500),

    visibilidad VARCHAR(20) NOT NULL DEFAULT 'amigos',

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expira_en TIMESTAMPTZ NOT NULL,

    CONSTRAINT estados_visibilidad_check
        CHECK (visibilidad IN ('amigos', 'publica')),

    CONSTRAINT estados_expiracion_check
        CHECK (expira_en > creado_en)
);


-- ============================================================
-- MULTIMEDIA DE ESTADOS
-- ============================================================

CREATE TABLE multimedia_estado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    estado_id UUID NOT NULL
        REFERENCES estados(id)
        ON DELETE CASCADE,

    archivo_id UUID NOT NULL
        REFERENCES archivos(id)
        ON DELETE CASCADE,

    tipo VARCHAR(20) NOT NULL,

    orden INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT multimedia_estado_tipo_check
        CHECK (tipo IN ('imagen', 'video', 'audio')),

    UNIQUE (estado_id, orden)
);


-- ============================================================
-- REELS
-- Vídeo corto con título obligatorio: un único archivo de vídeo
-- y visibilidad de amigos o público.
-- ============================================================

CREATE TABLE reels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    -- El vídeo vive en la tabla común de archivos, como todo el multimedia.
    archivo_id UUID NOT NULL
        REFERENCES archivos(id)
        ON DELETE CASCADE,

    titulo VARCHAR(100) NOT NULL,

    visibilidad VARCHAR(20) NOT NULL DEFAULT 'amigos',

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reels_titulo_no_vacio
        CHECK (length(trim(titulo)) > 0),

    CONSTRAINT reels_visibilidad_check
        CHECK (visibilidad IN ('amigos', 'publica'))
);


-- ============================================================
-- LIKES DE REELS
-- ============================================================

CREATE TABLE reels_likes (
    reel_id UUID NOT NULL
        REFERENCES reels(id)
        ON DELETE CASCADE,

    usuario_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (reel_id, usuario_id)
);


-- ============================================================
-- COMENTARIOS DE REELS
-- ============================================================

CREATE TABLE reels_comentarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    reel_id UUID NOT NULL
        REFERENCES reels(id)
        ON DELETE CASCADE,

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    texto VARCHAR(1000) NOT NULL,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reels_comentarios_texto_no_vacio
        CHECK (length(trim(texto)) > 0)
);


-- ============================================================
-- HISTORIAS
-- Carpetas permanentes: se crean con un nombre, guardan muchos
-- elementos y se pueden editar o borrar cuando se quiera.
-- ============================================================

CREATE TABLE historias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    autor_id UUID NOT NULL
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    nombre VARCHAR(60) NOT NULL,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT historias_nombre_no_vacio
        CHECK (length(trim(nombre)) > 0)
);


-- ============================================================
-- ELEMENTOS DE HISTORIA
-- Cada elemento es un texto o un archivo (foto, vídeo o audio),
-- como los estados, pero sin fecha de caducidad.
-- ============================================================

CREATE TABLE historias_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    historia_id UUID NOT NULL
        REFERENCES historias(id)
        ON DELETE CASCADE,

    texto VARCHAR(500),

    archivo_id UUID
        REFERENCES archivos(id)
        ON DELETE CASCADE,

    tipo VARCHAR(20) NOT NULL,

    orden INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT historias_items_tipo_check
        CHECK (tipo IN ('texto', 'imagen', 'video', 'audio')),

    -- Un elemento es texto o archivo: nunca los dos ni ninguno.
    CONSTRAINT historias_items_contenido
        CHECK (
            (tipo = 'texto' AND texto IS NOT NULL AND archivo_id IS NULL)
            OR
            (tipo <> 'texto' AND texto IS NULL AND archivo_id IS NOT NULL)
        ),

    UNIQUE (historia_id, orden)
);


-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_sesiones_usuario
    ON sesiones(usuario_id);

CREATE INDEX idx_sesiones_expira_en
    ON sesiones(expira_en);

CREATE INDEX idx_dispositivos_usuario
    ON dispositivos(usuario_id);

CREATE INDEX idx_notificaciones_usuario
    ON notificaciones(usuario_id);

CREATE INDEX idx_notificaciones_usuario_no_leidas
    ON notificaciones(usuario_id, leida)
    WHERE leida = FALSE;

CREATE INDEX idx_solicitudes_receptor_estado
    ON solicitudes_amistad(receptor_id, estado);

CREATE INDEX idx_solicitudes_emisor_estado
    ON solicitudes_amistad(emisor_id, estado);

CREATE INDEX idx_bloqueos_bloqueado
    ON bloqueos(bloqueado_id);

CREATE INDEX idx_conversaciones_usuario_a
    ON conversaciones_privadas(usuario_a_id);

CREATE INDEX idx_conversaciones_usuario_b
    ON conversaciones_privadas(usuario_b_id);

CREATE INDEX idx_mensajes_privados_conversacion
    ON mensajes_privados(conversacion_id, creado_en);

CREATE INDEX idx_mensajes_privados_autor
    ON mensajes_privados(autor_id);

CREATE INDEX idx_mensajes_privados_conversacion_sin_leer
    ON mensajes_privados(conversacion_id, autor_id)
    WHERE leido_en IS NULL;

CREATE INDEX idx_miembros_grupo_usuario
    ON miembros_grupo(usuario_id);

CREATE INDEX idx_mensajes_grupo_grupo
    ON mensajes_grupo(grupo_id, creado_en);

CREATE INDEX idx_mensajes_grupo_autor
    ON mensajes_grupo(autor_id);

CREATE INDEX idx_canales_grupo_grupo
    ON canales_grupo(grupo_id, orden);

CREATE INDEX idx_mensajes_grupo_canal
    ON mensajes_grupo(canal_id, creado_en);

CREATE INDEX idx_miembros_bloqueados_usuario
    ON miembros_bloqueados_grupo(usuario_id);

CREATE INDEX idx_ocultos_restringidos_usuario
    ON ocultos_restringidos_grupo(usuario_id);

CREATE INDEX idx_encuestas_grupo
    ON encuestas(grupo_id);

CREATE INDEX idx_opciones_encuesta_encuesta
    ON opciones_encuesta(encuesta_id);

CREATE INDEX idx_votos_encuesta_usuario
    ON votos_encuesta(usuario_id);

CREATE INDEX idx_publicaciones_autor
    ON publicaciones(autor_id, creada_en);

CREATE INDEX idx_multimedia_publicacion_publicacion
    ON multimedia_publicacion(publicacion_id, orden);

CREATE INDEX idx_comentarios_publicacion
    ON comentarios(publicacion_id, creado_en);

CREATE INDEX idx_corazones_publicacion
    ON corazones_publicacion(publicacion_id);

CREATE INDEX idx_estados_autor
    ON estados(autor_id, creado_en);

CREATE INDEX idx_estados_expira_en
    ON estados(expira_en);

CREATE INDEX idx_multimedia_estado_estado
    ON multimedia_estado(estado_id, orden);

CREATE INDEX idx_reels_autor
    ON reels(autor_id, creado_en DESC);

CREATE INDEX idx_reels_visibilidad
    ON reels(visibilidad, creado_en DESC);

CREATE INDEX idx_reels_likes_reel
    ON reels_likes(reel_id);

CREATE INDEX idx_reels_comentarios_reel
    ON reels_comentarios(reel_id, creado_en);

CREATE INDEX idx_historias_autor
    ON historias(autor_id, actualizado_en DESC);

CREATE INDEX idx_historias_items_historia
    ON historias_items(historia_id, orden);

CREATE INDEX idx_archivos_propietario
    ON archivos(propietario_id);

CREATE INDEX idx_archivos_tipo
    ON archivos(tipo);
    

-- ============================================================
-- SOLICITUDES DE AMISTAD PENDIENTES
-- EVITA DUPLICADOS EN AMBOS SENTIDOS
-- ============================================================

CREATE UNIQUE INDEX solicitudes_amistad_pendiente_unica
ON solicitudes_amistad (
    LEAST(emisor_id, receptor_id),
    GREATEST(emisor_id, receptor_id)
)
WHERE estado = 'pendiente';


-- ============================================================
-- CONTROL DE MIGRACIONES APLICADAS
-- MARCA AJUSTES QUE SOLO DEBEN EJECUTARSE UNA VEZ
-- ============================================================

CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre VARCHAR(100) PRIMARY KEY,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
