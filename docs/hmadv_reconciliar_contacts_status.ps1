param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$ExecutarBackfillAccount,
  [int]$Limite = 50
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$restBase = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$fnBase = "https://sspvizogbcyigquqycsz.supabase.co/functions/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  Prefer = "count=exact"
}

function Invoke-SafeGet($url) {
  try {
    return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 60
  } catch {
    return @{ erro = $_.Exception.Message }
  }
}

function Invoke-SafeCount($url) {
  try {
    $res = Invoke-WebRequest -Method Get -Uri $url -Headers $headers -TimeoutSec 60
    $cr = ($res.Headers["Content-Range"] -join "")
    $m = [regex]::Match($cr, "/(\d+)$")
    if ($m.Success) { return [int]$m.Groups[1].Value }

    if ($res.Content) {
      $parsed = $res.Content | ConvertFrom-Json
      if ($parsed -is [System.Array]) { return $parsed.Count }
      if ($null -ne $parsed) { return 1 }
    }

    return 0
  } catch {
    return @{ erro = $_.Exception.Message }
  }
}

function Test-Column($table, $column) {
  try {
    Invoke-RestMethod -Method Get -Uri "$restBase/$table?select=$column&limit=1" -Headers $headers -TimeoutSec 30 | Out-Null
    return $true
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match "Could not find the '.*' column" -or $msg -match "column .* does not exist" -or $msg -match "\(400\)") {
      return $false
    }
    return @{ erro = $msg }
  }
}

function Invoke-RepairProcess($processoId) {
  try {
    return Invoke-RestMethod -Method Post `
      -Uri "$fnBase/fs-account-repair?action=repair_process" `
      -Headers @{
        apikey = $ServiceRole
        Authorization = "Bearer $ServiceRole"
        "Content-Type" = "application/json"
      } `
      -Body (@{ processo_id = $processoId } | ConvertTo-Json -Depth 5) `
      -TimeoutSec 120
  } catch {
    return @{ erro = $_.Exception.Message; processo_id = $processoId }
  }
}

$hasClienteHmadv = Test-Column "partes" "cliente_hmadv"
$hasRepresentada = Test-Column "partes" "representada_pelo_escritorio"
$hasContatoFreshsales = Test-Column "partes" "contato_freshsales_id"
$hasPrincipalNoAccount = Test-Column "partes" "principal_no_account"
$hasProcessoContatoSync = Test-Column "processo_contato_sync" "id"
$hasStatusFonte = Test-Column "processos" "status_fonte"

$candidateUrl = "$restBase/processos?account_id_freshsales=not.is.null&or=(polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&select=id,numero_cnj,titulo,account_id_freshsales,polo_ativo,polo_passivo,status_atual_processo&limit=$Limite"
$candidateProcesses = Invoke-SafeGet $candidateUrl

$report = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  migration_006_applied = ($hasClienteHmadv -eq $true -or $hasRepresentada -eq $true -or $hasContatoFreshsales -eq $true -or $hasPrincipalNoAccount -eq $true -or $hasProcessoContatoSync -eq $true -or $hasStatusFonte -eq $true)
  processos_com_account = Invoke-SafeCount "$restBase/processos?account_id_freshsales=not.is.null&select=id"
  processos_candidatos_fase8 = Invoke-SafeCount "$restBase/processos?account_id_freshsales=not.is.null&or=(polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&select=id"
  processos_sem_polo_ativo = Invoke-SafeCount "$restBase/processos?account_id_freshsales=not.is.null&polo_ativo=is.null&select=id"
  processos_sem_polo_passivo = Invoke-SafeCount "$restBase/processos?account_id_freshsales=not.is.null&polo_passivo=is.null&select=id"
  processos_sem_status = Invoke-SafeCount "$restBase/processos?account_id_freshsales=not.is.null&status_atual_processo=is.null&select=id"
  processos_status_fora_padrao = Invoke-SafeCount "$restBase/processos?account_id_freshsales=not.is.null&status_atual_processo=not.in.(Ativo,Baixado,Suspenso)&select=id"
  partes_cliente_hmadv = if ($hasClienteHmadv -eq $true) { Invoke-SafeCount "$restBase/partes?cliente_hmadv=is.true&select=id" } else { @{ aviso = "coluna cliente_hmadv ainda nao aplicada" } }
  partes_representadas = if ($hasRepresentada -eq $true) { Invoke-SafeCount "$restBase/partes?representada_pelo_escritorio=is.true&select=id" } else { @{ aviso = "coluna representada_pelo_escritorio ainda nao aplicada" } }
  partes_com_contato = if ($hasContatoFreshsales -eq $true) { Invoke-SafeCount "$restBase/partes?contato_freshsales_id=not.is.null&select=id" } else { @{ aviso = "coluna contato_freshsales_id ainda nao aplicada" } }
  contatos_sync = if ($hasProcessoContatoSync -eq $true) { Invoke-SafeCount "$restBase/processo_contato_sync?select=id" } else { @{ aviso = "tabela processo_contato_sync ainda nao aplicada" } }
  sample_processos = $candidateProcesses
}

if ($ExecutarBackfillAccount -and $candidateProcesses -is [System.Array]) {
  $results = @()
  foreach ($proc in $candidateProcesses) {
    $results += Invoke-RepairProcess $proc.id
  }
  $report["backfill_account"] = $results
}

$report | ConvertTo-Json -Depth 8
