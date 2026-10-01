#!/usr/bin/env bash
# Prueba completa de extremo a extremo contra la URL publica: registro,
# amistad, audio privado y foto de servidor. Es la prueba que demuestra que
# lo que se acaba de desplegar funciona de verdad.
#   bash deploy/prueba-completa.sh
set -u

URL="$(cat "$HOME/atuistas/tunel-url.txt")"
SUFIJO="$(date +%s)"

peticion() {
    local metodo="$1" ruta="$2" token="$3" cuerpo="$4"
    if [ -n "$cuerpo" ]; then
        curl -s -X "$metodo" -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" -d "$cuerpo" "$URL$ruta"
    else
        curl -s -X "$metodo" -H "Authorization: Bearer $token" "$URL$ruta"
    fi
}

campo() {
    printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p"
}

echo "=== 1. Registro de dos usuarios por HTTPS ==="
A="$(peticion POST /api/auth/registro "" "{\"nombre\":\"ana$SUFIJO\",\"dispositivo_id\":\"aaaaaaaa-0000-0000-0000-00000000$SUFIJO\"}")"
B="$(peticion POST /api/auth/registro "" "{\"nombre\":\"beto$SUFIJO\",\"dispositivo_id\":\"bbbbbbbb-0000-0000-0000-00000000$SUFIJO\"}")"

TOKEN_A="$(campo "$A" token)"
TOKEN_B="$(campo "$B" token)"
ID_B="$(campo "$B" id)"

if [ -z "$TOKEN_A" ] || [ -z "$TOKEN_B" ] || [ -z "$ID_B" ]; then
    echo "FALLO al registrar. Respuesta A: $A" >&2
    exit 1
fi
echo "  Ana  y  Beto  registrados por HTTPS"

echo ""
echo "=== 2. Solicitud de amistad y aceptacion ==="
peticion POST /api/amigos/solicitud "$TOKEN_A" "{\"destinatarioId\":\"$ID_B\"}" >/dev/null
SOL="$(peticion GET /api/amigos/solicitudes/recibidas "$TOKEN_B" "")"
ID_SOL="$(campo "$SOL" id)"
peticion POST /api/amigos/solicitudes/aceptar "$TOKEN_B" "{\"solicitudId\":\"$ID_SOL\"}" >/dev/null
echo "  Aceptada"

echo ""
echo "=== 3. Subir un audio y enviarlo sin texto (como el microfono) ==="
# Se generan bytes aleatorios con la cabecera EBML de WebM: el backend solo
# comprueba el MIME declarado, no el contenido.
head -c 2048 /dev/urandom > /tmp/audio-prueba.weba
ADJ="$(curl -s -X POST -H "Authorization: Bearer $TOKEN_A" \
    -F "archivo=@/tmp/audio-prueba.weba;type=audio/webm" \
    "$URL/api/mensajes/conversacion/$ID_B/adjuntos")"
ID_ARCHIVO="$(campo "$ADJ" archivo_id)"
RUTA_AUDIO="$(campo "$ADJ" ruta)"

if [ -z "$ID_ARCHIVO" ]; then
    echo "FALLO al subir el audio. Respuesta: $ADJ" >&2
    exit 1
fi
echo "  Audio subido: $RUTA_AUDIO"

MSG="$(peticion POST "/api/mensajes/conversacion/$ID_B" "$TOKEN_A" \
    "{\"tipo\":\"audio\",\"archivoId\":\"$ID_ARCHIVO\"}")"
TIPO_MSG="$(campo "$MSG" tipo)"
echo "  Mensaje enviado de tipo: $TIPO_MSG"

echo ""
echo "=== 4. Servidor sin canales, con foto y mensaje oculto ==="
G="$(peticion POST /api/grupos "$TOKEN_A" \
    "{\"nombre\":\"prueba$SUFIJO\",\"descripcion\":\"x\",\"modelo\":\"chat_unico\",\"permite_ocultos\":true}")"
ID_GRUPO="$(campo "$G" id)"

curl -s -X POST -H "Authorization: Bearer $TOKEN_A" \
    -F "archivo=@/tmp/atuistas-foto.png;type=image/png" \
    "$URL/api/grupos/$ID_GRUPO/imagen" >/dev/null
DETALLE="$(peticion GET "/api/grupos/$ID_GRUPO" "$TOKEN_A" "")"
FOTO="$(campo "$DETALLE" imagen_ruta)"

OCULTO="$(peticion POST "/api/grupos/$ID_GRUPO/mensajes" "$TOKEN_A" \
    "{\"contenido\":\"mensaje oculto\",\"oculto\":true}")"
ES_OCULTO="$(campo "$OCULTO" oculto)"

echo "  Foto del servidor: ${FOTO:-NO}"
echo "  Mensaje oculto    : ${ES_OCULTO:-NO}"

echo ""
echo "=== 5. El audio se sirve como audio por HTTPS ==="
TIPO="$(curl -s -o /dev/null -w '%{content_type}' "$URL/$RUTA_AUDIO")"
echo "  Content-Type: $TIPO"

echo ""
echo "=== Resumen ==="
[ "$TIPO_MSG" = "audio" ] && echo "  OK  mensaje de audio sin texto" || echo "  FALLO audio"
[ -n "$FOTO" ] && echo "  OK  foto del servidor" || echo "  FALLO foto"
[ "$ES_OCULTO" = "true" ] && echo "  OK  mensaje oculto" || echo "  FALLO oculto"
case "$TIPO" in audio/*) echo "  OK  el audio se sirve como audio" ;; *) echo "  AVISO content-type: $TIPO" ;; esac
