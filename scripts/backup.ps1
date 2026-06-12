# ============================================================================
# Respaldo de la base de datos de Inventa Point (Supabase / Postgres).
# ----------------------------------------------------------------------------
# Requisitos (una sola vez):
#   1. Instalar las herramientas cliente de PostgreSQL (incluyen pg_dump):
#        winget install PostgreSQL.PostgreSQL.17
#      (o descargar solo los binarios desde postgresql.org)
#   2. Obtener la cadena de conexión en Supabase:
#        Dashboard -> (icono "Connect" arriba) -> Session pooler -> URI
#      Tiene la forma:
#        postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
#   3. Guardarla como variable de entorno de usuario (no queda en el repo):
#        [Environment]::SetEnvironmentVariable('INVENTA_DB_URL', 'postgresql://...', 'User')
#
# Uso manual:    powershell -File scripts\backup.ps1
# Programado:    ver instrucciones de Task Scheduler en el README/respuesta.
# ============================================================================

param(
  # Carpeta destino de los respaldos (fuera del repo por defecto).
  [string]$Destino = "$env:USERPROFILE\Respaldos\InventaPoint",
  # Cadena de conexión; por defecto se toma de la variable de entorno.
  [string]$DbUrl = $env:INVENTA_DB_URL,
  # Cuántos respaldos conservar (los más viejos se borran).
  [int]$Conservar = 30
)

if (-not $DbUrl) {
  Write-Error "Falta la cadena de conexión. Define INVENTA_DB_URL o pasa -DbUrl."
  exit 1
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "pg_dump no está en el PATH. Instala las herramientas de PostgreSQL."
  exit 1
}

New-Item -ItemType Directory -Force $Destino | Out-Null
$fecha = Get-Date -Format 'yyyy-MM-dd_HHmm'
$archivo = Join-Path $Destino "inventapoint_$fecha.sql"

Write-Host "Respaldando a $archivo ..."
pg_dump $DbUrl --no-owner --no-privileges --schema=public -f $archivo
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump falló (código $LASTEXITCODE)."
  exit $LASTEXITCODE
}

$tam = [math]::Round((Get-Item $archivo).Length / 1KB, 1)
Write-Host "✓ Respaldo creado ($tam KB)."

# Rotación: conservar solo los N más recientes.
Get-ChildItem $Destino -Filter 'inventapoint_*.sql' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Conservar |
  Remove-Item -Force

Write-Host "✓ Rotación aplicada (se conservan $Conservar)."
