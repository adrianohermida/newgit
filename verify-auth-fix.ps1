#!/usr/bin/env pwsh
# verify-auth-fix.ps1
# Script para verificar se as rotas de autenticação estão funcionando após deploy
# Use este script para validar a correção dos erros 404

param(
    [string]$BaseUrl = "https://hermidamaia.adv.br",
    [int]$TimeoutSec = 10,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "=" * 80 -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "=" * 80 -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Test-ApiEndpoint {
    param(
        [string]$Endpoint,
        [string]$Name,
        [int]$ExpectedStatus = 200
    )

    $url = "$BaseUrl$Endpoint"
    Write-Info "Testando: $Name ($url)"

    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
        $statusCode = $response.StatusCode
        $content = $response.Content

        if ($statusCode -eq $ExpectedStatus) {
            Write-Success "$Name retornou status $statusCode"
            
            # Tentar parsear JSON
            try {
                $json = $content | ConvertFrom-Json
                if ($Verbose) {
                    Write-Host "  Resposta JSON:" -ForegroundColor Gray
                    $json | ConvertTo-Json | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
                }
                
                # Validações específicas
                if ($json.ok -eq $true) {
                    Write-Success "  Resposta JSON válida (ok: true)"
                    return $true
                } else {
                    Write-Warning "  Resposta JSON indica erro (ok: false)"
                    if ($json.error) {
                        Write-Warning "  Erro: $($json.error)"
                    }
                    return $false
                }
            } catch {
                Write-Warning "  Não foi possível parsear JSON"
                if ($Verbose) {
                    Write-Host "  Conteúdo: $content" -ForegroundColor Gray
                }
                return $true  # Retorna true se recebeu 200, mesmo sem JSON válido
            }
        } else {
            Write-Error "$Name retornou status $statusCode (esperado: $ExpectedStatus)"
            if ($Verbose) {
                Write-Host "  Conteúdo: $content" -ForegroundColor Gray
            }
            return $false
        }
    } catch {
        $errorMessage = $_.Exception.Message
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            Write-Error "$Name retornou status $statusCode: $errorMessage"
        } else {
            Write-Error "$Name falhou: $errorMessage"
        }
        return $false
    }
}

function Test-PageLoad {
    param(
        [string]$PageUrl,
        [string]$PageName
    )

    Write-Info "Testando carregamento de página: $PageName ($PageUrl)"

    try {
        $response = Invoke-WebRequest -Uri $PageUrl -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
        $statusCode = $response.StatusCode
        $content = $response.Content

        if ($statusCode -eq 200) {
            Write-Success "$PageName carregou com sucesso (status 200)"
            
            # Verificar se é HTML
            if ($content -match '<!doctype html|<html') {
                Write-Success "  Conteúdo é HTML válido"
                return $true
            } else {
                Write-Warning "  Conteúdo não parece ser HTML"
                return $false
            }
        } else {
            Write-Error "$PageName retornou status $statusCode"
            return $false
        }
    } catch {
        $errorMessage = $_.Exception.Message
        Write-Error "$PageName falhou: $errorMessage"
        return $false
    }
}

# ============================================================================
# INÍCIO DOS TESTES
# ============================================================================

Write-Header "Verificação de Correção: Erros 404 em /api/admin-auth-config e /api/public-chat-config"

Write-Info "Base URL: $BaseUrl"
Write-Info "Timeout: ${TimeoutSec}s"
Write-Info ""

$results = @()

# ============================================================================
# TESTE 1: Verificar rotas de API públicas
# ============================================================================

Write-Header "TESTE 1: Rotas de API Públicas"

$result1 = Test-ApiEndpoint -Endpoint "/api/admin-auth-config" -Name "admin-auth-config"
$results += $result1

Write-Host ""

$result2 = Test-ApiEndpoint -Endpoint "/api/public-chat-config" -Name "public-chat-config"
$results += $result2

# ============================================================================
# TESTE 2: Verificar carregamento de páginas
# ============================================================================

Write-Header "TESTE 2: Carregamento de Páginas"

$result3 = Test-PageLoad -PageUrl "$BaseUrl/interno/login" -PageName "Página de Login"
$results += $result3

Write-Host ""

$result4 = Test-PageLoad -PageUrl "$BaseUrl/portal/login" -PageName "Portal de Login"
$results += $result4

# ============================================================================
# TESTE 3: Verificar assets estáticos
# ============================================================================

Write-Header "TESTE 3: Assets Estáticos"

Write-Info "Verificando se _next/static está acessível..."

try {
    # Fazer uma requisição para verificar se o diretório existe
    $response = Invoke-WebRequest -Uri "$BaseUrl/_next/static/" -Method HEAD -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Success "_next/static está acessível"
    $results += $true
} catch {
    # Isso é esperado (HEAD pode retornar 405), então verificamos com GET
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/_next/static/" -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction SilentlyContinue
        Write-Success "_next/static está acessível"
        $results += $true
    } catch {
        Write-Warning "_next/static pode não estar acessível (isso é normal para diretórios)"
        $results += $false
    }
}

# ============================================================================
# RESUMO FINAL
# ============================================================================

Write-Header "RESUMO FINAL"

$totalTests = $results.Count
$passedTests = ($results | Where-Object { $_ -eq $true }).Count
$failedTests = $totalTests - $passedTests

Write-Host ""
Write-Host "Total de testes: $totalTests" -ForegroundColor Cyan
Write-Host "Testes bem-sucedidos: $passedTests" -ForegroundColor Green
Write-Host "Testes falhados: $failedTests" -ForegroundColor $(if ($failedTests -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($failedTests -eq 0) {
    Write-Success "TODOS OS TESTES PASSARAM! ✅"
    Write-Host ""
    Write-Host "As rotas de autenticação estão funcionando corretamente." -ForegroundColor Green
    Write-Host "O dashboard administrativo deve estar pronto para uso." -ForegroundColor Green
    exit 0
} else {
    Write-Error "ALGUNS TESTES FALHARAM! ❌"
    Write-Host ""
    Write-Host "Próximas ações:" -ForegroundColor Yellow
    Write-Host "  1. Aguarde 1-2 minutos para propagação de DNS" -ForegroundColor Yellow
    Write-Host "  2. Verifique se o deploy foi bem-sucedido no Cloudflare Dashboard" -ForegroundColor Yellow
    Write-Host "  3. Verifique o console do navegador para mais detalhes (F12)" -ForegroundColor Yellow
    Write-Host "  4. Consulte RELATORIO_FIX_AUTH_404.md para troubleshooting" -ForegroundColor Yellow
    exit 1
}
