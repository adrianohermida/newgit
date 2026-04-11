param(
  [Parameter(Mandatory = $true)] [string]$InputPath,
  [ValidateSet('classe','assunto','movimento')] [string]$Entity,
  [string]$ProjectUrl = 'https://sspvizogbcyigquqycsz.supabase.co',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 200,
  [int]$MaxRows = 200,
  [switch]$Importar
)
if (-not (Test-Path $InputPath)) { throw "Arquivo nao encontrado: $InputPath" }
if (-not $ServiceRole) { throw 'Defina HMADV_SERVICE_ROLE ou passe -ServiceRole.' }
function Pick($o, [string[]]$names) { foreach ($n in $names) { foreach ($p in $o.PSObject.Properties) { if ($p.Name.ToLower() -eq $n.ToLower() -and "$($p.Value)".Trim()) { return "$($p.Value)".Trim() } } } return $null }
function ToInt($v) { if ($null -eq $v) { return $null }; $n = 0; $raw = ("$v" -replace '[^0-9\-]',''); if ([int]::TryParse($raw,[ref]$n)) { return $n }; return $null }
function ToBool($v, $d=$false) { $s = "$v".Trim().ToLower(); if (-not $s) { return $d }; if ($s -in @('s','sim','true','1','a')) { return $true }; if ($s -in @('n','nao','não','false','0','i')) { return $false }; return $d }
function SplitTop([string]$text,[char]$sep) { $parts = New-Object System.Collections.Generic.List[string]; $sb = New-Object System.Text.StringBuilder; $depth = 0; $inString = $false; for ($i=0; $i -lt $text.Length; $i++) { $c = $text[$i]; if ($c -eq "'") { if ($inString -and $i + 1 -lt $text.Length -and $text[$i+1] -eq "'") { [void]$sb.Append("''"); $i++; continue }; $inString = -not $inString; [void]$sb.Append($c); continue }; if (-not $inString) { if ($c -eq '(') { $depth++ } elseif ($c -eq ')') { $depth-- } elseif ($c -eq $sep -and $depth -eq 0) { $parts.Add($sb.ToString()); $sb.Clear() | Out-Null; continue } }; [void]$sb.Append($c) }; if ($sb.Length -gt 0) { $parts.Add($sb.ToString()) }; return $parts }
function ExtractTuples([string]$valuesText) { $tuples = New-Object System.Collections.Generic.List[string]; $sb = New-Object System.Text.StringBuilder; $depth = 0; $inString = $false; for ($i=0; $i -lt $valuesText.Length; $i++) { $c = $valuesText[$i]; if ($c -eq "'") { if ($inString -and $i + 1 -lt $valuesText.Length -and $valuesText[$i+1] -eq "'") { [void]$sb.Append("''"); $i++; continue }; $inString = -not $inString; [void]$sb.Append($c); continue }; if (-not $inString) { if ($c -eq '(') { $depth++ } elseif ($c -eq ')') { $depth-- } }; [void]$sb.Append($c); if (-not $inString -and $depth -eq 0 -and $sb.Length -gt 0 -and $c -eq ')') { $tuples.Add($sb.ToString().Trim()); $sb.Clear() | Out-Null } }; return $tuples }
function SqlLiteral([string]$t) { $trimmed = $t.Trim(); if ($trimmed -match '^(?i)null$') { return $null }; if ($trimmed -match "^'(.*)'$") { return ($matches[1] -replace "''","'") }; if ($trimmed -match '^-?\d+$') { return [int64]$trimmed }; if ($trimmed -match '^-?\d+\.\d+$') { return [double]$trimmed }; return $trimmed }
function ConvertRow($row) {
  switch ($Entity) {
    'classe' { $codigo = ToInt (Pick $row @('codigo_cnj','cod_classe','codigo','cod')); $nome = Pick $row @('nome','descricao','classe'); if (-not $codigo -or -not $nome) { return $null }; return [ordered]@{ codigo_cnj=$codigo; nome=$nome; sigla=Pick $row @('sigla'); descricao=Pick $row @('glossario','descricao'); natureza=Pick $row @('natureza'); polo_ativo=Pick $row @('polo_ativo'); polo_passivo=Pick $row @('polo_passivo'); area_direito=Pick $row @('area_direito','ramo_direito'); numeracao_propria=ToBool (Pick $row @('numeracao_propria')) $false; just_estadual=ToBool (Pick $row @('just_estadual','just_es_1grau','just_es_2grau')) $false; just_federal=ToBool (Pick $row @('just_federal','just_fed_1grau','just_fed_2grau')) $false; just_trabalho=ToBool (Pick $row @('just_trabalho','just_trab_1grau','just_trab_2grau')) $false; stf=ToBool (Pick $row @('stf')) $false; stj=ToBool (Pick $row @('stj')) $false; ativa=((Pick $row @('situacao')) -ne 'I'); importado_em=(Get-Date).ToString('s'); atualizado_em=(Get-Date).ToString('s') } }
    'assunto' { $codigo = ToInt (Pick $row @('codigo_cnj','cod_assunto','codigo','cod')); $nome = Pick $row @('nome','descricao','assunto'); if (-not $codigo -or -not $nome) { return $null }; return [ordered]@{ codigo_cnj=$codigo; nome=$nome; descricao=Pick $row @('glossario','descricao'); area_direito=Pick $row @('area_direito','ramo_direito'); dispositivo_legal=Pick $row @('dispositivo_legal'); artigo=Pick $row @('artigo'); sigiloso=ToBool (Pick $row @('sigiloso')) $false; assunto_secundario=ToBool (Pick $row @('assunto_secundario')) $false; crime_antecedente=ToBool (Pick $row @('crime_antecedente')) $false; just_estadual=ToBool (Pick $row @('just_estadual','just_es_1grau','just_es_2grau')) $false; just_federal=ToBool (Pick $row @('just_federal','just_fed_1grau','just_fed_2grau')) $false; just_trabalho=ToBool (Pick $row @('just_trabalho','just_trab_1grau','just_trab_2grau')) $false; stf=ToBool (Pick $row @('stf')) $false; stj=ToBool (Pick $row @('stj')) $false; codigo_pai_cnj=ToInt (Pick $row @('codigo_pai_cnj','cod_item_pai','cod_assunto_pai')); ativa=((Pick $row @('situacao')) -ne 'I'); importado_em=(Get-Date).ToString('s'); atualizado_em=(Get-Date).ToString('s') } }
    'movimento' { $codigo = ToInt (Pick $row @('codigo_cnj','cod_movimento','codigo','cod')); $nome = Pick $row @('nome','descricao'); if (-not $codigo -or -not $nome) { return $null }; $sub = Pick $row @('subcategoria'); $tipo = 'outro'; if (("$sub $nome").ToLower() -match 'senten') { $tipo='sentenca' } elseif (("$sub $nome").ToLower() -match 'decis') { $tipo='decisao' } elseif (("$sub $nome").ToLower() -match 'despach') { $tipo='despacho' } elseif (("$sub $nome").ToLower() -match 'intima') { $tipo='intimacao' } elseif (("$sub $nome").ToLower() -match 'cita') { $tipo='citacao' }; return [ordered]@{ codigo_cnj=$codigo; nome=$nome; descricao=Pick $row @('glossario','movimento','descricao'); tipo=$tipo; gera_prazo=ToBool (Pick $row @('gera_prazo')) $false; prazo_sugerido_dias=ToInt (Pick $row @('prazo_sugerido_dias')); visibilidade_externa=ToBool (Pick $row @('visibilidade_externa')) $true; flg_eletronico=ToBool (Pick $row @('flg_eletronico')) $false; just_estadual=ToBool (Pick $row @('just_estadual','just_es_1grau','just_es_2grau')) $false; just_federal=ToBool (Pick $row @('just_federal','just_fed_1grau','just_fed_2grau')) $false; just_trabalho=ToBool (Pick $row @('just_trabalho','just_trab_1grau','just_trab_2grau')) $false; stf=ToBool (Pick $row @('stf')) $false; stj=ToBool (Pick $row @('stj')) $false; ativa=((Pick $row @('situacao')) -ne 'I'); importado_em=(Get-Date).ToString('s'); atualizado_em=(Get-Date).ToString('s') } }
  }
}
$content = Get-Content -Path $InputPath -Raw
$pattern = [regex]'(?is)insert\s+into\s+(?<table>[`"\[\]\w\.]+)\s*\((?<cols>.*?)\)\s*values\s*(?<vals>.*?);'
$rows = New-Object System.Collections.Generic.List[object]
:outer foreach ($m in $pattern.Matches($content)) {
  $cols = @(SplitTop $m.Groups['cols'].Value ',') | ForEach-Object { ($_ -replace '[`"\[\]]','').Trim() }
  $tuples = ExtractTuples $m.Groups['vals'].Value
  foreach ($tuple in $tuples) {
    $inner = $tuple.Trim().TrimStart(',').Trim()
    if ($inner.StartsWith('(') -and $inner.EndsWith(')')) { $inner = $inner.Substring(1, $inner.Length - 2) }
    $values = @(SplitTop $inner ',' | ForEach-Object { SqlLiteral $_ })
    if ($values.Count -ne $cols.Count) { continue }
    $obj = [ordered]@{}
    for ($i=0; $i -lt $cols.Count; $i++) { $obj[$cols[$i]] = $values[$i] }
    $payload = ConvertRow ([pscustomobject]$obj)
    if ($payload) { $rows.Add($payload) }
    if ($MaxRows -gt 0 -and $rows.Count -ge $MaxRows) { break outer }
  }
}
Write-Host ''
Write-Host 'HMADV - Importacao TPU SQL anual'
Write-Host ("entity            : {0}" -f $Entity)
Write-Host ("arquivo           : {0}" -f $InputPath)
Write-Host ("max_rows          : {0}" -f $(if ($MaxRows -gt 0) { $MaxRows } else { 'full' }))
Write-Host ("linhas_convertidas: {0}" -f $rows.Count)
Write-Host ''
if (-not $Importar) {
  $rows | Select-Object -First 3 | ConvertTo-Json -Depth 8
  exit 0
}
$table = switch ($Entity) { 'classe' { 'tpu_classe' } 'assunto' { 'tpu_assunto' } 'movimento' { 'tpu_movimento' } }
$ok = 0; $erro = 0
for ($i=0; $i -lt $rows.Count; $i += $BatchSize) {
  $end = [Math]::Min($i + $BatchSize - 1, $rows.Count - 1)
  $batch = @($rows[$i..$end])
  $json = $batch | ConvertTo-Json -Depth 10 -Compress
  $url = "$ProjectUrl/rest/v1/$table?on_conflict=codigo_cnj"
  $resp = curl.exe -s -H "apikey: $ServiceRole" -H "Authorization: Bearer $ServiceRole" -H "Content-Type: application/json" -H "Content-Profile: judiciario" -H "Prefer: resolution=merge-duplicates,return=representation" -X POST -d $json $url
  if ($LASTEXITCODE -eq 0 -and $resp -ne $null) { $ok += $batch.Count } else { $erro += $batch.Count }
}
Write-Host ''
Write-Host ("importadas        : {0}" -f $ok)
Write-Host ("com_erro          : {0}" -f $erro)
