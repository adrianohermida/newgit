param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$base = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  Prefer = "count=exact"
}

function Get-Count($url) {
  try {
    $res = Invoke-WebRequest -Method Get -Uri $url -Headers $headers -TimeoutSec 60
    $contentRange = $null
    if ($res.Headers -and $null -ne $res.Headers["Content-Range"]) {
      $contentRange = ($res.Headers["Content-Range"] -join "")
    }
    if ($contentRange) {
      $m = [regex]::Match($contentRange, "/(\d+)$")
      if ($m.Success) { return [int]$m.Groups[1].Value }
    }
    if ($res.Content) {
      $parsed = $res.Content | ConvertFrom-Json
      if ($parsed -is [System.Array]) { return $parsed.Count }
      if ($null -ne $parsed) { return 1 }
    }
    return 0
  } catch {
    return @{ erro = $_.Exception.Message }
  }
}

function Get-Sample($url) {
  try {
    return Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 60
  } catch {
    return @{ erro = $_.Exception.Message }
  }
}

$report = [ordered]@{
  checked_at = (Get-Date).ToString("s")
  prazo_regra_total = Get-Count "$base/prazo_regra?select=id"
  prazo_regra_ia = Get-Count "$base/prazo_regra?aplica_ia=is.true&select=id"
  prazo_regra_cpc = Get-Count "$base/prazo_regra?rito=eq.cpc&select=id"
  prazo_regra_penal = Get-Count "$base/prazo_regra?rito=eq.penal&select=id"
  prazo_regra_trabalhista = Get-Count "$base/prazo_regra?rito=eq.trabalhista&select=id"
  prazo_regra_juizados = Get-Count "$base/prazo_regra?rito=eq.juizados&select=id"
  estado_ibge_total = Get-Count "$base/estado_ibge?select=id"
  municipio_ibge_total = Get-Count "$base/municipio_ibge?select=id"
  feriado_forense_total = Get-Count "$base/feriado_forense?select=id"
  feriado_nacional_total = Get-Count "$base/feriado_forense?tipo=eq.nacional&select=id"
  feriado_estadual_total = Get-Count "$base/feriado_forense?tipo=eq.estadual&select=id"
  feriado_municipal_total = Get-Count "$base/feriado_forense?tipo=eq.municipal&select=id"
  calendario_advise_total = Get-Count "$base/calendario_forense_fonte?tipo=eq.advise_dje&select=id"
  prazo_calculado_total = Get-Count "$base/prazo_calculado?select=id"
  sample_regras_ia = Get-Sample "$base/prazo_regra?aplica_ia=is.true&select=id,ato_praticado,base_legal,prazo_texto_original,tipo_contagem,rito&limit=10"
  sample_regras_cpc = Get-Sample "$base/prazo_regra?rito=eq.cpc&select=id,ato_praticado,prazo_dias,tipo_contagem&limit=10"
  sample_feriados = Get-Sample "$base/feriado_forense?select=id,nome,data_feriado,tipo,estado_uf,municipio_codigo_ibge,recorrente&limit=10"
  sample_calendario_advise = Get-Sample "$base/calendario_forense_fonte?tipo=eq.advise_dje&select=id,nome,tipo,metadata&limit=10"
}

$report | ConvertTo-Json -Depth 8
