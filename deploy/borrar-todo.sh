#!/usr/bin/env bash
#
# Borra todos los datos de la base de datos y deja el esquema intacto.
# Tambien vacia uploads/, para que no queden adjuntos sin dueno.
#
#   bash deploy/borrar-todo.sh
#   bash deploy/borrar-todo.sh --si    # no pide confirmacion
#
# Cuidado: borra cuentas tambien. Solo para reiniciar los datos de prueba.

set -uo pipefail

APP_DIR="$HOME/atuistas"
PGBIN="$(ls -1d /usr/lib/postgresql/*/bin | tail -1)"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$APP_DIR/.env" | cut -d= -f2-)"

psql() {
    PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h 127.0.0.1 -p 5433 -U atuistas -d atuistas "$@"
}

contar() {
    psql -tAc "SELECT count(*) FROM $1" 2>/dev/null || echo "?"
}

echo "=== Datos actuales ==="
printf '  %-26s %s\n' "usuarios:" "$(contar usuarios)"
printf '  %-26s %s\n' "servidores:" "$(contar grupos)"
printf '  %-26s %s\n' "mensajes privados:" "$(contar mensajes_privados)"
printf '  %-26s %s\n' "mensajes servidor:" "$(contar mensajes_grupo)"
printf '  %-26s %s\n' "publicaciones:" "$(contar publicaciones)"
printf '  %-26s %s\n' "estados:" "$(contar estados)"
printf '  %-26s %s\n' "archivos:" "$(contar archivos)"

if [ "${1:-}" != "--si" ]; then
    echo ""
    echo "Se borraran TODOS los datos, incluidas las cuentas."
    read -r -p "Escribe BORRAR en mayusculas: " CONFIRMA
    if [ "$CONFIRMA" != "BORRAR" ]; then
        echo "Cancelado. No se ha borrado nada."
        exit 0
    fi
fi

echo ""
echo "=== Borrando ==="

psql -q <<'SQL'
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'votos_encuesta', 'opciones_encuesta', 'encuestas', 'comentarios',
        'reels_comentarios', 'reels_likes', 'reels',
        'historias_items', 'historias',
        'corazones_publicacion', 'multimedia_publicacion', 'publicaciones',
        'estados_likes', 'estados_comentarios', 'estados', 'mensajes_privados', 'mensajes_grupo',
        'ocultos_restricidos_grupo', 'miembros_bloqueados_grupo',
        'bloqueos', 'solicitudes_amistad', 'amistades',
        'conversaciones_privadas', 'canales_grupo', 'miembros_grupo',
        'grupos', 'notificaciones', 'dispositivos', 'multimedia_estado',
        'sesiones', 'configuracion_notificaciones', 'archivos', 'usuarios'
    ]
    LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
        END IF;
    END LOOP;
END $$;
SQL

echo "  tablas vaciadas"

echo ""
echo "=== Vaciando uploads/ ==="
if [ -d "$APP_DIR/uploads" ]; then
    CUANTOS="$(find "$APP_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"
    find "$APP_DIR/uploads" -mindepth 1 -delete 2>/dev/null
    echo "  $CUANTOS ficheros borrados (las claves de Push de data/ se conservan)"
else
    echo "  no existe la carpeta uploads/"
fi

echo ""
echo "=== Resultado ==="
printf '  %-26s %s\n' "usuarios:" "$(contar usuarios)"
printf '  %-26s %s\n' "servidores:" "$(contar grupos)"
printf '  %-26s %s\n' "mensajes privados:" "$(contar mensajes_privados)"
printf '  %-26s %s\n' "publicaciones:" "$(contar publicaciones)"
printf '  %-26s %s\n' "archivos:" "$(contar archivos)"

echo ""
echo "Base de datos limpia. Ya puedes crear tu cuenta."
