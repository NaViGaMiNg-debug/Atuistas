#!/usr/bin/env bash
#
# Crea el rol y la base de datos de Atuistas, y aplica el esquema.
# Necesita sudo:  sudo bash deploy/setup-db.sh
#
# La contrasena se lee del .env ya colocado en el servidor, de modo que el
# rol y la app usan siempre la misma.

set -euo pipefail

# Con sudo, $HOME apunta a /root, asi que la ruta se deduce de donde esta
# este propio script: esta en <app>/deploy/, luego la app esta un nivel arriba.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecutalo con sudo:  sudo bash deploy/setup-db.sh" >&2
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "No se encuentra $ENV_FILE" >&2
    exit 1
fi

# Se leen del .env para no repetir el secreto en el codigo.
DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | cut -d= -f2-)"
DB_USER="$(grep -E '^DB_USER=' "$ENV_FILE" | cut -d= -f2-)"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"

if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Faltan DB_NAME, DB_USER o DB_PASSWORD en el .env" >&2
    exit 1
fi

PG_BIN="$(ls -1 /usr/lib/postgresql/*/bin/psql 2>/dev/null | tail -1)"
PG_DIR="$(dirname "$PG_BIN")"

echo "==> Asegurando el servicio de PostgreSQL"
systemctl enable --now postgresql

echo "==> Creando el rol $DB_USER (si no existe)"
if su postgres -c "$PG_BIN -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1; then
    echo "   el rol ya existe"
else
    su postgres -c "$PG_BIN -c \"CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'\""
    echo "   rol creado"
fi

echo "==> Creando la base de datos $DB_NAME (si no existe)"
if su postgres -c "$PG_BIN -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1; then
    echo "   la base ya existe"
else
    su postgres -c "$PG_BIN -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER\""
    echo "   base creada"
fi

# En PostgreSQL la contrasena se fija despues para no exponerla en el
# historial de comandos del servidor recien creado.
echo "==> Fijando la contrasena del rol"
su postgres -c "$PG_BIN -c \"ALTER ROLE $DB_USER PASSWORD '$DB_PASSWORD'\"" >/dev/null

echo "==> Comprobando la conexion"
PGPASSWORD="$DB_PASSWORD" "$PG_BIN" -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 'conexion OK'" \
    || { echo "No se pudo conectar con el rol recien creado" >&2; exit 1; }

echo ""
echo "Base de datos lista: $DB_NAME (usuario $DB_USER)"
