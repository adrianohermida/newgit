param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$Importar,
  [switch]$DryRun,
  [int]$BatchSize = 100,
  [string]$CsvCpc = "D:\Downloads\prazos_processuais_cpc_rows.csv",
  [string]$CsvPenal = "D:\Downloads\prazos_processuais_penais_rows.csv",
  [string]$CsvTrabalhista = "D:\Downloads\prazos_processuais_trabalhistas_rows.csv",
  [string]$CsvJuizados = "D:\Downloads\prazos_processuais_juizados_rows.csv",
  [string]$CsvFeriados = "D:\Downloads\Feriado_export (1).csv",
  [string]$CsvEstados = "D:\Downloads\Estado_export (3).csv",
  [string]$CsvMunicipios = "D:\Downloads\Municipio_export (1).csv",
  [string]$CsvAdvise = "D:\Downloads\AdviseData - DJE.csv"
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
  return $value.Trim()
}

function Parse-PrazoDias([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  $m = [regex]::Match($value, "^\s*(\d+)\s*$")
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return $null
}

function Infer-TipoContagem([string]$baseLegal, [string]$prazoTexto, [string]$ato) {
  $joined = @($baseLegal, $prazoTexto, $ato) -join " "
  if ($joined -match "audi[êe]ncia|minutos antes") { return "evento" }
  if ($joined -match "prazo determinado pelo juiz|subsidi") { return "indeterminado" }
  if ($joined -match "dias [úu]teis|lei 9\.099/95|juizado") { return "dias_uteis" }
  return "dias_corridos"
}

function Infer-Ramo([string]$baseLegal) {
  if ($baseLegal -match "CLT|Trabalho") { return "trabalhista" }
  if ($baseLegal -match "Penal|Processo Penal") { return "penal" }
  if ($baseLegal -match "9\.099/95|Juizado") { return "juizados" }
  return "civel"
}

function Build-RegraRows($csvPath, [string]$rito) {
  $rows = Import-Csv $csvPath
  return @($rows | ForEach-Object {
    $prazoTexto = Normalize-Text $_.prazo
    [ordered]@{
      ato_praticado = Normalize-Text $_.ato_praticado
      base_legal = Normalize-Text $_.base_legal
      artigo = Normalize-Text $_.artigo
      prazo_texto_original = $prazoTexto
      prazo_dias = Parse-PrazoDias $prazoTexto
      tipo_contagem = Infer-TipoContagem $_.base_legal $prazoTexto $_.ato_praticado
      ramo = Infer-Ramo $_.base_legal
      rito = $rito
      instancia = $null
      tribunal_sigla = $null
      aplica_ia = ($null -eq (Parse-PrazoDias $prazoTexto))
      ativo = $true
      metadata = @{
        fonte_csv = [System.IO.Path]::GetFileName($csvPath)
      }
    }
  })
}

function Build-EstadoRows($csvPath) {
  return @(Import-Csv $csvPath | ForEach-Object {
    [ordered]@{
      codigo_ibge = Normalize-Text $_.codigo_uf
      uf = Normalize-Text $_.sigla
      nome = Normalize-Text $_.nome
      metadata = @{
        nome_normalizado = Normalize-Text $_.nome_normalizado
        origem_id = Normalize-Text $_.id
      }
    }
  })
}

function Build-MunicipioRows($csvPath) {
  return @(Import-Csv $csvPath | ForEach-Object {
    [ordered]@{
      codigo_ibge = Normalize-Text $_.codigo
      estado_uf = $null
      nome = Normalize-Text $_.nome
      metadata = @{
        codigo_uf = Normalize-Text $_.codigo_uf
        nome_normalizado = Normalize-Text $_.nome_normalizado
        origem_id = Normalize-Text $_.id
      }
    }
  })
}

function Build-FeriadoRows($csvPath) {
  return @(Import-Csv $csvPath | ForEach-Object {
    [ordered]@{
      nome = Normalize-Text $_.name
      tipo = Normalize-Text $_.type
      data_feriado = Normalize-Text $_.date
      estado_uf = Normalize-Text $_.state
      municipio_codigo_ibge = Normalize-Text $_.city
      tribunal_sigla = $null
      recorrente = ([string]::Equals($_.recurring, "true", [System.StringComparison]::OrdinalIgnoreCase))
      afeta_prazo = $true
      origem = "lawdesk_export"
      metadata = @{
        origem_id = Normalize-Text $_.id
        created_by = Normalize-Text $_.created_by
        is_sample = Normalize-Text $_.is_sample
      }
    }
  })
}

function Build-AdviseRows($csvPath) {
  return @(Import-Csv $csvPath | ForEach-Object {
    [ordered]@{
      nome = "Advise " + (Normalize-Text $_.'Diário')
      tribunal_sigla = $null
      estado_uf = $null
      municipio_codigo_ibge = $null
      tipo = "advise_dje"
      url_fonte = $null
      vigencia_inicio = $null
      vigencia_fim = $null
      metadata = @{
        estado = Normalize-Text $_.Estado
        diario = Normalize-Text $_.'Diário'
        tribunais_abrangidos = Normalize-Text $_.'Tribunais Abrangidos'
      }
    }
  })
}

function Invoke-Upsert($table, $rows, $conflict) {
  if (-not $rows -or $rows.Count -eq 0) {
    return @{ tabela = $table; total = 0; importadas = 0 }
  }

  $importadas = 0
  for ($i = 0; $i -lt $rows.Count; $i += $BatchSize) {
    $batch = @($rows[$i..([Math]::Min($i + $BatchSize - 1, $rows.Count - 1))])
    $json = $batch | ConvertTo-Json -Depth 10 -Compress
    $body = [System.Text.Encoding]::UTF8.GetBytes($json)
    $uri = "$base/$table?on_conflict=$conflict"
    Invoke-RestMethod -Method Post -Uri $uri -Headers ($headers + @{ Prefer = "resolution=merge-duplicates" }) -Body $body -TimeoutSec 120 -ErrorAction Stop | Out-Null
    $importadas += $batch.Count
  }

  return @{ tabela = $table; total = $rows.Count; importadas = $importadas }
}

$payload = [ordered]@{
  prazo_regra = @(
    Build-RegraRows $CsvCpc "cpc"
    Build-RegraRows $CsvPenal "penal"
    Build-RegraRows $CsvTrabalhista "trabalhista"
    Build-RegraRows $CsvJuizados "juizados"
  )
  estado_ibge = Build-EstadoRows $CsvEstados
  municipio_ibge = Build-MunicipioRows $CsvMunicipios
  feriado_forense = Build-FeriadoRows $CsvFeriados
  calendario_forense_fonte = Build-AdviseRows $CsvAdvise
}

if ($DryRun) {
  [ordered]@{
    modo = "dry_run"
    prazo_regra_total = $payload.prazo_regra.Count
    estado_total = $payload.estado_ibge.Count
    municipio_total = $payload.municipio_ibge.Count
    feriado_total = $payload.feriado_forense.Count
    calendario_total = $payload.calendario_forense_fonte.Count
    sample_prazo_regra = $payload.prazo_regra | Select-Object -First 5
    sample_feriado = $payload.feriado_forense | Select-Object -First 5
    sample_calendario = $payload.calendario_forense_fonte | Select-Object -First 5
  } | ConvertTo-Json -Depth 8
  exit 0
}

$results = @()
$results += Invoke-Upsert "prazo_regra" $payload.prazo_regra "ato_praticado,base_legal,artigo,rito"
$results += Invoke-Upsert "estado_ibge" $payload.estado_ibge "codigo_ibge"
$results += Invoke-Upsert "municipio_ibge" $payload.municipio_ibge "codigo_ibge"
$results += Invoke-Upsert "feriado_forense" $payload.feriado_forense "nome,data_feriado,tipo,coalesce(estado_uf,''),coalesce(municipio_codigo_ibge,''),coalesce(tribunal_sigla,'')"
$results += Invoke-Upsert "calendario_forense_fonte" $payload.calendario_forense_fonte "nome,tipo"

[ordered]@{
  modo = "importacao"
  resultados = $results
} | ConvertTo-Json -Depth 8
