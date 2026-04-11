param(
  [string]$CloudflareAccountId,
  [string]$CloudflareApiToken,
  [string]$SupabaseProjectRef = 'sspvizogbcyigquqycsz',
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$SupabaseServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$FreshsalesApiBase = $env:FRESHSALES_API_BASE,
  [string]$FreshsalesApiKey = $env:FRESHSALES_API_KEY,
  [string]$FreshsalesOwnerId = $env:FRESHSALES_OWNER_ID,
  [string]$FreshsalesActivityTypeNotaProcessual = $env:FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL,
  [string]$FreshsalesActivityTypeAudiencia = $env:FRESHSALES_ACTIVITY_TYPE_AUDIENCIA,
  [string]$CloudflareWorkersAiModel = $env:CLOUDFLARE_WORKERS_AI_MODEL,
  [string]$AetherlabLegalModel = $env:AETHERLAB_LEGAL_MODEL,
  [string]$SharedSecret = $env:HMDAV_AI_SHARED_SECRET,
  [string]$ProcessAiBase = $env:PROCESS_AI_BASE,
  [switch]$SkipDeploy,
  [switch]$SkipSupabaseSecrets
)

$ErrorActionPreference = 'Stop'
$UsedExplicitCloudflareArgs = $PSBoundParameters.ContainsKey('CloudflareAccountId') -or $PSBoundParameters.ContainsKey('CloudflareApiToken')

function Import-LocalEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1]
    if (-not $name) { return }
    if ([string]::IsNullOrWhiteSpace((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Normalize-CloudflareToken([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $normalized = $Value.Trim()
  $normalized = $normalized.Trim('"').Trim("'")
  if ($normalized.StartsWith('Bearer ')) {
    $normalized = $normalized.Substring(7).Trim()
  }
  $normalized = -join ($normalized.ToCharArray() | Where-Object { -not [char]::IsWhiteSpace($_) })
  return $normalized
}

function Require-Value([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Defina $Name."
  }
}

function Mask-Value([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  if ($Value.Length -le 8) { return ('*' * $Value.Length) }
  return $Value.Substring(0, 4) + ('*' * ($Value.Length - 8)) + $Value.Substring($Value.Length - 4)
}

Import-LocalEnvFile (Join-Path $PSScriptRoot '..\.dev.vars')

if ([string]::IsNullOrWhiteSpace($CloudflareAccountId)) {
  $CloudflareAccountId = $env:CLOUDFLARE_WORKER_ACCOUNT_ID
}
if ([string]::IsNullOrWhiteSpace($CloudflareAccountId)) {
  $CloudflareAccountId = $env:CLOUDFLARE_ACCOUNT_ID
}
if ([string]::IsNullOrWhiteSpace($CloudflareApiToken)) {
  $CloudflareApiToken = $env:CLOUDFLARE_WORKER_API_TOKEN
}
if ([string]::IsNullOrWhiteSpace($CloudflareApiToken)) {
  $CloudflareApiToken = $env:CLOUDFLARE_API_TOKEN
}
$CloudflareApiToken = Normalize-CloudflareToken $CloudflareApiToken

function Put-WranglerSecret([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  Write-Host "Gravando secret no Worker: $Name"
  $Value | npx wrangler secret put $Name --config workers/hmadv-process-ai/wrangler.toml
  if ($LASTEXITCODE -ne 0) {
    if ($script:UsedExplicitCloudflareArgs) {
      throw "Wrangler secret put falhou para $Name com as credenciais Cloudflare informadas (exit code $LASTEXITCODE)."
    }
    Write-Warning "Falha ao gravar $Name com CLOUDFLARE_WORKER_*. Tentando novamente com a sessao OAuth local do Wrangler."
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
    $Value | npx wrangler secret put $Name --config workers/hmadv-process-ai/wrangler.toml
    if ($LASTEXITCODE -ne 0) {
      throw "Wrangler secret put falhou para $Name tambem com a sessao OAuth local (exit code $LASTEXITCODE)."
    }
  }
}

function Invoke-WranglerCommand([scriptblock]$Action) {
  & $Action
  if ($LASTEXITCODE -ne 0) {
    if ($script:UsedExplicitCloudflareArgs) {
      throw "Wrangler command falhou com as credenciais Cloudflare informadas (exit code $LASTEXITCODE)."
    }
    Write-Warning 'Falha com CLOUDFLARE_WORKER_* configurado. Tentando novamente com a sessao OAuth local do Wrangler.'
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
    & $Action
    if ($LASTEXITCODE -ne 0) {
      throw "Wrangler command falhou tambem com a sessao OAuth local (exit code $LASTEXITCODE)."
    }
  }
}

if ([string]::IsNullOrWhiteSpace($SharedSecret)) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $SharedSecret = [Convert]::ToBase64String($bytes)
  Write-Host "HMDAV_AI_SHARED_SECRET gerado automaticamente."
}

Require-Value 'SUPABASE_URL' $SupabaseUrl
Require-Value 'SUPABASE_SERVICE_ROLE_KEY' $SupabaseServiceRoleKey
Require-Value 'FRESHSALES_API_BASE' $FreshsalesApiBase
Require-Value 'FRESHSALES_API_KEY' $FreshsalesApiKey
Require-Value 'FRESHSALES_OWNER_ID' $FreshsalesOwnerId
Require-Value 'FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL' $FreshsalesActivityTypeNotaProcessual
Require-Value 'FRESHSALES_ACTIVITY_TYPE_AUDIENCIA' $FreshsalesActivityTypeAudiencia

if ([string]::IsNullOrWhiteSpace($CloudflareWorkersAiModel)) {
  $CloudflareWorkersAiModel = '@cf/meta/llama-3.1-8b-instruct'
}
if ([string]::IsNullOrWhiteSpace($AetherlabLegalModel)) {
  $AetherlabLegalModel = $CloudflareWorkersAiModel
}

$env:CLOUDFLARE_ACCOUNT_ID = $CloudflareAccountId
$env:CLOUDFLARE_API_TOKEN = $CloudflareApiToken

Push-Location 'D:\Github\newgit'
try {
  if (-not $SkipDeploy) {
    Write-Host 'Publicando worker Cloudflare AI...'
    Invoke-WranglerCommand { npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml }
    Write-Host ''
    Write-Host 'Se o wrangler exibiu a URL final do worker, use-a em PROCESS_AI_BASE.'
  }

  Put-WranglerSecret 'SUPABASE_URL' $SupabaseUrl
  Put-WranglerSecret 'SUPABASE_SERVICE_ROLE_KEY' $SupabaseServiceRoleKey
  Put-WranglerSecret 'FRESHSALES_API_BASE' $FreshsalesApiBase
  Put-WranglerSecret 'FRESHSALES_API_KEY' $FreshsalesApiKey
  Put-WranglerSecret 'FRESHSALES_OWNER_ID' $FreshsalesOwnerId
  Put-WranglerSecret 'FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL' $FreshsalesActivityTypeNotaProcessual
  Put-WranglerSecret 'FRESHSALES_ACTIVITY_TYPE_AUDIENCIA' $FreshsalesActivityTypeAudiencia
  Put-WranglerSecret 'HMDAV_AI_SHARED_SECRET' $SharedSecret
  Put-WranglerSecret 'CLOUDFLARE_WORKERS_AI_MODEL' $CloudflareWorkersAiModel
  Put-WranglerSecret 'AETHERLAB_LEGAL_MODEL' $AetherlabLegalModel

  if (-not $SkipSupabaseSecrets) {
    if ([string]::IsNullOrWhiteSpace($ProcessAiBase)) {
      Write-Warning 'PROCESS_AI_BASE nao foi informado. Configure a URL final do worker no HMADV depois do deploy.'
    } else {
      Write-Host 'Gravando secrets no projeto HMADV...'
      npx supabase secrets set `
        PROCESS_AI_BASE="$ProcessAiBase" `
        HMDAV_AI_SHARED_SECRET="$SharedSecret" `
        --project-ref $SupabaseProjectRef
    }
  }

  Write-Host ''
  Write-Host 'Resumo:'
  Write-Host "  CLOUDFLARE_WORKER_ACCOUNT_ID = $(Mask-Value $CloudflareAccountId)"
  Write-Host "  PROCESS_AI_BASE = $ProcessAiBase"
  Write-Host "  HMDAV_AI_SHARED_SECRET = $(Mask-Value $SharedSecret)"
  Write-Host "  AETHERLAB_LEGAL_MODEL = $AetherlabLegalModel"
  Write-Host ''
  Write-Host 'Validacoes recomendadas apos o deploy:'
  Write-Host "  1. GET  $ProcessAiBase/health"
  Write-Host "  2. POST $ProcessAiBase/execute"
  Write-Host "  3. POST $ProcessAiBase/v1/execute"
  Write-Host "  4. POST $ProcessAiBase/v1/messages"
  Write-Host '  5. Rodar /llm-test com provider custom'
}
finally {
  Pop-Location
}
