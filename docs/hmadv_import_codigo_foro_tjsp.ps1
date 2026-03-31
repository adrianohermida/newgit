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
    "$ProjectUrl/rest/v1/codigo_foro_tjsp"
}

$delimiter = Get-Delimiter $CsvPath
$csv = Import-Csv -Path $CsvPath -Delimiter $delimiter

$rows = foreach ($row in $csv) {
  $codigo = Pick $row @('codigo_foro','codigo_tjsp','tjsp_code')
  $nome = Pick $row @('nome_foro','nome','name')
  if (-not $codigo -or -not $nome) { continue }

  [ordered]@{
    codigo_foro = $codigo
    nome_foro = $nome
    comarca = Pick $row @('comarca','comarca_name')
    municipio = Pick $row @('municipio','cidade')
    uf = (Pick $row @('uf')) ?? 'SP'
    tribunal = 'TJSP'
    metadata = @{
      fonte_arquivo = (Split-Path $CsvPath -Leaf)
      codigo_cnj = Pick $row @('codigo_cnj','cnj_code')
      grau = Pick $row @('grau')
      ativo = Pick $row @('ativo')
      raw = @{}
    }
  }
}

if ($rows.Count -eq 0) {
  Write-Host "Nenhum codigo de foro valido encontrado no CSV."
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
Write-Host "HMADV - Importacao Codigo Foro TJSP"
Write-Host "arquivo          : $CsvPath"
Write-Host "linhas_validas    : $($rows.Count)"
Write-Host "importadas        : $ok"
Write-Host "com_erro          : $errors"
Write-Host ""
