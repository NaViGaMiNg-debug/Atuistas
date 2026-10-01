#!/usr/bin/env bash
# Comprueba que Atuistas responde a traves del tunel publico.
#   bash deploy/verificar.sh [url]
set -u

URL="${1:-$(cat "$HOME/atuistas/tunel-url.txt" 2>/dev/null || true)}"

if [ -z "$URL" ]; then
    echo "No hay URL de tunel. Levanta el tunel con: bash deploy/tunel.sh" >&2
    exit 1
fi

echo "Comprobando $URL"
echo ""

# Recursos de la PWA: si alguno falla, la app no se puede instalar.
for recurso in / /app.webmanifest /app.js /style.css /sw.js \
               /icon-192.png /icon-512.png /icon-maskable-512.png /icon.svg
do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$URL$recurso")"
    printf '  %-24s %s\n' "$recurso" "$codigo"
done

echo ""
echo "API (debe pedir token, no 404):"
codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$URL/api/ws/ticket")"
printf '  %-24s %s\n' "/api/ws/ticket" "$codigo"

echo ""
echo "Registro de usuario:"
codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
    -X POST -H 'Content-Type: application/json' \
    -d '{"nombre":"prueba","dispositivo_id":"11111111-1111-1111-1111-111111111111"}' \
    "$URL/api/auth/registro")"
printf '  %-24s %s\n' "POST /api/auth/registro" "$codigo"

echo ""
echo "Certificado TLS:"
echo | openssl s_client -connect "${URL#https://}" -servername "${URL#https://}" 2>/dev/null \
    | openssl x509 -noout -subject -dates 2>/dev/null | head -3 || echo "  no se pudo leer"
