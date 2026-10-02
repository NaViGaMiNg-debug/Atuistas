#!/usr/bin/env bash
#
# Prueba servicios de tunel gratuitos para ver cuales llegan desde internet.
# Solo prueba y deja el primero que funcione de verdad.
#
#   bash deploy/probar-tuneles.sh
#
# Comprobacion clave: la URL tiene que responder desde FUERA de la red local.
# Un tunel puede ir bien desde tu wifi y estar roto fuera.

set -uo pipefail

APP_DIR="$HOME/atuistas"
PUERTO=3000
LOGDIR="$APP_DIR/tuneles"

mkdir -p "$LOGDIR"

# Devuelve la URL publica de un tunel, o cadena vacia si no funciona.
# $1 = nombre, $2 = comando para arrancar, $3 = patron para extraer la URL
probar() {
    local nombre="$1" log="$LOGDIR/$1.log"

    echo "=== $nombre ==="
    rm -f "$log"

    # El comando se lanza en segundo plano.
    bash -c "$2" > "$log" 2>&1 &
    local pid=$!

    local url=""
    for i in $(seq 1 20); do
        sleep 3
        url="$(grep -oE "$3" "$log" 2>/dev/null | head -1 || true)"
        [ -n "$url" ] && break
        if ! kill -0 "$pid" 2>/dev/null; then
            break
        fi
    done

    if [ -z "$url" ]; then
        echo "  no se obtuvo URL"
        kill "$pid" 2>/dev/null || true
        tail -3 "$log" 2>/dev/null | sed 's/^/    /'
        return 1
    fi

    echo "  URL: $url"

    # La prueba decisiva: preguntar a un servicio externo si esa URL responde.
    # Si solo funciona desde la red local, el tunel no sirve para el movil.
    local codigo
    codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
        "https://api.allorigins.win/raw?url=$url" 2>/dev/null || echo "000")"
    codigo="${codigo:0:3}"

    echo "  desde internet: HTTP $codigo"

    if [ "$codigo" = "200" ]; then
        echo "  FUNCIONA desde fuera" >&2
        echo "$url" > "$APP_DIR/tunel-url.txt"
        kill "$pid" 2>/dev/null || true
        return 0
    fi

    echo "  no llega desde fuera" >&2
    kill "$pid" 2>/dev/null || true
    return 1
}

# 1. Cloudflare por HTTP2 en vez de QUIC: si el bloqueo afecta a UDP/QUIC,
#    forzar HTTP2 puede esquivarlo.
if probar "cloudflare-http2" \
    "$APP_DIR/cloudflared tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:$PUERTO" \
    'https://[a-z0-9-]+\.trycloudflare\.com'; then
    echo ""
    echo "SOLUCION: cloudflare con HTTP2 -> $(cat "$APP_DIR/tunel-url.txt")"
    exit 0
fi

# 2. LocalTunnel: servicio alternativo, sin cuenta.
if probar "localtunnel" \
    "npx --yes localtunnel --port $PUERTO" \
    'https://[a-z0-9-]+\.loca\.lt'; then
    echo ""
    echo "SOLUCION: localtunnel -> $(cat "$APP_DIR/tunel-url.txt")"
    exit 0
fi

# 3. serveo: otra alternativa sin cuenta.
if probar "serveo" \
    "ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:127.0.0.1:$PUERTO serveo.net" \
    'https://[a-z0-9.-]+\.serveousercontent\.com'; then
    echo ""
    echo "SOLUCION: serveo -> $(cat "$APP_DIR/tunel-url.txt")"
    exit 0
fi

echo ""
echo "Ninguno de los tuneles gratuitos llega desde internet."
echo "El problema no es el servicio, sino la conexion de tu casa a Internet."
