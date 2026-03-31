param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$AnonKey = $env:HMADV_ANON_KEY,
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$Limit = 200,
  [switch]$EnqueueOnlyMissingParser,
  [switch]$RunDatajudWorker
)

if (-not $AnonKey) { throw "Defina HMADV_ANON_KEY ou passe -AnonKey." }
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

function Post-Json($url, $bodyObj, $profile = "judiciario") {
  $json = $bodyObj | ConvertTo-Json -Depth 12 -Compress
  return curl.exe -s `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Content-Type: application/json" `
    -H "Prefer: return=representation" `
    -H "Content-Profile: $profile" `
    -X POST `
    -d $json `
    $url
}

Write-Host ""
Write-Host "HMADV - Backfill P1 Parser"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

$filtroParser = if ($EnqueueOnlyMissingParser) { "&parser_tribunal_schema=is.null" } else { "" }
$url = "$ProjectUrl/rest/v1/processos?select=id,numero_cnj,account_id_freshsales,datajud_status,parser_tribunal_schema&numero_cnj=not.is.null&account_id_freshsales=not.is.null$($filtroParser)&limit=$Limit"
$processos = Get-Json $url

if ($processos.Count -eq 0) {
  Write-Host "Nenhum processo encontrado para backfill."
  exit 0
}

$enqueued = 0
$ignored = 0
$errors = 0

foreach ($proc in $processos) {
  $numero = "$($proc.numero_cnj)"
  $account = "$($proc.account_id_freshsales)"
  if (-not $numero -or -not $account) {
    $ignored++
    continue
  }

  $payload = @{
    processo_id = $proc.id
    fonte = "DATAJUD"
    status = "pending"
    prioridade = 4
    tentativas = 0
    tipo = "processo"
    account_id_freshsales = $account
    payload = @{
      numeroProcesso = $numero
      origem = "p1_parser_backfill"
      parser_backfill = $true
    }
  }

  $resp = Post-Json "$ProjectUrl/rest/v1/monitoramento_queue" $payload
  if ($LASTEXITCODE -eq 0 -and $resp) {
    $enqueued++
  } else {
    $errors++
  }
}

Write-Host "[resultado]"
Write-Host "processos_lidos     : $($processos.Count)"
Write-Host "enfileirados        : $enqueued"
Write-Host "ignorados           : $ignored"
Write-Host "erros               : $errors"
Write-Host ""

if ($RunDatajudWorker) {
  Write-Host "[disparo_datajud_worker]"
  $body = @{ } | ConvertTo-Json -Compress
  $raw = curl.exe -s `
    -H "apikey: $AnonKey" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Content-Type: application/json" `
    -X POST `
    -d $body `
    "$ProjectUrl/functions/v1/datajud-worker"
  $raw
  Write-Host ""
}
