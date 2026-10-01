#!/usr/bin/env bash
#
# Despliegue de Atuistas en un servidor Ubuntu limpio.
#
#   sudo bash deploy.sh
#
# Prepara Node, PostgreSQL y el usuario de la base de datos. La app se publica
# despues con deploy-publish.sh, y el servicio systemd lo activa ese script.

set -euo pipefail

APP_USER="${APP_USER:-$SUDO_USER}"
APP_DIR="${APP_DIR:-/opt/atuistas}"
DB_NAME="${DB_NAME:-atuistas}"
DB_USER="${DB_USER:-atuistas}"

log() {
    echo ""
    echo "==> $1"
}

log "Comprobando que se ejecuta como root"
if [ "$(id -u)" -ne 0 ]; then
    echo "Este script necesita sudo:  sudo bash deploy.sh" >&2
    exit 1
fi

log "Instalando dependencias del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates postgresql postgresql-contrib nginx rsync

log "Preparando PostgreSQL"
systemctl enable --now postgresql

# start-stop-daemon no se usa aqui: se trabaja sobre el cluster por defecto.
PG_BIN="$(ls -1 /usr/lib/postgresql/*/bin/psql 2>/dev/null | tail -1 || true)"
if [ -z "$PG_BIN" ]; then
    echo "No se encontro psql de PostgreSQL" >&2
    exit 1
fi
PG_BIN_DIR="$(dirname "$PG_BIN")"

su postgres -c "$PG_BIN_DIR/psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1 || {
    echo "Creando rol $DB_USER"
    su postgres -c "$PG_BIN_DIR/psql -c \"CREATE ROLE $DB_USER LOGIN PASSWORD 'cambiame_esto_en_produccion'\""
}

su postgres -c "$PG_BIN_DIR/psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1 || {
    echo "Creando base de datos $DB_NAME"
    su postgres -c "$PG_BIN_DIR/psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER\""
}

log "Creando el directorio de la aplicacion"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Preparando el servicio systemd"
install -m 644 "$(dirname "$0")/atuistas.service" /etc/systemd/system/atuistas.service
systemctl daemon-reload
systemctl enable atuistas

log "Resumen"
echo "  usuario app : $APP_USER"
echo "  directorio  : $APP_DIR"
echo "  base datos  : $DB_NAME"
echo "  rol         : $DB_USER"
echo ""
echo "Siguiente paso: bash deploy-publish.sh"
