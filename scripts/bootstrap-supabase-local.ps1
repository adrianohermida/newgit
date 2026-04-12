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
$supabaseCliAvailable = Test-CommandExists "supabase"

$envLines = @()
if ($IncludeOfflineFlags) {
  $envLines += 'LAWDESK_OFFLINE_MODE=true'
  $envLines += 'NEXT_PUBLIC_LAWDESK_OFFLINE_MODE=true'
  $envLines += 'AICORE_OFFLINE_MODE=true'
}
$envLines += 'SUPABASE_URL=http://127.0.0.1:54321'
$envLines += 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321'
$envLines += 'SUPABASE_SERVICE_ROLE_KEY=<service-role-local>'
$envLines += 'NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-local>'
$envLines += 'DOTOBOT_SUPABASE_EMBED_FUNCTION=dotobot-embed'
$envLines += 'DOTOBOT_SUPABASE_MEMORY_TABLE=dotobot_memory_embeddings'
$envLines += 'DOTOBOT_SUPABASE_EMBEDDING_MODEL=supabase/gte-small'

$envBlock = $envLines -join [Environment]::NewLine

if (-not [string]::IsNullOrWhiteSpace($OutputEnvFile)) {
  $targetFile = if ([System.IO.Path]::IsPathRooted($OutputEnvFile)) {
    $OutputEnvFile
  } else {
    Join-Path $root $OutputEnvFile
  }
  $envBlock | Set-Content -Path $targetFile -Encoding UTF8
}

$missingArtifacts = @($artifactChecks | Where-Object { -not $_.exists })

$nextSteps = @(
  "1. Confirme Docker Desktop ativo.",
  "2. Rode: supabase start",
  "3. Exporte as envs locais no shell do app.",
  "4. Rode: npm run diagnose:supabase-local",
  "5. Se o doctor acusar gaps, valide migrations 024/025/027 e a function dotobot-embed."
)

if (-not $dockerAvailable) {
  $nextSteps = @("Instale ou ligue o Docker Desktop antes de subir o Supabase local.") + $nextSteps
}

if (-not $supabaseCliAvailable) {
  $nextSteps = @("Instale a Supabase CLI com npm install -g supabase.") + $nextSteps
}

if ($missingArtifacts.Count -gt 0) {
  $nextSteps = @("Alguns artefatos do contrato offline nao foram encontrados no repo; revise o pacote de migrations/functions antes de subir o stack.") + $nextSteps
}

[ordered]@{
  checkedAt = (Get-Date).ToString("o")
  ok = ($missingArtifacts.Count -eq 0)
  supabaseUrl = $SupabaseUrl
  dockerAvailable = $dockerAvailable
  supabaseCliAvailable = $supabaseCliAvailable
  envBlock = $envBlock
  outputEnvFile = if ([string]::IsNullOrWhiteSpace($OutputEnvFile)) { $null } else { $OutputEnvFile }
  artifacts = $artifactChecks
  missingArtifacts = $missingArtifacts
  nextSteps = $nextSteps
} | ConvertTo-Json -Depth 8
