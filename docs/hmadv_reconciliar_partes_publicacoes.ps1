param(
<<<<<<< HEAD
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [string[]]$ProcessNumbers,
  [string]$ProcessListPath,
  [int]$Limite = 50,
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

function Invoke-JsonPostUpsert([string]$table, [string]$onConflict, $payload) {
  $json = $payload | ConvertTo-Json -Depth 10 -Compress
  return Invoke-RestMethod -Method Post -Uri "$restBase/$table?on_conflict=$onConflict" -Headers ($writeHeaders + @{ Prefer = "resolution=merge-duplicates,return=representation" }) -Body $json -TimeoutSec 120
}

function Escape-IlikeValue([string]$value) {
  $safe = if ($null -eq $value) { '' } else { [string]$value }
  return [uri]::EscapeDataString($safe.Trim())
}

function Normalize-Text([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return (($sb.ToString().Normalize([Text.NormalizationForm]::FormC).ToUpperInvariant()) -replace '\s+', ' ').Trim()
}

function Get-Processes() {
  if ($ProcessNumbers -and $ProcessNumbers.Count -gt 0) {
    $clean = @($ProcessNumbers | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    $rows = New-Object 'System.Collections.Generic.List[object]'
    foreach ($n in $clean) {
      $raw = $n.Trim()
      $digits = ($raw -replace '[^0-9]', '')
      if ($digits.Length -eq 20) {
        foreach ($row in @(Invoke-JsonGet "$restBase/processos?numero_cnj=eq.$digits&select=id,numero_cnj,account_id_freshsales,polo_ativo,polo_passivo,titulo&limit=1")) {
          [void]$rows.Add($row)
        }
      }
      if (@($rows | Where-Object { $_.numero_cnj -eq $digits }).Count -eq 0) {
        $pattern = Escape-IlikeValue "*$raw*"
        foreach ($row in @(Invoke-JsonGet "$restBase/processos?titulo=ilike.$pattern&select=id,numero_cnj,account_id_freshsales,polo_ativo,polo_passivo,titulo&limit=1")) {
          [void]$rows.Add($row)
        }
      }
    }
    return @(@($rows) | Sort-Object id -Unique)
  }
  return @(Invoke-JsonGet "$restBase/processos?select=id,numero_cnj,account_id_freshsales,polo_ativo,polo_passivo,titulo&limit=$Limite")
}

function Get-Publicacoes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=50")
}

function Get-Partes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/partes?processo_id=eq.$processoId&select=id,nome,polo&limit=200")
}

function Parse-PartesFromText([string]$text) {
  $out = @()
  if ([string]::IsNullOrWhiteSpace($text)) { return $out }
  $m = [regex]::Match($text, 'Parte\(s\):\s*([^\n]+(?:\n(?!Advogado|Processo)[^\n]+)*)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if (-not $m.Success) { return $out }
  $block = $m.Groups[1].Value
  $regex = New-Object System.Text.RegularExpressions.Regex("([^()\r\n]{3,}?)\s*\(([AP])\)")
  foreach ($hit in $regex.Matches($block)) {
    $name = $hit.Groups[1].Value.Trim()
    $polo = if ($hit.Groups[2].Value -eq 'A') { 'ativo' } else { 'passivo' }
    if ($name.Length -lt 3) { continue }
    $tipoPessoa = if ($name -match '\b(LTDA|S\.A\.|S\.A|ME|EPP|EIRELI|SA|S/A|BANCO|FUND|ASSOC|SIND|CORP|GRUPO|EMPRESA|CONSTRUTORA|COMERCIAL|SERVI|INCORPORA)\b') { 'JURIDICA' } else { 'FISICA' }
    $out += [pscustomobject]@{
      nome = $name
      polo = $polo
      tipo_pessoa = $tipoPessoa
      fonte = 'publicacao'
    }
  }
  return @($out | Group-Object nome,polo | ForEach-Object { $_.Group[0] })
}

$processos = Get-Processes
$sample = @()
$partesInseridas = 0

foreach ($proc in @($processos)) {
  $publicacoes = Get-Publicacoes $proc.id
  $existentes = Get-Partes $proc.id
  $parsed = @()
  foreach ($pub in @($publicacoes)) {
    $parsed += @(Parse-PartesFromText ([string]$pub.conteudo))
  }
  $dedup = @($parsed | Group-Object nome,polo | ForEach-Object { $_.Group[0] })
  $novas = @()
  foreach ($parte in $dedup) {
    $exists = @($existentes | Where-Object { (Normalize-Text $_.nome) -eq (Normalize-Text $parte.nome) -and $_.polo -eq $parte.polo })
    if ($exists.Count -eq 0) {
      $novas += [ordered]@{
        processo_id = $proc.id
        nome = $parte.nome
        polo = $parte.polo
        tipo_pessoa = $parte.tipo_pessoa
        fonte = 'publicacao'
      }
    }
  }

  if ($Aplicar -and $novas.Count -gt 0) {
    [void](Invoke-JsonPostUpsert "partes" "processo_id,nome,polo" $novas)
    $partesInseridas += $novas.Count
  }

  if ($novas.Count -gt 0 -or ($ProcessNumbers -and $ProcessNumbers.Count -gt 0)) {
    $sample += [ordered]@{
      processo_id = $proc.id
      numero_cnj = $proc.numero_cnj
      publicacoes_lidas = $publicacoes.Count
      partes_existentes = $existentes.Count
      partes_detectadas = $dedup.Count
      partes_novas = $novas
    }
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  processos_lidos = $processos.Count
  partes_inseridas = $partesInseridas
  sample = $sample | Select-Object -First 20
} | ConvertTo-Json -Depth 8
=======
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
>>>>>>> codex/hmadv-tpu-fase53
