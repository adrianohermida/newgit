param(
  [int]$Port = 8000,
  [string]$LocalLlmBaseUrl = "",
  [string]$LocalLlmModel = "",
  [switch]$OfflineMode = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$aiCore = Join-Path $root "ai-core"
$envSnapshotPath = Join-Path $root ".ai-core-local-runtime.json"

if (-not (Test-Path $aiCore)) {
  throw "Diretorio ai-core nao encontrado em $aiCore"
}

function First-Value([string[]]$Candidates) {
  foreach ($item in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($item)) {
      return $item.Trim()
    }
  }
  return ""
}

function Import-LocalEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if (-not $name) { return }
    $existingValue = [Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace([string]$existingValue)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Resolve-ExistingPath([string[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $trimmed = $candidate.Trim()
    if (Test-Path -LiteralPath $trimmed) {
      return $trimmed
    }
  }
  return ""
}

Import-LocalEnvFile (Join-Path $root ".local.supabase.env")
Import-LocalEnvFile (Join-Path $root ".env.offline-local")
Import-LocalEnvFile (Join-Path $root ".dev.vars")

function Test-PortAvailable([int]$CandidatePort) {
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CandidatePort)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Resolve-AiCorePort([int]$PreferredPort) {
  $candidates = @($PreferredPort, 8010, 8020) | Select-Object -Unique
  foreach ($candidate in $candidates) {
    if (Test-PortAvailable -CandidatePort $candidate) {
      return $candidate
    }
  }
  throw "Nenhuma porta disponivel para o ai-core entre: $($candidates -join ', ')"
}

$resolvedPort = Resolve-AiCorePort -PreferredPort $Port

$resolvedAiCoreBaseUrl = "http://127.0.0.1:$resolvedPort"
$resolvedLocalLlmBaseUrl = First-Value @(
  $LocalLlmBaseUrl,
  $env:AICORE_LOCAL_LLM_BASE_URL,
  $env:LOCAL_LLM_BASE_URL,
  $env:LLM_BASE_URL,
  "http://127.0.0.1:11434"
)
$resolvedLocalLlmModel = First-Value @(
  $LocalLlmModel,
  $env:AICORE_LOCAL_LLM_MODEL,
  $env:LOCAL_LLM_MODEL,
  $env:LLM_MODEL,
  "aetherlab-legal-local-v1"
)

$env:AICORE_API_BASE_URL = $resolvedAiCoreBaseUrl
$env:AICORE_LOCAL_LLM_BASE_URL = $resolvedLocalLlmBaseUrl
$env:AICORE_LOCAL_LLM_MODEL = $resolvedLocalLlmModel
$env:LOCAL_LLM_BASE_URL = $resolvedLocalLlmBaseUrl
$env:LLM_BASE_URL = $resolvedLocalLlmBaseUrl
$env:LOCAL_LLM_MODEL = $resolvedLocalLlmModel
$env:LLM_MODEL = $resolvedLocalLlmModel
$resolvedOffline = if ($OfflineMode) { "true" } else { First-Value @($env:AICORE_OFFLINE_MODE, "false") }
$env:LAWDESK_OFFLINE_MODE = First-Value @($env:LAWDESK_OFFLINE_MODE, $resolvedOffline)
$env:NEXT_PUBLIC_LAWDESK_OFFLINE_MODE = First-Value @($env:NEXT_PUBLIC_LAWDESK_OFFLINE_MODE, $resolvedOffline)
$env:AICORE_OFFLINE_MODE = First-Value @($env:AICORE_OFFLINE_MODE, $resolvedOffline)
$env:AI_CORE_DEFAULT_PROVIDER = First-Value @($env:AI_CORE_DEFAULT_PROVIDER, "local")
$resolvedVaultPath = Resolve-ExistingPath @(
  $env:DOTOBOT_OBSIDIAN_VAULT_PATH,
  $env:LAWDESK_OBSIDIAN_VAULT_PATH,
  $env:OBSIDIAN_VAULT_PATH,
  "D:\Obsidian\hermidamaia",
  "D:\Obsidian"
)
if (-not [string]::IsNullOrWhiteSpace($resolvedVaultPath)) {
  $env:DOTOBOT_OBSIDIAN_VAULT_PATH = $resolvedVaultPath
  $env:UNIVERSAL_LLM_DEFAULT_BASE_PATH = First-Value @($env:UNIVERSAL_LLM_DEFAULT_BASE_PATH, $resolvedVaultPath)
}

Write-Host "AI Core local"
Write-Host "  AICORE_API_BASE_URL=$resolvedAiCoreBaseUrl"
Write-Host "  LOCAL_LLM_BASE_URL=$resolvedLocalLlmBaseUrl"
Write-Host "  LOCAL_LLM_MODEL=$resolvedLocalLlmModel"
Write-Host "  OFFLINE_MODE=$($env:AICORE_OFFLINE_MODE)"
Write-Host "  OBSIDIAN_VAULT=$resolvedVaultPath"
Write-Host "  PORT=$resolvedPort"
if ($resolvedPort -ne $Port) {
  Write-Host "  FALLBACK_PORT=$resolvedPort (porta preferida $Port ocupada)"
}

([ordered]@{
  checkedAt = (Get-Date).ToString("o")
  AICORE_API_BASE_URL = $env:AICORE_API_BASE_URL
  LOCAL_LLM_BASE_URL = $env:LOCAL_LLM_BASE_URL
  LLM_BASE_URL = $env:LLM_BASE_URL
  LOCAL_LLM_MODEL = $env:LOCAL_LLM_MODEL
  LLM_MODEL = $env:LLM_MODEL
  LAWDESK_OFFLINE_MODE = $env:LAWDESK_OFFLINE_MODE
  NEXT_PUBLIC_LAWDESK_OFFLINE_MODE = $env:NEXT_PUBLIC_LAWDESK_OFFLINE_MODE
  AICORE_OFFLINE_MODE = $env:AICORE_OFFLINE_MODE
  AI_CORE_DEFAULT_PROVIDER = $env:AI_CORE_DEFAULT_PROVIDER
  DOTOBOT_OBSIDIAN_VAULT_PATH = $env:DOTOBOT_OBSIDIAN_VAULT_PATH
  UNIVERSAL_LLM_DEFAULT_BASE_PATH = $env:UNIVERSAL_LLM_DEFAULT_BASE_PATH
  SUPABASE_URL = $env:SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY = $(if ($env:SUPABASE_SERVICE_ROLE_KEY) { "[set]" } else { "" })
  NEXT_PUBLIC_SUPABASE_ANON_KEY = $(if ($env:NEXT_PUBLIC_SUPABASE_ANON_KEY) { "[set]" } else { "" })
} | ConvertTo-Json -Depth 4) | Set-Content -Path $envSnapshotPath -Encoding UTF8

Push-Location $aiCore
try {
  & python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "O modulo 'uvicorn' nao esta instalado neste Python. Rode: python -m pip install -e .  (dentro de ai-core) ou npm run setup:ai-core-local"
  }
  python -m uvicorn api.app:app --host 0.0.0.0 --port $resolvedPort
}
finally {
  Pop-Location
}
