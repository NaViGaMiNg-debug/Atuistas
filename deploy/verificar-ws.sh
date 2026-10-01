#!/usr/bin/env bash
# Comprueba el certificado HTTPS y el WebSocket a traves del tunel.
#   bash deploy/verificar-ws.sh
set -u

URL="$(cat "$HOME/atuistas/tunel-url.txt")"
HOST="${URL#https://}"
BASE="$URL"

echo "=== Registro y websocket ==="

# Se registra un usuario de comprobacion con un id fijo.
DISPOSITIVO="33333333-3333-3333-3333-333333333333"
# El nombre unico evita que una segunda ejecucion falle por duplicado.
NOMBRE="verificador-$(date +%s)"
CUERPO="{\"nombre\":\"$NOMBRE\",\"dispositivo_id\":\"$DISPOSITIVO\"}"

REGISTRO="$(curl -s -X POST -H 'Content-Type: application/json' -d "$CUERPO" "$BASE/api/auth/registro")"
TOKEN="$(printf '%s' "$REGISTRO" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [ -z "$TOKEN" ]; then
    echo "No se pudo registrar el usuario de prueba:"
    printf '%s\n' "$REGISTRO" | head -5
    exit 1
fi
echo "Usuario de prueba registrado."

TICKET="$(curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE/api/ws/ticket" \
    | sed -n 's/.*"ticket"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [ -z "$TICKET" ]; then
    echo "No se pudo pedir el ticket del websocket."
    exit 1
fi
echo "Ticket del websocket obtenido."

# El handshake se comprueba pidiendo la mejora a WebSocket y leyendo la
# respuesta 101 Switching Protocols.
echo ""
echo "Respuesta del handshake:"
curl -s -i --http1.1 --max-time 20 \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "$BASE/ws?ticket=$TICKET" 2>/dev/null | head -6

echo ""
echo "=== Nota ==="
echo "Un 401 o un cierre Invalido en el handshake seria un fallo."
echo "Un 101 Switching Protocols significa que el tiempo real funciona."
