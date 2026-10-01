#!/usr/bin/env bash
#
# Publica el codigo en /opt/atuistas, compila y reinicia el servicio.
# Se ejecuta desde el PC de desarrollo, contra el servidor:
#
#   bash deploy/deploy-publish.sh
#
# No toca el .env del servidor ni la carpeta uploads/: esos se conservan
# entre publicaciones para no perder datos ni claves de Push.

set -euo pipefail

SERVIDOR="${SERVIDOR:-navigaming@192.168.1.158}"
CLAVE="${CLAVE:-$HOME/.ssh/atuistas_deploy}"
ORIGEN="$(cd "$(dirname "$0")/.." && pwd)"

log() {
    echo ""
    echo "==> $1"
}

log "Subiendo el codigo a $SERVIDOR"
ssh -i "$CLAVE" "$SERVIDOR" 'sudo mkdir -p /opt/atuistas && sudo chown -R $USER:$USER /opt/atuistas'

rsync -az --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude 'uploads' \
    --exclude 'data' \
    --exclude '*.log' \
    -e "ssh -i $CLAVE" \
    "$ORIGEN/" "$SERVIDOR:/opt/atuistas/"

log "Instalando dependencias y compilando en el servidor"
ssh -i "$CLAVE" "$SERVIDOR" 'cd /opt/atuistas && npm ci --omit=dev && npx tsc && sudo chown -R atuistas:atuistas /opt/atuistas'

log "Reiniciando el servicio"
ssh -i "$CLAVE" "$SERVIDOR" 'sudo systemctl restart atuistas && sleep 2 && sudo systemctl --no-pager status atuistas | head -12'

log "Comprobando que responde"
ssh -i "$CLAVE" "$SERVIDOR" 'curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/'

echo ""
echo "Despliegue terminado."
