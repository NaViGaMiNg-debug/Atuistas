import { db } from "./database.js";

export async function migrarEsquema() {
    const client = await db.connect();

    try {
        await client.query("BEGIN");
        await client.query(`
            ALTER TABLE usuarios
                ALTER COLUMN nombre TYPE VARCHAR(25),
                ALTER COLUMN nombre_normalizado TYPE VARCHAR(25),
                ADD COLUMN IF NOT EXISTS codigo_vinculacion_cifrado TEXT,
                ADD COLUMN IF NOT EXISTS codigo_vinculacion_hash TEXT;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = 'usuarios'
                      AND column_name = 'codigo_hash'
                ) THEN
                    EXECUTE 'UPDATE usuarios
                             SET codigo_vinculacion_hash = codigo_hash
                             WHERE codigo_vinculacion_hash IS NULL';
                END IF;
            END
            $$;

            CREATE UNIQUE INDEX IF NOT EXISTS usuarios_codigo_vinculacion_hash_uq
                ON usuarios (codigo_vinculacion_hash)
                WHERE codigo_vinculacion_hash IS NOT NULL;

            ALTER TABLE sesiones
                ADD COLUMN IF NOT EXISTS dispositivo_id UUID,
                ADD COLUMN IF NOT EXISTS identificador TEXT;

            ALTER TABLE multimedia_estado
                DROP CONSTRAINT IF EXISTS multimedia_estado_tipo_check;

            ALTER TABLE multimedia_estado
                ADD CONSTRAINT multimedia_estado_tipo_check
                CHECK (tipo IN ('imagen', 'video', 'audio'));

            -- Los mensajes de servidor admiten vídeo además de imagen y audio.
            ALTER TABLE mensajes_grupo
                DROP CONSTRAINT IF EXISTS mensajes_grupo_tipo_check;

            ALTER TABLE mensajes_grupo
                ADD CONSTRAINT mensajes_grupo_tipo_check
                CHECK (tipo IN ('texto', 'imagen', 'audio', 'video'));

            -- La pareja (tipo, contenido/archivo) también debe admitir vídeo.
            ALTER TABLE mensajes_grupo
                DROP CONSTRAINT IF EXISTS mensajes_grupo_contenido_check;

            ALTER TABLE mensajes_grupo
                ADD CONSTRAINT mensajes_grupo_contenido_check
                CHECK (
                    (tipo = 'texto' AND contenido IS NOT NULL AND length(trim(contenido)) > 0)
                    OR
                    (tipo IN ('imagen', 'audio', 'video') AND archivo_id IS NOT NULL)
                );

            -- Los chats privados también admiten imagen, audio y vídeo.
            ALTER TABLE mensajes_privados
                DROP CONSTRAINT IF EXISTS mensajes_privados_tipo_check;

            ALTER TABLE mensajes_privados
                ADD CONSTRAINT mensajes_privados_tipo_check
                CHECK (tipo IN ('texto', 'imagen', 'audio', 'video'));

            ALTER TABLE mensajes_privados
                DROP CONSTRAINT IF EXISTS mensajes_privados_contenido_check;

            ALTER TABLE mensajes_privados
                ADD CONSTRAINT mensajes_privados_contenido_check
                CHECK (
                    (tipo = 'texto' AND contenido IS NOT NULL AND length(trim(contenido)) > 0)
                    OR
                    (tipo IN ('imagen', 'audio', 'video') AND archivo_id IS NOT NULL)
                );

            ALTER TABLE archivos
                DROP CONSTRAINT IF EXISTS archivos_tipo_check;

            -- Los tipos de reels e historias se anaden aqui: con la lista corta
            -- volver a crear la restriccion fallaria en cuanto hubiera un reel
            -- o una historia guardados.
            ALTER TABLE archivos
                ADD CONSTRAINT archivos_tipo_check
                CHECK (tipo IN (
                    'avatar', 'grupo_imagen', 'publicacion_imagen',
                    'publicacion_video', 'mensaje_imagen', 'mensaje_audio',
                    'mensaje_video', 'estado_imagen', 'estado_video', 'estado_audio',
                    'reel_video', 'historia_imagen', 'historia_video', 'historia_audio'
                ));

            -- Avisos agrupados: los mensajes seguidos de la misma persona
            -- se suman al aviso sin leer que ya exista en lugar de crear otro.
            ALTER TABLE notificaciones
                ADD COLUMN IF NOT EXISTS autor_id UUID
                    REFERENCES usuarios(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1;

            CREATE INDEX IF NOT EXISTS notificaciones_usuario_autor
                ON notificaciones (usuario_id, autor_id, leida);

            -- ================================
            -- PODERES DE DESARROLLADOR
            -- Una sola cuenta los tiene: la que se llama "Iván J.". Puede
            -- borrar publicaciones, reels, estados e historias de cualquiera y
            -- poner nombre, descripción o etiqueta en el perfil de otros.
            -- La migración se aplica sola al arrancar, así que la cuenta
            -- nombrada queda con poderes en cuanto existe en la base.
            -- ================================

            ALTER TABLE usuarios
                ADD COLUMN IF NOT EXISTS es_desarrollador BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS etiqueta VARCHAR(24);

            -- La cuenta se busca por nombre normalizado (en minúsculas y sin
            -- espacios sobrantes). Se aceptan las dos formas de escribirlo:
            -- con tilde y sin tilde.
            UPDATE usuarios
            SET es_desarrollador = TRUE
            WHERE nombre_normalizado IN ('iván j.', 'ivan j.')
              AND es_desarrollador = FALSE;

            -- El desarrollador recibe la etiqueta "Creador" si no tiene otra.
            UPDATE usuarios
            SET etiqueta = 'Creador'
            WHERE es_desarrollador = TRUE
              AND (etiqueta IS NULL OR trim(etiqueta) = '');

            UPDATE sesiones
            SET identificador = 'migrado-' || id::text
            WHERE identificador IS NULL;

            INSERT INTO dispositivos (usuario_id, identificador)
            SELECT s.usuario_id, s.identificador
            FROM sesiones s
            WHERE s.dispositivo_id IS NULL
            ON CONFLICT (usuario_id, identificador) DO NOTHING;

            UPDATE sesiones s
            SET dispositivo_id = d.id
            FROM dispositivos d
            WHERE s.dispositivo_id IS NULL
              AND d.usuario_id = s.usuario_id
              AND d.identificador = s.identificador;

            CREATE UNIQUE INDEX IF NOT EXISTS sesiones_identificador_uq
                ON sesiones (identificador)
                WHERE identificador IS NOT NULL;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'sesiones_dispositivo_fk'
                      AND conrelid = 'sesiones'::regclass
                ) THEN
                    ALTER TABLE sesiones
                    ADD CONSTRAINT sesiones_dispositivo_fk
                    FOREIGN KEY (dispositivo_id)
                    REFERENCES dispositivos(id)
                    ON DELETE CASCADE;
                END IF;
            END
            $$;

            -- ====================================================
            -- REDISEÑO DE SERVIDORES
            -- ====================================================

            ALTER TABLE grupos
                ADD COLUMN IF NOT EXISTS modelo VARCHAR(20) NOT NULL DEFAULT 'chat_unico',
                ADD COLUMN IF NOT EXISTS retencion_horas INTEGER,
                ADD COLUMN IF NOT EXISTS permite_ocultos BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS canales_activado_en TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                ADD COLUMN IF NOT EXISTS codigo_invitacion VARCHAR(12),
                ADD COLUMN IF NOT EXISTS codigo_invitacion_expira_en TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS codigo_invitacion_creado_en TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS codigo_invitacion_creado_por UUID;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'grupos_modelo_check'
                      AND conrelid = 'grupos'::regclass
                ) THEN
                    ALTER TABLE grupos
                    ADD CONSTRAINT grupos_modelo_check
                    CHECK (modelo IN ('chat_unico', 'canales'));
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'grupos_retencion_check'
                      AND conrelid = 'grupos'::regclass
                ) THEN
                    ALTER TABLE grupos
                    ADD CONSTRAINT grupos_retencion_check
                    CHECK (
                        retencion_horas IS NULL
                        OR (retencion_horas >= 1 AND retencion_horas <= 8760)
                    );
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'grupos_codigo_invitacion_creado_por_fk'
                      AND conrelid = 'grupos'::regclass
                ) THEN
                    ALTER TABLE grupos
                    ADD CONSTRAINT grupos_codigo_invitacion_creado_por_fk
                    FOREIGN KEY (codigo_invitacion_creado_por)
                    REFERENCES usuarios(id)
                    ON DELETE SET NULL;
                END IF;
            END
            $$;

            CREATE UNIQUE INDEX IF NOT EXISTS grupos_codigo_invitacion_uq
                ON grupos (codigo_invitacion)
                WHERE codigo_invitacion IS NOT NULL;

            CREATE TABLE IF NOT EXISTS canales_grupo (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                grupo_id UUID NOT NULL
                    REFERENCES grupos(id) ON DELETE CASCADE,
                nombre VARCHAR(25) NOT NULL,
                orden INTEGER NOT NULL DEFAULT 0,
                retencion_horas INTEGER,
                permite_ocultos BOOLEAN NOT NULL DEFAULT FALSE,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT canales_grupo_nombre_no_vacio
                    CHECK (length(trim(nombre)) > 0),
                CONSTRAINT canales_grupo_retencion_check
                    CHECK (
                        retencion_horas IS NULL
                        OR (retencion_horas >= 1 AND retencion_horas <= 8760)
                    ),
                UNIQUE (grupo_id, nombre)
            );

            -- Columnas de canal añadidas en la fase de rediseño.
            ALTER TABLE canales_grupo
                ADD COLUMN IF NOT EXISTS descripcion VARCHAR(200),
                ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ;

            ALTER TABLE mensajes_grupo
                ADD COLUMN IF NOT EXISTS canal_id UUID,
                ADD COLUMN IF NOT EXISTS oculto BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS editado_en TIMESTAMPTZ;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'mensajes_grupo_canal_fk'
                      AND conrelid = 'mensajes_grupo'::regclass
                ) THEN
                    ALTER TABLE mensajes_grupo
                    ADD CONSTRAINT mensajes_grupo_canal_fk
                    FOREIGN KEY (canal_id)
                    REFERENCES canales_grupo(id)
                    ON DELETE CASCADE;
                END IF;
            END
            $$;

            -- Cada grupo existente recibe su canal 'general' y sus mensajes se reasignan.
            INSERT INTO canales_grupo (grupo_id, nombre, orden, retencion_horas, permite_ocultos)
            SELECT g.id, 'general', 0, g.retencion_horas, g.permite_ocultos
            FROM grupos g
            WHERE NOT EXISTS (
                SELECT 1 FROM canales_grupo c WHERE c.grupo_id = g.id
            );

            UPDATE mensajes_grupo mg
            SET canal_id = c.id
            FROM canales_grupo c
            WHERE c.grupo_id = mg.grupo_id
              AND mg.canal_id IS NULL;

            -- Ajuste único: los servidores antiguos limpiaban mensajes a las 48 h.
            CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
                nombre VARCHAR(100) PRIMARY KEY,
                aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM migraciones_aplicadas
                    WHERE nombre = 'retencion_legacy_48'
                ) THEN
                    UPDATE grupos SET retencion_horas = 48 WHERE retencion_horas IS NULL;
                    UPDATE canales_grupo SET retencion_horas = 48 WHERE retencion_horas IS NULL;

                    INSERT INTO migraciones_aplicadas (nombre)
                    VALUES ('retencion_legacy_48')
                    ON CONFLICT DO NOTHING;
                END IF;
            END
            $$;

            ALTER TABLE mensajes_grupo
                ALTER COLUMN canal_id SET NOT NULL;

            ALTER TABLE miembros_grupo
                ADD COLUMN IF NOT EXISTS silenciado BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS puede_escribir BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS ultima_lectura_en TIMESTAMPTZ;

            DO $$
            DECLARE
                definicion TEXT;
            BEGIN
                SELECT pg_get_constraintdef(c.oid) INTO definicion
                FROM pg_constraint c
                WHERE c.conname = 'miembros_grupo_rol_check'
                  AND c.conrelid = 'miembros_grupo'::regclass;

                IF definicion IS NULL OR definicion NOT LIKE '%moderador%' THEN
                    ALTER TABLE miembros_grupo
                    DROP CONSTRAINT IF EXISTS miembros_grupo_rol_check;

                    ALTER TABLE miembros_grupo
                    ADD CONSTRAINT miembros_grupo_rol_check
                    CHECK (rol IN ('creador', 'moderador', 'miembro'));
                END IF;
            END
            $$;

            CREATE TABLE IF NOT EXISTS miembros_bloqueados_grupo (
                grupo_id UUID NOT NULL
                    REFERENCES grupos(id) ON DELETE CASCADE,
                usuario_id UUID NOT NULL
                    REFERENCES usuarios(id) ON DELETE CASCADE,
                bloqueado_por UUID
                    REFERENCES usuarios(id) ON DELETE SET NULL,
                motivo VARCHAR(200),
                oculto BOOLEAN NOT NULL DEFAULT FALSE,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (grupo_id, usuario_id)
            );

            CREATE TABLE IF NOT EXISTS ocultos_restringidos_grupo (
                grupo_id UUID NOT NULL
                    REFERENCES grupos(id) ON DELETE CASCADE,
                usuario_id UUID NOT NULL
                    REFERENCES usuarios(id) ON DELETE CASCADE,
                creado_por UUID
                    REFERENCES usuarios(id) ON DELETE SET NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (grupo_id, usuario_id)
            );

            CREATE INDEX IF NOT EXISTS idx_canales_grupo_grupo
                ON canales_grupo(grupo_id, orden);

            CREATE INDEX IF NOT EXISTS idx_mensajes_grupo_canal
                ON mensajes_grupo(canal_id, creado_en);

            CREATE INDEX IF NOT EXISTS idx_miembros_bloqueados_usuario
                ON miembros_bloqueados_grupo(usuario_id);

            CREATE INDEX IF NOT EXISTS idx_ocultos_restringidos_usuario
                ON ocultos_restringidos_grupo(usuario_id);

            -- ==========================================
            -- MENSAJES SIN LEER (punto rojo en la lista de chats)
            -- ==========================================

            ALTER TABLE mensajes_privados
                ADD COLUMN IF NOT EXISTS leido_en TIMESTAMPTZ;

            CREATE INDEX IF NOT EXISTS idx_mensajes_privados_conversacion_sin_leer
                ON mensajes_privados(conversacion_id, autor_id)
                WHERE leido_en IS NULL;

            -- ==========================================
            -- REELS
            -- Vídeo corto con título obligatorio, sus
            -- likes y sus comentarios.
            -- ==========================================

            CREATE TABLE IF NOT EXISTS reels (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                autor_id UUID NOT NULL
                    REFERENCES usuarios(id) ON DELETE CASCADE,
                archivo_id UUID NOT NULL
                    REFERENCES archivos(id) ON DELETE CASCADE,
                titulo VARCHAR(100) NOT NULL,
                visibilidad VARCHAR(20) NOT NULL DEFAULT 'amigos',
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT reels_titulo_no_vacio
                    CHECK (length(trim(titulo)) > 0),
                CONSTRAINT reels_visibilidad_check
                    CHECK (visibilidad IN ('amigos', 'publica'))
            );

            CREATE TABLE IF NOT EXISTS reels_likes (
                reel_id UUID NOT NULL
                    REFERENCES reels(id) ON DELETE CASCADE,
                usuario_id UUID NOT NULL
                    REFERENCES usuarios(id) ON DELETE CASCADE,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (reel_id, usuario_id)
            );

            CREATE TABLE IF NOT EXISTS reels_comentarios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                reel_id UUID NOT NULL
                    REFERENCES reels(id) ON DELETE CASCADE,
                autor_id UUID NOT NULL
                    REFERENCES usuarios(id) ON DELETE CASCADE,
                texto VARCHAR(1000) NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT reels_comentarios_texto_no_vacio
                    CHECK (length(trim(texto)) > 0)
            );

            CREATE INDEX IF NOT EXISTS idx_reels_autor
                ON reels(autor_id, creado_en DESC);

            CREATE INDEX IF NOT EXISTS idx_reels_visibilidad
                ON reels(visibilidad, creado_en DESC);

            CREATE INDEX IF NOT EXISTS idx_reels_likes_reel
                ON reels_likes(reel_id);

            CREATE INDEX IF NOT EXISTS idx_reels_comentarios_reel
                ON reels_comentarios(reel_id, creado_en);

            -- ==========================================
            -- HISTORIAS
            -- Carpetas permanentes con muchos elementos
            -- (texto, foto, vídeo o audio) que se pueden
            -- editar o borrar cuando se quiera.
            -- ==========================================

            CREATE TABLE IF NOT EXISTS historias (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                autor_id UUID NOT NULL
                    REFERENCES usuarios(id) ON DELETE CASCADE,
                nombre VARCHAR(60) NOT NULL,
                creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT historias_nombre_no_vacio
                    CHECK (length(trim(nombre)) > 0)
            );

            CREATE TABLE IF NOT EXISTS historias_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                historia_id UUID NOT NULL
                    REFERENCES historias(id) ON DELETE CASCADE,
                texto VARCHAR(500),
                archivo_id UUID
                    REFERENCES archivos(id) ON DELETE CASCADE,
                tipo VARCHAR(20) NOT NULL,
                orden INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT historias_items_tipo_check
                    CHECK (tipo IN ('texto', 'imagen', 'video', 'audio')),
                CONSTRAINT historias_items_contenido
                    CHECK (
                        (tipo = 'texto' AND texto IS NOT NULL AND archivo_id IS NULL)
                        OR
                        (tipo <> 'texto' AND texto IS NULL AND archivo_id IS NOT NULL)
                    ),
                UNIQUE (historia_id, orden)
            );

            CREATE INDEX IF NOT EXISTS idx_historias_autor
                ON historias(autor_id, actualizado_en DESC);

            CREATE INDEX IF NOT EXISTS idx_historias_items_historia
                ON historias_items(historia_id, orden);


        `);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}