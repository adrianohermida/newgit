param(
  [string]$InputPath = 'D:\Github\newgit\docs\tpu\movimentos\dump_dados_oracle_postgres.sql',
  [ValidateSet('tipo_complemento','complemento','complemento_movimento','complemento_tabelado','procedimento_complementos','temporariedade','tipo_ramo_justica','temp_item')] [string]$Entity,
  [string]$ProjectUrl = 'https://sspvizogbcyigquqycsz.supabase.co',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 50,
  [int]$MaxRows = 500,
  [switch]$Importar
)

if (-not (Test-Path $InputPath)) { throw "Arquivo nao encontrado: $InputPath" }
if ($Importar -and -not $ServiceRole) { throw 'Defina HMADV_SERVICE_ROLE ou passe -ServiceRole.' }

$entityMap = @{
  tipo_complemento = @{
    TableName = 'TIPO_COMPLEMENTO'
    Target = 'tpu_tipo_complemento'
    Conflict = 'seq_tipo_complemento'
  }
  complemento = @{
    TableName = 'COMPLEMENTO'
    Target = 'tpu_complemento'
    Conflict = 'seq_complemento'
  }
  complemento_movimento = @{
    TableName = 'COMPLEMENTO_MOVIMENTO'
    Target = 'tpu_complemento_movimento'
    Conflict = 'seq_compl_mov'
  }
  complemento_tabelado = @{
    TableName = 'COMPLEMENTO_TABELADO'
    Target = 'tpu_complemento_tabelado'
    Conflict = 'seq_compl_tabelado'
  }
  procedimento_complementos = @{
    TableName = 'PROCEDIMENTO_COMPLEMENTOS'
    Target = 'tpu_procedimento_complemento'
    Conflict = 'seq_procedimento_complemento'
  }
  temporariedade = @{
    TableName = 'TEMPORARIEDADE'
    Target = 'tpu_temporariedade'
    Conflict = 'seq_temp'
  }
  tipo_ramo_justica = @{
    TableName = 'TIPO_RAMO_JUSTICA'
    Target = 'tpu_tipo_ramo_justica'
    Conflict = 'seq_tipo_ramo_justica'
  }
  temp_item = @{
    TableName = 'TEMP_ITEM'
    Target = 'tpu_temp_item'
    Conflict = 'seq_temp_item'
  }
}

$config = $entityMap[$Entity]

function SplitTop([string]$text,[char]$sep) {
  $parts = New-Object System.Collections.Generic.List[string]
  $sb = New-Object System.Text.StringBuilder
  $depth = 0
  $inString = $false
  for ($i = 0; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($c -eq "'") {
      if ($inString -and $i + 1 -lt $text.Length -and $text[$i + 1] -eq "'") {
        [void]$sb.Append("''")
        $i++
        continue
      }
      $inString = -not $inString
      [void]$sb.Append($c)
      continue
    }
    if (-not $inString) {
      if ($c -eq '(') { $depth++ }
      elseif ($c -eq ')') { $depth-- }
      elseif ($c -eq $sep -and $depth -eq 0) {
        $parts.Add($sb.ToString())
        $null = $sb.Clear()
        continue
      }
    }
    [void]$sb.Append($c)
  }
  if ($sb.Length -gt 0) { $parts.Add($sb.ToString()) }
  return $parts
}

function SqlLiteral([string]$t) {
  $trimmed = $t.Trim()
  if ($trimmed -match '^(?i)null$') { return $null }
  if ($trimmed -match "^to_date\('(.*)','.*'\)$") { return $matches[1] }
  if ($trimmed -match "^to_timestamp\('(.*)','.*'\)$") { return $matches[1] }
  if ($trimmed -match "^'(.*)'$") { return ($matches[1] -replace "''","'") }
  if ($trimmed -match '^-?\d+$') { return [int64]$trimmed }
  return $trimmed
}

function ToInt($v) {
  if ($null -eq $v) { return $null }
  $raw = ("$v" -replace '[^0-9\-]','')
  $n = 0
  if ([int]::TryParse($raw,[ref]$n)) { return $n }
  return $null
}

function Convert-Timestamp($v) {
  if ($null -eq $v) { return $null }
  $text = "$v".Trim()
  if (-not $text) { return $null }
  $out = [datetime]::MinValue
  if ([datetime]::TryParse($text, [ref]$out)) {
    return $out.ToString('s')
  }
  return $text
}

function Convert-Row([pscustomobject]$row) {
  $now = (Get-Date).ToString('s')
  switch ($Entity) {
    'tipo_complemento' {
      return [ordered]@{
        seq_tipo_complemento = ToInt $row.seq_tipo_complemento
        descricao = "$($row.desc_tipo_complemento)".Trim()
        observacao = if ($row.dsc_observacao) { "$($row.dsc_observacao)" } else { $null }
        importado_em = $now
        atualizado_em = $now
      }
    }
    'complemento' {
      return [ordered]@{
        seq_complemento = ToInt $row.seq_complemento
        seq_tipo_complemento = ToInt $row.seq_tipo_complemento
        descricao = "$($row.dsc_complemento)".Trim()
        observacao = if ($row.dsc_observacao) { "$($row.dsc_observacao)" } else { $null }
        importado_em = $now
        atualizado_em = $now
      }
    }
    'complemento_movimento' {
      return [ordered]@{
        seq_compl_mov = ToInt $row.seq_compl_mov
        seq_complemento = ToInt $row.seq_complemento
        cod_movimento = ToInt $row.cod_movimento
        data_inclusao = Convert-Timestamp $row.data_inclusao
        usuario_inclusao = if ($row.usu_inclusao) { "$($row.usu_inclusao)" } else { $null }
        importado_em = $now
        atualizado_em = $now
      }
    }
    'complemento_tabelado' {
      return [ordered]@{
        seq_compl_tabelado = ToInt $row.seq_compl_tabelado
        seq_complemento = ToInt $row.seq_complemento
        valor_tabelado = "$($row.dsc_valor_tabelado)".Trim()
        importado_em = $now
        atualizado_em = $now
      }
    }
    'procedimento_complementos' {
      return [ordered]@{
        seq_procedimento_complemento = ToInt $row.id
        cod_movimento = ToInt $row.cod_movimento
        seq_tipo_complemento = ToInt $row.seq_tipo_complemento
        valor = "$($row.valor)".Trim()
        data_inclusao = Convert-Timestamp $row.dat_inclusao
        usuario_inclusao = if ($row.usu_inclusao) { "$($row.usu_inclusao)" } else { $null }
        importado_em = $now
        atualizado_em = $now
      }
    }
    'temporariedade' {
      return [ordered]@{
        seq_temp = ToInt $row.seq_temp
        temporariedade = "$($row.temporariedade)".Trim()
        texto_temporariedade = "$($row.txt_temp)".Trim()
        tipo_justica = "$($row.tipo_justica)".Trim()
        texto_tipo_justica = "$($row.txt_tipo_justica)".Trim()
        ordem = ToInt $row.ordem
        status = "$($row.status)".Trim()
        importado_em = $now
        atualizado_em = $now
      }
    }
    'tipo_ramo_justica' {
      return [ordered]@{
        seq_tipo_ramo_justica = ToInt $row.seq_tipo_ramo_justica
        descricao = if ($row.dsc_ramo_justica) { "$($row.dsc_ramo_justica)" } else { $null }
        nome = if ($row.nom_ramo_justica) { "$($row.nom_ramo_justica)" } else { $null }
        importado_em = $now
        atualizado_em = $now
      }
    }
    'temp_item' {
      return [ordered]@{
        seq_temp_item = ToInt $row.seq_temp_item
        seq_item = ToInt $row.seq_item
        seq_temp = ToInt $row.seq_temp
        tipo_item = "$($row.tipo_item)".Trim()
        observacao = if ($row.temp_observacao) { "$($row.temp_observacao)" } else { $null }
        seq_tipo_ramo_justica = ToInt $row.seq_tipo_ramo_justica
        usuario_inclusao = "$($row.usu_inclusao)".Trim()
        data_inclusao = Convert-Timestamp $row.dat_inclusao
        importado_em = $now
        atualizado_em = $now
      }
    }
  }
}

function Get-ErrorBody($exception) {
  if ($exception.ErrorDetails -and $exception.ErrorDetails.Message) {
    return $exception.ErrorDetails.Message
  }
  try {
    $stream = $exception.Response.GetResponseStream()
    if (-not $stream) { return $null }
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
  } catch {
    return $null
  }
}

function Invoke-SupabaseUpsert([string]$table, [string]$conflictColumn, [object[]]$batch) {
  $headers = @{
    apikey = $ServiceRole
    Authorization = "Bearer $ServiceRole"
    'Content-Type' = 'application/json; charset=utf-8'
    'Content-Profile' = 'judiciario'
    Prefer = 'resolution=merge-duplicates,return=representation'
  }
  $uri = "${ProjectUrl}/rest/v1/${table}?on_conflict=${conflictColumn}"
  $json = $batch | ConvertTo-Json -Depth 10 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body
}

$escapedTable = [regex]::Escape($config.TableName)
$regex = [regex]"(?i)^insert\s+into\s+${escapedTable}\s*\((?<cols>.*?)\)\s*values\s*\((?<vals>.*)\);$"
$rows = New-Object System.Collections.Generic.List[object]

Get-Content -Path $InputPath | ForEach-Object {
  if ($MaxRows -gt 0 -and $rows.Count -ge $MaxRows) { return }
  $line = $_
  $m = $regex.Match($line)
  if (-not $m.Success) { return }
  $cols = @(SplitTop $m.Groups['cols'].Value ',') | ForEach-Object { ($_ -replace '[`"\[\]]','').Trim() }
  $vals = @(SplitTop $m.Groups['vals'].Value ',') | ForEach-Object { SqlLiteral $_ }
  if ($cols.Count -ne $vals.Count) { return }
  $obj = [ordered]@{}
  for ($i = 0; $i -lt $cols.Count; $i++) { $obj[$cols[$i]] = $vals[$i] }
  $payload = Convert-Row ([pscustomobject]$obj)
  if ($payload) { $rows.Add($payload) }
}

Write-Host ''
Write-Host 'HMADV - Importacao TPU Complementos'
Write-Host ("entity            : {0}" -f $Entity)
Write-Host ("arquivo           : {0}" -f $InputPath)
Write-Host ("tabela_origem     : {0}" -f $config.TableName)
Write-Host ("batch_size        : {0}" -f $BatchSize)
Write-Host ("max_rows          : {0}" -f $(if ($MaxRows -gt 0) { $MaxRows } else { 'full' }))
Write-Host ("linhas_convertidas: {0}" -f $rows.Count)
Write-Host ''

if (-not $Importar) {
  $rows | Select-Object -First 5 | ConvertTo-Json -Depth 8
  exit 0
}

$ok = 0
$erro = 0
$errosAmostra = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $rows.Count; $i += $BatchSize) {
  $end = [Math]::Min($i + $BatchSize - 1, $rows.Count - 1)
  $batch = @($rows[$i..$end])
  try {
    $null = Invoke-SupabaseUpsert -table $config.Target -conflictColumn $config.Conflict -batch $batch
    $ok += $batch.Count
  } catch {
    $erro += $batch.Count
    if ($errosAmostra.Count -lt 5) {
      $body = Get-ErrorBody $_
      if ($body) {
        $errosAmostra.Add($body)
      } else {
        $errosAmostra.Add($_.Exception.Message)
      }
    }
  }
}

Write-Host ''
Write-Host ("importadas        : {0}" -f $ok)
Write-Host ("com_erro          : {0}" -f $erro)
if ($errosAmostra.Count -gt 0) {
  Write-Host ''
  Write-Host 'amostra_erros     :'
  $errosAmostra | ForEach-Object { Write-Host $_ }
}
