param(
  [Parameter(Mandatory = $true)] [string]$InputPath,
  [ValidateSet('classe','assunto','movimento','documento')] [string]$Entity,
  [string]$ProjectUrl = 'https://sspvizogbcyigquqycsz.supabase.co',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 50,
  [int]$MaxRows = 200,
  [switch]$Importar
)

if (-not (Test-Path $InputPath)) { throw "Arquivo nao encontrado: $InputPath" }
if ($Importar -and -not $ServiceRole) { throw 'Defina HMADV_SERVICE_ROLE ou passe -ServiceRole.' }

$tipoMap = @{ classe = 'C'; assunto = 'A'; movimento = 'M'; documento = 'D' }
$tipoEsperado = $tipoMap[$Entity]

function SplitTop([string]$text,[char]$sep) {
  $parts = New-Object System.Collections.Generic.List[string]
  $sb = New-Object System.Text.StringBuilder
  $depth = 0
  $inString = $false
  for ($i=0; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($c -eq "'") {
      if ($inString -and $i + 1 -lt $text.Length -and $text[$i+1] -eq "'") {
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

function Convert-Item($row) {
  $base = [ordered]@{
    codigo_cnj = ToInt $row.cod_item
    nome = "$($row.nome)".Trim()
    descricao = if ($row.dsc_caminho_completo) { "$($row.dsc_caminho_completo)" } else { $null }
    ativa = ("$($row.situacao)" -ne 'I')
    versao_cnj = ToInt $row.num_versao_lancado
    codigo_pai_cnj = ToInt $row.cod_item_pai
    importado_em = (Get-Date).ToString('s')
    atualizado_em = (Get-Date).ToString('s')
  }

  switch ($Entity) {
    'classe' {
      $base.Remove('codigo_pai_cnj') | Out-Null
      return $base
    }
    'assunto' {
      return $base
    }
    'movimento' {
      $nome = "$($row.nome)".Trim()
      $tipo = 'outro'
      if ($nome.ToLower() -match 'senten') { $tipo='sentenca' }
      elseif ($nome.ToLower() -match 'decis') { $tipo='decisao' }
      elseif ($nome.ToLower() -match 'despach') { $tipo='despacho' }
      elseif ($nome.ToLower() -match 'intima') { $tipo='intimacao' }
      elseif ($nome.ToLower() -match 'cita') { $tipo='citacao' }
      $base.Remove('codigo_pai_cnj') | Out-Null
      $base['tipo'] = $tipo
      return $base
    }
    'documento' {
      return $base
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

function Invoke-SupabaseUpsert([string]$table, [object[]]$batch) {
  $headers = @{
    apikey = $ServiceRole
    Authorization = "Bearer $ServiceRole"
    'Content-Type' = 'application/json; charset=utf-8'
    'Content-Profile' = 'judiciario'
    Prefer = 'resolution=merge-duplicates,return=representation'
  }
  $uri = "${ProjectUrl}/rest/v1/${table}?on_conflict=codigo_cnj"
  $json = $batch | ConvertTo-Json -Depth 10 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body
}

$rows = New-Object System.Collections.Generic.List[object]
$regex = [regex]"(?i)insert\s+into\s+ITENS\s*\((?<cols>.*?)\)\s*values\s*\((?<vals>.*)\);"
Get-Content -Path $InputPath | ForEach-Object {
  if ($MaxRows -gt 0 -and $rows.Count -ge $MaxRows) { return }
  $line = $_
  $m = $regex.Match($line)
  if (-not $m.Success) { return }
  $cols = @(SplitTop $m.Groups['cols'].Value ',') | ForEach-Object { ($_ -replace '[`"\[\]]','').Trim() }
  $vals = @(SplitTop $m.Groups['vals'].Value ',') | ForEach-Object { SqlLiteral $_ }
  if ($cols.Count -ne $vals.Count) { return }
  $obj = [ordered]@{}
  for ($i=0; $i -lt $cols.Count; $i++) { $obj[$cols[$i]] = $vals[$i] }
  if ("$($obj.tipo_item)" -ne $tipoEsperado) { return }
  $payload = Convert-Item ([pscustomobject]$obj)
  if ($payload) { $rows.Add($payload) }
}

Write-Host ''
Write-Host 'HMADV - Importacao TPU SQL (ITENS)'
Write-Host ("entity            : {0}" -f $Entity)
Write-Host ("arquivo           : {0}" -f $InputPath)
Write-Host ("tipo_item         : {0}" -f $tipoEsperado)
Write-Host ("batch_size        : {0}" -f $BatchSize)
Write-Host ("max_rows          : {0}" -f $(if ($MaxRows -gt 0) { $MaxRows } else { 'full' }))
Write-Host ("linhas_convertidas: {0}" -f $rows.Count)
Write-Host ''

if (-not $Importar) {
  $rows | Select-Object -First 5 | ConvertTo-Json -Depth 8
  exit 0
}

$table = switch ($Entity) {
  'classe' { 'tpu_classe' }
  'assunto' { 'tpu_assunto' }
  'movimento' { 'tpu_movimento' }
  'documento' { 'tpu_documento' }
}

$ok = 0
$erro = 0
$errosAmostra = New-Object System.Collections.Generic.List[string]
for ($i=0; $i -lt $rows.Count; $i += $BatchSize) {
  $end = [Math]::Min($i + $BatchSize - 1, $rows.Count - 1)
  $batch = @($rows[$i..$end])
  try {
    $null = Invoke-SupabaseUpsert -table $table -batch $batch
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
