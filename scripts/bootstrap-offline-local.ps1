param(
  [string]$AiCoreBaseUrl = "http://127.0.0.1:8000",
  [string]$AiCorePort = "8000",
  [string]$LocalLlmBaseUrl = "",
  [string]$LocalLlmModel = "aetherlab-legal-local-v1",
  [string]$ObsidianVaultPath = "",
  [string]$ExtensionBaseUrl = "http://127.0.0.1:32123",
  [string]$ExtensionPort = "32123",
  [switch]$RunDoctorAfterStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$aiCoreDir = Join-Path $root "ai-core"
$extensionDir = Join-Path $root "universal-llm-extension"

if (-not (Test-Path $aiCoreDir)) {
  throw "Diretorio ai-core nao encontrado em $aiCoreDir"
}
if (-not (Test-Path $extensionDir)) {
  throw "Diretorio universal-llm-extension nao encontrado em $extensionDir"
}

function First-Value([string[]]$Candidates) {
  foreach ($item in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($item)) {
      return $item.Trim()
    }
  }
  return ""
}

function Resolve-LocalRuntimeBaseUrl {
  return First-Value @(
    $LocalLlmBaseUrl,
    $env:LOCAL_LLM_BASE_URL,
    $env:LLM_BASE_URL,
    $env:AICORE_LOCAL_LLM_BASE_URL,
    "http://127.0.0.1:11434"
  )
}

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

$resolvedVault = First-Value @($ObsidianVaultPath, $env:DOTOBOT_OBSIDIAN_VAULT_PATH)
$resolvedExtensionPort = try { [int]$ExtensionPort } catch { 32123 }
$preferredAiCorePort = try { [int]$AiCorePort } catch { 8000 }
$resolvedAiCorePort = Resolve-AiCorePort -PreferredPort $preferredAiCorePort
$resolvedAiCoreBaseUrl = "http://127.0.0.1:$resolvedAiCorePort"
$resolvedLocalLlmBaseUrl = Resolve-LocalRuntimeBaseUrl

$sharedEnv = @(
  '$env:LAWDESK_OFFLINE_MODE="true"',
  '$env:NEXT_PUBLIC_LAWDESK_OFFLINE_MODE="true"',
  '$env:AICORE_OFFLINE_MODE="true"',
  '$env:AI_CORE_DEFAULT_PROVIDER="local"',
  "`$env:AICORE_API_BASE_URL=`"$resolvedAiCoreBaseUrl`"",
  "`$env:LOCAL_LLM_BASE_URL=`"$resolvedLocalLlmBaseUrl`"",
  "`$env:LOCAL_LLM_MODEL=`"$LocalLlmModel`"",
  "`$env:LLM_BASE_URL=`"$resolvedLocalLlmBaseUrl`"",
  "`$env:LLM_MODEL=`"$LocalLlmModel`"",
  "`$env:UNIVERSAL_LLM_EXTENSION_BASE_URL=`"$ExtensionBaseUrl`"",
  "`$env:UNIVERSAL_LLM_EXTENSION_PORT=`"$resolvedExtensionPort`""
)

if (-not [string]::IsNullOrWhiteSpace($resolvedVault)) {
  $sharedEnv += "`$env:DOTOBOT_OBSIDIAN_VAULT_PATH=`"$resolvedVault`""
  $sharedEnv += "`$env:UNIVERSAL_LLM_DEFAULT_BASE_PATH=`"$resolvedVault`""
}

$aiCoreCommand = @(
  $sharedEnv
  "`$env:PYTHONUTF8=`"1`""
  "& `"$root\scripts\start-ai-core-local.ps1`" -Port $resolvedAiCorePort -LocalLlmBaseUrl `"$resolvedLocalLlmBaseUrl`" -LocalLlmModel `"$LocalLlmModel`""
) -join "; "

$extensionCommand = @(
  $sharedEnv
  "Set-Location `"$extensionDir`""
  "node server.js"
) -join "; "

Start-Process -FilePath "powershell" -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $aiCoreCommand
) | Out-Null

Start-Process -FilePath "powershell" -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $extensionCommand
) | Out-Null

Start-Sleep -Seconds 3

if ($RunDoctorAfterStart) {
  $doctorArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $root "scripts\doctor-local-offline-stack.ps1"),
    "-AiCoreBaseUrl", $resolvedAiCoreBaseUrl,
    "-LocalLlmBaseUrl", $resolvedLocalLlmBaseUrl,
    "-ExtensionBaseUrl", $ExtensionBaseUrl
  )
  if (-not [string]::IsNullOrWhiteSpace($resolvedVault)) {
    $doctorArgs += @("-ObsidianVaultPath", $resolvedVault)
  }
  & powershell @doctorArgs
  exit $LASTEXITCODE
}

[ordered]@{
  ok = $true
  message = "Bootstrap offline local iniciado em novas janelas do PowerShell."
  nextSteps = @(
    "Confirme que o endpoint local do modelo esta ativo em $resolvedLocalLlmBaseUrl.",
    "Rode npm run doctor:offline-local para validar o stack.",
    "Se quiser persistencia estruturada offline, suba tambem o Supabase local."
  )
  config = [ordered]@{
    aiCoreBaseUrl = $resolvedAiCoreBaseUrl
    aiCorePort = $resolvedAiCorePort
    preferredAiCorePort = $preferredAiCorePort
    localLlmBaseUrl = $resolvedLocalLlmBaseUrl
    localLlmModel = $LocalLlmModel
    extensionBaseUrl = $ExtensionBaseUrl
    obsidianVaultPath = $resolvedVault
    offlineMode = $true
  }
} | ConvertTo-Json -Depth 8
