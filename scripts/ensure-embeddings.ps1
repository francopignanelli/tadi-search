$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$HealthUrl = "http://127.0.0.1:8000/health"
$StartApi = Join-Path $Root "paquete-embeddings-buscador\start-api.ps1"

try {
    Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 2 | Out-Null
    Write-Host "[embeddings] Servicio ya disponible en http://127.0.0.1:8000"

    while ($true) {
        Start-Sleep -Seconds 3600
    }
}
catch {
    Write-Host "[embeddings] Iniciando servicio local..."
    & $StartApi
}
