param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$AnonKey = $env:HMADV_ANON_KEY,
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE
)

if (-not $AnonKey) {
  throw "Defina HMADV_ANON_KEY ou passe -AnonKey."
}

if (-not $ServiceRole) {
  throw "Defina HMADV_SERVICE_ROLE ou passe -ServiceRole."
}

$headers = @{
  apikey        = $AnonKey
  Authorization = "Bearer $ServiceRole"
  "Content-Type" = "application/json"
}

function Get-Json($url) {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

$sync = Get-Json "$ProjectUrl/functions/v1/sync-worker?action=status"
$advise = Get-Json "$ProjectUrl/functions/v1/advise-sync?action=status"
$fs = Get-Json "$ProjectUrl/functions/v1/fs-runner?action=status"

Write-Host ""
Write-Host "HMADV - Monitoramento Diario"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

Write-Host "[sync-worker]"
Write-Host "em_execucao      : $($sync.worker.em_execucao)"
Write-Host "ultima_execucao  : $($sync.worker.ultima_execucao)"
Write-Host "rodadas_atual    : $($sync.worker.rodadas_atual)"
Write-Host "motivo_ultimo    : $($sync.worker.ultimo_lote.motivo)"
Write-Host "proc_sem_acc     : $($sync.p.proc_sem_acc)"
Write-Host "pubs_pendentes   : $($sync.p.pubs)"
Write-Host "movs_advise      : $($sync.p.movs_advise)"
Write-Host "fila_dj          : $($sync.p.fila_dj)"
Write-Host "total            : $($sync.p.total)"
Write-Host ""

Write-Host "[advise-sync]"
Write-Host "status           : $($advise.status_cursor.status)"
Write-Host "ultima_execucao  : $($advise.status_cursor.ultima_execucao)"
Write-Host "ultima_pagina    : $($advise.status_cursor.ultima_pagina)"
Write-Host "total_paginas    : $($advise.status_cursor.total_paginas)"
Write-Host "token_ok         : $($advise.config.token_ok)"
Write-Host "modo             : $($advise.config.modo)"
Write-Host ""

Write-Host "[freshsales]"
Write-Host "sem_account      : $($fs.processos.sem_account)"
Write-Host "com_account      : $($fs.processos.com_account)"
Write-Host "pubs_pendentes   : $($fs.publicacoes.pendentes_fs)"
Write-Host "pubs_enviadas    : $($fs.publicacoes.enviadas)"
Write-Host "movs_pendentes   : $($fs.movimentacoes.pendentes_fs)"
Write-Host "movs_enviados    : $($fs.movimentacoes.enviadas)"
Write-Host ""
