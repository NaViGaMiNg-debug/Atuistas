#Requires -Version 5.1
<#
    Publica Atuistas en el servidor de casa, desde Windows.

    Por que existe este script: deploy-publish.sh necesita bash y rsync, y en
    este PC no estan instalados (comprobado: "bash" y "rsync" no existen). Por
    eso el codigo se sube con tar + scp + ssh, que si trae Windows.

    Uso:
        powershell -ExecutionPolicy Bypass -File deploy\publicar.ps1

    Opciones:
        -Comprobar      Solo informa del estado del servidor, sin publicar.
        -SinReiniciar   Sube y compila, pero no reinicia la aplicacion.

    Datos que NUNCA se tocan (viven solo en el servidor y no estan en el repo):
        .env   uploads/   pgdata/   data/   cloudflared   tunel-url.txt   tunel.pid
    Solo se reemplaza el codigo, se compila con tsc y se reinicia la app.
#>

[CmdletBinding()]
param(
    [string]$Servidor = "navigaming@192.168.1.158",
    [string]$Clave = (Join-Path $HOME ".ssh\atuistas_deploy"),
    [switch]$Comprobar,
    [switch]$SinReiniciar
)

$Origen = Split-Path -Parent $PSScriptRoot
$Carpeta = "atuistas"

function Paso([string]$texto) {
    Write-Host ""
    Write-Host "==> $texto" -ForegroundColor Cyan
}

function Morir([string]$texto) {
    Write-Host ""
    Write-Host "ERROR: $texto" -ForegroundColor Red
    exit 1
}

$OpcionesSsh = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-i", $Clave)

# Ejecuta un comando en el servidor y aborta si falla.
function Remoto([string]$comando) {
    $salida = & ssh @OpcionesSsh $Servidor $comando 2>&1
    $codigo = $LASTEXITCODE
    if ($codigo -ne 0) {
        $salida | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        Morir "Fallo en el servidor (codigo $codigo)."
    }
    return $salida
}

# ---------------------------------------------------------------- herramientas
foreach ($herramienta in @("ssh", "scp", "tar")) {
    if (-not (Get-Command $herramienta -ErrorAction SilentlyContinue)) {
        Morir "Falta '$herramienta' en este PC."
    }
}
if (-not (Test-Path -LiteralPath $Clave)) {
    Morir "No encuentro la clave privada: $Clave"
}

# ------------------------------------------- comprobar que los datos siguen ahi
Paso "Comprobando el servidor $Servidor"
$estado = (Remoto "cd ~/$Carpeta && test -f .env && echo ENV_OK; test -d pgdata && echo PG_OK; test -d uploads && echo UP_OK; test -d data && echo DATA_OK; pgrep -f 'dist/app.js' >/dev/null && echo APP_ON || echo APP_OFF; systemctl is-active atuistas 2>/dev/null || true") -join " "

foreach ($necesario in @("ENV_OK", "PG_OK", "UP_OK", "DATA_OK")) {
    if ($estado -notmatch $necesario) {
        Morir "En el servidor falta $necesario. No publico nada para no tocar tus datos."
    }
}
Write-Host "    datos intactos: .env, pgdata, uploads, data"
if ($estado -match "APP_ON") { Write-Host "    la app esta en marcha" } else { Write-Host "    la app NO esta en marcha" }
if (($estado -split "\s+") -contains "active") {
    Write-Host "    AVISO: el servicio systemd 'atuistas' esta activo y chocaria en el puerto 3000." -ForegroundColor Yellow
}

if ($Comprobar) {
    Paso "Estado del servidor"
    Remoto "bash ~/$Carpeta/deploy/estado.sh" | ForEach-Object { Write-Host "    $_" }
    Write-Host ""
    Write-Host "Solo comprobacion: no se ha publicado nada."
    exit 0
}

# --------------------------------------------------------------- empaquetar
Paso "Empaquetando el codigo"
$Elementos = @("src", "public", "deploy", "package.json", "package-lock.json", "tsconfig.json", ".env.example")
foreach ($elemento in $Elementos) {
    if (-not (Test-Path -LiteralPath (Join-Path $Origen $elemento))) {
        Morir "No encuentro '$elemento' en el proyecto."
    }
}

$Temporal = Join-Path ([System.IO.Path]::GetTempPath()) ("atuistas-publicar-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Temporal -Force | Out-Null
$Paquete = Join-Path $Temporal "codigo.tar.gz"

& tar -czf $Paquete -C $Origen @Elementos
if ($LASTEXITCODE -ne 0) { Morir "tar no pudo crear el paquete." }
Write-Host ("    {0} KB" -f [math]::Round((Get-Item -LiteralPath $Paquete).Length / 1KB))

# --------------------------------------------------------------------- subir
Paso "Subiendo el codigo"
Remoto "mkdir -p ~/$Carpeta/.deploy" | Out-Null
& scp -o BatchMode=yes -o ConnectTimeout=15 -i $Clave $Paquete "${Servidor}:$Carpeta/.deploy/codigo.tar.gz"
if ($LASTEXITCODE -ne 0) { Morir "scp no pudo subir el paquete." }
Write-Host "    subido"

# ------------------------------------------------- instalar y compilar
Paso "Instalando el codigo"
Remoto "cd ~/$Carpeta && tar -xzf .deploy/codigo.tar.gz && rm -f .deploy/codigo.tar.gz" | Out-Null
Write-Host "    codigo reemplazado (src/, public/, deploy/, package.json...)"

Paso "Compilando con tsc"
$compilado = (Remoto "cd ~/$Carpeta && if [ -x node_modules/.bin/tsc ]; then node_modules/.bin/tsc; else npm install --no-audit --no-fund >/dev/null 2>&1 && node_modules/.bin/tsc; fi && echo COMPILADO_OK") -join " "
if ($compilado -notmatch "COMPILADO_OK") { Morir "tsc no termino correctamente." }
Write-Host "    dist/ regenerado"

# ----------------------------------------------------------------- reiniciar
if ($SinReiniciar) {
    Write-Host ""
    Write-Host "Aviso: se ha publicado pero NO se ha reiniciado (-SinReiniciar)."
} else {
    Paso "Reiniciando la aplicacion"
    Remoto "cd ~/$Carpeta && bash deploy/iniciar.sh --parar" | Out-Null
    Remoto "cd ~/$Carpeta && bash deploy/iniciar.sh" |
        Where-Object { "$_".Trim() } |
        ForEach-Object { Write-Host "    $_" }
}

# ---------------------------------------------------------------- verificar
Paso "Comprobando el resultado"
$http = (Remoto "curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/") -join ""
Write-Host "    la app responde: HTTP $http"

$marcas = (Remoto "cd ~/$Carpeta && grep -c 'boton-ver-grupo' public/index.html; grep -o 'VERSION = .v[0-9]*.' public/sw.js; grep -c 'actualizarDescripcionGrupo' src/services/grupos.service.ts") -join "  |  "
Write-Host "    cambios nuevos presentes: $marcas"

$url = (Remoto "cat ~/$Carpeta/tunel-url.txt 2>/dev/null || true") -join ""
if ($url -match "https://") { Write-Host "    URL publica: $url" }
else { Write-Host "    (sin tunel levantado en el servidor)" }

# ------------------------------------------------------------------ limpieza
Remove-Item -LiteralPath $Temporal -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Publicacion terminada." -ForegroundColor Green
