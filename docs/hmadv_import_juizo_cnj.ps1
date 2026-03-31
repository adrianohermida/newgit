param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,
  [string]$ProjectUrl = "https://sspvizogbcyigquqycsz.supabase.co",
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 100
)

if (-not (Test-Path $CsvPath)) { throw "Arquivo nao encontrado: $CsvPath" }
if (-not $ServiceRole) { throw "Defina HMADV_SERVICE_ROLE ou passe -ServiceRole." }

function Get-Delimiter($path) {
  $line = Get-Content -Path $path -TotalCount 1
  if ($line -match ';') { return ';' }
  return ','
}

function Pick($row, [string[]]$names) {
  foreach ($name in $names) {
    $prop = $row.PSObject.Properties | Where-Object { $_.Name.Trim().ToLower() -eq $name.ToLower() } | Select-Object -First 1
    if ($prop -and "$($prop.Value)".Trim()) { return "$($prop.Value)".Trim() }
  }
  return $null
}

function Normalize-Grau($value) {
  $v = "$value".Trim().ToLower()
  if ($v -match '^1' -or $v -like '*1*grau*') { return '1' }
  if ($v -match '^2' -or $v -like '*2*grau*') { return '2' }
  if ($v -match '^3' -or $v -like '*superior*') { return '3' }
  if (-not $v) { return $null }
  return "$value".Trim()
}

function To-Bool($value, $default = $false) {
  if ($null -eq $value -or "$value".Trim() -eq '') { return $default }
  $v = "$value".Trim().ToLower()
  if ($v -in @('false','0','nao','não','n')) { return $false }
  if ($v -in @('true','1','sim','s')) { return $true }
  return $default
}

function Post-Batch($rows) {
  $json = $rows | ConvertTo-Json -Depth 10 -Compress
  return curl.exe -s `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Content-Type: application/json" `
    -H "Content-Profile: judiciario" `
    -H "Prefer: return=representation" `
    -X POST `
    -d $json `
    "$ProjectUrl/rest/v1/juizo_cnj"
}

$delimiter = Get-Delimiter $CsvPath
$csv = Import-Csv -Path $CsvPath -Delimiter $delimiter

$rows = foreach ($row in $csv) {
  $tribunal = Pick $row @('tribunal')
  $orgao = Pick $row @('nome_juizo','orgao_julgador','juizo','nome')
  if (-not $tribunal -or -not $orgao) { continue }

  [ordered]@{
    tribunal = $tribunal.ToUpper()
    grau = Normalize-Grau (Pick $row @('grau'))
    orgao_julgador = $orgao
    competencia = Pick $row @('competencia','classificacao')
    codigo_cnj = Pick $row @('codigo_cnj','codigo_origem','codigo')
    origem = 'CNJ_CSV'
    metadata = @{
      fonte_arquivo = (Split-Path $CsvPath -Leaf)
      uf = Pick $row @('uf')
      numero_serventia = Pick $row @('numero_serventia')
      nome_serventia = Pick $row @('nome_serventia')
      juizo_100_digital = To-Bool (Pick $row @('juizo_100_digital')) $false
      data_adesao = Pick $row @('data_adesao')
      tipo_unidade = Pick $row @('tipo_unidade')
      classificacao = Pick $row @('classificacao')
      unidade = Pick $row @('unidade')
      permite_peticionamento_eletronico = To-Bool (Pick $row @('permite_peticionamento_eletronico')) $true
      sistema_processual = Pick $row @('sistema_processual')
      raw = @{}
    }
  }
}

if ($rows.Count -eq 0) {
  Write-Host "Nenhum juizo valido encontrado no CSV."
  exit 0
}

for ($i = 0; $i -lt $rows.Count; $i++) {
  $keys = $csv[$i].PSObject.Properties.Name
  foreach ($key in $keys) {
    $rows[$i].metadata.raw[$key] = "$($csv[$i].$key)"
  }
}

$ok = 0
$errors = 0

for ($i = 0; $i -lt $rows.Count; $i += $BatchSize) {
  $batch = @($rows[$i..([Math]::Min($i + $BatchSize - 1, $rows.Count - 1))])
  $resp = Post-Batch $batch
  if ($LASTEXITCODE -eq 0 -and $resp) {
    $ok += $batch.Count
  } else {
    $errors += $batch.Count
  }
}

Write-Host ""
Write-Host "HMADV - Importacao Juizo CNJ"
Write-Host "arquivo          : $CsvPath"
Write-Host "linhas_validas    : $($rows.Count)"
Write-Host "importadas        : $ok"
Write-Host "com_erro          : $errors"
Write-Host ""
