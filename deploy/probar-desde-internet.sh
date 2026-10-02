#!/usr/bin/env bash
# Comprueba una URL desde internet de verdad, no desde la red local.
#   bash deploy/probar-desde-externet.sh [url]
#
# Sin esto no se detecta el fallo real: un tunel puede responder 200 desde tu
# wifi y estar roto justo para quien entra desde fuera.
set -u

URL="${1:-$(cat "$HOME/atuistas/tunel-url.txt" 2>/dev/null || true)}"

if [ -z "$URL" ]; then
    echo "Falta la URL." >&2
    exit 1
fi

echo "Probando $URL"
echo ""

CODIFICADA="$(printf '%s' "$URL" | sed 's|:|%3A|g; s|/|%2F|g')"

echo "--- 1. Desde esta red (control) ---"
curl -s -o /tmp/ctl.html -w "    HTTP %{http_code}  %{size_download} bytes  %{content_type}\n" --max-time 25 "$URL"
if grep -q "Atuistas" /tmp/ctl.html 2>/dev/null; then
    echo "    es Atuistas: si"
else
    echo "    es Atuistas: NO"
fi

echo ""
echo "--- 2. Desde internet (allorigins) ---"
curl -s -o /tmp/ext1.html -w "    HTTP %{http_code}  %{size_download} bytes\n" --max-time 40 \
    "https://api.allorigins.win/raw?url=$CODIFICADA" || echo "    fallo la peticion"
if grep -q "Atuistas" /tmp/ext1.html 2>/dev/null; then
    echo "    es Atuistas: SI  -> FUNCIONA DESDE INTERNET"
    exit 0
else
    echo "    es Atuistas: NO"
    head -c 200 /tmp/ext1.html 2>/dev/null
    echo ""
fi

echo ""
echo "--- 3. Desde internet (codetabs) ---"
curl -s -o /tmp/ext2.html -w "    HTTP %{http_code}  %{size_download} bytes\n" --max-time 40 \
    "https://api.codetabs.com/v1/proxy?quest=$CODIFICADA" || echo "    fallo la peticion"
if grep -q "Atuistas" /tmp/ext2.html 2>/dev/null; then
    echo "    es Atuistas: SI  -> FUNCIONA DESDE INTERNET"
    exit 0
else
    echo "    es Atuistas: NO"
fi

echo ""
echo "CONCLUSION: la URL responde en local pero NO desde internet."
