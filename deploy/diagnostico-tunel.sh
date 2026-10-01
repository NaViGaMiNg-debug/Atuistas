#!/usr/bin/env bash
# Diagnostico del tunel: por que la web no responde aunque la app este viva.
#   bash deploy/diagnostico-tunel.sh
set -u

APP_DIR="/home/navigaming/atuistas"
URLFILE="$APP_DIR/tunel-url.txt"
PIDFILE="$APP_DIR/tunel.pid"
LOGFILE="$APP_DIR/tunel.log"

echo "=== 1. La app en local ==="
if curl -s -o /dev/null -w "  local: HTTP %{http_code}\n" --max-time 10 http://127.0.0.1:3000/; then
    :
else
    echo "  la app NO responde en local"
fi

echo ""
echo "=== 2. Proceso del tunel ==="
if [ -f "$PIDFILE" ]; then
    PID="$(cat "$PIDFILE")"
    if kill -0 "$PID" 2>/dev/null; then
        echo "  vivo (pid $PID)"
    else
        echo "  MUERTO (pid $PID, proceso ya no existe)"
    fi
else
    echo "  sin fichero de PID: nunca se levanto o se limpio"
fi
pgrep -a cloudflared || echo "  no hay ningun proceso cloudflared"

echo ""
echo "=== 3. URL guardada ==="
if [ -f "$URLFILE" ]; then
    URL="$(cat "$URLFILE")"
    echo "  $URL"
    echo "  comprobando..."
    CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL/" || echo 000)"
    echo "  HTTP $CODIGO"
else
    echo "  no hay URL guardada"
fi

echo ""
echo "=== 4. Ultimas lineas del log del tunel ==="
if [ -f "$LOGFILE" ]; then
    tail -12 "$LOGFILE"
else
    echo "  sin log"
fi
