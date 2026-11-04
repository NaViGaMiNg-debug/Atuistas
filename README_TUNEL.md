# 📦 Tutorial para IAs: Cómo publicar actualizaciones en Atuistas

Este documento explica, paso a paso, cómo publicar cambios de código en la aplicación **Atuistas** para que se vean en el dominio `https://atuistas.com` (a través del túnel de Cloudflare). No es solo "hacer commit y subir"; es el flujo completo para que la actualización llegue al dominio público.

---

## 1. Arquitectura rápida (cómo llega un cambio al dominio)

```
Tu PC (código)  →  publicar.ps1  →  Servidor Ubuntu (puerto 3000)  →  cloudflared (túnel)  →  https://atuistas.com
```

El túnel de Cloudflare reenvía el tráfico de `atuistas.com` al puerto `3000` del servidor. Si la app no corre en el puerto 3000 o el túnel está caído, el dominio da **Error 1033**.

---

## 2. Prerrequisitos (una sola vez)

En tu **servidor Ubuntu** (donde vive la app):

- `.env` existe en `~/atuistas/`
- `pgdata/`, `uploads/`, `data/` existen en `~/atuistas/`
- `cloudflared` instalado en `~/atuistas/cloudflared` o `~/cloudflared`
- Túnel creado con nombre `atuistas` y rutas DNS para `atuistas.com` y `www.atuistas.com`
- URL guardada en `~/atuistas/tunel-url.txt`

En tu **PC local (Windows)** donde editas el código:

- PowerShell con acceso SSH al servidor
- Clave privada en `C:\Users\imore\.ssh\atuistas_deploy`
- Proyecto clonado en `C:\Users\imore\Desktop\Proyectos VS Code\Atuistas`


---

## 4. Paso 1: Publicar el código

Desde tu **PC local**, en PowerShell, dentro de la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\publicar.ps1
```

### Qué hace este script automáticamente

1. Empaqueta `src/`, `public/`, `deploy/`, `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`
2. Sube el paquete al servidor por SCP/SSH
3. Valida que el servidor tenga los datos (`.env`, `pgdata`, `uploads`, `data`) — si faltan, aborta para no borrar nada
4. Extrae el código en `~/atuistas/`
5. Compila TypeScript con `tsc` → genera `dist/`
6. Reinicia la app con `deploy/iniciar.sh --parar` y `deploy/iniciar.sh`
7. Verifica que responda en `http://127.0.0.1:3000/`
8. Muestra la URL pública si existe el archivo `tunel-url.txt`

### Opciones útiles

| Opción | Qué hace |
|--------|----------|
| (ninguna) | Publica, compila y reinicia la app |
| `-Comprobar` | Solo informa del estado del servidor, no publica nada |
| `-SinReiniciar` | Sube y compila, pero no reinicia la app |


---

## 5. Paso 2: Si el dominio da Error 1033 (túnel caído)


### Arreglo rápido en el servidor (ejecutar en la terminal SSH del servidor)

```bash
bash ~/atuistas/deploy/tunel-dominio.sh
```


### Qué hace este script

1. Descarga `cloudflared` si no existe
2. Te pide iniciar sesión en Cloudflare (se abre un navegador; dale "Allow")
3. Crea/reusa el túnel llamado `atuistas`
4. Configura las rutas DNS: `atuistas.com` → `127.0.0.1:3000` y `www.atuistas.com` → `127.0.0.1:3000`
5. Levanta el túnel en segundo plano con `nohup`
6. Guarda la URL pública en `~/atuistas/tunel-url.txt`
7. Agrega un cron `@reboot` para que vuelva solo si se reinicia el servidor


---

## 6. Paso 3: Verificar que la actualización llegó al dominio

```powershell
powershell -ExecutionPolicy Bypass -File deploy\publicar.ps1
```


Después de publicar (Paso 1) y asegurar que el túnel está arriba (Paso 2):

1. Espera 1-2 minutos para que Cloudflare propague el DNS
2. Abre en un navegador: `https://atuistas.com`
3. Confirma que se ven los cambios nuevos

Desde el servidor, puedes verificar los logs:

```bash
tail -20 ~/atuistas/atuistas.log
```

Y comprobar la URL pública:

```bash
cat ~/atuistas/tunel-url.txt
```


---

## 7. Comandos de referencia rápida (copiar y pegar)

### Desde tu PC local (PowerShell)

```powershell
# Conectar al servidor
ssh -i "C:\Users\imore\.ssh\atuistas_deploy" navegaming@192.168.1.158

# Ver estado completo del servidor
ssh -i "C:\Users\imore\.ssh\atuistas_deploy" navegaming@192.168.1.158 "bash ~/atuistas/deploy/estado.sh"

# Publicar actualización
powershell -ExecutionPolicy Bypass -File deploy\publicar.ps1

# Solo comprobar estado sin publicar
powershell -ExecutionPolicy Bypass -File deploy\publicar.ps1 -Comprobar
```

### Desde el servidor (terminal SSH)

```bash
# Iniciar la app si no responde
bash ~/atuistas/deploy/iniciar.sh

# Parar la app
bash ~/atuistas/deploy/iniciar.sh --parar

# Arreglar el túnel de Cloudflare (Error 1033)
bash ~/atuistas/deploy/tunel-dominio.sh

# Ver URL pública del túnel
cat ~/atuistas/tunel-url.txt

# Ver logs de la app
tail -20 ~/atuistas/atuistas.log

# Ver logs del túnel
tail -20 ~/atuistas/tunel.log
```


---

## 8. Solución de problemas comunes

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| Error 1033 en `atuistas.com` | `cloudflared` no está corriendo | Ejecutar `bash ~/atuistas/deploy/tunel-dominio.sh` en el servidor |
| La app no responde en el puerto 3000 | Proceso node caído | Ejecutar `bash ~/atuistas/deploy/iniciar.sh` en el servidor |
| `publicar.ps1` aborta | Faltan `.env`, `pgdata`, `uploads` o `data` en el servidor | No publicar; restaurar esos datos primero |
| Puerto 3000 ocupado por systemd | Servicio `atuistas` de systemd chocando | `sudo systemctl stop atuistas` en el servidor, luego `bash ~/atuistas/deploy/iniciar.sh` |
| Dominio muestra contenido viejo | Caché de Cloudflare | Esperar 2-5 min o forzar recarga (Ctrl+F5) |
| `bash` no encontrado en Windows | Estás en PowerShell, no en WSL | Usa `powershell -ExecutionPolicy Bypass -File deploy\publicar.ps1` desde Windows |


---

## 9. Checklist antes de considerar la publicación exitosa

- [ ] El script `publicar.ps1` terminó sin errores
- [ ] La app responde en `http://127.0.0.1:3000/` (HTTP 200)
- [ ] El archivo `~/atuistas/tunel-url.txt` existe y tiene `https://atuistas.com`
- [ ] `https://atuistas.com` carga en el navegador y muestra los cambios nuevos


---

## 10. Por qué fallaba antes (Error 1033)

El script `publicar.ps1` **solo publica código y reinicia la app en el puerto 3000**. No toca el túnel de Cloudflare. Si en algún momento el proceso `cloudflared` se detuvo, el servidor se reinició o las rutas DNS se perdieron, el dominio dejaba de resolver aunque la app estuviera viva en el puerto 3000.


Por eso, tras cada publicación, se debe verificar que el túnel esté activo:
```bash
cat ~/atuistas/tunel-url.txt
```
Si no hay URL o el dominio da Error 1033, ejecutar:
```bash
bash ~/atuistas/deploy/tunel-dominio.sh
```

---

*Última actualización: 2026-11-02*








---

*Última actualización: 2026-11-02*