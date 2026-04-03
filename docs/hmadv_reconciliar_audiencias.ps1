param(
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
  $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$restBase/$table" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $json -TimeoutSec 120
  if ($resp.Content) { return $resp.Content | ConvertFrom-Json }
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
      audiencias_existentes = $existentes.Count
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
