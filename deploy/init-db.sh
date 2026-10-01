#!/usr/bin/env bash
#
# Crea una base de datos PostgreSQL propia del usuario, sin sudo.
#
# El cluster del sistema (puerto 5432) es del usuario postgres y no se puede
# tocar sin password. Este crea un cluster en la carpeta del usuario, en el
# puerto 5433, que el usuario puede arrancar y parar sin privilegios.
#
#   bash deploy/init-db.sh
#
# Es la solucion adecuada para una instalacion de un solo usuario en un
# servidor domestico. Si algun dia hacen falta varios usuarios del sistema,
# habria que migrar al cluster compartido con sudo.

set -euo pipefail

PGBIN="${PGBIN:-$(ls -1d /usr/lib/postgresql/*/bin | tail -1)}"
PGDATA="$HOME/atuistas/pgdata"
PGPORT="${PGPORT:-5433}"
DB_NAME="${DB_NAME:-atuistas}"
DB_USER="${DB_USER:-atuistas}"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$HOME/atuistas/.env" | cut -d= -f2-)"

if [ -z "$DB_PASSWORD" ]; then
    echo "No se encuentra DB_PASSWORD en ~/atuistas/.env" >&2
    exit 1
fi

echo "==> Binarios: $PGBIN"
echo "==> Datos en: $PGDATA"
echo "==> Puerto: $PGPORT"

if [ -d "$PGDATA/base" ]; then
    echo "El cluster ya existe; no se vuelve a crear."
else
    echo "==> Creando el cluster"
    mkdir -p "$PGDATA"
    # initdb no admite ejecutar como root, y por suerte aqui no lo somos.
    "$PGBIN/initdb" -D "$PGDATA" -U "$DB_USER" --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 >/dev/null
    echo "    cluster creado"
fi

# Puerto y escucha solo en local: la base no se expone a la red.
cat >> "$PGDATA/postgresql.conf" <<EOF

# Ajustes de Atuistas: la base solo se escucha desde el propio servidor.
port = $PGPORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '$PGDATA'
EOF

# La app se conecta con usuario y contraseña por TCP, no por socket local.
cat > "$PGDATA/pg_hba.conf" <<EOF
local   all   all                  trust
host    all   all   127.0.0.1/32   scram-sha-256
host    all   all   ::1/128        scram-sha-256
EOF

echo "==> Arrancando PostgreSQL"
if "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/servidor.log" start >/dev/null 2>&1; then
    echo "    arrancado"
else
    echo "    ya estaba arrancado"
fi

sleep 2

echo "==> Fijando la contraseña del rol $DB_USER"
"$PGBIN/psql" -h "$PGDATA" -p "$PGPORT" -U "$DB_USER" -d postgres -c "ALTER ROLE $DB_USER PASSWORD '$DB_PASSWORD'" >/dev/null

echo "==> Creando la base $DB_NAME"
if "$PGBIN/psql" -h "$PGDATA" -p "$PGPORT" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    echo "    ya existe"
else
    "$PGBIN/psql" -h "$PGDATA" -p "$PGPORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER" >/dev/null
    echo "    creada"
fi

echo "==> Comprobando la conexion por TCP con contraseña"
PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 'conexion OK'" \
    || { echo "Fallo la conexion" >&2; exit 1; }
