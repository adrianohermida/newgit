param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$AnonKey = $env:HMADV_ANON_KEY,
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$Limit = 2000,
  [switch]$QueueBackfill,
  [switch]$UseDatajudStatus = $true,
  [int]$ResetProcessandoMinutos = 90
)

if (-not $AnonKey) { throw "Defina HMADV_ANON_KEY ou passe -AnonKey." }
if (-not $ServiceRole) { throw "Defina HMADV_SERVICE_ROLE ou passe -ServiceRole." }

$headers = @{
  apikey         = $ServiceRole
  Authorization  = "Bearer $ServiceRole"
  "Content-Type" = "application/json"
  "Accept-Profile" = "judiciario"
}

function Get-Json($url) {
  $raw = curl.exe -s `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Accept-Profile: judiciario" `
    $url
  if (-not $raw) { return @() }
  return @($raw | ConvertFrom-Json)
}

function Patch-Json($url, $body) {
  $json = $body | ConvertTo-Json -Depth 12 -Compress
  curl.exe -s -X PATCH `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Accept-Profile: judiciario" `
    -H "Content-Type: application/json" `
    -d $json `
    $url | Out-Null
}

function Get-IsoUtcNow() {
  return [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Post-Json($url, $body) {
  $json = $body | ConvertTo-Json -Depth 12 -Compress
  curl.exe -s -X POST `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Accept-Profile: judiciario" `
    -H "Content-Type: application/json" `
    -H "Prefer: return=representation" `
    -d $json `
    $url
}

function Get-Count($url) {
  $headersOut = curl.exe -s -D - -o NUL `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Accept-Profile: judiciario" `
    -H "Prefer: count=exact" `
    $url
  $contentRange = ($headersOut | Select-String 'Content-Range').Line
  if ($contentRange -match '/(\d+)$') {
    return [int]$Matches[1]
  }
  return 0
}

function Get-PagedJson($baseUrl, [int]$pageSize = 1000, [int]$maxItems = 5000) {
  $items = New-Object System.Collections.Generic.List[object]
  $offset = 0
  while ($offset -lt $maxItems) {
    $url = "$baseUrl&limit=$pageSize&offset=$offset"
    $page = @((Get-Json $url))
    if ($page.Count -eq 0) { break }
    foreach ($item in $page) { $items.Add($item) }
    if ($page.Count -lt $pageSize) { break }
    $offset += $pageSize
  }
  return @($items.ToArray())
}

function Normalize-Cnj([string]$value) {
  if (-not $value) { return $null }
  $digits = ($value -replace '[^0-9]', '')
  if ($digits.Length -eq 20) { return $digits }
  return $null
}

function Get-CandidateCnjs($pub) {
  $list = New-Object System.Collections.Generic.List[string]

  $cnjApi = Normalize-Cnj $pub.numero_processo_api
  if ($cnjApi) { $list.Add($cnjApi) }

  if ($pub.raw_payload) {
    if ($pub.raw_payload.processos) {
      foreach ($proc in $pub.raw_payload.processos) {
        foreach ($field in @('numeroProcesso','numero_processo','numero_cnj')) {
          $cnj = Normalize-Cnj ($proc.$field)
          if ($cnj) { $list.Add($cnj) }
        }
      }
    }
  }

  foreach ($field in @('despacho','conteudo')) {
    $text = [string]$pub.$field
    if (-not $text) { continue }
    $matches = [regex]::Matches($text, '\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}')
    foreach ($m in $matches) {
      $cnj = Normalize-Cnj $m.Value
      if ($cnj) { $list.Add($cnj) }
    }
  }

  return $list | Select-Object -Unique
}

Write-Host ""
Write-Host "HMADV - Backfill de Enriquecimento"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

# 1. Vincular publicacoes sem processo_id
$orphans = @((Get-Json "$ProjectUrl/rest/v1/publicacoes?select=id,numero_processo_api,processo_id,despacho,conteudo,raw_payload&processo_id=is.null&limit=200"))
$linked = 0
$unresolved = @()

foreach ($pub in $orphans) {
  $candidates = @(Get-CandidateCnjs $pub)
  $processId = $null

  foreach ($cnj in $candidates) {
    $found = @((Get-Json "$ProjectUrl/rest/v1/processos?select=id,numero_cnj,numero_processo&or=(numero_cnj.eq.$cnj,numero_processo.eq.$cnj)&limit=2"))
    if ($found.Count -eq 1) {
      $processId = $found[0].id
      break
    }
  }

  if ($processId) {
    Patch-Json "$ProjectUrl/rest/v1/publicacoes?id=eq.$($pub.id)" @{ processo_id = $processId }
    $linked++
  } else {
    $unresolved += [pscustomobject]@{
      publicacao_id = $pub.id
      candidatos = ($candidates -join ', ')
      despacho = [string]$pub.despacho
    }
  }
}

# 2. Processos com account que ainda precisam de enriquecimento
if ($UseDatajudStatus) {
  $needsFilter = "account_id_freshsales=not.is.null&or=(datajud_status.is.null,datajud_status.eq.pendente,datajud_status.eq.falha_temporaria)"
  $needsSelect = "id,numero_cnj,numero_processo,account_id_freshsales,datajud_status,datajud_last_attempt_at,datajud_last_error"
} else {
  $needsFilter = "account_id_freshsales=not.is.null&or=(dados_incompletos.eq.true,polo_ativo.is.null,polo_passivo.is.null,classe.is.null,tribunal.is.null,orgao_julgador.is.null,data_ajuizamento.is.null)"
  $needsSelect = "id,numero_cnj,numero_processo,account_id_freshsales,dados_incompletos,polo_ativo,polo_passivo,classe,tribunal,orgao_julgador,data_ajuizamento"
}

$needsBaseUrl = "$ProjectUrl/rest/v1/processos?select=$needsSelect&$needsFilter"
$needsExactCount = Get-Count "$ProjectUrl/rest/v1/processos?select=id&$needsFilter"
$needsEnrichment = @((Get-PagedJson $needsBaseUrl 1000 $Limit))

# 2.1 Recuperar processos presos em "processando" por muito tempo
$staleProcessando = @()
if ($UseDatajudStatus -and $ResetProcessandoMinutos -gt 0) {
  $processing = @((Get-PagedJson "$ProjectUrl/rest/v1/processos?select=id,numero_cnj,numero_processo,account_id_freshsales,datajud_status,datajud_last_attempt_at&account_id_freshsales=not.is.null&datajud_status=eq.processando" 1000 $Limit))
  $cutoff = [DateTime]::UtcNow.AddMinutes(-1 * $ResetProcessandoMinutos)
  foreach ($proc in $processing) {
    $lastAttempt = $null
    try {
      if ($proc.datajud_last_attempt_at) {
        $lastAttempt = [DateTime]::Parse($proc.datajud_last_attempt_at).ToUniversalTime()
      }
    } catch {}
    if (-not $lastAttempt -or $lastAttempt -lt $cutoff) {
      Patch-Json "$ProjectUrl/rest/v1/processos?id=eq.$($proc.id)" @{
        datajud_status = "falha_temporaria"
        datajud_last_error = "timeout_operacional_reconciliado"
        updated_at = Get-IsoUtcNow
      }
      $proc | Add-Member -NotePropertyName reconciliado_para -NotePropertyValue "falha_temporaria" -Force
      $staleProcessando += $proc
      $needsEnrichment += $proc
    }
  }
}

$existingQueue = @((Get-PagedJson "$ProjectUrl/rest/v1/monitoramento_queue?select=processo_id,tipo,status&tipo=in.(processo,fs_webhook_sync)&status=in.(pendente,processando)" 1000 10000))
$queuedIds = @{}
foreach ($item in $existingQueue) {
  if ($item.processo_id) { $queuedIds[$item.processo_id] = $true }
}

$queuedNow = 0
if ($QueueBackfill) {
  $batch = New-Object System.Collections.Generic.List[object]
  foreach ($proc in $needsEnrichment) {
    if ($queuedIds.ContainsKey($proc.id)) { continue }
    $cnj = Normalize-Cnj $proc.numero_cnj
    if (-not $cnj) { $cnj = Normalize-Cnj $proc.numero_processo }
    if (-not $cnj) { continue }

    $body = @{
      processo_id = $proc.id
      fonte = "DATAJUD"
      status = "pendente"
      prioridade = 4
      tipo = "processo"
      account_id_freshsales = $proc.account_id_freshsales
      payload = @{
        numero_cnj = $cnj
        numero_processo = $cnj
        account_id = $proc.account_id_freshsales
      }
    }
    $batch.Add($body)
    $queuedNow++
    $queuedIds[$proc.id] = $true

    if ($batch.Count -ge 100) {
      Post-Json "$ProjectUrl/rest/v1/monitoramento_queue" @($batch.ToArray()) | Out-Null
      $batch.Clear()
    }
  }
  if ($batch.Count -gt 0) {
    Post-Json "$ProjectUrl/rest/v1/monitoramento_queue" @($batch.ToArray()) | Out-Null
  }
}

Write-Host "[publicacoes]"
Write-Host "sem_processo_antes : $($orphans.Count)"
Write-Host "vinculadas_agora   : $linked"
Write-Host "pendentes_manuais  : $($unresolved.Count)"
Write-Host ""

Write-Host "[processos]"
Write-Host "com_account_e_gap  : $needsExactCount"
Write-Host "ja_na_fila         : $(@($needsEnrichment | Where-Object { $queuedIds.ContainsKey($_.id) }).Count - $queuedNow)"
Write-Host "enfileirados_agora : $queuedNow"
if ($UseDatajudStatus) {
  Write-Host "modo               : datajud_status"
}
Write-Host "processando_stale  : $($staleProcessando.Count)"
Write-Host ""

if ($unresolved.Count -gt 0) {
  Write-Host "[publicacoes_pendentes_manuais]"
  $unresolved | Select-Object -First 10 | ConvertTo-Json -Depth 6
  Write-Host ""
}

if ($staleProcessando.Count -gt 0) {
  Write-Host "[processos_reconciliados_de_processando]"
  $staleProcessando | Select-Object -First 20 | ConvertTo-Json -Depth 6
  Write-Host ""
}
