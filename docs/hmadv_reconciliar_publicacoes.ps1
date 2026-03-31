param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$LimitProcessos = 25,
  [int]$LimitPublicacoes = 2000,
  [switch]$ExecutarRepairProcess
)

if (-not $ServiceRole) { throw "Defina HMADV_SERVICE_ROLE ou passe -ServiceRole." }

function Get-Json($url) {
  $raw = curl.exe -s `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Accept-Profile: judiciario" `
    $url
  if (-not $raw) { return @() }
  return @($raw | ConvertFrom-Json)
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

function Invoke-RepairProcess($processoId) {
  $url = "$ProjectUrl/functions/v1/sync-worker?action=repair_process&processo_id=$processoId"
  $raw = curl.exe -s -X POST `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Content-Type: application/json" `
    $url
  if (-not $raw) { return $null }
  return $raw | ConvertFrom-Json
}

function Is-Leilao($pub) {
  $texto = @(
    [string]$pub.conteudo
    [string]$pub.despacho
    [string]($pub.raw_payload | ConvertTo-Json -Depth 8 -Compress)
  ) -join ' '
  return $texto -match 'LEILAO|LEILÃO|LEILOES|LEILÕES'
}

Write-Host ""
Write-Host "HMADV - Reconciliacao de Publicacoes"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

$baseUrl = "$ProjectUrl/rest/v1/publicacoes?select=id,processo_id,data_publicacao,nome_diario,despacho,conteudo,freshsales_activity_id,raw_payload&processo_id=not.is.null&freshsales_activity_id=is.null"
$pubs = @((Get-PagedJson $baseUrl 1000 $LimitPublicacoes))

$validas = @()
$leiloes = @()
foreach ($pub in $pubs) {
  if (Is-Leilao $pub) {
    $leiloes += $pub
  } else {
    $validas += $pub
  }
}

$procIds = $validas | Group-Object processo_id | Sort-Object Count -Descending | Select-Object -First $LimitProcessos
$procMap = @{}

foreach ($group in $procIds) {
  $pid = [string]$group.Name
  $proc = @((Get-Json "$ProjectUrl/rest/v1/processos?select=id,numero_cnj,numero_processo,account_id_freshsales,tribunal,orgao_julgador&id=eq.$pid&limit=1")) | Select-Object -First 1
  $procMap[$pid] = [pscustomobject]@{
    processo_id = $pid
    numero = if ($proc.numero_cnj) { $proc.numero_cnj } else { $proc.numero_processo }
    account_id_freshsales = $proc.account_id_freshsales
    tribunal = $proc.tribunal
    orgao_julgador = $proc.orgao_julgador
    publicacoes_pendentes = $group.Count
    executado = $false
    enviados = $null
    leiloes = $null
    total = $null
  }
}

if ($ExecutarRepairProcess) {
  foreach ($pid in $procMap.Keys) {
    $result = Invoke-RepairProcess $pid
    if ($result) {
      $procMap[$pid].executado = $true
      $procMap[$pid].enviados = $result.publicacoes.enviados
      $procMap[$pid].leiloes = $result.publicacoes.leiloes
      $procMap[$pid].total = $result.publicacoes.total
    }
    Start-Sleep -Milliseconds 200
  }
}

Write-Host "[publicacoes]"
Write-Host "pendentes_total        : $($pubs.Count)"
Write-Host "pendentes_nao_leilao   : $($validas.Count)"
Write-Host "leilao_detectado       : $($leiloes.Count)"
Write-Host "processos_com_pendencia: $($procMap.Count)"
Write-Host ""

Write-Host "[top_processos]"
$procMap.Values | Sort-Object publicacoes_pendentes -Descending | Select-Object -First $LimitProcessos | ConvertTo-Json -Depth 6
Write-Host ""

if ($ExecutarRepairProcess) {
  Write-Host "[repair_process]"
  $procMap.Values | Where-Object { $_.executado } | Select-Object processo_id, numero, publicacoes_pendentes, enviados, leiloes, total | ConvertTo-Json -Depth 6
  Write-Host ""
}
