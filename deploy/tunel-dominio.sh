#!/usr/bin/env bash
# Conecta atuistas.com al servidor con un tunel fijo de Cloudflare.
# Uso: bash deploy/tunel-dominio.sh [--parar|--estado]
set -euo pipefail
DOMINIO="atuistas.com"
WWW="www.atuistas.com"
NOMBRE="atuistas"
PUERTO=3000
APP_DIR="$HOME/atuistas"
BIN="$APP_DIR/cloudflared"
CDIR="$HOME/.cloudflared"
CONF="$CDIR/config.yml"
PIDF="$APP_DIR/tunel.pid"
PIDF2="$APP_DIR/tunel-dominio.pid"
LOGF="$APP_DIR/tunel.log"
URLF="$APP_DIR/tunel-url.txt"
if [ ! -x "$BIN" ]; then
  curl -fsSL --max-time 120 -o "$BIN" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  chmod +x "$BIN"
fi
parar() {
  for f in "$PIDF" "$PIDF2"; do
    if [ -f "$f" ]; then
      p="$(cat "$f" 2>/dev/null || true)"
      [ -n "$p" ] && kill "$p" 2>/dev/null || true
      sleep 2; [ -n "$p" ] && kill -9 "$p" 2>/dev/null || true
      rm -f "$f"
    fi
  done
  echo "Tunel parado."
}
if [ "${1:-}" = "--parar" ]; then parar; exit 0; fi
if [ "${1:-}" = "--estado" ]; then
  echo "--- config ---"; cat "$CONF" 2>/dev/null || echo "sin $CONF"
  echo "--- proceso ---"; pgrep -a cloudflared || echo "ninguno"
  echo "--- tuneles ---"; "$BIN" tunnel list 2>&1 | head -10 || true
  exit 0
fi
mkdir -p "$CDIR"
if [ ! -f "$CDIR/cert.pem" ]; then
  echo "==> Autoriza en el navegador (se abre un enlace):"
  "$BIN" tunnel login
fi
if ! "$BIN" tunnel list 2>/dev/null | grep -qE "[[:space:]]$NOMBRE([[:space:]]|$)"; then
  "$BIN" tunnel create "$NOMBRE"
else echo "Tunel '$NOMBRE' ya existe, se reutiliza."
fi
TID="$("$BIN" tunnel list 2>/dev/null | awk -v n="$NOMBRE" '$0 ~ n {print $1; exit}')"
[ -z "${TID:-}" ] && { echo "No se vio el ID del tunel." >&2; exit 1; }
echo "ID: $TID"
"$BIN" tunnel route dns "$NOMBRE" "$DOMINIO" || true
"$BIN" tunnel route dns "$NOMBRE" "$WWW" || true
cat > "$CONF" <<EOF
tunnel: $TID
credentials-file: $CDIR/$TID.json
ingress:
  - hostname: $DOMINIO
    service: http://127.0.0.1:$PUERTO
  - hostname: $WWW
    service: http://127.0.0.1:$PUERTO
  - service: http_status:404
EOF
"$BIN" tunnel ingress validate
parar
nohup "$BIN" tunnel --config "$CONF" --no-autoupdate run "$NOMBRE" > "$LOGF" 2>&1 &
echo $! > "$PIDF2"
echo "https://$DOMINIO" > "$URLF"
echo "Arrancado (pid $(cat "$PIDF2")). Esperando conexion..."
for _ in $(seq 1 30); do
  sleep 2
  grep -qE "Registered tunnel connection|registered" "$LOGF" 2>/dev/null && break
done
tail -5 "$LOGF" || true
TAREA="@reboot sleep 45 && $APP_DIR/deploy/tunel-dominio.sh >/dev/null 2>&1"
E="$(crontab -l 2>/dev/null | grep -vF "$APP_DIR/deploy/tunel.sh" || true)"
echo "$E" | grep -qF "tunel-dominio.sh" || (printf '%s\n' "$E" "$TAREA" | sed '/^$/d' | crontab -)
curl -s -o /dev/null -w "Local: HTTP %{http_code}\n" --max-time 10 http://127.0.0.1:$PUERTO/ || true
echo "Listo: abre https://$DOMINIO (el DNS tarda unos minutos la 1a vez)."
echo "Verifica con: bash ~/atuistas/deploy/verificar.sh https://$DOMINIO"
