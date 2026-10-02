#!/usr/bin/env bash
# Lista los usuarios registrados, para comprobar que la app funciona de verdad.
#   bash deploy/listar-usuarios.sh
set -u

APP_DIR="$HOME/atuistas"
PGBIN="$(ls -1d /usr/lib/postgresql/*/bin | tail -1)"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$APP_DIR/.env" | cut -d= -f2-)"

PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" \
    -h 127.0.0.1 -p 5433 -U atuistas -d atuistas \
    -c "SELECT nombre, created_at FROM usuarios ORDER BY created_at DESC LIMIT 10" 2>/dev/null \
    || PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" \
        -h 127.0.0.1 -p 5433 -U atuistas -d atuistas \
        -c "SELECT nombre, creado_en FROM usuarios ORDER BY creado_en DESC LIMIT 10"

echo ""
echo "Total: $(PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h 127.0.0.1 -p 5433 -U atuistas -d atuistas -tAc 'SELECT count(*) FROM usuarios')"
