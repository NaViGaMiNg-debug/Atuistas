#!/usr/bin/env bash
# Estado del puerto 3000 y del servicio, sin depender de sudo.
set -u

echo "--- proceso node ---"
pgrep -a node || echo "ninguno"

echo "--- propietario del puerto 3000 ---"
ss -tulpn 2>/dev/null | grep ":3000 " || echo "puerto libre"

echo "--- servicio systemd ---"
printf "atuistas: "
systemctl is-active atuistas 2>/dev/null || echo "desconocido"
printf "habilitado: "
systemctl is-enabled atuistas 2>/dev/null || echo "desconocido"

echo "--- base de datos ---"
PGBIN="$(ls -1d /usr/lib/postgresql/*/bin | tail -1)"
if "$PGBIN/pg_ctl" -D "$HOME/atuistas/pgdata" status >/dev/null 2>&1; then
    echo "cluster propio: en marcha (puerto 5433)"
else
    echo "cluster propio: parado"
fi

echo "--- tablas ---"
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$HOME/atuistas/.env" | cut -d= -f2-)"
PGPASSWORD="$DB_PASSWORD" "$PGBIN/psql" -h 127.0.0.1 -p 5433 -U atuistas -d atuistas \
    -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'" 2>/dev/null \
    | { read n; echo "tablas: ${n:-0}"; } || echo "no se pudo consultar"

echo "--- cloudflared ---"
if [ -x "$HOME/atuistas/cloudflared" ]; then
    echo "instalado: $("$HOME/atuistas/cloudflared" --version 2>&1 | head -1)"
else
    echo "no instalado"
fi
if [ -f "$HOME/atuistas/tunel-url.txt" ]; then
    echo "URL actual: $(cat "$HOME/atuistas/tunel-url.txt")"
else
    echo "sin tunel levantado"
fi
