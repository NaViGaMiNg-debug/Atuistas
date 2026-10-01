#!/usr/bin/env bash
# Resumen de las peticiones y errores del log de Atuistas.
#   bash deploy/ver-log.sh [lineas]
set -u

LOG="$HOME/atuistas/atuistas.log"
LINEAS="${1:-200}"

if [ ! -f "$LOG" ]; then
    echo "No hay log en $LOG" >&2
    exit 1
fi

echo "=== Ultimas $LINEAS peticiones, con codigo ==="
tail -n "$LINEAS" "$LOG" \
    | sed -n 's/.*"url":"\([^"]*\)".*"statusCode":\([0-9]*\).*/\2  \1/p' \
    | tail -40

echo ""
echo "=== Errores registrados (level 50) ==="
CANTIDAD="$(grep -c '"level":50' "$LOG" 2>/dev/null || echo 0)"
echo "total: $CANTIDAD"
if [ "$CANTIDAD" -gt 0 ]; then
    grep '"level":50' "$LOG" | tail -5 | sed 's/^/  /'
fi

echo ""
echo "=== Peticiones a la API por el usuario ==="
grep -c 'api/auth/registro' "$LOG" 2>/dev/null || echo "0 registros"
echo "ultimos accesos:"
grep -oE 'accesso|verificacion|/api/[a-z/]+' "$LOG" 2>/dev/null | sort | uniq -c | tail -10
