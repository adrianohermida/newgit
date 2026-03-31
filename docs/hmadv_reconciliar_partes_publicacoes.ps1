param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$Limite = 200,
  [switch]$ExecutarEnriquecimento
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

function Invoke-Enriquecer($limite) {
  $url = "$ProjectUrl/functions/v1/processo-sync?action=enriquecer&limite=$limite"
  $raw = curl.exe -s -X POST `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Content-Type: application/json" `
    $url
  if (-not $raw) { return $null }
  return $raw | ConvertFrom-Json
}

Write-Host ""
Write-Host "HMADV - Reconciliacao de Partes por Publicacoes"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

$pubsPendentes = Get-Count "$ProjectUrl/rest/v1/publicacoes?select=id&processo_id=not.is.null&adriano_polo=is.null"
$partesTotal = Get-Count "$ProjectUrl/rest/v1/partes?select=id"
$procSemPolos = Get-Count "$ProjectUrl/rest/v1/processos?select=id&or=(polo_ativo.is.null,polo_passivo.is.null)"
$amostra = @((Get-Json "$ProjectUrl/rest/v1/publicacoes?select=id,processo_id,numero_processo_api,data_publicacao,adriano_polo&processo_id=not.is.null&adriano_polo=is.null&limit=$Limite"))

Write-Host "[estado_atual]"
Write-Host "publicacoes_pendentes_partes : $pubsPendentes"
Write-Host "partes_total                 : $partesTotal"
Write-Host "processos_sem_polos          : $procSemPolos"
Write-Host ""

if ($amostra.Count -gt 0) {
  Write-Host "[amostra_publicacoes_pendentes]"
  $amostra | Select-Object -First 20 | ConvertTo-Json -Depth 6
  Write-Host ""
}

if ($ExecutarEnriquecimento) {
  $resultado = Invoke-Enriquecer $Limite
  Write-Host "[resultado_enriquecimento]"
  if ($resultado) {
    $resultado | ConvertTo-Json -Depth 10
  } else {
    Write-Host "sem_retorno"
  }
  Write-Host ""

  $pubsPendentesDepois = Get-Count "$ProjectUrl/rest/v1/publicacoes?select=id&processo_id=not.is.null&adriano_polo=is.null"
  $partesDepois = Get-Count "$ProjectUrl/rest/v1/partes?select=id"
  $procSemPolosDepois = Get-Count "$ProjectUrl/rest/v1/processos?select=id&or=(polo_ativo.is.null,polo_passivo.is.null)"

  Write-Host "[estado_depois]"
  Write-Host "publicacoes_pendentes_partes : $pubsPendentesDepois"
  Write-Host "partes_total                 : $partesDepois"
  Write-Host "processos_sem_polos          : $procSemPolosDepois"
  Write-Host ""
}
