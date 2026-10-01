#!/usr/bin/env bash
#
# Instala el servicio systemd y el proxy de nginx. Necesita sudo:
#
#   sudo bash deploy/setup-servicio.sh
#
# Nginx solo hace de proxy inverso hacia el puerto 3000 y sirve el WebSocket.
# El HTTPS lo terminara el tunel de Cloudflare, asi que aqui se listens
# en HTTP y el tunel se ocupa de cifrar hacia fuera.

set -euo pipefail

# Con sudo, $HOME pasa a ser /root: la ruta se deduce de la ubicacion de este
# script, que vive en <app>/deploy/.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUERTO_INTERNO=3000

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecutalo con sudo:  sudo bash deploy/setup-servicio.sh" >&2
    exit 1
fi

echo "==> Instalando el servicio systemd"
# Con "sudo bash", $USER y $(id -un) son root: hay que usar el usuario que
# invoco sudo, o el servicio arrancaria como root y dejaria el puerto 3000
# bloqueado sin que el propio usuario pueda pararlo.
USUARIO_REAL="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"

sed -e "s#@APP_DIR@#$APP_DIR#g" \
    -e "s#@APP_USER@#$USUARIO_REAL#g" \
    -e "s#@APP_GROUP@#$USUARIO_REAL#g" \
    "$APP_DIR/deploy/atuistas.service" > /etc/systemd/system/atuistas.service

chmod 644 /etc/systemd/system/atuistas.service
systemctl daemon-reload
systemctl enable atuistas

echo "==> Configurando nginx"
cat > /etc/nginx/sites-available/atuistas <<EOF
# Atuistas: proxy inverso hacia la aplicacion de Node.
# El WebSocket (/ws) necesita las cabeceras Upgrade para el tiempo real.
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # Adjuntos de hasta 50 MB (limite que impone @fastify/multipart).
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$PUERTO_INTERNO;
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # El tiempo real no debe cortarse por tiempo de espera.
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /ws {
        proxy_pass http://127.0.0.1:$PUERTO_INTERNO;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/atuistas /etc/nginx/sites-enabled/atuistas
rm -f /etc/nginx/sites-enabled/default

echo "==> Comprobando la configuracion de nginx"
nginx -t

echo "==> Arrancando todo"
systemctl restart atuistas
systemctl restart nginx
sleep 4

echo ""
echo "==> Estado"
systemctl --no-pager --lines=5 status atuistas || true
echo ""
echo "==> Comprobacion HTTP"
curl -s -o /dev/null -w "  puerto $PUERTO_INTERNO -> HTTP %{http_code}\n" "http://127.0.0.1:$PUERTO_INTERNO/" || true
curl -s -o /dev/null -w "  puerto 80         -> HTTP %{http_code}\n" "http://127.0.0.1/" || true
