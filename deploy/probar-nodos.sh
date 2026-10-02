#!/usr/bin/env bash
# Comprueba la URL desde varios puntos de internet del mundo con check-host.net.
#   bash deploy/probar-nodos.sh [url]
#
# Los servicios tipo allorigins pueden estar tambien tras Cloudflare, y
# Cloudflare no siempre encadena peticiones entre si. Por eso conviene
# comprobar con nodos reales en paises distintos.
set -u

URL="${1:-$(cat "$HOME/atuistas/tunel-url.txt" 2>/dev/null || true)}"

if [ -z "$URL" ]; then
    echo "Falta la URL." >&2
    exit 1
fi

echo "URL: $URL"
echo ""

# Se pide el chequeo. Devuelve un identificador de solicitud.
SOLICITUD="$(curl -s --max-time 30 -H 'Accept: application/json' \
    "https://check-host.net/check-http?host=$URL&max_nodes=5")"

ID="$(printf '%s' "$SOLICITUD" | sed -n 's/.*"request_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [ -z "$ID" ]; then
    echo "No se pudo lanzar la comprobacion:"
    printf '%s\n' "$SOLICITUD" | head -5
    exit 1
fi

echo "Comprobacion lanzada: $ID"
echo "Esperando resultados (30s)..."
sleep 30

echo ""
echo "=== RESULTADOS POR NODO ==="
RESULTADO="$(curl -s --max-time 30 -H 'Accept: application/json' \
    "https://check-host.net/check-result/$ID")"

# Cada entrada trae nodo:[[tiempo, ..., "OK", codigo, ip]]. Se separa cada
# nodo en una linea y se sacan el nombre y el codigo HTTP.
printf '%s\n' "$RESULTADO" | tr '}' '\n' | while read -r LINEA; do
    NODO="$(printf '%s' "$LINEA" | sed -n 's/.*"\([a-z0-9.-]*\.check-host\.net\)".*/\1/p')"
    CODIGO="$(printf '%s' "$LINEA" | grep -oE '(,|")[[:space:]]*([0-9]{3})(,|")' | head -1 | grep -oE '[0-9]{3}')"
    if [ -n "$NODO" ] && [ -n "$CODIGO" ]; then
        if [ "$CODIGO" = "200" ]; then
            echo "  OK    $NODO  ->  $CODIGO"
        else
            echo "  FALLO $NODO  ->  $CODIGO"
        fi
    fi
done

echo ""
echo "Un 200 significa que ese nodo abre bien la web."
echo ""
echo "NOTA: al|Comprobación con nodos reales de check-host.net."
echo "Los servicios tipo allorigins o codetabs NO sirven para esto: estan"
echo "ellos tambien tras Cloudflare y devuelven 522 aunque la web vaya bien."
