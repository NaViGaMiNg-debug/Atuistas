#!/usr/bin/env bash
# Comprobacion rapida del estado de la instalacion de paquetes.
set -u

echo "--- ESTADO DE APT ---"
if pgrep -x apt >/dev/null 2>&1; then
    echo "apt sigue instalando (pid $(pgrep -x apt | head -1))"
else
    echo "apt terminado"
fi

echo "--- BINARIOS ---"
for comando in node npm psql nginx systemctl; do
    printf '%-10s ' "$comando"
    if command -v "$comando" >/dev/null 2>&1; then
        echo "OK -> $(command -v "$comando")"
    else
        echo "FALTA"
    fi
done

echo "--- VERSIONES ---"
node -v 2>/dev/null || echo "node: no disponible"
npm -v 2>/dev/null || echo "npm: no disponible"
psql --version 2>/dev/null || echo "psql: no disponible"
nginx -v 2>&1 || echo "nginx: no disponible"

echo "--- POSTGRESQL ---"
if command -v pg_lsclusters >/dev/null 2>&1; then
    pg_lsclusters 2>/dev/null || echo "sin clusters"
fi

echo "--- SUDO ---"
if sudo -n true 2>/dev/null; then
    echo "sudo sin password: OK"
else
    echo "sudo sigue pidiendo password"
fi
