param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$Importar,
  [switch]$DryRun,
  [int]$BatchSize = 100
)

if (-not $DryRun -and -not $Importar) {
  throw "Use -DryRun ou -Importar"
}

if ($Importar -and -not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE para importar"
}

$base = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Type" = "application/json; charset=utf-8"
}

function Normalize-Text([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($char)
    }
  }
  return $sb.ToString().ToLowerInvariant().Trim()
}

function Get-RegraRows {
  try {
    return Invoke-RestMethod -Method Get -Uri "$base/prazo_regra?select=id,ato_praticado,base_legal,rito,prazo_texto_original,prazo_dias,tipo_contagem" -Headers $headers -TimeoutSec 120
  } catch {
    throw "Falha ao ler prazo_regra: $($_.Exception.Message)"
  }
}

function New-AliasSet($regra) {
  $set = New-Object 'System.Collections.Generic.HashSet[string]'
  $raw = @(
    $regra.ato_praticado,
    $regra.base_legal
  ) | Where-Object { $_ }

  foreach ($entry in $raw) {
    $normalized = Normalize-Text $entry
    if ($normalized) { [void]$set.Add($normalized) }
  }

  $ato = Normalize-Text $regra.ato_praticado
  if (-not $ato) { return @() }

  $tokens = $ato -split '\s+' | Where-Object { $_ -and $_.Length -ge 4 }
  foreach ($token in $tokens) {
    [void]$set.Add($token)
  }

  if ($ato -match "contest") { [void]$set.Add("contestacao") }
  if ($ato -match "embargo") { [void]$set.Add("embargos") }
  if ($ato -match "apelac") { [void]$set.Add("apelacao") }
  if ($ato -match "audiencia") { [void]$set.Add("audiencia") }
  if ($ato -match "laudo") { [void]$set.Add("pericia") }
  if ($ato -match "peticao inicial|inicial") { [void]$set.Add("peticao inicial") }
  if ($ato -match "alegac") { [void]$set.Add("alegacoes finais") }
  if ($ato -match "recurso") { [void]$set.Add("recurso") }
  if ($ato -match "cumprimento") { [void]$set.Add("cumprimento") }
  if ($ato -match "manifest") { [void]$set.Add("manifestacao") }
  if ($ato -match "juntada") { [void]$set.Add("juntada") }

  return @($set)
}

function Build-AliasRows($regras) {
  $rows = @()
  foreach ($regra in $regras) {
    $aliases = New-AliasSet $regra
    foreach ($alias in $aliases) {
      $rows += [ordered]@{
        prazo_regra_id = $regra.id
        alias = $alias
        peso = if ($alias -eq (Normalize-Text $regra.ato_praticado)) { 10 } else { 100 }
        origem = "hmadv_seed"
        metadata = @{
          rito = $regra.rito
          base_legal = $regra.base_legal
          prazo_texto_original = $regra.prazo_texto_original
          tipo_contagem = $regra.tipo_contagem
        }
      }
    }
  }
  return $rows
}

function Invoke-UpsertAlias($rows) {
  if (-not $rows -or $rows.Count -eq 0) {
    return @{ total = 0; importadas = 0 }
  }

  $importadas = 0
  for ($i = 0; $i -lt $rows.Count; $i += $BatchSize) {
    $batch = @($rows[$i..([Math]::Min($i + $BatchSize - 1, $rows.Count - 1))])
    $json = $batch | ConvertTo-Json -Depth 10 -Compress
    Invoke-RestMethod -Method Post `
      -Uri "$base/prazo_regra_alias?on_conflict=prazo_regra_id,alias" `
      -Headers ($headers + @{ Prefer = "resolution=merge-duplicates" }) `
      -Body $json `
      -TimeoutSec 120 | Out-Null
    $importadas += $batch.Count
  }

  return @{ total = $rows.Count; importadas = $importadas }
}

$regras = @(Get-RegraRows)
$aliasRows = @(Build-AliasRows $regras)

if ($DryRun) {
  [ordered]@{
    modo = "dry_run"
    regras_total = $regras.Count
    alias_total = $aliasRows.Count
    sample_alias = $aliasRows | Select-Object -First 20
  } | ConvertTo-Json -Depth 8
  exit 0
}

[ordered]@{
  modo = "importacao"
  resultado = Invoke-UpsertAlias $aliasRows
} | ConvertTo-Json -Depth 8
