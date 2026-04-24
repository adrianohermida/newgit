param(
  [string]$ProjectRef = "sspvizogbcyigquqycsz",
  [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"

$functions = @(
  "dotobot-slack",
  "dotobot-embed",
  "fc-ingest-conversations",
  "fc-last-conversation",
  "fc-update-conversation",
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

foreach ($fn in $functions) {
  Write-Host ""
  Write-Host "==> Deploy $fn em $ProjectRef" -ForegroundColor Cyan
  & npx supabase functions deploy $fn --use-api --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Falha no deploy da function $fn para o projeto $ProjectRef."
  }
}

if ($SmokeTest) {
  Write-Host ""
  Write-Host "==> Smoke test remoto" -ForegroundColor Green
  & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\hmadv-audit-supabase-target.ps1" -HmadvProjectRef $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Falha no smoke test remoto apos deploy."
  }
}
