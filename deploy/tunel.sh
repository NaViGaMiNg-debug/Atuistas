#!/usr/bin/env bash
#
# Levanta un tunel de Cloudflare para que Atuistas sea accesible desde
# internet con HTTPS, sin abrir puertos del router y sin certificado propio.
#
#   bash deploy/tunel.sh
#   bash deploy/tunel.sh --parar
#
# El tunel corre en segundo plano con nohup y guarda la URL publica en
# tunel-url.txt. El microfono de la PWA solo funciona con HTTPS, y esto es
# lo que lo hace posible sin contratar nada.

set -euo pipefail

APP_DIR="$HOME/atuistas"
BINARIO="$APP_DIR/cloudflared"
PIDFILE="$APP_DIR/tunel.pid"
LOGFILE="$APP_DIR/tunel.log"
URLFILE="$APP_DIR/tunel-url.txt"
PUERTO=3000

descargar() {
    echo "==> Descargando cloudflared"
    local url
    # Se prueban los dos formatos de nombre que publica Cloudflare.
    for url in \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.tgz"
    do
        echo "    probando $url"
        if curl -fsSL --max-time 120 -o "$BINARIO" "$url" 2>/dev/null; then
            chmod +x "$BINARIO"
            if "$BINARIO" --version >/dev/null 2>&1; then
                echo "    descargado: $("$BINARIO" --version 2>&1 | head -1)"
                return 0
            fi
        fi
        rm -f "$BINARIO"
    done

    echo "No se pudo descargar cloudflared" >&2
    return 1
}

parar() {
    if [ -f "$PIDFILE" ]; then
        local pid
        pid="$(cat "$PIDFILE" 2>/dev/null || true)"
        if [ -n "$pid" ]; then
            echo "Parando el tunel (pid $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$PIDFILE"
    fi
    echo "Tunel parado."
}

if [ "${1:-}" = "--parar" ]; then
    parar
    exit 0
fi

# Si ya hay un tunel vivo, no se levanta otro.
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "El tunel ya esta en marcha (pid $(cat "$PIDFILE"))."
    [ -f "$URLFILE" ] && echo "URL: $(cat "$URLFILE")"
    exit 0
fi

if [ ! -x "$BINARIO" ]; then
    descargar
fi

echo "==> Levantando el tunel hacia 127.0.0.1:$PUERTO"
nohup "$BINARIO" tunnel --no-autoupdate --url "http://127.0.0.1:$PUERTO" \
    > "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

echo "    esperando a que asigne la URL..."
URL=""
for i in $(seq 1 30); do
    sleep 2
    # Cloudflare escribe la URL asignada en el log.
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGFILE" 2>/dev/null | head -1 || true)"
    if [ -n "$URL" ]; then
        break
    fi
done

if [ -z "$URL" ]; then
    echo "No se obtuvo la URL. Log del tunel:" >&2
    tail -20 "$LOGFILE" >&2
    exit 1
fi

echo "$URL" > "$URLFILE"

echo ""
echo "    URL publica: $URL"
echo "    guardada en $URLFILE"
echo ""
echo "Comprobando que responde por HTTPS..."
sleep 3
curl -s -o /dev/null -w "    HTTP %{http_code}\n" --max-time 20 "$URL/" || true
