param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$BatchSize = 1000
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$restBase = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  Accept = "application/json"
}

function Invoke-JsonPaged([string]$path) {
  $all = @()
  $offset = 0
  while ($true) {
    $url = "$restBase/$path&limit=$BatchSize&offset=$offset"
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -Headers $headers -TimeoutSec 120
      $parsed = $resp.Content | ConvertFrom-Json
      $rows = @($parsed)
    } catch {
      break
    }
    if (-not $rows -or $rows.Count -eq 0) { break }
    $all += $rows
    if ($rows.Count -lt $BatchSize) { break }
    $offset += $BatchSize
  }
  return $all
}

function Normalize-Keyword([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  return (($sb.ToString().Normalize([Text.NormalizationForm]::FormC).ToUpperInvariant()) -replace '\s+', ' ').Trim()
}

function Test-LeilaoKeyword($rawPayload) {
  $keywords = @()
  if ($null -ne $rawPayload -and $null -ne $rawPayload.palavrasChave) {
    $keywords = @($rawPayload.palavrasChave)
  }
  foreach ($kw in $keywords) {
    $norm = Normalize-Keyword ([string]$kw)
    if ($norm -eq "LEILAO" -or $norm -eq "LEILOES") {
      return $true
    }
  }
  return $false
}

function Test-AudienciaSignal([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  return $text -match '(?i)audiencia|audiência|sess[aã]o de julgamento|designad[ao].{0,40}aud|redesignad[ao].{0,40}aud'
}

$publicacoes = @(Invoke-JsonPaged "publicacoes?select=id,processo_id,freshsales_activity_id,conteudo,raw_payload")
$processos = @(Invoke-JsonPaged "processos?select=id,account_id_freshsales,data_ajuizamento,polo_ativo,polo_passivo")
$partes = @(Invoke-JsonPaged "partes?select=id,processo_id,nome,polo")
$audiencias = @(Invoke-JsonPaged "audiencias?select=id,processo_id,data_audiencia,titulo,descricao,freshsales_activity_id")

$processosById = @{}
foreach ($proc in $processos) {
  $processosById[[string]$proc.id] = $proc
}

$partesByProcesso = @{}
foreach ($parte in $partes) {
  $processoId = [string]$parte.processo_id
  if (-not $partesByProcesso.ContainsKey($processoId)) {
    $partesByProcesso[$processoId] = @()
  }
  $partesByProcesso[$processoId] += $parte
}

$audienciasByProcesso = @{}
foreach ($aud in $audiencias) {
  $processoId = [string]$aud.processo_id
  if (-not $audienciasByProcesso.ContainsKey($processoId)) {
    $audienciasByProcesso[$processoId] = @()
  }
  $audienciasByProcesso[$processoId] += $aud
}

$pubsComActivityReal = 0
$pubsLeilaoIgnorado = 0
$pubsPendentesComAccount = 0
$pubsPendentesNaoLeilaoComAccount = 0
$pubsPendentesLeilaoComAccount = 0
$pubsComSinalAudiencia = 0
$pubsComSinalAudienciaSemLinha = 0
$pubsComSinalAudienciaSemActivity = 0

$processosComPublicacao = New-Object 'System.Collections.Generic.HashSet[string]'
$processosComSinalAudiencia = New-Object 'System.Collections.Generic.HashSet[string]'

foreach ($pub in $publicacoes) {
  $processoId = [string]$pub.processo_id
  if (-not [string]::IsNullOrWhiteSpace($processoId)) {
    [void]$processosComPublicacao.Add($processoId)
  }

  $activityId = [string]$pub.freshsales_activity_id
  $proc = if ($processosById.ContainsKey($processoId)) { $processosById[$processoId] } else { $null }
  $hasAccount = ($null -ne $proc -and -not [string]::IsNullOrWhiteSpace([string]$proc.account_id_freshsales))
  $isLeilao = Test-LeilaoKeyword $pub.raw_payload

  if (-not [string]::IsNullOrWhiteSpace($activityId) -and $activityId -ne "LEILAO_IGNORADO") {
    $pubsComActivityReal += 1
  }
  if ($activityId -eq "LEILAO_IGNORADO") {
    $pubsLeilaoIgnorado += 1
  }
  if ([string]::IsNullOrWhiteSpace($activityId) -and $hasAccount) {
    $pubsPendentesComAccount += 1
    if ($isLeilao) {
      $pubsPendentesLeilaoComAccount += 1
    } else {
      $pubsPendentesNaoLeilaoComAccount += 1
    }
  }

  if (Test-AudienciaSignal ([string]$pub.conteudo)) {
    $pubsComSinalAudiencia += 1
    if (-not [string]::IsNullOrWhiteSpace($processoId)) {
      [void]$processosComSinalAudiencia.Add($processoId)
      $audsProc = if ($audienciasByProcesso.ContainsKey($processoId)) { @($audienciasByProcesso[$processoId]) } else { @() }
      if ($audsProc.Count -eq 0) {
        $pubsComSinalAudienciaSemLinha += 1
      } elseif (@($audsProc | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.freshsales_activity_id) }).Count -eq 0) {
        $pubsComSinalAudienciaSemActivity += 1
      }
    }
  }
}

$processosComPublicacaoSemPartes = 0
$processosComPublicacaoSemPolos = 0
foreach ($processoId in $processosComPublicacao) {
  $partsProc = if ($partesByProcesso.ContainsKey($processoId)) { @($partesByProcesso[$processoId]) } else { @() }
  if ($partsProc.Count -eq 0) { $processosComPublicacaoSemPartes += 1 }
  $proc = $processosById[$processoId]
  if ($null -ne $proc -and [string]::IsNullOrWhiteSpace([string]$proc.polo_ativo) -and [string]::IsNullOrWhiteSpace([string]$proc.polo_passivo)) {
    $processosComPublicacaoSemPolos += 1
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  publicacoes_total = $publicacoes.Count
  publicacoes_com_activity_real = $pubsComActivityReal
  publicacoes_leilao_ignorado = $pubsLeilaoIgnorado
  publicacoes_pendentes_com_account = $pubsPendentesComAccount
  publicacoes_pendentes_nao_leilao_com_account = $pubsPendentesNaoLeilaoComAccount
  publicacoes_pendentes_leilao_com_account = $pubsPendentesLeilaoComAccount
  processos_total = $processos.Count
  processos_com_account = @($processos | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.account_id_freshsales) }).Count
  processos_sem_account = @($processos | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.account_id_freshsales) }).Count
  processos_com_data_ajuizamento = @($processos | Where-Object { $_.data_ajuizamento }).Count
  processos_sem_data_ajuizamento = @($processos | Where-Object { -not $_.data_ajuizamento }).Count
  partes_total = $partes.Count
  processos_com_publicacoes = $processosComPublicacao.Count
  processos_com_publicacoes_sem_partes = $processosComPublicacaoSemPartes
  processos_com_publicacoes_sem_polos_no_processo = $processosComPublicacaoSemPolos
  audiencias_total = $audiencias.Count
  processos_com_sinal_audiencia_em_publicacoes = $processosComSinalAudiencia.Count
  publicacoes_com_sinal_audiencia = $pubsComSinalAudiencia
  publicacoes_com_sinal_audiencia_sem_linha_audiencia = $pubsComSinalAudienciaSemLinha
  publicacoes_com_sinal_audiencia_sem_activity = $pubsComSinalAudienciaSemActivity
} | ConvertTo-Json -Depth 6
