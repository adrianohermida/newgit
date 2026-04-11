param(
<<<<<<< HEAD
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [string[]]$ProcessNumbers,
  [string]$ProcessListPath,
  [int]$Limite = 100,
  [switch]$Aplicar
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

if ($ProcessListPath -and (Test-Path $ProcessListPath)) {
  $ProcessNumbers = @(Get-Content $ProcessListPath | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
}

$restBase = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$readHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
}
$writeHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Profile" = "judiciario"
  "Content-Type" = "application/json; charset=utf-8"
}

function Invoke-JsonGet([string]$url) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -Headers $readHeaders -TimeoutSec 120
    $parsed = if ($resp.Content) { $resp.Content | ConvertFrom-Json } else { $null }
    if ($null -eq $parsed) { return @() }
    if ($parsed -is [System.Array]) { return $parsed }
    return @($parsed)
  } catch {
    return @()
  }
}

function Invoke-JsonPost([string]$table, $payload) {
  $json = $payload | ConvertTo-Json -Depth 10 -Compress
  Add-Type -AssemblyName System.Net.Http
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(120)
  foreach ($kv in $writeHeaders.GetEnumerator()) {
    if ([string]$kv.Key -eq 'Content-Type') { continue }
    [void]$client.DefaultRequestHeaders.TryAddWithoutValidation([string]$kv.Key, [string]$kv.Value)
  }
  [void]$client.DefaultRequestHeaders.TryAddWithoutValidation('Prefer', 'return=representation')
  $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
  $resp = $client.PostAsync("$restBase/$table", $content).GetAwaiter().GetResult()
  $raw = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if ([int]$resp.StatusCode -eq 409) {
    if ($raw) { return $raw | ConvertFrom-Json }
    return $null
  }
  if (-not $resp.IsSuccessStatusCode) {
    throw "POST $table falhou: $([int]$resp.StatusCode) $raw"
  }
  if ($raw) { return $raw | ConvertFrom-Json }
  return $null
}

function Escape-IlikeValue([string]$value) {
  $safe = if ($null -eq $value) { '' } else { [string]$value }
  return [uri]::EscapeDataString($safe.Trim())
}

function Get-Processes() {
  if ($ProcessNumbers -and $ProcessNumbers.Count -gt 0) {
    $rows = @()
    foreach ($n in @($ProcessNumbers | Select-Object -Unique)) {
      $raw = $n.Trim()
      $digits = ($raw -replace '[^0-9]', '')
      if ($digits.Length -eq 20) {
        $rows += @(Invoke-JsonGet "$restBase/processos?numero_cnj=eq.$digits&select=id,numero_cnj,titulo&limit=1")
      }
      if (@($rows | Where-Object { $_.numero_cnj -eq $digits }).Count -eq 0) {
        $pattern = Escape-IlikeValue "*$raw*"
        $rows += @(Invoke-JsonGet "$restBase/processos?titulo=ilike.$pattern&select=id,numero_cnj,titulo&limit=1")
      }
    }
    return @($rows | Sort-Object id -Unique)
  }
  return @(Invoke-JsonGet "$restBase/processos?select=id,numero_cnj,titulo&limit=$Limite")
}

function Get-Publicacoes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=50")
}

function Get-Audiencias([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/audiencias?processo_id=eq.$processoId&select=id,origem,origem_id,tipo,data_audiencia,descricao,local,situacao,freshsales_activity_id&limit=200")
}

function Normalize-SearchText([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return $sb.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Test-AudienciaSignal([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  $clean = Normalize-SearchText $text
  if ($clean -match '(?i)deixo de designar audiencia') { return $false }
  return $clean -match '(?i)designad[ao].{0,40}audi|redesignad[ao].{0,40}audi|sessao de julgamento|audiencia.{0,200}(\d{2}/\d{2}/\d{4})'
}

function Extract-AudienciaDate([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $clean = Normalize-SearchText $text
  $patterns = @(
    '(?i)design[oa].{0,120}audiencia[\s\S]{0,240}?(\d{2}/\d{2}/\d{4})',
    '(?i)audiencia[\s\S]{0,240}?dia\s+(\d{2}/\d{2}/\d{4})',
    '(?i)sessao de julgamento[\s\S]{0,240}?(\d{2}/\d{2}/\d{4})',
    '(?i)(\d{2}/\d{2}/\d{4})[\s\S]{0,140}(?:audiencia|sessao de julgamento)'
  )
  foreach ($pattern in $patterns) {
    $m = [regex]::Match($clean, $pattern)
    if ($m.Success) {
      try {
        return [datetime]::ParseExact($m.Groups[1].Value, 'dd/MM/yyyy', [Globalization.CultureInfo]::InvariantCulture)
      } catch { }
    }
  }
  return $null
}

function Extract-AudienciaHora([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $clean = Normalize-SearchText $text
  $patterns = @(
    '(?i)(?:às|as)\s*(\d{1,2}:\d{2})\s*h?',
    '(?i)(\d{1,2}:\d{2})\s*h'
  )
  foreach ($pattern in $patterns) {
    $m = [regex]::Match($clean, $pattern)
    if ($m.Success) { return $m.Groups[1].Value }
  }
  return $null
}

function Build-Tipo([string]$text) {
  $clean = Normalize-SearchText $text
  if ($clean -match '(?i)sessao de julgamento') {
    return "sessao_julgamento"
  }
  if ($clean -match '(?i)audiencia una') {
    return "audiencia_una"
  }
  return "audiencia"
}

function Build-Resumo([string]$text, [datetime]$dt) {
  $clean = Normalize-SearchText $text
  if ($clean -match '(?i)sessao de julgamento') {
    return "Sessao de julgamento em $($dt.ToString('dd/MM/yyyy'))"
  }
  if ($clean -match '(?i)audiencia una') {
    return "Audiencia una em $($dt.ToString('dd/MM/yyyy'))"
  }
  return "Audiencia em $($dt.ToString('dd/MM/yyyy'))"
}

function Extract-Local([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $m = [regex]::Match($text, '(?i)órgão:\s*([^\.]+?)(?:tipo de comunicação:|tipo de documento:|meio:|parte\(s\):)')
  if (-not $m.Success) {
    $m = [regex]::Match($text, '(?i)sala de audiências da\s+([^,\n]+)')
  }
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return $null
}

$processos = Get-Processes
$sample = @()
$audienciasInseridas = 0

foreach ($proc in @($processos)) {
  $publicacoes = Get-Publicacoes $proc.id
  $existentes = Get-Audiencias $proc.id
  $novas = @()

  foreach ($pub in @($publicacoes)) {
    $txt = [string]$pub.conteudo
    if (-not (Test-AudienciaSignal $txt)) { continue }
    $dt = Extract-AudienciaDate $txt
    if ($null -eq $dt) { continue }
    $hora = Extract-AudienciaHora $txt
    if ($hora) {
      try {
        $dt = [datetime]::ParseExact(($dt.ToString('dd/MM/yyyy') + ' ' + $hora), 'dd/MM/yyyy HH:mm', [Globalization.CultureInfo]::InvariantCulture)
      } catch { }
    }
    $exists = @($existentes | Where-Object {
      $_.data_audiencia -and ([datetime]$_.data_audiencia).ToString('s') -eq $dt.ToString('s') -and $_.origem_id -eq $pub.id
    })
    if ($exists.Count -gt 0) { continue }
    $novas += [ordered]@{
      processo_id = $proc.id
      origem = 'publicacao_advise'
      origem_id = $pub.id
      tipo = Build-Tipo $txt
      data_audiencia = $dt.ToString('s')
      local = Extract-Local $txt
      situacao = 'detectada'
      descricao = $txt.Substring(0, [Math]::Min($txt.Length, 4000))
      metadata = @{
        resumo = Build-Resumo $txt $dt
        numero_cnj = $proc.numero_cnj
        titulo_processo = $proc.titulo
        publicacao_id = $pub.id
      }
    }
  }

  if ($novas.Count -gt 1) {
    $novas = @($novas | Group-Object data_audiencia,tipo,local | ForEach-Object { $_.Group[0] })
  }

  if ($Aplicar -and $novas.Count -gt 0) {
    foreach ($aud in $novas) {
      [void](Invoke-JsonPost "audiencias" $aud)
      $audienciasInseridas += 1
    }
  }

  if ($novas.Count -gt 0 -or ($ProcessNumbers -and $ProcessNumbers.Count -gt 0)) {
    $sample += [ordered]@{
      processo_id = $proc.id
      numero_cnj = $proc.numero_cnj
      titulo_processo = $proc.titulo
      publicacoes_lidas = $publicacoes.Count
      audiencias_existentes = @($existentes).Count
      audiencias_novas = $novas
    }
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  processos_lidos = @($processos).Count
  audiencias_inseridas = $audienciasInseridas
  sample = $sample | Select-Object -First 30
} | ConvertTo-Json -Depth 8
=======
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
>>>>>>> codex/hmadv-tpu-fase53
