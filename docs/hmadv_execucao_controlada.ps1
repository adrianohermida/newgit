param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$AnonKey = $env:HMADV_ANON_KEY,
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$RunSyncWorker,
  [switch]$RunAdviseSync,
  [string]$DataInicio,
  [string]$DataFim,
  [int]$Pagina = 0,
  [int]$PorPagina = 10,
  [int]$MaxPaginas = 1
)

if (-not $AnonKey) {
  throw "Defina HMADV_ANON_KEY ou passe -AnonKey."
}

if (-not $ServiceRole) {
  throw "Defina HMADV_SERVICE_ROLE ou passe -ServiceRole."
}

if (-not $RunSyncWorker -and -not $RunAdviseSync) {
  throw "Use -RunSyncWorker e/ou -RunAdviseSync."
}

$headers = @{
  apikey         = $AnonKey
  Authorization  = "Bearer $ServiceRole"
  "Content-Type" = "application/json"
}

function Invoke-JsonPost($url) {
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body "{}"
}

function Invoke-JsonGet($url) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

Write-Host ""
Write-Host "HMADV - Execucao Controlada"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

if ($RunSyncWorker) {
  Write-Host "[sync-worker] disparando..."
  $syncResult = Invoke-JsonPost "$ProjectUrl/functions/v1/sync-worker?action=run"
  $syncResult | ConvertTo-Json -Depth 8
  Write-Host ""
}

if ($RunAdviseSync) {
  $params = @()
  if ($DataInicio) { $params += "data_inicio=$DataInicio" }
  if ($DataFim) { $params += "data_fim=$DataFim" }
  if ($Pagina -gt 0) { $params += "pagina=$Pagina" }
  if ($PorPagina -gt 0) { $params += "por_pagina=$PorPagina" }
  if ($MaxPaginas -gt 0) { $params += "max_paginas=$MaxPaginas" }

  $query = "action=sync"
  if ($params.Count -gt 0) {
    $query = "action=sync_range&" + ($params -join "&")
  }

  Write-Host "[advise-sync] disparando..."
  $adviseResult = Invoke-JsonGet "$ProjectUrl/functions/v1/advise-sync?$query"
  $adviseResult | ConvertTo-Json -Depth 8
  Write-Host ""
}

Write-Host "[status final]"
$syncStatus = Invoke-JsonGet "$ProjectUrl/functions/v1/sync-worker?action=status"
$adviseStatus = Invoke-JsonGet "$ProjectUrl/functions/v1/advise-sync?action=status"
$fsStatus = Invoke-JsonGet "$ProjectUrl/functions/v1/fs-runner?action=status"

[pscustomobject]@{
  sync_total        = $syncStatus.p.total
  sync_proc_sem_acc = $syncStatus.p.proc_sem_acc
  sync_pubs         = $syncStatus.p.pubs
  sync_movs_advise  = $syncStatus.p.movs_advise
  sync_fila_dj      = $syncStatus.p.fila_dj
  advise_status     = $adviseStatus.status_cursor.status
  advise_pagina     = $adviseStatus.status_cursor.ultima_pagina
  advise_total_pag  = $adviseStatus.status_cursor.total_paginas
  fs_sem_account    = $fsStatus.processos.sem_account
  fs_pubs_pend      = $fsStatus.publicacoes.pendentes_fs
  fs_movs_pend      = $fsStatus.movimentacoes.pendentes_fs
} | ConvertTo-Json -Depth 6
