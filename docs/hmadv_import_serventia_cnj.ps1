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

function To-Bool($value, $default = $true) {
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
    "$ProjectUrl/rest/v1/serventia_cnj"
}

$delimiter = Get-Delimiter $CsvPath
$csv = Import-Csv -Path $CsvPath -Delimiter $delimiter

$rows = foreach ($row in $csv) {
  $tribunal = Pick $row @('tribunal')
  $nomeServentia = Pick $row @('nome_serventia','serventia','nome')
  if (-not $tribunal -or -not $nomeServentia) { continue }

  [ordered]@{
    tribunal = $tribunal.ToUpper()
    uf = Pick $row @('uf')
    municipio = Pick $row @('municipio','cidade')
    codigo_municipio_ibge = Pick $row @('codigo_municipio_ibge','ibge','codigo_ibge')
    numero_serventia = Pick $row @('numero_serventia','codigo_serventia')
    nome_serventia = $nomeServentia
    tipo_orgao = Pick $row @('tipo_orgao','tipo_unidade')
    competencia = Pick $row @('competencia','classificacao')
    telefone = Pick $row @('telefone','fone')
    email = Pick $row @('email','e_mail')
    endereco = Pick $row @('endereco','logradouro')
    cep = Pick $row @('cep')
    ativa = To-Bool (Pick $row @('ativa','ativo')) $true
    origem = 'CNJ_CSV'
    metadata = @{
      fonte_arquivo = (Split-Path $CsvPath -Leaf)
      raw = @{}
    }
  }
}

if ($rows.Count -eq 0) {
  Write-Host "Nenhuma serventia valida encontrada no CSV."
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
Write-Host "HMADV - Importacao Serventia CNJ"
Write-Host "arquivo          : $CsvPath"
Write-Host "linhas_validas    : $($rows.Count)"
Write-Host "importadas        : $ok"
Write-Host "com_erro          : $errors"
Write-Host ""
