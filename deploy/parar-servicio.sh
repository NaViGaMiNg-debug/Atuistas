#!/usr/bin/env bash
#
# Corrige el servicio systemd de Atuistas y lo para, para que la app pueda
# arrancarse desde el propio usuario sin ocupar el puerto como root.
#
#   sudo bash /home/navigaming/atuistas/deploy/parar-servicio.sh
#
# Por que hace falta: si el servicio se instalo con "sudo bash", la sustitucion
# de $USER puso User=root y el proceso queda como root,dueño del puerto 3000,
# y despues el usuario ya no puede pararlo. Aqui se deja el servicio con el
# usuario correcto y detenido; el arranque real lo hace deploy/iniciar.sh.

set -euo pipefail

APP_DIR="/home/navigaming/atuistas"
USUARIO="${SUDO_USER:-navigaming}"
PUERTO=3000

echo "==> Parando el servicio"
systemctl stop atuistas 2>/dev/null || echo "    no estaba corriendo"
systemctl disable atuistas 2>/dev/null || true

echo "==> Liberando el puerto $PUERTO"
for intento in 1 2 3 4 5; do
    PID="$(ss -tulpn 2>/dev/null | grep ":$PUERTO " | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
    if [ -z "$PID" ]; then
        echo "    puerto libre"
        break
    fi
    echo "    parando pid $PID"
    kill -TERM "$PID" 2>/dev/null || true
    sleep 2
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
done

echo "==> Dejando la unit con el usuario correcto"
if [ -f "$APP_DIR/deploy/atuistas.service" ]; then
    sed -e "s#@APP_DIR@#$APP_DIR#g" \
        -e "s#@APP_USER@#$USUARIO#g" \
        -e "s#@APP_GROUP@#$USUARIO#g" \
        "$APP_DIR/deploy/atuistas.service" > /etc/systemd/system/atuistas.service
    chmod 644 /etc/systemd/system/atuistas.service
    systemctl daemon-reload
    echo "    unit corregida (User=$USUARIO)"
else
    echo "    no se encuentra la plantilla; se deja como estaba"
fi

echo ""
echo "==> Estado final"
systemctl is-active atuistas 2>/dev/null || true
ss -tuln | grep ":$PUERTO " || echo "puerto $PUERTO libre"
