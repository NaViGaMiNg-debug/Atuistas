#!/usr/bin/env bash
#
# Arranca Atuistas en segundo plano, sin systemd y sin sudo.
#
#   bash deploy/iniciar.sh
#   bash deploy/iniciar.sh --parar
#
# La app queda como proceso en segundo plano con nohup y su PID en un
# fichero. Para que vuelva sola cuando se reinicie el PC, se anade una
# entrada @reboot al crontab del usuario.

set -euo pipefail

APP_DIR="$HOME/atuistas"
PIDFILE="$APP_DIR/atuistas.pid"
LOGFILE="$APP_DIR/atuistas.log"
PGBIN="${PGBIN:-$(ls -1d /usr/lib/postgresql/*/bin | tail -1)}"

estaViva() {
    [ -f "$PIDFILE" ] || return 1
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    [ -n "$pid" ] || return 1
    kill -0 "$pid" 2>/dev/null
}

parar() {
    if estaViva; then
        local pid
        pid="$(cat "$PIDFILE")"
        echo "Parando Atuistas (pid $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 2
        kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PIDFILE"
    echo "Atuistas parado."
}

if [ "${1:-}" = "--parar" ]; then
    parar
    exit 0
fi

if estaViva; then
    echo "Atuistas ya esta en marcha (pid $(cat "$PIDFILE"))."
    exit 0
fi

echo "==> Asegurando PostgreSQL"
if ! "$PGBIN/pg_ctl" -D "$APP_DIR/pgdata" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$APP_DIR/pgdata" -l "$APP_DIR/pgdata/servidor.log" start >/dev/null 2>&1
    echo "    PostgreSQL arrancado"
else
    echo "    PostgreSQL ya estaba en marcha"
fi
sleep 2

echo "==> Arrancando Atuistas"
cd "$APP_DIR"
# set -a exporta las variables del .env al proceso hijo, que es como lee
# dotenv la configuracion sin tener que parsearlo aqui.
set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

nohup node dist/app.js >> "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

sleep 4

if estaViva; then
    echo "    en marcha (pid $(cat "$PIDFILE"))"
else
    echo "No arranco. Ultimas lineas del log:" >&2
    tail -20 "$LOGFILE" >&2
    rm -f "$PIDFILE"
    exit 1
fi

# El navegador tiene que esperar a que la app escuche.
echo "==> Comprobando"
curl -s -o /dev/null -w "    HTTP %{http_code}\n" http://127.0.0.1:3000/ || true

echo ""
echo "Registro automatico al reiniciar el PC..."
TAREA="@reboot $APP_DIR/deploy/iniciar.sh >/dev/null 2>&1"
if crontab -l 2>/dev/null | grep -qF "deploy/iniciar.sh"; then
    echo "    ya estaba configurado"
else
    (crontab -l 2>/dev/null; echo "$TAREA") | crontab -
    echo "    añadido al crontab (@reboot)"
fi
