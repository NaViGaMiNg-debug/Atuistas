#!/usr/bin/env bash
# Registra el arranque automatico de Atuistas y de su tunel al reiniciar el
# PC, usando el crontab del usuario (sin sudo).
#   bash deploy/arranque-automatico.sh
set -u

APP_DIR="/home/navigaming/atuistas"
TAREAS="$APP_DIR/deploy/iniciar.sh"
TUNEL="$APP_DIR/deploy/tunel.sh"

echo "==> Preparando el crontab"

# Se reconstruye desde cero con las dos tareas de arranque, y se conserva
# cualquier otra entrada que hubiera.
EXISTENTE="$(crontab -l 2>/dev/null | grep -vF "$TAREAS" | grep -vF "$TUNEL" || true)"

NUEVO="$EXISTENTE
# Atuistas: arranca la base de datos y la aplicacion.
@reboot sleep 20 && $TAREAS >/dev/null 2>&1
# Tunel de Cloudflare: da la URL publica con HTTPS.
@reboot sleep 45 && $TUNEL >/dev/null 2>&1"

printf '%s\n' "$NUEVO" | sed '/^$/d' | crontab -

echo "    crontab actualizado:"
crontab -l | sed 's/^/    /'
echo ""
echo "Al reiniciar el PC, Atuistas y el tunel se levantan solos."
echo "Ojo: la URL del tunel temporal cambiara. Para una fija hace falta un"
echo "dominio propio con Cloudflare."
