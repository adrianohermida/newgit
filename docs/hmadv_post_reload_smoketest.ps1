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
  "Content-Type" = "application/json"
}

function Invoke-Test($name, [scriptblock]$action) {
  try {
    $result = & $action
    return [ordered]@{
      teste = $name
      ok = $true
      resultado = $result
    }
  } catch {
    $msg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return [ordered]@{
      teste = $name
      ok = $false
      erro = $msg
    }
  }
}

$processoId = "fdebde7d-11f5-4717-b32f-e6391abe8403"

$tests = @()

$tests += Invoke-Test "patch_processos_status" {
  $body = [System.Text.Encoding]::UTF8.GetBytes('{"status_atual_processo":"Ativo","status_fonte":"fallback","status_evento_origem":"smoketest"}')
  Invoke-RestMethod -Method Patch -Uri "$base/processos?id=eq.$processoId" -Headers ($headers + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

$tests += Invoke-Test "post_prazo_regra" {
  $body = [System.Text.Encoding]::UTF8.GetBytes('[{"ato_praticado":"Teste prazo smoketest","base_legal":"HMADV","artigo":"1","prazo_texto_original":"5","prazo_dias":5,"tipo_contagem":"dias_corridos","ramo":"civel","rito":"teste","aplica_ia":false,"ativo":true,"metadata":{"origem":"smoketest"}}]')
  Invoke-RestMethod -Method Post -Uri "$base/prazo_regra" -Headers ($headers + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

$tests += Invoke-Test "get_prazo_regra" {
  Invoke-RestMethod -Method Get -Uri "$base/prazo_regra?select=id,ato_praticado,rito&limit=3" -Headers $headers -TimeoutSec 120
}

$tests += Invoke-Test "post_prazo_regra_alias" {
  $regra = Invoke-RestMethod -Method Get -Uri "$base/prazo_regra?ato_praticado=eq.Teste%20prazo%20smoketest&select=id&limit=1" -Headers $headers -TimeoutSec 120
  if (-not $regra -or $regra.Count -eq 0) {
    throw "Regra de smoketest não encontrada"
  }
  $regraId = $regra[0].id
  $body = [System.Text.Encoding]::UTF8.GetBytes(("[{{""prazo_regra_id"":""{0}"",""alias"":""teste prazo smoketest"",""peso"":10,""origem"":""smoketest"",""metadata"":{{}}}}]" -f $regraId))
  Invoke-RestMethod -Method Post -Uri "$base/prazo_regra_alias" -Headers ($headers + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  tests = $tests
} | ConvertTo-Json -Depth 10
