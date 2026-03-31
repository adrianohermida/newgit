param(
  [string]$ProjectUrl = 'https://sspvizogbcyigquqycsz.supabase.co',
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$SampleSize = 10
)

if (-not $ServiceRole) { throw 'Defina HMADV_SERVICE_ROLE ou passe -ServiceRole.' }

$warnings = New-Object System.Collections.Generic.List[string]

function New-Headers([string]$prefer = 'count=exact') {
  return @{
    apikey = $ServiceRole
    Authorization = "Bearer $ServiceRole"
    'Accept-Profile' = 'judiciario'
    Prefer = $prefer
  }
}

function Read-ErrorBody($exception) {
  try {
    $stream = $exception.Response.GetResponseStream()
    if (-not $stream) { return $null }
    $reader = New-Object System.IO.StreamReader($stream)
    $text = $reader.ReadToEnd()
    $reader.Close()
    return $text
  } catch {
    return $null
  }
}

function Invoke-JsonGet([string]$path) {
  try {
    return Invoke-RestMethod -Method Get -Uri "$ProjectUrl/rest/v1/$path" -Headers (New-Headers)
  } catch {
    $body = Read-ErrorBody $_.Exception
    if ($body) { $warnings.Add("GET $path -> $body") }
    else { $warnings.Add("GET $path -> $($_.Exception.Message)") }
    return $null
  }
}

function Get-Count([string]$table, [string]$filter = '', [switch]$Optional) {
  $suffix = if ($filter) { "?$filter" } else { '' }
  try {
    $resp = Invoke-WebRequest -Method Get -Uri "$ProjectUrl/rest/v1/$table$suffix" -Headers (New-Headers) -UseBasicParsing
    $line = $resp.Headers['Content-Range']
    if (-not $line) { return 0 }
    $match = [regex]::Match("$line", '/(?<count>\d+)')
    if ($match.Success) { return [int]$match.Groups['count'].Value }
    return 0
  } catch {
    if (-not $Optional) {
      $body = Read-ErrorBody $_.Exception
      if ($body) { $warnings.Add("COUNT $table -> $body") }
      else { $warnings.Add("COUNT $table -> $($_.Exception.Message)") }
    }
    return 0
  }
}

$tpuMovimentos = Get-Count 'tpu_movimento' 'select=id'
$tpuClasses = Get-Count 'tpu_classe' 'select=id'
$tpuAssuntos = Get-Count 'tpu_assunto' 'select=id'
$tpuDocumentos = Get-Count 'tpu_documento' 'select=id' -Optional
$tpuTiposComplemento = Get-Count 'tpu_tipo_complemento' 'select=id' -Optional
$tpuComplementos = Get-Count 'tpu_complemento' 'select=id' -Optional
$tpuComplementosMov = Get-Count 'tpu_complemento_movimento' 'select=id' -Optional
$tpuComplTabelado = Get-Count 'tpu_complemento_tabelado' 'select=id' -Optional
$tpuProcComplementos = Get-Count 'tpu_procedimento_complemento' 'select=id' -Optional
$tpuTemporariedade = Get-Count 'tpu_temporariedade' 'select=id' -Optional
$tpuTipoRamoJustica = Get-Count 'tpu_tipo_ramo_justica' 'select=id' -Optional
$tpuTempItem = Get-Count 'tpu_temp_item' 'select=id' -Optional
$movPendentes = Get-Count 'movimentos' 'select=id&movimento_tpu_id=is.null&codigo=not.is.null'
$movResolvidos = Get-Count 'movimentos' 'select=id&movimento_tpu_id=not.is.null'
$statusCount = Get-Count 'movimentos' 'select=id&tpu_status=eq.pendente' -Optional

$sampleResp = Invoke-JsonGet "movimentos?select=id,processo_id,codigo,descricao,movimento_tpu_id&movimento_tpu_id=is.null&codigo=not.is.null&limit=$SampleSize&order=data_movimento.desc"
$sampleRows = @()
if ($sampleResp) { $sampleRows = @($sampleResp) }

Write-Host ''
Write-Host 'HMADV - Validacao TPU / SGT'
Write-Host ("tpu_movimentos       : {0}" -f $tpuMovimentos)
Write-Host ("tpu_classes          : {0}" -f $tpuClasses)
Write-Host ("tpu_assuntos         : {0}" -f $tpuAssuntos)
Write-Host ("tpu_documentos       : {0}" -f $tpuDocumentos)
Write-Host ("tpu_tipo_complemento : {0}" -f $tpuTiposComplemento)
Write-Host ("tpu_complemento      : {0}" -f $tpuComplementos)
Write-Host ("tpu_compl_movimento  : {0}" -f $tpuComplementosMov)
Write-Host ("tpu_compl_tabelado   : {0}" -f $tpuComplTabelado)
Write-Host ("tpu_proc_compl       : {0}" -f $tpuProcComplementos)
Write-Host ("tpu_temporariedade   : {0}" -f $tpuTemporariedade)
Write-Host ("tpu_tipo_ramo_just   : {0}" -f $tpuTipoRamoJustica)
Write-Host ("tpu_temp_item        : {0}" -f $tpuTempItem)
Write-Host ("movs_pendentes_tpu   : {0}" -f $movPendentes)
Write-Host ("movs_resolvidos_tpu  : {0}" -f $movResolvidos)
Write-Host ("movs_status_pendente : {0}" -f $statusCount)
Write-Host ''
Write-Host 'Amostra de movimentos sem TPU:'
$sampleRows | ConvertTo-Json -Depth 5

if ($warnings.Count -gt 0) {
  Write-Host ''
  Write-Host 'Avisos de permissao/consulta:'
  $warnings | Select-Object -Unique | ForEach-Object { Write-Host $_ }
}
