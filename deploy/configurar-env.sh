#!/usr/bin/env bash
#
# Ajusta el .env del servidor al cluster propio del usuario (puerto 5433).
#   bash deploy/configurar-env.sh
#
# El .env guarda la clave de cifrado de los codigos de vinculacion, asi que
# este script solo cambia la conexion y nunca regenera esa clave.

set -euo pipefail

ENV_FILE="$HOME/atuistas/.env"
PGPORT="${PGPORT:-5433}"

if [ ! -f "$ENV_FILE" ]; then
    echo "No se encuentra $ENV_FILE" >&2
    exit 1
fi

actualizar() {
    local clave="$1"
    local valor="$2"

    if grep -qE "^$clave=" "$ENV_FILE"; then
        # sed -i con delimitador distinto para no chocar con las barras de la URL.
        sed -i "s|^$clave=.*|$clave=$valor|" "$ENV_FILE"
    else
        echo "$clave=$valor" >> "$ENV_FILE"
    fi
    echo "  $clave=$valor"
}

echo "==> Configurando la conexion a la base de datos"
actualizar DB_HOST 127.0.0.1
actualizar DB_PORT "$PGPORT"
actualizar DB_NAME atuistas
actualizar DB_USER atuistas

# En produccion el servidor escucha solo en local: el proxy y el tunel son los
# unicos que llegan desde fuera.
actualizar HOST 127.0.0.1
actualizar PORT 3000

echo ""
echo "--- .env resultante (sin mostrar secretos) ---"
grep -vE 'PASSWORD|ENCRYPTION_KEY|PRIVATE_KEY' "$ENV_FILE"
