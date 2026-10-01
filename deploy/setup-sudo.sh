#!/usr/bin/env bash
#
# Da acceso sin password a las operaciones de despliegue, en vez de depender
# de teclear la contrasena cada vez. Se ejecuta UNA vez desde la terminal
# del usuario (pide el password de sudo):
#
#   bash deploy/setup-sudo.sh
#
# Crea una regla en /etc/sudoers.d que limita el usuario a reiniciar el
# servicio y leer sus logs. Nada mas: si algo mas hace falta, se anade aqui
# de forma explicita, nunca un NOPASSWD: ALL.

set -euo pipefail

USUARIO="${1:-$SUDO_USER}"
RULE="/etc/sudoers.d/atuistas-deploy"

if [ "$(id -u)" -ne 0 ]; then
    echo "Ejecutalo con sudo:  sudo bash deploy/setup-sudo.sh" >&2
    exit 1
fi

cat > "$RULE" <<EOF
# Atuistas: permite al usuario publicar y reiniciar el servicio sin teclear
# el password. Las demas operaciones de sudo siguen pidiendo contrasena.
$USUARIO ALL=(root) NOPASSWD: /bin/systemctl restart atuistas, /bin/systemctl status atuistas, /bin/systemctl stop atuistas, /bin/systemctl start atuistas, /bin/journalctl -u atuistas, /usr/sbin/nginx -t, /bin/mkdir -p /opt/atuistas, /bin/chown -R atuistas:atuistas /opt/atuistas
EOF

chmod 440 "$RULE"

# vis -c es la unica forma segura de validar la sintaxis antes de dejar
# el fichero en su sitio: si estuviera mal, sudo dejaria de funcionar.
if ! vis -c "$RULE" >/dev/null; then
    rm -f "$RULE"
    echo "La regla no era valida y se ha eliminado. No se ha tocado nada." >&2
    exit 1
fi

echo "Acceso sin password configurado para: $USUARIO"
echo "Comprobando..."
sudo -u "$USUARIO" sudo -n systemctl status atuistas >/dev/null 2>&1 \
    && echo "sudo funciona" \
    || echo "sudo todavia pide password: cierra la sesion y vuelve a entrar"
