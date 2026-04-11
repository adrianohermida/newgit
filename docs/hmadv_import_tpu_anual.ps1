param(
  [Parameter(Mandatory = $true)] [string]$InputPath,
  [ValidateSet('auto','movimento','classe','assunto')] [string]$Entity = 'auto',
  [string]$ProjectUrl = 'https://sspvizogbcyigquqycsz.supabase.co',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 200,
  [switch]$DryRun
)

if (-not (Test-Path $InputPath)) { throw "Arquivo nao encontrado: $InputPath" }
if (-not $ServiceRole -and -not $DryRun) { throw 'Defina HMADV_SERVICE_ROLE ou passe -ServiceRole.' }

function Resolve-SourceFile([string]$path) {
  $item = Get-Item -LiteralPath $path
  if ($item.Extension -ne '.zip') {
    return [pscustomobject]@{ Path = $item.FullName; TempDir = $null; SourceType = $item.Extension.TrimStart('.').ToLower() }
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $tempDir = Join-Path $env:TEMP ("hmadv_tpu_" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempDir | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($item.FullName, $tempDir)
  $preferred = Get-ChildItem -Path $tempDir -Recurse -File |
    Where-Object { $_.Extension -in @('.sql','.csv','.tsv') } |
    Sort-Object @{Expression = { @('.sql','.csv','.tsv').IndexOf($_.Extension.ToLower()) }}, Length -Descending |
    Select-Object -First 1
  if (-not $preferred) { throw "ZIP sem arquivo .sql/.csv/.tsv suportado: $path" }
  return [pscustomobject]@{ Path = $preferred.FullName; TempDir = $tempDir; SourceType = $preferred.Extension.TrimStart('.').ToLower() }
}

function Cleanup-TempDir([string]$path) {
  if ($path -and (Test-Path $path)) { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue }
}

function Get-Delimiter([string]$path) {
  $line = Get-Content -Path $path -TotalCount 1
  if ($line -match ';') { return ';' }
  if ($line -match "`t") { return "`t" }
  return ','
}

function Normalize-Header([string]$name) {
  return (([string]$name).Trim().ToLower() -replace '[^a-z0-9_]+', '_')
}

function Pick-Value($row, [string[]]$names) {
  foreach ($name in $names) {
    $normalized = Normalize-Header $name
    foreach ($prop in $row.PSObject.Properties) {
      if ((Normalize-Header $prop.Name) -eq $normalized -and "$($prop.Value)".Trim()) { return "$($prop.Value)".Trim() }
    }
  }
  return $null
}

function To-Bool($value, $default = $false) {
  if ($null -eq $value) { return $default }
  $v = "$value".Trim().ToLower()
  if (-not $v) { return $default }
  if ($v -in @('s','sim','true','1','a','ativo','y','yes')) { return $true }
  if ($v -in @('n','nao','não','false','0','i','inativo','no')) { return $false }
  return $default
}

function To-NullableInt($value) {
  if ($null -eq $value) { return $null }
  $raw = "$value".Trim()
  if (-not $raw) { return $null }
  $n = 0
  if ([int]::TryParse(($raw -replace '[^0-9\-]', ''), [ref]$n)) { return $n }
  return $null
}

function Is-AtivaFromSituacao($situacaoRaw) {
  $situacao = "$situacaoRaw".Trim().ToUpper()
  if (-not $situacao) { return $true }
  return $situacao -ne 'I'
}

function Map-TipoMovimento($subcategoria, $nome, $movimento) {
  $v = (@($subcategoria, $nome, $movimento) -join ' ').ToLower()
  if ($v -match 'senten') { return 'sentenca' }
  if ($v -match 'decis') { return 'decisao' }
  if ($v -match 'despach') { return 'despacho' }
  if ($v -match 'intima') { return 'intimacao' }
  if ($v -match 'cita') { return 'citacao' }
  return 'outro'
}
function Convert-ClasseRow($row) {
  $codigo = To-NullableInt (Pick-Value $row @('codigo_cnj','cod_classe','codigo','cod'))
  $nome = Pick-Value $row @('nome','descricao','classe')
  if (-not $codigo -or -not $nome) { return $null }
  return [ordered]@{
    codigo_cnj = $codigo
    nome = $nome
    sigla = Pick-Value $row @('sigla')
    descricao = Pick-Value $row @('glossario','descricao')
    natureza = Pick-Value $row @('natureza')
    polo_ativo = Pick-Value $row @('polo_ativo')
    polo_passivo = Pick-Value $row @('polo_passivo')
    area_direito = Pick-Value $row @('area_direito','ramo_direito')
    numeracao_propria = To-Bool (Pick-Value $row @('numeracao_propria')) $false
    just_estadual = ((To-Bool (Pick-Value $row @('just_estadual','just_es_1grau','just_es_2grau')) $false) -or (To-Bool (Pick-Value $row @('just_estadual_2grau')) $false))
    just_federal = (To-Bool (Pick-Value $row @('just_federal','just_fed_1grau','just_fed_2grau')) $false)
    just_trabalho = (To-Bool (Pick-Value $row @('just_trabalho','just_trab_1grau','just_trab_2grau')) $false)
    just_militar = To-Bool (Pick-Value $row @('just_militar')) $false
    just_eleitoral = To-Bool (Pick-Value $row @('just_eleitoral')) $false
    stf = To-Bool (Pick-Value $row @('stf')) $false
    stj = To-Bool (Pick-Value $row @('stj')) $false
    ativa = Is-AtivaFromSituacao (Pick-Value $row @('situacao'))
    versao_cnj = To-NullableInt (Pick-Value $row @('versao_cnj','num_versao_lancado'))
    importado_em = (Get-Date).ToString('s')
    atualizado_em = (Get-Date).ToString('s')
  }
}

function Convert-AssuntoRow($row) {
  $codigo = To-NullableInt (Pick-Value $row @('codigo_cnj','cod_assunto','codigo','cod'))
  $nome = Pick-Value $row @('nome','descricao','assunto')
  if (-not $codigo -or -not $nome) { return $null }
  return [ordered]@{
    codigo_cnj = $codigo
    nome = $nome
    descricao = Pick-Value $row @('glossario','descricao')
    area_direito = Pick-Value $row @('area_direito','ramo_direito')
    dispositivo_legal = Pick-Value $row @('dispositivo_legal')
    artigo = Pick-Value $row @('artigo')
    sigiloso = To-Bool (Pick-Value $row @('sigiloso')) $false
    assunto_secundario = To-Bool (Pick-Value $row @('assunto_secundario')) $false
    crime_antecedente = To-Bool (Pick-Value $row @('crime_antecedente')) $false
    just_estadual = To-Bool (Pick-Value $row @('just_estadual','just_es_1grau','just_es_2grau')) $false
    just_federal = To-Bool (Pick-Value $row @('just_federal','just_fed_1grau','just_fed_2grau')) $false
    just_trabalho = To-Bool (Pick-Value $row @('just_trabalho','just_trab_1grau','just_trab_2grau')) $false
    stf = To-Bool (Pick-Value $row @('stf')) $false
    stj = To-Bool (Pick-Value $row @('stj')) $false
    codigo_pai_cnj = To-NullableInt (Pick-Value $row @('codigo_pai_cnj','cod_item_pai','cod_assunto_pai'))
    ativa = Is-AtivaFromSituacao (Pick-Value $row @('situacao'))
    versao_cnj = To-NullableInt (Pick-Value $row @('versao_cnj','num_versao_lancado'))
    importado_em = (Get-Date).ToString('s')
    atualizado_em = (Get-Date).ToString('s')
  }
}

function Convert-MovimentoRow($row) {
  $codigo = To-NullableInt (Pick-Value $row @('codigo_cnj','cod_movimento','codigo','cod'))
  $nome = Pick-Value $row @('nome','descricao')
  $movimento = Pick-Value $row @('movimento')
  if (-not $codigo -or -not $nome) { return $null }
  return [ordered]@{
    codigo_cnj = $codigo
    nome = $nome
    descricao = Pick-Value $row @('glossario','movimento','descricao')
    tipo = Map-TipoMovimento (Pick-Value $row @('subcategoria')) $nome $movimento
    gera_prazo = To-Bool (Pick-Value $row @('gera_prazo')) $false
    prazo_sugerido_dias = To-NullableInt (Pick-Value $row @('prazo_sugerido_dias'))
    visibilidade_externa = To-Bool (Pick-Value $row @('visibilidade_externa')) $true
    flg_eletronico = To-Bool (Pick-Value $row @('flg_eletronico')) $false
    just_estadual = To-Bool (Pick-Value $row @('just_estadual','just_es_1grau','just_es_2grau')) $false
    just_federal = To-Bool (Pick-Value $row @('just_federal','just_fed_1grau','just_fed_2grau')) $false
    just_trabalho = To-Bool (Pick-Value $row @('just_trabalho','just_trab_1grau','just_trab_2grau')) $false
    stf = To-Bool (Pick-Value $row @('stf')) $false
    stj = To-Bool (Pick-Value $row @('stj')) $false
    ativa = Is-AtivaFromSituacao (Pick-Value $row @('situacao'))
    versao_cnj = To-NullableInt (Pick-Value $row @('versao_cnj','num_versao_lancado'))
    importado_em = (Get-Date).ToString('s')
    atualizado_em = (Get-Date).ToString('s')
  }
}

function Detect-EntityFromTable([string]$tableName) {
  $t = (([string]$tableName) -replace '[`"\[\]]', '').ToLower()
  if ($t -match 'movimento') { return 'movimento' }
  if ($t -match 'assunto') { return 'assunto' }
  if ($t -match 'classe') { return 'classe' }
  return $null
}

function Detect-EntityFromHeaders($row) {
  $headers = @($row.PSObject.Properties.Name | ForEach-Object { Normalize-Header $_ })
  if ($headers -contains 'cod_movimento' -or $headers -contains 'movimento') { return 'movimento' }
  if ($headers -contains 'cod_assunto' -or $headers -contains 'ramo_direito') { return 'assunto' }
  if ($headers -contains 'cod_classe' -or $headers -contains 'numeracao_propria') { return 'classe' }
  return $null
}

function Split-SqlTopLevel([string]$text, [char]$separator) {
  $parts = New-Object System.Collections.Generic.List[string]
  $sb = New-Object System.Text.StringBuilder
  $depth = 0
  $inString = $false
  for ($i = 0; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($c -eq "'") {
      if ($inString -and $i + 1 -lt $text.Length -and $text[$i + 1] -eq "'") { [void]$sb.Append("''"); $i++; continue }
      $inString = -not $inString
      [void]$sb.Append($c)
      continue
    }
    if (-not $inString) {
      if ($c -eq '(') { $depth++ }
      elseif ($c -eq ')') { $depth-- }
      elseif ($c -eq $separator -and $depth -eq 0) { $parts.Add($sb.ToString()); $sb.Clear() | Out-Null; continue }
    }
    [void]$sb.Append($c)
  }
  if ($sb.Length -gt 0) { $parts.Add($sb.ToString()) }
  return $parts
}

function Extract-SqlTuples([string]$valuesText) {
  $tuples = New-Object System.Collections.Generic.List[string]
  $sb = New-Object System.Text.StringBuilder
  $depth = 0
  $inString = $false
  for ($i = 0; $i -lt $valuesText.Length; $i++) {
    $c = $valuesText[$i]
    if ($c -eq "'") {
      if ($inString -and $i + 1 -lt $valuesText.Length -and $valuesText[$i + 1] -eq "'") { [void]$sb.Append("''"); $i++; continue }
      $inString = -not $inString
      [void]$sb.Append($c)
      continue
    }
    if (-not $inString) {
      if ($c -eq '(') { $depth++ }
      elseif ($c -eq ')') { $depth-- }
    }
    [void]$sb.Append($c)
    if (-not $inString -and $depth -eq 0 -and $sb.Length -gt 0 -and $c -eq ')') { $tuples.Add($sb.ToString().Trim()); $sb.Clear() | Out-Null }
  }
  return $tuples
}

function Convert-SqlLiteral([string]$token) {
  $trimmed = $token.Trim()
  if ($trimmed -match '^(?i)null$') { return $null }
  if ($trimmed -match "^'(.*)'$") { return ($matches[1] -replace "''","'") }
  if ($trimmed -match '^-?\d+$') { return [int64]$trimmed }
  if ($trimmed -match '^-?\d+\.\d+$') { return [double]$trimmed }
  return $trimmed
}
function Read-SqlRows([string]$path, [string]$forcedEntity, [int]$maxRows = 0) {
  $content = Get-Content -Path $path -Raw
  $pattern = [regex]'(?is)insert\s+into\s+(?<table>[`"\[\]\w\.]+)\s*\((?<cols>.*?)\)\s*values\s*(?<vals>.*?);'
  $items = New-Object System.Collections.Generic.List[object]`r`n  :outer foreach ($match in $pattern.Matches($content)) {
    $table = $match.Groups['table'].Value
    $entityDetected = if ($forcedEntity -ne 'auto') { $forcedEntity } else { Detect-EntityFromTable $table }
    if (-not $entityDetected) { continue }
    $columns = @(Split-SqlTopLevel $match.Groups['cols'].Value ',' | ForEach-Object { ($_ -replace '[`"\[\]]', '').Trim() })
    $tuples = Extract-SqlTuples $match.Groups['vals'].Value
    foreach ($tuple in $tuples) {
      $inner = $tuple.Trim().TrimStart(',').Trim()
      if ($inner.StartsWith('(') -and $inner.EndsWith(')')) { $inner = $inner.Substring(1, $inner.Length - 2) }
      $values = @(Split-SqlTopLevel $inner ',' | ForEach-Object { Convert-SqlLiteral $_ })
      if ($values.Count -ne $columns.Count) { continue }
      $obj = [ordered]@{}
      for ($j = 0; $j -lt $columns.Count; $j++) { $obj[$columns[$j]] = $values[$j] }
      $items.Add([pscustomobject]@{ Entity = $entityDetected; Row = [pscustomobject]$obj })`r`n      if ($maxRows -gt 0 -and $items.Count -ge $maxRows) { break outer }`r`n    }
  }
  return $items
}

function Read-DelimitedRows([string]$path, [string]$forcedEntity, [int]$maxRows = 0) {
  $delimiter = Get-Delimiter $path
  $csv = Import-Csv -Path $path -Delimiter $delimiter
  $items = New-Object System.Collections.Generic.List[object]
  if (-not $csv -or $csv.Count -eq 0) { return $items }
  $entityDetected = if ($forcedEntity -ne 'auto') { $forcedEntity } else { Detect-EntityFromHeaders $csv[0] }
  if (-not $entityDetected) { throw "Nao foi possivel detectar a entidade TPU pelo cabecalho do arquivo: $path" }
  :loop foreach ($row in $csv) { $items.Add([pscustomobject]@{ Entity = $entityDetected; Row = $row }); if ($maxRows -gt 0 -and $items.Count -ge $maxRows) { break loop } }
  return $items
}

function Convert-ToPayload($entity, $row) {
  switch ($entity) {
    'classe' { return Convert-ClasseRow $row }
    'assunto' { return Convert-AssuntoRow $row }
    'movimento' { return Convert-MovimentoRow $row }
    default { return $null }
  }
}

function Get-RestTable([string]$entity) {
  switch ($entity) {
    'classe' { return 'tpu_classe' }
    'assunto' { return 'tpu_assunto' }
    'movimento' { return 'tpu_movimento' }
    default { throw "Entidade TPU invalida: $entity" }
  }
}

function Post-Batch([string]$restTable, $rows) {
  $json = $rows | ConvertTo-Json -Depth 10 -Compress
  $url = "$ProjectUrl/rest/v1/$restTable?on_conflict=codigo_cnj"
  return curl.exe -s `
    -H "apikey: $ServiceRole" `
    -H "Authorization: Bearer $ServiceRole" `
    -H "Content-Type: application/json" `
    -H "Content-Profile: judiciario" `
    -H "Prefer: resolution=merge-duplicates,return=representation" `
    -X POST `
    -d $json `
    $url
}

$resolved = Resolve-SourceFile $InputPath
$sourcePath = $resolved.Path
$sourceType = $resolved.SourceType
$tempDir = $resolved.TempDir

try {
  switch ($sourceType) {
    'sql' { $rawItems = Read-SqlRows $sourcePath $Entity }
    'csv' { $rawItems = Read-DelimitedRows $sourcePath $Entity }
    'tsv' { $rawItems = Read-DelimitedRows $sourcePath $Entity }
    default { throw "Tipo de arquivo nao suportado: .$sourceType" }
  }

  $payloadByEntity = @{ classe = New-Object System.Collections.Generic.List[object]; assunto = New-Object System.Collections.Generic.List[object]; movimento = New-Object System.Collections.Generic.List[object] }
  foreach ($item in $rawItems) {
    $payload = Convert-ToPayload $item.Entity $item.Row
    if ($payload) { $payloadByEntity[$item.Entity].Add($payload) }
  }

  $summary = [ordered]@{
    arquivo_origem = $InputPath
    arquivo_resolvido = $sourcePath
    tipo_fonte = $sourceType
    modo = if ($DryRun) { 'dry_run' } else { 'import' }
    classes = $payloadByEntity['classe'].Count
    assuntos = $payloadByEntity['assunto'].Count
    movimentos = $payloadByEntity['movimento'].Count
  }

  if ($DryRun) {
    $preview = [ordered]@{}
    foreach ($entityName in @('classe','assunto','movimento')) { $preview[$entityName] = @($payloadByEntity[$entityName] | Select-Object -First 3) }
    Write-Host ""
    Write-Host 'HMADV - Importacao Anual TPU (dry-run)'
    $summary.GetEnumerator() | ForEach-Object { Write-Host ("{0,-18}: {1}" -f $_.Key, $_.Value) }
    Write-Host ""
    $preview | ConvertTo-Json -Depth 8
    exit 0
  }

  $imported = [ordered]@{ classe = 0; assunto = 0; movimento = 0 }
  $errors = [ordered]@{ classe = 0; assunto = 0; movimento = 0 }
  foreach ($entityName in @('classe','assunto','movimento')) {
    $rows = @($payloadByEntity[$entityName])
    if ($rows.Count -eq 0) { continue }
    $restTable = Get-RestTable $entityName
    for ($i = 0; $i -lt $rows.Count; $i += $BatchSize) {
      $end = [Math]::Min($i + $BatchSize - 1, $rows.Count - 1)
      $batch = @($rows[$i..$end])
      $resp = Post-Batch $restTable $batch
      if ($LASTEXITCODE -eq 0 -and $resp -ne $null) { $imported[$entityName] += $batch.Count } else { $errors[$entityName] += $batch.Count }
    }
  }

  Write-Host ""
  Write-Host 'HMADV - Importacao Anual TPU'
  $summary.GetEnumerator() | ForEach-Object { Write-Host ("{0,-18}: {1}" -f $_.Key, $_.Value) }
  Write-Host ""
  Write-Host ("classes_importadas : {0}" -f $imported['classe'])
  Write-Host ("classes_com_erro   : {0}" -f $errors['classe'])
  Write-Host ("assuntos_importados: {0}" -f $imported['assunto'])
  Write-Host ("assuntos_com_erro  : {0}" -f $errors['assunto'])
  Write-Host ("movs_importados    : {0}" -f $imported['movimento'])
  Write-Host ("movs_com_erro      : {0}" -f $errors['movimento'])
  Write-Host ""
}
finally {
  Cleanup-TempDir $tempDir
}



