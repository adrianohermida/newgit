param(
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$LimitMovimentos = 1000,
  [int]$LimitPublicacoes = 1000
)

if (-not $ServiceRole) { throw "Defina HMADV_SERVICE_ROLE ou passe -ServiceRole." }

$HearingRegex = '(?i)audi[eê]ncia|sess[aã]o de julgamento|designad[ao].{0,30}audi[eê]ncia|pra[cç]a|hasta p[úu]blica'
$DateRegex = '\b\d{2}/\d{2}/\d{4}\b'

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

function Extract-Date($text, $fallback) {
  if (-not $text) { return $fallback }
  $m = [regex]::Match([string]$text, $DateRegex)
  if ($m.Success) { return $m.Value }
  return $fallback
}

function Build-Candidate($origem, $item, $textoBase, $fallbackData) {
  if (-not $textoBase) { return $null }
  if ($textoBase -notmatch $HearingRegex) { return $null }
  return [pscustomobject]@{
    origem = $origem
    origem_id = $item.id
    processo_id = $item.processo_id
    data_referencia = $fallbackData
    data_detectada = Extract-Date $textoBase $fallbackData
    descricao = ([string]$textoBase).Substring(0, [Math]::Min(400, [string]$textoBase.Length))
  }
}

Write-Host ""
Write-Host "HMADV - Reconciliacao de Audiencias"
Write-Host "Data UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-dd HH:mm:ss"))"
Write-Host ""

$movimentos = @((Get-PagedJson "$ProjectUrl/rest/v1/movimentos?select=id,processo_id,data_movimento,descricao&processo_id=not.is.null" 1000 $LimitMovimentos))
$publicacoes = @((Get-PagedJson "$ProjectUrl/rest/v1/publicacoes?select=id,processo_id,data_publicacao,conteudo,despacho&processo_id=not.is.null" 1000 $LimitPublicacoes))

$candidatosMov = New-Object System.Collections.Generic.List[object]
foreach ($mov in $movimentos) {
  $cand = Build-Candidate 'movimento_datajud' $mov ([string]$mov.descricao) ([string]$mov.data_movimento)
  if ($cand) { $candidatosMov.Add($cand) }
}

$candidatosPub = New-Object System.Collections.Generic.List[object]
foreach ($pub in $publicacoes) {
  $texto = @([string]$pub.conteudo, [string]$pub.despacho) -join ' '
  $cand = Build-Candidate 'publicacao_advise' $pub $texto ([string]$pub.data_publicacao)
  if ($cand) { $candidatosPub.Add($cand) }
}

$todos = @($candidatosMov.ToArray() + $candidatosPub.ToArray())

Write-Host "[estado_atual]"
Write-Host "movimentos_analisados       : $($movimentos.Count)"
Write-Host "publicacoes_analisadas      : $($publicacoes.Count)"
Write-Host "candidatas_movimentos       : $($candidatosMov.Count)"
Write-Host "candidatas_publicacoes      : $($candidatosPub.Count)"
Write-Host "candidatas_total            : $($todos.Count)"
Write-Host ""

if ($todos.Count -gt 0) {
  Write-Host "[amostra_candidatas]"
  $todos | Select-Object -First 30 | ConvertTo-Json -Depth 8
  Write-Host ""
}
