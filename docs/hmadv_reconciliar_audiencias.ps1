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
  return Invoke-RestMethod -Method Post -Uri "$restBase/$table" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $json -TimeoutSec 120
}

function Escape-IlikeValue([string]$value) {
  $safe = if ($null -eq $value) { '' } else { [string]$value }
  return [uri]::EscapeDataString($safe.Trim())
}

function Get-Processes() {
  if ($ProcessNumbers -and $ProcessNumbers.Count -gt 0) {
    $rows = New-Object 'System.Collections.Generic.List[object]'
    foreach ($n in @($ProcessNumbers | Select-Object -Unique)) {
      $raw = $n.Trim()
      $digits = ($raw -replace '[^0-9]', '')
      if ($digits.Length -eq 20) {
        foreach ($row in @(Invoke-JsonGet "$restBase/processos?numero_cnj=eq.$digits&select=id,numero_cnj,titulo&limit=1")) {
          [void]$rows.Add($row)
        }
      }
      if (@($rows | Where-Object { $_.numero_cnj -eq $digits }).Count -eq 0) {
        $pattern = Escape-IlikeValue "*$raw*"
        foreach ($row in @(Invoke-JsonGet "$restBase/processos?titulo=ilike.$pattern&select=id,numero_cnj,titulo&limit=1")) {
          [void]$rows.Add($row)
        }
      }
    }
    return @(@($rows) | Sort-Object id -Unique)
  }
  return @(Invoke-JsonGet "$restBase/processos?select=id,numero_cnj,titulo&limit=$Limite")
}

function Get-Publicacoes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=50")
}

function Get-Audiencias([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/audiencias?processo_id=eq.$processoId&select=id,data_audiencia,titulo,descricao,freshsales_activity_id&limit=200")
}

function Test-AudienciaSignal([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  return $text -match '(?i)audiencia|audiência|sess[aã]o de julgamento|designad[ao].{0,40}aud|redesignad[ao].{0,40}aud'
}

function Extract-AudienciaDate([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $m = [regex]::Match($text, '(?i)(?:audiencia|audiência|sess[aã]o de julgamento|designad[ao].{0,40}aud)[\s\S]{0,120}?(\d{2}/\d{2}/\d{4})')
  if (-not $m.Success) {
    $m = [regex]::Match($text, '(?i)(\d{2}/\d{2}/\d{4})[\s\S]{0,80}(?:audiencia|audiência|sess[aã]o de julgamento)')
  }
  if (-not $m.Success) { return $null }
  try {
    return [datetime]::ParseExact($m.Groups[1].Value, 'dd/MM/yyyy', [Globalization.CultureInfo]::InvariantCulture)
  } catch {
    return $null
  }
}

function Extract-AudienciaHora([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $m = [regex]::Match($text, '(?i)(\d{1,2}:\d{2})')
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

function Build-Titulo([string]$text, [datetime]$dt) {
  if ($text -match '(?i)sess[aã]o de julgamento') {
    return "Sessao de julgamento em $($dt.ToString('dd/MM/yyyy'))"
  }
  return "Audiencia em $($dt.ToString('dd/MM/yyyy'))"
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
      $_.data_audiencia -and ([datetime]$_.data_audiencia).ToString('s') -eq $dt.ToString('s')
    })
    if ($exists.Count -gt 0) { continue }
    $novas += [ordered]@{
      processo_id = $proc.id
      data_audiencia = $dt.ToString('s')
      titulo = Build-Titulo $txt $dt
      descricao = $txt.Substring(0, [Math]::Min($txt.Length, 4000))
    }
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
      publicacoes_lidas = $publicacoes.Count
      audiencias_existentes = $existentes.Count
      audiencias_novas = $novas
    }
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  processos_lidos = $processos.Count
  audiencias_inseridas = $audienciasInseridas
  sample = $sample | Select-Object -First 30
} | ConvertTo-Json -Depth 8
