param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [int]$Limite = 100,
  [string[]]$OfficeTerms = @(
    "ADRIANO MENEZES HERMIDA MAIA",
    "ADRIANO HERMIDA MAIA",
    "HERMIDA MAIA",
    "ADRIANO MENEZES"
  ),
  [string[]]$OfficeOabs = @()
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
$publicHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
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

function Invoke-PublicJsonGet([string]$url) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri $url -Headers $publicHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Get-Processes() {
  return @(Invoke-JsonGet "$restBase/processos?account_id_freshsales=not.is.null&select=id,numero_cnj,account_id_freshsales,polo_ativo,polo_passivo&limit=$Limite")
}

function Get-Partes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/partes?processo_id=eq.$processoId&select=id,nome,polo,documento,tipo_pessoa")
}

function Get-Publicacoes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,data_publicacao,raw_payload&order=data_publicacao.desc.nullslast&limit=10")
}

function Get-FreshsalesContacts() {
  return @(Invoke-PublicJsonGet "$restBase/freshsales_contacts?select=id,freshsales_contact_id,name,email,phone&limit=5000")
}

function Find-Marker($publicacoes) {
  foreach ($pub in @($publicacoes)) {
    $raw = $pub.raw_payload
    $rawCandidates = @(
      Normalize-Text $raw.nomeCliente,
      Normalize-Text $raw.nomeUsuarioCliente
    ) | Where-Object { $_ }

    foreach ($candidate in $rawCandidates) {
      foreach ($term in @($OfficeTerms)) {
        $needle = Normalize-Text $term
        if ($needle -and $candidate -like "*$needle*") {
          return [pscustomobject]@{
            matched = $true
            termo = $term
            tipo = "raw_payload"
            publicacao_id = $pub.id
          }
        }
      }
    }

    $text = Normalize-Text $pub.conteudo
    if (-not $text) { continue }
    foreach ($term in @($OfficeTerms)) {
      $needle = Normalize-Text $term
      if ($needle -and $text -like "*$needle*") {
        return [pscustomobject]@{
          matched = $true
          termo = $term
          tipo = "termo"
          publicacao_id = $pub.id
        }
      }
    }
    foreach ($oab in @($OfficeOabs)) {
      $needle = (Normalize-Text $oab) -replace '[^A-Z0-9]', ''
      if (-not $needle) { continue }
      $compact = $text -replace '[^A-Z0-9]', ''
      if ($compact -like "*$needle*") {
        return [pscustomobject]@{
          matched = $true
          termo = $oab
          tipo = "oab"
          publicacao_id = $pub.id
        }
      }
    }
  }
  return [pscustomobject]@{ matched = $false }
}

$processos = Get-Processes
$freshsalesContacts = Get-FreshsalesContacts
$sample = @()
$markerCount = 0
$processosComParte = 0
$processosComDocumento = 0
$partesTotal = 0
$partesComDocumento = 0

foreach ($proc in @($processos)) {
  $partes = Get-Partes $proc.id
  $publicacoes = Get-Publicacoes $proc.id
  $marker = Find-Marker $publicacoes

  if ($marker.matched) { $markerCount += 1 }
  if (@($partes).Count -gt 0) { $processosComParte += 1 }

  $docsThisProc = 0
  foreach ($parte in @($partes)) {
    $partesTotal += 1
    $documento = [string]($(if ($null -ne $parte.documento) { $parte.documento } else { '' })).Trim()
    if (-not [string]::IsNullOrWhiteSpace($documento)) {
      $partesComDocumento += 1
      $docsThisProc += 1
    }
  }
  if ($docsThisProc -gt 0) { $processosComDocumento += 1 }

  if ($marker.matched -or @($partes).Count -eq 0 -or $docsThisProc -eq 0) {
    $sample += [pscustomobject]@{
      processo_id = $proc.id
      numero_cnj = $proc.numero_cnj
      account_id_freshsales = $proc.account_id_freshsales
      partes_total = @($partes).Count
      partes_com_documento = $docsThisProc
      marker = $marker
    }
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  office_terms = $OfficeTerms
  office_oabs = $OfficeOabs
  processos_lidos = @($processos).Count
  freshsales_contacts_total = @($freshsalesContacts).Count
  processos_com_partes = $processosComParte
  processos_com_marker_escritorio = $markerCount
  processos_com_algum_documento = $processosComDocumento
  partes_total = $partesTotal
  partes_com_documento = $partesComDocumento
  sample = $sample | Select-Object -First 25
} | ConvertTo-Json -Depth 10
