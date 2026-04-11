param(
  [string]$AccountId,
  [string]$ApiToken
)

$ErrorActionPreference = 'Stop'
$UsedExplicitCloudflareArgs = $PSBoundParameters.ContainsKey('AccountId') -or $PSBoundParameters.ContainsKey('ApiToken')

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

function Test-CloudflareTokenLooksDuplicated([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  if (($Value.Length % 2) -ne 0) { return $false }
  $half = [int]($Value.Length / 2)
  if ($half -lt 8) { return $false }
  return $Value.Substring(0, $half) -eq $Value.Substring($half)
}

function Test-CloudflareApiToken([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $headers = @{
    Authorization = "Bearer $Value"
    "Content-Type" = "application/json"
  }
  try {
    $response = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers $headers -Method Get
    return [bool]$response.success
  } catch {
    return $false
  }
}

function Invoke-WranglerDeployWithFallback([string]$ResolvedAccountId, [string]$ResolvedApiToken) {
  if (-not [string]::IsNullOrWhiteSpace($ResolvedAccountId)) {
    $env:CLOUDFLARE_ACCOUNT_ID = $ResolvedAccountId
  }
  if (-not [string]::IsNullOrWhiteSpace($ResolvedApiToken)) {
    if (Test-CloudflareTokenLooksDuplicated $ResolvedApiToken) {
      Write-Warning 'CLOUDFLARE_WORKER_API_TOKEN parece duplicado no .dev.vars. Revise a linha e mantenha apenas um token.'
    } elseif (-not (Test-CloudflareApiToken $ResolvedApiToken)) {
      Write-Warning 'CLOUDFLARE_WORKER_API_TOKEN nao passou na verificacao da API da Cloudflare. O deploy vai usar fallback OAuth local.'
    }
    $env:CLOUDFLARE_API_TOKEN = $ResolvedApiToken
  }

  npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml
  if ($LASTEXITCODE -ne 0) {
    if ($script:UsedExplicitCloudflareArgs) {
      throw "Wrangler deploy falhou com as credenciais Cloudflare informadas (exit code $LASTEXITCODE)."
    }
    Write-Warning 'Falha com CLOUDFLARE_WORKER_* configurado. Tentando novamente com a sessao OAuth local do Wrangler.'
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
    npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml
    if ($LASTEXITCODE -ne 0) {
      throw "Wrangler deploy falhou tambem com a sessao OAuth local (exit code $LASTEXITCODE)."
    }
  }
}

Import-LocalEnvFile (Join-Path $PSScriptRoot '..\.dev.vars')

if ([string]::IsNullOrWhiteSpace($AccountId)) {
  $AccountId = $env:CLOUDFLARE_WORKER_ACCOUNT_ID
}
if ([string]::IsNullOrWhiteSpace($AccountId)) {
  $AccountId = $env:CLOUDFLARE_ACCOUNT_ID
}
if ([string]::IsNullOrWhiteSpace($ApiToken)) {
  $ApiToken = $env:CLOUDFLARE_WORKER_API_TOKEN
}
if ([string]::IsNullOrWhiteSpace($ApiToken)) {
  $ApiToken = $env:CLOUDFLARE_API_TOKEN
}
$ApiToken = Normalize-CloudflareToken $ApiToken

Push-Location 'D:\Github\newgit'
try {
  Invoke-WranglerDeployWithFallback $AccountId $ApiToken
} finally {
  Pop-Location
}

