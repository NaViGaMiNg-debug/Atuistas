#!/usr/bin/env bash
# Averigua por que ningun tunel llega desde internet: mide si la conexion
# de casa tiene problemas hacia los servidores de tunel.
#   bash deploy/diagnostico-salida.sh
set -u

echo "=== 1. Conexion a Internet general ==="
for destino in "https://www.google.com" "https://api.ipify.org" "https://github.com"; do
    CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$destino" 2>/dev/null || echo 000)"
    printf '  %-32s %s\n' "$destino" "$CODIGO"
done

echo ""
echo "=== 2. Protocolo QUIC/UDP (Cloudflare lo usa por defecto) ==="
# Si el UDP esta bloqueado, el tunel con QUIC no sale. Por eso http2 existe.
if command -v nc >/dev/null 2>&1; then
    timeout 8 nc -zvu 1.1.1.1 443 2>&1 | tail -1 | sed 's/^/  /'
else
    echo "  nc no disponible"
fi

echo ""
echo "=== 3. Servidores de tunel ==="
# 22 = SSH (serveo), 443 = HTTPS (cloudflare, localtunnel)
for objetivo in "serveo.net 22" "api.cloudflare.com 443" "loca.lt 443"; do
    # shellcheck disable=SC2086
    set -- $objetivo
    if timeout 8 bash -c "cat < /dev/null > /dev/tcp/$1/$2" 2>/dev/null; then
        printf '  %-28s puerto %-5s ABIERTO\n' "$1" "$2"
    else
        printf '  %-28s puerto %-5s BLOQUEADO\n' "$1" "$2"
    fi
done

echo ""
echo "=== 4. Tipo de conexion (posible CG-NAT) ==="
echo "  IP publica: $(curl -4 -s --max-time 15 ifconfig.me || echo 'no se pudo obtener')"
echo "  IP local:   $(hostname -I | awk '{print $1}')"
echo ""
echo "  Si la IP publica empieza por 100.64 o es muy parecida a la local,"
echo "  la conexion esta tras CG-NAT y eso afecta a los tuneles entrantes."
