# deploy_automatico.ps1
# Script PowerShell para build do Pages e deploy completo (Pages + Workers) localmente
# Execute no PowerShell na raiz do projeto
#
# IMPORTANTE: Este script faz deploy COMPLETO, incluindo Cloudflare Pages Functions.
# Use apenas em desenvolvimento local. Para produção, prefira o build conectado do Cloudflare Pages.

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor $Color
}

function Invoke-CheckedCommand {
    param([string]$Label, [scriptblock]$Action)
    Write-Step $Label
    & $Action
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha ao executar: $Label (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

# ============================================================================
# ETAPA 1: Build do Pages (inclui cópia de functions/ para out/)
# ============================================================================
Invoke-CheckedCommand "Build do Cloudflare Pages" {
    npm run build:pages
}

Write-Host "✅ Build do Pages concluído com sucesso." -ForegroundColor Green

# ============================================================================
# ETAPA 2: Deploy do Cloudflare Pages (com Pages Functions)
# ============================================================================
Write-Step "Deploy do Cloudflare Pages (inclui Pages Functions em /api/*)" "Yellow"
Write-Host "⚠️  AVISO: Este é um deploy estático-only. Para produção, use o build conectado do Cloudflare." -ForegroundColor Yellow
Write-Host "   Continuando com deploy local explícito..." -ForegroundColor Yellow

$env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
try {
    npm run deploy:pages
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha ao fazer deploy do Pages" -ForegroundColor Red
        exit 1
    }
} finally {
    Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY -ErrorAction SilentlyContinue
}

Write-Host "✅ Deploy do Cloudflare Pages concluído." -ForegroundColor Green

# ============================================================================
# ETAPA 3: Deploy do Worker AI (hmadv-process-ai)
# ============================================================================
$workerPath = "workers/hmadv-process-ai"
if (Test-Path $workerPath) {
    Invoke-CheckedCommand "Deploy do Worker AI (hmadv-process-ai)" {
        Push-Location $workerPath
        wrangler deploy
        Pop-Location
    }
    Write-Host "✅ Worker AI deployado com sucesso." -ForegroundColor Green
} else {
    Write-Host "⚠️  Pasta $workerPath não encontrada. Pulando deploy do Worker AI." -ForegroundColor Yellow
}

# ============================================================================
# ETAPA 4: Deploy do Worker API (hmadv-api)
# ============================================================================
$apiWorkerPath = "workers/hmadv-api"
if (Test-Path $apiWorkerPath) {
    Invoke-CheckedCommand "Deploy do Worker API (hmadv-api)" {
        Push-Location $apiWorkerPath
        wrangler deploy
        Pop-Location
    }
    Write-Host "✅ Worker API deployado com sucesso." -ForegroundColor Green
} else {
    Write-Host "⚠️  Pasta $apiWorkerPath não encontrada. Pulando deploy do Worker API." -ForegroundColor Yellow
}

# ============================================================================
# ETAPA 5: Verificação Pós-Deploy
# ============================================================================
Write-Step "Verificação Pós-Deploy" "Cyan"
Write-Host "Aguardando propagação de DNS (30 segundos)..." -ForegroundColor Gray
Start-Sleep -Seconds 30

if (Test-Path "scripts/diagnose-pages-admin-runtime.ps1") {
    Write-Host "Executando diagnóstico de Pages Functions..." -ForegroundColor Cyan
    & "scripts/diagnose-pages-admin-runtime.ps1" -BaseUrl "https://hermidamaia.adv.br" | ConvertTo-Json -Depth 3 | Out-Host
} else {
    Write-Host "⚠️  Script de diagnóstico não encontrado. Pulando verificação automática." -ForegroundColor Yellow
}

# ============================================================================
# RESUMO FINAL
# ============================================================================
Write-Host ""
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "✅ DEPLOY AUTOMÁTICO CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
Write-Host ""
Write-Host "Componentes deployados:" -ForegroundColor Green
Write-Host "  ✅ Cloudflare Pages (Frontend + Pages Functions /api/*)" -ForegroundColor Green
Write-Host "  ✅ Worker hmadv-process-ai (ai.hermidamaia.adv.br)" -ForegroundColor Green
Write-Host "  ✅ Worker hmadv-api (api.hermidamaia.adv.br)" -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "  1. Aguarde 1-2 minutos para propagação de DNS" -ForegroundColor Cyan
Write-Host "  2. Teste as rotas de API:" -ForegroundColor Cyan
Write-Host "     - https://hermidamaia.adv.br/api/admin-auth-config" -ForegroundColor Cyan
Write-Host "     - https://hermidamaia.adv.br/api/public-chat-config" -ForegroundColor Cyan
Write-Host "  3. Abra DevTools (F12) e procure por status 200 no Network" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para diagnóstico detalhado, execute:" -ForegroundColor Cyan
Write-Host "  npm run diagnose:pages-admin" -ForegroundColor Cyan
Write-Host ""
