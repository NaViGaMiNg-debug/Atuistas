#!/usr/bin/env bash
# Que se puede hacer sin sudo: determina si basta para publicar la app.
set -u

echo "--- sudo sin password ---"
if sudo -n true 2>/dev/null; then
    echo "SI: se puede usar sudo"
else
    echo "NO: pide password"
fi

echo "--- grupos del usuario ---"
id -nG

echo "--- initdb ---"
ls -1 /usr/lib/postgresql/*/bin/initdb 2>/dev/null || echo "no encontrado"

echo "--- crontab ---"
command -v crontab >/dev/null 2>&1 && echo "disponible" || echo "no disponible"

echo "--- puertos libres ---"
for puerto in 5432 5433 3000 8080; do
    if ss -tuln 2>/dev/null | grep -q ":$puerto "; then
        echo "$puerto ocupado"
    else
        echo "$puerto libre"
    fi
done

echo "--- cluster actual de postgres ---"
pg_lsclusters 2>/dev/null || echo "sin informacion"

echo "--- se puede leer la config de postgres? ---"
ls -la /etc/postgresql/18/main/pg_hba.conf >/dev/null 2>&1 && echo "se ve el fichero" || echo "no se ve"
