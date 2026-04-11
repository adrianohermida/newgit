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
Write-Host "HMADV - Validacao P1 TPU"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

$movSemTpu = Get-Count "$ProjectUrl/rest/v1/movimentos?select=id&movimento_tpu_id=is.null"
$movTpuFalha = Get-Count "$ProjectUrl/rest/v1/movimentos?select=id&tpu_status=eq.falha"
$movTpuPendente = Get-Count "$ProjectUrl/rest/v1/movimentos?select=id&tpu_status=eq.pendente"
$movTpuResolvido = Get-Count "$ProjectUrl/rest/v1/movimentos?select=id&movimento_tpu_id=not.is.null"

$processosSemJuizo = Get-Count "$ProjectUrl/rest/v1/processos?select=id&juizo_cnj_id=is.null"
$processosSemServentia = Get-Count "$ProjectUrl/rest/v1/processos?select=id&serventia_cnj_id=is.null"
$processosSemParser = Get-Count "$ProjectUrl/rest/v1/processos?select=id&parser_tribunal_schema=is.null"

$amostraMov = Get-Json "$ProjectUrl/rest/v1/movimentos?select=id,processo_id,codigo,descricao,movimento_tpu_id,tpu_status&movimento_tpu_id=is.null&limit=20"
$amostraProc = Get-Json "$ProjectUrl/rest/v1/processos?select=id,numero_cnj,tribunal,orgao_julgador,juizo_cnj_id,serventia_cnj_id,parser_tribunal_schema&juizo_cnj_id=is.null&limit=20"

Write-Host "[movimentos]"
Write-Host "sem_tpu           : $movSemTpu"
Write-Host "tpu_pendente      : $movTpuPendente"
Write-Host "tpu_falha         : $movTpuFalha"
Write-Host "tpu_resolvido     : $movTpuResolvido"
Write-Host ""

Write-Host "[processos]"
Write-Host "sem_juizo_cnj     : $processosSemJuizo"
Write-Host "sem_serventia_cnj : $processosSemServentia"
Write-Host "sem_parser_schema : $processosSemParser"
Write-Host ""

if ($amostraMov.Count -gt 0) {
  Write-Host "[amostra_movimentos_sem_tpu]"
  $amostraMov | ConvertTo-Json -Depth 8
  Write-Host ""
}

if ($amostraProc.Count -gt 0) {
  Write-Host "[amostra_processos_sem_camadas_cnj]"
  $amostraProc | ConvertTo-Json -Depth 8
  Write-Host ""
}
