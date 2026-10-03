#!/usr/bin/env bash
#
# Publica el codigo en ~/atuistas, que es donde vive la aplicacion de verdad
# (el servicio arranca con deploy/iniciar.sh, sin sudo ni systemd), compila y
# reinicia:
#
#   bash deploy/deploy-publish.sh
#
# OJO: este script necesita bash y rsync. En el PC de Windows de desarrollo no
# hay ninguno de los dos, asi que alli no sirve: usa deploy/publicar.ps1, que
# hace exactamente lo mismo con tar + scp + ssh.
#
# No toca los datos del servidor: .env, uploads/, pgdata/ (la base de datos),
# data/ (claves de Push), el binario cloudflared ni los ficheros del tunel.

set -euo pipefail

SERVIDOR="${SERVIDOR:-navigaming@192.168.1.158}"
CLAVE="${CLAVE:-$HOME/.ssh/atuistas_deploy}"
ORIGEN="$(cd "$(dirname "$0")/.." && pwd)"
CARPETA="atuistas"

log() {
    echo ""
    echo "==> $1"
}

log "Comprobando que el servidor conserva sus datos"
ssh -i "$CLAVE" "$SERVIDOR" "cd ~/$CARPETA && test -f .env && test -d pgdata && test -d uploads && test -d data" \
    || { echo "Faltan datos en el servidor: no publico nada." >&2; exit 1; }

log "Subiendo el codigo a $SERVIDOR"
# Solo src/ y public/ se sincronizan con --delete, porque son codigo puro y
# asi desaparecen los ficheros viejos. El resto se copia encima para no borrar
# nunca los datos del servidor (pgdata, uploads, .env, claves de Push...).
rsync -az --delete -e "ssh -i $CLAVE" "$ORIGEN/src/" "$SERVIDOR:$CARPETA/src/"
rsync -az --delete -e "ssh -i $CLAVE" "$ORIGEN/public/" "$SERVIDOR:$CARPETA/public/"
rsync -az -e "ssh -i $CLAVE" --exclude '*.log' --exclude '*.pid' \
    "$ORIGEN/deploy/" "$SERVIDOR:$CARPETA/deploy/"
rsync -az -e "ssh -i $CLAVE" \
    "$ORIGEN/package.json" "$ORIGEN/package-lock.json" "$ORIGEN/tsconfig.json" "$ORIGEN/.env.example" \
    "$SERVIDOR:$CARPETA/"

log "Compilando en el servidor"
ssh -i "$CLAVE" "$SERVIDOR" "cd ~/$CARPETA && node_modules/.bin/tsc"

log "Reiniciando la aplicacion"
ssh -i "$CLAVE" "$SERVIDOR" "cd ~/$CARPETA && bash deploy/iniciar.sh --parar && bash deploy/iniciar.sh"

log "Comprobando que responde"
ssh -i "$CLAVE" "$SERVIDOR" 'curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/'

echo ""
echo "Despliegue terminado."
