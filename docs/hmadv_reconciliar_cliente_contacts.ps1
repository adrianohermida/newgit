param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$Aplicar,
  [string[]]$ProcessoIds,
  [int]$Limite = 50,
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
$readHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
}
$publicReadHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
}
$writeHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Profile" = "judiciario"
  "Content-Type" = "application/json; charset=utf-8"
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
    return @(Invoke-RestMethod -Method Get -Uri $url -Headers $readHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Invoke-PublicJsonGet([string]$url) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri $url -Headers $publicReadHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Invoke-JsonPatch([string]$table, [string]$filter, $payload) {
  $json = $payload | ConvertTo-Json -Depth 8 -Compress
  return Invoke-RestMethod -Method Patch -Uri "$restBase/$table?$filter" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $json -TimeoutSec 120
}

function Invoke-JsonPost([string]$table, $payload) {
  $json = $payload | ConvertTo-Json -Depth 8 -Compress
  return Invoke-RestMethod -Method Post -Uri "$restBase/$table" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $json -TimeoutSec 120
}

function Get-Processes() {
  $select = "id,numero_cnj,account_id_freshsales,polo_ativo,polo_passivo,titulo"
  if ($ProcessoIds -and $ProcessoIds.Count -gt 0) {
    $ids = ($ProcessoIds | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() }) -join ","
    return @(Invoke-JsonGet "$restBase/processos?id=in.($ids)&select=$select")
  }
  return @(Invoke-JsonGet "$restBase/processos?account_id_freshsales=not.is.null&select=$select&limit=$Limite")
}

function Get-Partes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/partes?processo_id=eq.$processoId&select=id,nome,polo,documento,tipo_pessoa,cliente_hmadv,representada_pelo_escritorio,contato_freshsales_id,principal_no_account&order=created_at.asc")
}

function Get-Publicacoes([string]$processoId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,data_publicacao,raw_payload&order=data_publicacao.desc.nullslast&limit=10")
}

function Get-FreshsalesContacts() {
  return @(Invoke-PublicJsonGet "$restBase/freshsales_contacts?select=id,freshsales_contact_id,name,email,email_normalized,phone,phone_normalized&limit=5000")
}

function Get-ExistingProcessoContatoSync([string]$processoId, [string]$contactId) {
  return @(Invoke-JsonGet "$restBase/processo_contato_sync?processo_id=eq.$processoId&contact_id_freshsales=eq.$contactId&select=id,processo_id,parte_id,contact_id_freshsales")
}

function Publication-HasOfficeMarker($publicacoes) {
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
          return @{ matched = $true; termo = $term; fonte = "raw_payload"; publicacao_id = $pub.id; texto = $candidate }
        }
      }
    }

    $text = Normalize-Text $pub.conteudo
    if (-not $text) { continue }
    foreach ($term in @($OfficeTerms)) {
      $needle = Normalize-Text $term
      if ($needle -and $text -like "*$needle*") {
        return @{ matched = $true; termo = $term; fonte = "termo"; publicacao_id = $pub.id; texto = $text }
      }
    }
    foreach ($oab in @($OfficeOabs)) {
      $needle = (Normalize-Text $oab) -replace '[^A-Z0-9]', ''
      if (-not $needle) { continue }
      $compact = $text -replace '[^A-Z0-9]', ''
      if ($compact -like "*$needle*") {
        return @{ matched = $true; termo = $oab; fonte = "oab"; publicacao_id = $pub.id; texto = $text }
      }
    }
  }
  return @{ matched = $false }
}

function Infer-RepresentedPole($processo, $markerInfo, $partes) {
  if (-not $markerInfo.matched) { return $null }

  $texts = @()
  foreach ($pub in @(Get-Publicacoes $processo.id)) {
    $text = Normalize-Text $pub.conteudo
    if ($text) { $texts += $text }
  }
  $joined = ($texts -join " || ")

  $activeHints = @(
    "PARTE EXEQUENTE",
    "PARTE AUTORA",
    "PARTE REQUERENTE",
    "AGRAVANTE",
    "EXEQUENTE",
    "AUTOR",
    "REQUERENTE"
  ) | ForEach-Object { Normalize-Text $_ }
  $passiveHints = @(
    "PARTE EXECUTADA",
    "PARTE REQUERIDA",
    "PARTE RE",
    "AGRAVADO",
    "EXECUTADO",
    "REQUERIDO",
    "REU"
  ) | ForEach-Object { Normalize-Text $_ }

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

function Test-HasContactIdentifier($parte) {
  $documento = [string]($(if ($null -ne $parte.documento) { $parte.documento } else { '' })).Trim()
  return -not [string]::IsNullOrWhiteSpace($documento)
}

function Get-BestFreshsalesContactMatch($parte, $freshsalesContacts) {
  $target = Normalize-Text $parte.nome
  if (-not $target) { return $null }

  $matches = @()
  foreach ($contact in @($freshsalesContacts)) {
    $contactName = Normalize-Text $contact.name
    if (-not $contactName) { continue }
    $score = 0.0
    if ($contactName -eq $target) {
      $score = 1.0
    } elseif ($contactName -like "*$target*" -or $target -like "*$contactName*") {
      $score = 0.9
    } else {
      continue
    }

    $matches += [pscustomobject]@{
      id = $contact.id
      freshsales_contact_id = $contact.freshsales_contact_id
      name = $contact.name
      email = $contact.email
      phone = $contact.phone
      score = $score
    }
  }

  $ordered = @($matches | Sort-Object -Property @{ Expression = "score"; Descending = $true }, @{ Expression = "name"; Descending = $false })
  if ($ordered.Count -eq 0) { return $null }
  $best = $ordered[0]
  $sameTop = @($ordered | Where-Object { $_.score -eq $best.score })
  return [pscustomobject]@{
    best = $best
    total_matches = $ordered.Count
    ambiguous = ($sameTop.Count -gt 1)
    candidates = $ordered | Select-Object -First 5
  }
}

$processos = Get-Processes
$freshsalesContacts = Get-FreshsalesContacts
$sample = @()
$applied = 0
$withEvidence = 0
$withoutEvidence = 0
$withCrmBlock = 0
$withContactSuggestion = 0
$withContactLinked = 0

foreach ($proc in @($processos)) {
  $partes = Get-Partes $proc.id
  if (@($partes).Count -eq 0) { continue }

  $publicacoes = Get-Publicacoes $proc.id
  $marker = Publication-HasOfficeMarker $publicacoes
  $representedPole = Infer-RepresentedPole $proc $marker $partes
  $candidatas = @($partes | Where-Object { $_.polo -eq $representedPole })
  $principal = Select-PrincipalParte $candidatas $proc $representedPole
  $partePatches = @()
  $contactSuggestion = $null

  if ($principal) {
    $withEvidence += 1
    $contactSuggestion = Get-BestFreshsalesContactMatch $principal $freshsalesContacts
    if ($contactSuggestion) { $withContactSuggestion += 1 }
    $safeContactLink = $contactSuggestion -and -not $contactSuggestion.ambiguous -and $contactSuggestion.best.score -ge 1.0
    foreach ($parte in $candidatas) {
      $patch = [ordered]@{
        representada_pelo_escritorio = $true
        cliente_hmadv = $true
        principal_no_account = ($parte.id -eq $principal.id)
      }
      if (($parte.id -eq $principal.id) -and $safeContactLink) {
        $patch["contato_freshsales_id"] = [string]$contactSuggestion.best.freshsales_contact_id
      }
      $partePatches += [pscustomobject]@{
        parte_id = $parte.id
        nome = $parte.nome
        polo = $parte.polo
        has_contact_identifier = (Test-HasContactIdentifier $parte)
        freshsales_contact_suggestion = if ($parte.id -eq $principal.id) { $contactSuggestion } else { $null }
        patch = $patch
      }
    }
    if ($safeContactLink) { $withContactLinked += 1 }
  } else {
    $withoutEvidence += 1
  }

  $entry = [ordered]@{
    processo_id = $proc.id
    numero_cnj = $proc.numero_cnj
    account_id_freshsales = $proc.account_id_freshsales
    marker = $marker
    represented_pole = $representedPole
    partes_total = @($partes).Count
    partes_candidatas = @($candidatas).Count
    principal_parte_id = $principal.id
    principal_nome = $principal.nome
    freshsales_contacts_total = @($freshsalesContacts).Count
    contact_suggestion = $contactSuggestion
    parte_patches = $partePatches
    bloqueio_crm = if ($principal -and $contactSuggestion -and $contactSuggestion.ambiguous) {
      "match_ambiguo_freshsales"
    } elseif ($principal -and -not (Test-HasContactIdentifier $principal) -and -not ($contactSuggestion -and -not $contactSuggestion.ambiguous -and $contactSuggestion.best.score -ge 1.0)) {
      "parte_sem_documento_identificador"
    } elseif (-not $principal) {
      "sem_evidencia_forte_para_cliente"
    } else {
      $null
    }
  }

  if ($entry.bloqueio_crm) {
    $withCrmBlock += 1
  }

  if ($Aplicar -and @($partePatches).Count -gt 0) {
    $resultados = @()
    foreach ($partePatch in $partePatches) {
      try {
        $resultados += Invoke-JsonPatch "partes" "id=eq.$($partePatch.parte_id)" $partePatch.patch
        if ($partePatch.patch.contato_freshsales_id) {
          $existing = Get-ExistingProcessoContatoSync $proc.id ([string]$partePatch.patch.contato_freshsales_id)
          if (@($existing).Count -eq 0) {
            $syncPayload = [ordered]@{
              processo_id = $proc.id
              parte_id = $partePatch.parte_id
              contact_id_freshsales = [string]$partePatch.patch.contato_freshsales_id
              relacao = if ($partePatch.polo -eq "ativo") { "cliente_principal" } elseif ($partePatch.polo -eq "passivo") { "parte_relacionada" } else { "parte" }
              principal = [bool]$partePatch.patch.principal_no_account
              origem = "fase8_reconciliador"
              metadata = @{
                numero_cnj = $proc.numero_cnj
                marker = $marker
                score = if ($partePatch.freshsales_contact_suggestion) { $partePatch.freshsales_contact_suggestion.best.score } else { $null }
              }
            }
            [void](Invoke-JsonPost "processo_contato_sync" $syncPayload)
          }
        }
        $applied += 1
      } catch {
        $resultados += @{ erro = $_.Exception.Message; parte_id = $partePatch.parte_id }
      }
    }
    $entry["resultado"] = $resultados
  }

  if (@($partePatches).Count -gt 0 -or ($ProcessoIds -and $ProcessoIds.Count -gt 0)) {
    $sample += $entry
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  office_terms = $OfficeTerms
  office_oabs = $OfficeOabs
  processos_lidos = @($processos).Count
  freshsales_contacts_total = @($freshsalesContacts).Count
  processos_com_evidencia_forte = $withEvidence
  processos_sem_evidencia_forte = $withoutEvidence
  processos_com_bloqueio_crm = $withCrmBlock
  processos_com_sugestao_contact = $withContactSuggestion
  processos_com_contact_vinculavel = $withContactLinked
  partes_aplicadas = $applied
  sample = $sample | Select-Object -First 20
} | ConvertTo-Json -Depth 10
