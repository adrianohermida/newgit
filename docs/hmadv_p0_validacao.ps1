param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$AnonKey = $env:HMADV_ANON_KEY,
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE
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

Write-Host ""
Write-Host "HMADV - Validacao P0"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

$totalComAccount = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null"
$enriquecidos = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null&datajud_status=eq.enriquecido"
$pendentes = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null&datajud_status=eq.pendente"
$processando = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null&datajud_status=eq.processando"
$falhaTemporaria = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null&datajud_status=eq.falha_temporaria"
$naoEnriquecivel = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null&datajud_status=eq.nao_enriquecivel"
$semStatus = Get-Count "$ProjectUrl/rest/v1/processos?select=id&account_id_freshsales=not.is.null&datajud_status=is.null"

$pubSemProcesso = Get-Count "$ProjectUrl/rest/v1/publicacoes?select=id&processo_id=is.null"
$pubAdministrativas = Get-Count "$ProjectUrl/rest/v1/publicacoes?select=id&processual=is.false"
$pubTriagemManual = Get-Count "$ProjectUrl/rest/v1/publicacoes?select=id&triagem_manual=is.true"

$filaProcesso = Get-Count "$ProjectUrl/rest/v1/monitoramento_queue?select=id&tipo=eq.processo&status=eq.pendente"
$filaWebhook = Get-Count "$ProjectUrl/rest/v1/monitoramento_queue?select=id&tipo=eq.fs_webhook_sync&status=eq.pendente"

$amostraFalhas = Get-Json "$ProjectUrl/rest/v1/processos?select=id,numero_cnj,account_id_freshsales,datajud_status,datajud_last_error,datajud_last_attempt_at&account_id_freshsales=not.is.null&datajud_status=in.(falha_temporaria,nao_enriquecivel)&limit=20"
$amostraOrfas = Get-Json "$ProjectUrl/rest/v1/publicacoes?select=id,despacho,motivo_sem_processo,triagem_manual,processual&processo_id=is.null&limit=20"

Write-Host "[processos com Sales Account]"
Write-Host "total              : $totalComAccount"
Write-Host "enriquecidos       : $enriquecidos"
Write-Host "pendentes          : $pendentes"
Write-Host "processando        : $processando"
Write-Host "falha_temporaria   : $falhaTemporaria"
Write-Host "nao_enriquecivel   : $naoEnriquecivel"
Write-Host "sem_status         : $semStatus"
Write-Host ""

Write-Host "[publicacoes]"
Write-Host "sem_processo       : $pubSemProcesso"
Write-Host "administrativas    : $pubAdministrativas"
Write-Host "triagem_manual     : $pubTriagemManual"
Write-Host ""

Write-Host "[fila]"
Write-Host "processo_pendente  : $filaProcesso"
Write-Host "webhook_pendente   : $filaWebhook"
Write-Host ""

if ($amostraFalhas.Count -gt 0) {
  Write-Host "[amostra_falhas_datajud]"
  $amostraFalhas | ConvertTo-Json -Depth 8
  Write-Host ""
}

if ($amostraOrfas.Count -gt 0) {
  Write-Host "[amostra_publicacoes_sem_processo]"
  $amostraOrfas | ConvertTo-Json -Depth 8
  Write-Host ""
}
