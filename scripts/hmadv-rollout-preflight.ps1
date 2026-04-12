$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
  Write-Host "[ok] $message" -ForegroundColor Green
}

function Write-WarnLine($message) {
  Write-Host "[warn] $message" -ForegroundColor Yellow
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$expectedFunctions = @(
  "datajud-search",
  "datajud-worker",
  "datajud-webhook",
  "advise-sync",
  "fs-webhook",
  "fs-account-repair",
  "processo-sync",
  "publicacoes-freshsales",
  "sync-advise-backfill",
  "sync-advise-publicacoes",
  "sync-advise-realtime",
  "sync-worker",
  "tpu-sync"
)

$expectedMigrations = 40..54 | ForEach-Object {
  "{0:D3}_" -f $_
}

Write-Step "Checando CLI"
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
if ($null -eq $supabaseCmd) {
  Write-WarnLine "Supabase CLI nao encontrada no PATH."
} else {
  Write-Ok "Supabase CLI encontrada: $($supabaseCmd.Source)"
}

Write-Step "Checando workflow HMADV"
$workflowPath = Join-Path $repoRoot ".github\\workflows\\hmadv-runner.yml"
if (Test-Path $workflowPath) {
  Write-Ok "Workflow presente: $workflowPath"
} else {
  Write-WarnLine "Workflow ausente: $workflowPath"
}

Write-Step "Checando edge functions HMADV"
$functionsRoot = Join-Path $repoRoot "supabase\\functions"
foreach ($name in $expectedFunctions) {
  $path = Join-Path $functionsRoot $name
  if (Test-Path $path) {
    Write-Ok "Function encontrada: $name"
  } else {
    Write-WarnLine "Function ausente: $name"
  }
}

Write-Step "Checando migrations HMADV"
$migrationRoot = Join-Path $repoRoot "supabase\\migrations"
$migrationFiles = Get-ChildItem -Path $migrationRoot -File | Select-Object -ExpandProperty Name
foreach ($prefix in $expectedMigrations) {
  $found = $migrationFiles | Where-Object { $_ -like "$prefix*" } | Select-Object -First 1
  if ($found) {
    Write-Ok "Migration presente: $found"
  } else {
    Write-WarnLine "Migration ausente para prefixo: $prefix"
  }
}

Write-Step "Checando arquivos de apoio"
$docPath = Join-Path $repoRoot "docs\\hmadv_rollout_validacao_final.md"
if (Test-Path $docPath) {
  Write-Ok "Runbook presente: $docPath"
} else {
  Write-WarnLine "Runbook ausente: $docPath"
}

Write-Host ""
Write-Host "Preflight HMADV concluido." -ForegroundColor Cyan
