# Conectar atuistas.com (guia rapida)

Tu web vive en el servidor de casa (`~/atuistas`, puerto 3000) y hoy sale a
internet por un tunel temporal `trycloudflare.com` que cambia. Para usar tu
dominio fijo con HTTPS:

## 1. Poner el dominio en Cloudflare (navegador, 1 vez)
1. Crea cuenta gratis en https://dash.cloudflare.com
2. `Add domain` -> `atuistas.com` (plan Free).
3. Cloudflare te da 2 nameservers (`xxx.ns.cloudflare.com`).
4. Ve al panel donde compraste el dominio (registrador) y sustituye los
   nameservers por los de Cloudflare.
5. Espera a que Cloudflare lo marque como **Active** (minutos / pocas horas).

## 2. Conectar el servidor al dominio (terminal del servidor, 1 vez)
```bash
cd ~/atuistas
bash deploy/tunel-dominio.sh
```
Te pedira autorizar (abres un enlace en el navegador). El script crea el tunel
fijo `atuistas`, las rutas DNS `atuistas.com` y `www.atuistas.com`, y arranca
el tunel. A partir de ahi la web es `https://atuistas.com` (fija, con HTTPS).

## 3. Comprobar
```bash
bash ~/atuistas/deploy/verificar.sh https://atuistas.com
```

## Notas
- El tunel temporal viejo (`tunel.sh`, trycloudflare) queda sustituido: el
  arranque automatico pasa a usar `tunel-dominio.sh`.
- No hay que abrir puertos del router ni contratar hosting: Cloudflare hace
  de puente con HTTPS.
- Si reinstalas el servidor, basta repetir el paso 2 (el tunel `atuistas`
  se reutiliza).
- Util: `bash ~/atuistas/deploy/tunel-dominio.sh --estado` y `--parar`.
