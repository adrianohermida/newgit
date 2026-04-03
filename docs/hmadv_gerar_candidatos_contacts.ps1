param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$Limite = 50,
  [string[]]$OfficeTerms = @(
    "ADRIANO MENEZES HERMIDA MAIA",
    "ADRIANO HERMIDA MAIA",
    "HERMIDA MAIA",
    "ADRIANO MENEZES"
  )
)

if (-not $ServiceRole) {
  throw "Defina -ServiceRole ou a env:HMADV_SERVICE_ROLE"
}

$restBase = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$headers = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
}

function Normalize-Text([string]$value) {
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

function Invoke-JsonGet([string]$url) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Get-Processes() {
  return @(Invoke-JsonGet "$restBase/processos?account_id_freshsales=not.is.null&select=id,numero_cnj,account_id_freshsales,polo_ativo,polo_passivo,titulo&limit=$Limite")
}

function Get-Partes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/partes?processo_id=eq.$processoId&select=id,nome,polo,documento,tipo_pessoa&order=created_at.asc")
}

function Get-Publicacoes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,raw_payload,data_publicacao&order=data_publicacao.desc.nullslast&limit=10")
}

function Find-Marker($publicacoes) {
  foreach ($pub in @($publicacoes)) {
    $raw = $pub.raw_payload
    $candidates = @(
      Normalize-Text $raw.nomeCliente,
      Normalize-Text $raw.nomeUsuarioCliente
    ) | Where-Object { $_ }
    foreach ($candidate in $candidates) {
      foreach ($term in @($OfficeTerms)) {
        $needle = Normalize-Text $term
        if ($needle -and $candidate -like "*$needle*") {
          return [pscustomobject]@{
            matched = $true
            termo = $term
            publicacao_id = $pub.id
            raw_payload = $raw
          }
        }
      }
    }
  }
  return [pscustomobject]@{ matched = $false }
}

function Infer-RepresentedPole($processo, $publicacoes, $partes) {
  $texts = @()
  foreach ($pub in @($publicacoes)) {
    $text = Normalize-Text $pub.conteudo
    if ($text) { $texts += $text }
  }
  $joined = ($texts -join " || ")

  $activeHints = @("PARTE EXEQUENTE","PARTE AUTORA","PARTE REQUERENTE","AGRAVANTE","EXEQUENTE","AUTOR","REQUERENTE","RECLAMANTE") | ForEach-Object { Normalize-Text $_ }
  $passiveHints = @("PARTE EXECUTADA","PARTE REQUERIDA","PARTE RE","AGRAVADO","EXECUTADO","REQUERIDO","REU","RECLAMADO") | ForEach-Object { Normalize-Text $_ }

  foreach ($hint in $activeHints) {
    if ($joined -like "*$hint*") { return "ativo" }
  }
  foreach ($hint in $passiveHints) {
    if ($joined -like "*$hint*") { return "passivo" }
  }

  $ativos = @($partes | Where-Object { $_.polo -eq "ativo" })
  $passivos = @($partes | Where-Object { $_.polo -eq "passivo" })
  if ($ativos.Count -gt 0 -and $passivos.Count -eq 0) { return "ativo" }
  if ($passivos.Count -gt 0 -and $ativos.Count -eq 0) { return "passivo" }
  return $null
}

function Select-PrincipalParte($candidatas, $processo, [string]$polo) {
  if (@($candidatas).Count -eq 0) { return $null }
  $target = Normalize-Text ($(if ($polo -eq "ativo") { $processo.polo_ativo } else { $processo.polo_passivo }))
  if ($target) {
    $exact = @($candidatas | Where-Object { (Normalize-Text $_.nome) -eq $target })
    if ($exact.Count -gt 0) { return $exact[0] }
  }
  return $candidatas[0]
}

function Extract-EmailFromText([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $m = [regex]::Match($text, '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($m.Success) { return $m.Value.ToLowerInvariant() }
  return $null
}

function Extract-PhoneFromText([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $digits = ($text -replace '\D', '')
  if ($digits.Length -ge 10 -and $digits.Length -le 13) { return $digits }
  return $null
}

$processos = Get-Processes
$sample = @()
$withMarker = 0
$withCandidate = 0
$withEmail = 0
$withPhone = 0
$withoutIdentifier = 0

foreach ($proc in @($processos)) {
  $partes = Get-Partes $proc.id
  $publicacoes = Get-Publicacoes $proc.id
  $marker = Find-Marker $publicacoes
  if (-not $marker.matched) { continue }
  $withMarker += 1

  $representedPole = Infer-RepresentedPole $proc $publicacoes $partes
  $candidatas = @($partes | Where-Object { $_.polo -eq $representedPole })
  $principal = Select-PrincipalParte $candidatas $proc $representedPole
  if (-not $principal) { continue }
  $withCandidate += 1

  $joinedText = (@($publicacoes | ForEach-Object { $_.conteudo }) -join " || ")
  $email = Extract-EmailFromText $joinedText
  $phone = Extract-PhoneFromText $joinedText
  if ($email) { $withEmail += 1 }
  if ($phone) { $withPhone += 1 }
  if (-not $email -and -not $phone -and [string]::IsNullOrWhiteSpace([string]$principal.documento)) {
    $withoutIdentifier += 1
  }

  $sample += [pscustomobject]@{
    processo_id = $proc.id
    numero_cnj = $proc.numero_cnj
    account_id_freshsales = $proc.account_id_freshsales
    represented_pole = $representedPole
    principal_parte_id = $principal.id
    principal_nome = $principal.nome
    email_candidato = $email
    phone_candidato = $phone
    documento = $principal.documento
    tipo_pessoa = $principal.tipo_pessoa
    publicacao_marker_id = $marker.publicacao_id
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  processos_lidos = @($processos).Count
  processos_com_marker = $withMarker
  processos_com_cliente_candidato = $withCandidate
  candidatos_com_email = $withEmail
  candidatos_com_telefone = $withPhone
  candidatos_sem_identificador = $withoutIdentifier
  sample = $sample | Select-Object -First 25
} | ConvertTo-Json -Depth 8
