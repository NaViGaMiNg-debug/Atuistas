#!/usr/bin/env bash
# Espera a que apt/dpkg terminen y luego vuelve a comprobar el sistema.
set -u

LIMITE="${1:-60}"
echo "Esperando a que apt termine (max ${LIMITE}0s)..."

esperados=0
for i in $(seq 1 "$LIMITE"); do
    if ! pgrep -x apt >/dev/null 2>&1 && ! pgrep -x dpkg >/dev/null 2>&1; then
        esperados=1
        break
    fi
    sleep 10
done

if [ "$esperados" -eq 1 ]; then
    echo "apt/dpkg han terminado."
else
    echo "AVISO: apt sigue corriendo tras ${LIMITE}0s."
fi

echo ""
bash /tmp/check.sh
