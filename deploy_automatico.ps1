# deploy_automatico.ps1
# Script PowerShell para build do Pages e deploy do Worker AI localmente
# Execute no PowerShell na raiz do projeto

Write-Host "Iniciando build do Pages..." -ForegroundColor Cyan
npm run build:pages

Write-Host "Build do Pages concluído." -ForegroundColor Green

# Deploy do Worker AI (hmadv-process-ai)
$workerPath = "workers/hmadv-process-ai"
if (Test-Path $workerPath) {
    Write-Host "Deployando Worker AI..." -ForegroundColor Cyan
    Push-Location $workerPath
    wrangler deploy
    Pop-Location
} else {
    Write-Host "Pasta workers/hmadv-process-ai não encontrada. Pulei deploy do Worker AI." -ForegroundColor Yellow
}

Write-Host "Script de deploy automático local concluído." -ForegroundColor Green
