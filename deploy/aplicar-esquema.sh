#!/usr/bin/env bash
#
# Aplica el esquema inicial (schema.sql) y deja la base lista.
#
#   bash deploy/aplicar-esquema.sh
#
# El arranque de la app solo ejecuta migraciones, que asumen que las tablas
# ya existen. En una base nueva hay que cargar antes el esquema. Es seguro
# repetirlo: schema.sql lleva "IF NOT EXISTS" en todas sus tablas.

set -euo pipefail

APP_DIR="$HOME/atuistas"
PGBIN="${PGBIN:-$(ls -1d /usr/lib/postgresql/*/bin | tail -1)}"
PGPORT="${PGPORT:-5433}"
DB_NAME="${DB_NAME:-atuistas}"
DB_USER="${DB_USER:-atuistas}"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$APP_DIR/.env" | cut -d= -f2-)"
ESQUEMA="$APP_DIR/src/db/schema.sql"

if [ ! -f "$ESQUEMA" ]; then
    echo "No se encuentra el esquema en $ESQUEMA" >&2
    exit 1
fi

echo "==> Aplicando schema.sql"
PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" \
    -h 127.0.0.1 -p "$PGPORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -q -f "$ESQUEMA"

echo "==> Tablas creadas"
PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" \
    -h 127.0.0.1 -p "$PGPORT" -U "$DB_USER" -d "$DB_NAME" \
    -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
