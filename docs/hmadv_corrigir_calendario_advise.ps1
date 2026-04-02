param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [string]$CsvAdvise = "D:\Downloads\AdviseData - DJE.csv",
  [switch]$Aplicar,
  [int]$Limite = 200
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$base = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Type" = "application/json; charset=utf-8"
}

$writeHeaders = $headers + @{
  "Content-Profile" = "judiciario"
}

function Normalize-Text([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  return ($value -replace '\s+', ' ').Trim()
}

function Get-CsvValue($row, [string[]]$names) {
  foreach ($name in $names) {
    $prop = $row.PSObject.Properties[$name]
    if ($null -ne $prop -and -not [string]::IsNullOrWhiteSpace([string]$prop.Value)) {
      return [string]$prop.Value
    }
  }
  return $null
}

function Get-CsvValueByPattern($row, [string]$pattern) {
  foreach ($prop in $row.PSObject.Properties) {
    if ($prop.Name -like $pattern -and -not [string]::IsNullOrWhiteSpace([string]$prop.Value)) {
      return [string]$prop.Value
    }
  }
  return $null
}

function Build-AdviseMap($csvPath) {
  $map = @{}
  foreach ($row in (Import-Csv $csvPath)) {
    $estado = Normalize-Text (Get-CsvValue $row @("Estado"))
    if (-not $estado) { continue }

    $diario = Normalize-Text (Get-CsvValueByPattern $row "Di*")
    $tribunais = Normalize-Text (Get-CsvValue $row @("Tribunais Abrangidos", "Tribunais Abrangidos "))

    $map[$estado.ToLowerInvariant()] = [ordered]@{
      estado = $estado
      diario = $diario
      nome = if ($diario) { "Advise $diario" } else { "Advise" }
      tribunais_abrangidos = $tribunais
    }
  }
  return $map
}

function Get-Candidatos {
  return @(Invoke-RestMethod -Method Get -Uri "$base/calendario_forense_fonte?tipo=eq.advise_dje&select=id,nome,metadata&limit=$Limite" -Headers $headers -TimeoutSec 120)
}

function Build-Patch($row, $adviseMap) {
  $estado = Normalize-Text ([string]$row.metadata.estado)
  if (-not $estado) { return $null }

  $source = $adviseMap[$estado.ToLowerInvariant()]
  if (-not $source) { return $null }

  $currentDiario = Normalize-Text ([string]$row.metadata.diario)
  $currentTribunais = Normalize-Text ([string]$row.metadata.tribunais_abrangidos)
  $currentNome = Normalize-Text ([string]$row.nome)

  $needsPatch = (-not $currentDiario) -or ($currentNome -eq "Advise") -or ($currentNome -eq "Advise ") -or (-not $currentTribunais)
  if (-not $needsPatch) { return $null }

  return [ordered]@{
    nome = $source.nome
    metadata = @{
      estado = $estado
      diario = $source.diario
      tribunais_abrangidos = $source.tribunais_abrangidos
    }
  }
}

function Apply-Patch($id, $patch) {
  $json = $patch | ConvertTo-Json -Depth 8 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Patch -Uri "$base/calendario_forense_fonte?id=eq.$id" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

$adviseMap = Build-AdviseMap $CsvAdvise
$rows = Get-Candidatos
$report = @()

foreach ($row in $rows) {
  $patch = Build-Patch $row $adviseMap
  if (-not $patch) { continue }

  $entry = [ordered]@{
    id = $row.id
    nome_atual = $row.nome
    estado = $row.metadata.estado
    patch = $patch
  }

  if ($Aplicar) {
    try {
      $entry.resultado = Apply-Patch $row.id $patch
    } catch {
      $entry.erro = $_.Exception.Message
    }
  }

  $report += $entry
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  total_lidos = $rows.Count
  total_candidatos = $report.Count
  sample = $report | Select-Object -First 20
} | ConvertTo-Json -Depth 10
