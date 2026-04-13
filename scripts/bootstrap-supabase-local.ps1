param(
  [string]$SupabaseUrl = "http://127.0.0.1:54321",
  [string]$OutputEnvFile = "",
  [switch]$IncludeOfflineFlags = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Test-CommandExists([string]$Name) {
  try {
    $null = Get-Command $Name -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Test-LocalSupabaseCli {
  $packagePath = Join-Path $root "node_modules\supabase\package.json"
  return Test-Path -LiteralPath $packagePath
}

function Test-DockerEngineAvailable {
  if (-not (Test-CommandExists "docker")) {
    return $false
  }

  try {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Resolve-ObsidianVaultPath {
  param(
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    $trimmed = $candidate.Trim()
    if (Test-Path -LiteralPath $trimmed) {
      return $trimmed
    }
  }

  return ""
}

function Get-LocalSupabaseStatusEnv {
  if (-not (Test-LocalSupabaseCli)) {
    return $null
  }

  try {
    $raw = & npx supabase status -o env 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
      return $null
    }

    $result = @{}
    foreach ($line in $raw) {
      $trimmed = [string]$line
      if ([string]::IsNullOrWhiteSpace($trimmed)) {
        continue
      }
      if ($trimmed -match '^\s*([^=]+)=(.*)$') {
        $result[$matches[1].Trim()] = $matches[2]
      }
    }

    return $result
  } catch {
    return $null
  }
}

function Build-ArtifactCheck {
  param(
    [string]$Id,
    [string]$Label,
    [string]$Path
  )

  $fullPath = Join-Path $root $Path
  $exists = Test-Path -LiteralPath $fullPath
  return [ordered]@{
    id = $Id
    label = $Label
    path = $Path
    fullPath = $fullPath
    exists = $exists
  }
}

$artifactChecks = @(
  (Build-ArtifactCheck -Id "memory_table" -Label "Migration da memoria vetorial" -Path "supabase/migrations/024_create_dotobot_memory_embeddings.sql"),
  (Build-ArtifactCheck -Id "memory_search_rpc" -Label "Migration da RPC de busca vetorial" -Path "supabase/migrations/025_create_search_dotobot_memory_embeddings.sql"),
  (Build-ArtifactCheck -Id "task_runs" -Label "Migration de task runs" -Path "supabase/migrations/027_create_dotobot_task_runs.sql"),
  (Build-ArtifactCheck -Id "embed_function" -Label "Function dotobot-embed" -Path "supabase/functions/dotobot-embed/index.ts")
)

$dockerAvailable = Test-CommandExists "docker"
$dockerEngineAvailable = Test-DockerEngineAvailable
$supabaseCliAvailable = Test-CommandExists "supabase"
$localSupabaseCliAvailable = Test-LocalSupabaseCli
$localSupabaseStatusEnv = Get-LocalSupabaseStatusEnv

$resolvedSupabaseUrl = if ($localSupabaseStatusEnv -and $localSupabaseStatusEnv.ContainsKey("API_URL")) {
  [string]$localSupabaseStatusEnv["API_URL"]
} else {
  $SupabaseUrl
}
$resolvedObsidianVaultPath = Resolve-ObsidianVaultPath @(
  $env:DOTOBOT_OBSIDIAN_VAULT_PATH,
  $env:LAWDESK_OBSIDIAN_VAULT_PATH,
  $env:OBSIDIAN_VAULT_PATH,
  "D:\Obsidian\hermidamaia",
  "D:\Obsidian"
)
$resolvedAnonKey = if ($localSupabaseStatusEnv -and $localSupabaseStatusEnv.ContainsKey("ANON_KEY")) {
  [string]$localSupabaseStatusEnv["ANON_KEY"]
} else {
  "<anon-local>"
}
$resolvedServiceRoleKey = if ($localSupabaseStatusEnv -and $localSupabaseStatusEnv.ContainsKey("SERVICE_ROLE_KEY")) {
  [string]$localSupabaseStatusEnv["SERVICE_ROLE_KEY"]
} else {
  "<service-role-local>"
}

$envLines = @()
if ($IncludeOfflineFlags) {
  $envLines += 'LAWDESK_OFFLINE_MODE=true'
  $envLines += 'NEXT_PUBLIC_LAWDESK_OFFLINE_MODE=true'
  $envLines += 'AICORE_OFFLINE_MODE=true'
}
$envLines += "SUPABASE_URL=$resolvedSupabaseUrl"
$envLines += "NEXT_PUBLIC_SUPABASE_URL=$resolvedSupabaseUrl"
$envLines += "SUPABASE_SERVICE_ROLE_KEY=$resolvedServiceRoleKey"
$envLines += "NEXT_PUBLIC_SUPABASE_ANON_KEY=$resolvedAnonKey"
if (-not [string]::IsNullOrWhiteSpace($resolvedObsidianVaultPath)) {
  $envLines += "DOTOBOT_OBSIDIAN_VAULT_PATH=$resolvedObsidianVaultPath"
}
$envLines += 'DOTOBOT_SUPABASE_EMBED_FUNCTION=dotobot-embed'
$envLines += 'DOTOBOT_SUPABASE_MEMORY_TABLE=dotobot_memory_embeddings'
$envLines += 'DOTOBOT_SUPABASE_EMBEDDING_MODEL=supabase/gte-small'

$envBlock = $envLines -join [Environment]::NewLine
$resolvedOutputEnvFile = $null

if (-not [string]::IsNullOrWhiteSpace($OutputEnvFile)) {
  $targetFile = if ([System.IO.Path]::IsPathRooted($OutputEnvFile)) {
    $OutputEnvFile
  } else {
    Join-Path $root $OutputEnvFile
  }
  $envBlock | Set-Content -Path $targetFile -Encoding UTF8
  $resolvedOutputEnvFile = $targetFile
}

$missingArtifacts = @($artifactChecks | Where-Object { -not $_.exists })

$nextSteps = @(
  "1. Confirme Docker Desktop ativo.",
  "2. Rode: npm run supabase:start-local",
  "3. Carregue as envs no shell com: . .\scripts\load-local-env.ps1 -Path .local.supabase.env",
  "4. Rode: npm run diagnose:supabase-local",
  "5. Se o doctor acusar gaps, valide migrations 024/025/027; em offline com Obsidian local o dotobot-embed pode ficar opcional."
)

if (-not $dockerAvailable) {
  $nextSteps = @("Instale ou ligue o Docker Desktop antes de subir o Supabase local.") + $nextSteps
} elseif (-not $dockerEngineAvailable) {
  $nextSteps = @("Abra o Docker Desktop e aguarde o engine Linux ficar disponivel antes de rodar o Supabase local.") + $nextSteps
}

if (-not $supabaseCliAvailable -and -not $localSupabaseCliAvailable) {
  $nextSteps = @("Instale a Supabase CLI no projeto com npm run setup:supabase-cli-local.") + $nextSteps
}

if ($missingArtifacts.Count -gt 0) {
  $nextSteps = @("Alguns artefatos do contrato offline nao foram encontrados no repo; revise o pacote de migrations/functions antes de subir o stack.") + $nextSteps
}

[ordered]@{
  checkedAt = (Get-Date).ToString("o")
  ok = ($missingArtifacts.Count -eq 0)
  supabaseUrl = $resolvedSupabaseUrl
  dockerAvailable = $dockerAvailable
  dockerEngineAvailable = $dockerEngineAvailable
  supabaseCliAvailable = $supabaseCliAvailable
  localSupabaseCliAvailable = $localSupabaseCliAvailable
  localSupabaseRunning = [bool]$localSupabaseStatusEnv
  obsidianVaultPath = $resolvedObsidianVaultPath
  envBlock = $envBlock
  outputEnvFile = $resolvedOutputEnvFile
  artifacts = $artifactChecks
  missingArtifacts = $missingArtifacts
  nextSteps = $nextSteps
} | ConvertTo-Json -Depth 8
