param(
  [Parameter(Mandatory = $true)] [string]$InputPath,
  [int]$LineCount = 4000
)
if (-not (Test-Path $InputPath)) { throw "Arquivo nao encontrado: $InputPath" }
$head = (Get-Content -Path $InputPath -TotalCount $LineCount) -join "`n"
$match = [regex]::Match($head, '(?is)insert\s+into\s+(?<table>[`"\[\]\w\.]+)\s*\((?<cols>.*?)\)\s*values\s*(?<vals>.*?);')
if (-not $match.Success) { throw 'Nao foi encontrado INSERT INTO no trecho inicial do arquivo.' }
$table = $match.Groups['table'].Value
$cols = $match.Groups['cols'].Value -split ',' | ForEach-Object { ($_ -replace '[`"\[\]]','').Trim() }
$preview = $match.Groups['vals'].Value.Substring(0, [Math]::Min(800, $match.Groups['vals'].Value.Length))
Write-Host ''
Write-Host 'HMADV - Preview rapido TPU SQL'
Write-Host ("arquivo       : {0}" -f $InputPath)
Write-Host ("tabela        : {0}" -f $table)
Write-Host ("total_colunas : {0}" -f $cols.Count)
Write-Host 'colunas:'
$cols | Select-Object -First 25 | ForEach-Object { Write-Host (" - {0}" -f $_) }
Write-Host ''
Write-Host 'preview values:'
Write-Output $preview
