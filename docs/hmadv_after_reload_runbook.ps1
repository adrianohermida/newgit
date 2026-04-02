param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$AplicarBackfillFase8,
  [switch]$ImportarPrazos,
  [switch]$SemearAliases,
  [int]$LimiteFase8 = 100
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$env:HMADV_SERVICE_ROLE = $ServiceRole

function Run-Step($label, [scriptblock]$action) {
  try {
    $result = & $action
    return [ordered]@{
      etapa = $label
      ok = $true
      resultado = $result
    }
  } catch {
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return [ordered]@{
      etapa = $label
      ok = $false
      erro = $msg
    }
  }
}

$smoke = Run-Step "smoketest_postgrest" {
  powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_post_reload_smoketest.ps1" | ConvertFrom-Json
}

$report = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  smoketest = $smoke
}

$canProceed = $false
if ($smoke.ok -and $smoke.resultado -and $smoke.resultado.tests) {
  $allOk = @($smoke.resultado.tests | Where-Object { -not $_.ok }).Count -eq 0
  $canProceed = $allOk
}

if (-not $canProceed) {
  $report["bloqueio"] = "PostgREST ainda nao recarregou o schema ou ha erro estrutural nas tabelas novas."
  $report | ConvertTo-Json -Depth 12
  exit 0
}

$report["fase8_validacao_inicial"] = Run-Step "fase8_validacao_inicial" {
  powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_fase8_contacts_status_validacao.ps1" | ConvertFrom-Json
}

if ($AplicarBackfillFase8) {
  $report["fase8_backfill"] = Run-Step "fase8_backfill" {
    powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_backfill_polos_status.ps1" -Aplicar -Limite $LimiteFase8 | ConvertFrom-Json
  }
}

if ($ImportarPrazos) {
  $report["prazos_importacao"] = Run-Step "prazos_importacao" {
    powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_prazos_base.ps1" -Importar | ConvertFrom-Json
  }
}

if ($SemearAliases) {
  $report["prazos_alias"] = Run-Step "prazos_alias" {
    powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_seed_prazo_alias.ps1" -Importar | ConvertFrom-Json
  }
}

$report["prazos_validacao"] = Run-Step "prazos_validacao" {
  powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_prazos_validacao.ps1" | ConvertFrom-Json
}

$report["fase8_validacao_final"] = Run-Step "fase8_validacao_final" {
  powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_fase8_contacts_status_validacao.ps1" | ConvertFrom-Json
}

$report | ConvertTo-Json -Depth 12
