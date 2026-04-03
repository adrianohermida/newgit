param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [string]$FreshsalesApiBase = $env:FRESHSALES_API_BASE,
  [string]$FreshsalesApiKey = $env:FRESHSALES_API_KEY,
  [string]$ContactTypeField = $(if ($env:FRESHSALES_CONTACT_TYPE_FIELD) { $env:FRESHSALES_CONTACT_TYPE_FIELD } else { "cf_tipo" }),
  [int]$FreshsalesMinIntervalMs = $(if ($env:FRESHSALES_MIN_INTERVAL_MS) { [int]$env:FRESHSALES_MIN_INTERVAL_MS } else { 4500 }),
  [switch]$Aplicar,
  [string[]]$ProcessoIds,
  [int]$Limite = 25,
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
if (-not $FreshsalesApiBase) {
  throw "Defina -FreshsalesApiBase ou a env:FRESHSALES_API_BASE"
}
if (-not $FreshsalesApiKey) {
  throw "Defina -FreshsalesApiKey ou a env:FRESHSALES_API_KEY"
}

$restBase = "https://sspvizogbcyigquqycsz.supabase.co/rest/v1"
$readHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
}
$writeHeaders = @{
  apikey = $ServiceRole
  Authorization = "Bearer $ServiceRole"
  "Accept-Profile" = "judiciario"
  "Content-Profile" = "judiciario"
  "Content-Type" = "application/json; charset=utf-8"
}

$script:FreshsalesLastRequestAt = [datetime]::MinValue

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

function Split-Name([string]$name) {
  $parts = @([string]$name -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($parts.Count -eq 0) {
    return @{ first_name = "Contato"; last_name = "HMADV" }
  }
  if ($parts.Count -eq 1) {
    return @{ first_name = $parts[0]; last_name = "HMADV" }
  }
  return @{
    first_name = $parts[0]
    last_name = ($parts[1..($parts.Count - 1)] -join " ")
  }
}

function Normalize-FreshsalesBase([string]$raw) {
  $base = $raw.Trim().TrimEnd('/')
  if ($base -match '/api$') { return $base }
  if ($base -match '\.freshsales\.io$') { return "$base/api" }
  if ($base -match '/crm/sales$') { return "$base/api" }
  if ($base -match 'myfreshworks\.com/crm/sales$') { return "$base/api" }
  return "$base/api"
}

function Invoke-JsonGet([string]$url) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri $url -Headers $readHeaders -TimeoutSec 120)
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
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processoId&select=id,conteudo,raw_payload,data_publicacao&order=data_publicacao.desc.nullslast&limit=10")
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
  }
  return @{ matched = $false }
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

function Get-ContactRole($parte, [string]$representedPole) {
  if ($parte.polo -eq $representedPole) { return "Cliente" }
  if ($parte.polo -eq "ativo" -or $parte.polo -eq "passivo") { return "Parte Adversa" }
  return "Terceiro Interessado"
}

function Build-ExternalId([string]$processoId, [string]$parteId, [string]$role) {
  $roleNorm = $role.ToLowerInvariant() -replace '\s+', '_'
  return "hmadv:processo:$($processoId):parte:$($parteId):tipo:$($roleNorm)"
}

function Invoke-FreshsalesRequest([string]$method, [string]$path, $body = $null) {
  $base = Normalize-FreshsalesBase $FreshsalesApiBase
  $headers = @{
    Authorization = "Token token=$FreshsalesApiKey"
    Accept = "application/json"
    "Content-Type" = "application/json"
  }
  $json = if ($null -ne $body) { $body | ConvertTo-Json -Depth 10 -Compress } else { $null }
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    $elapsed = ((Get-Date) - $script:FreshsalesLastRequestAt).TotalMilliseconds
    $waitMs = [Math]::Max(0, $FreshsalesMinIntervalMs - [int][Math]::Floor($elapsed))
    if ($waitMs -gt 0) {
      Start-Sleep -Milliseconds $waitMs
    }
    $script:FreshsalesLastRequestAt = Get-Date
    try {
      if ($null -ne $json) {
        return Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $headers -Body $json -TimeoutSec 120
      }
      return Invoke-RestMethod -Method $method -Uri "$base$path" -Headers $headers -TimeoutSec 120
    } catch {
      if ($_.Exception.Response) {
        $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
        $text = $reader.ReadToEnd()
        $reader.Close()
        $statusCode = 0
        try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
        if (($statusCode -eq 429 -or $statusCode -ge 500) -and $attempt -lt 4) {
          Start-Sleep -Seconds (5 * $attempt)
          continue
        }
        throw $text
      }
      if ($attempt -lt 4) {
        Start-Sleep -Seconds (5 * $attempt)
        continue
      }
      throw
    }
  }
}

function Upsert-FreshsalesContact($parte, $proc, [string]$role) {
  $nameParts = Split-Name $parte.nome
  $externalId = Build-ExternalId $proc.id $parte.id $role
  $contactPayload = @{
    unique_identifier = @{
      external_id = $externalId
    }
    contact = @{
      first_name = $nameParts.first_name
      last_name = $nameParts.last_name
      external_id = $externalId
      custom_field = @{
        $ContactTypeField = $role
      }
    }
  }

  try {
    $upsert = Invoke-FreshsalesRequest "Post" "/contacts/upsert" $contactPayload
    return @{
      ok = $true
      mode = "upsert"
      contact = $upsert.contact
      request = $contactPayload
    }
  } catch {
    $fallbackPayload = @{
      contact = @{
        first_name = $nameParts.first_name
        last_name = $nameParts.last_name
        external_id = $externalId
        custom_field = @{
          $ContactTypeField = $role
        }
      }
    }
    try {
      $created = Invoke-FreshsalesRequest "Post" "/contacts" $fallbackPayload
      return @{
        ok = $true
        mode = "create"
        contact = $created.contact
        request = $fallbackPayload
      }
    } catch {
      return @{
        ok = $false
        mode = "failed"
        error = [string]$_
        request = $contactPayload
      }
    }
  }
}

function Get-ExistingProcessoContatoSync([string]$processoId, [string]$contactId) {
  return @(Invoke-JsonGet "$restBase/processo_contato_sync?processo_id=eq.$processoId&contact_id_freshsales=eq.$contactId&select=id")
}

$processos = Get-Processes
$sample = @()
$created = 0
$failed = 0

foreach ($proc in @($processos)) {
  $partes = Get-Partes $proc.id
  if (@($partes).Count -eq 0) { continue }
  $publicacoes = Get-Publicacoes $proc.id
  $marker = Publication-HasOfficeMarker $publicacoes
  if (-not $marker.matched) { continue }

  $representedPole = Infer-RepresentedPole $proc $publicacoes $partes
  if (-not $representedPole) { continue }

  $parteOut = @()
  foreach ($parte in @($partes)) {
    if ([string]::IsNullOrWhiteSpace([string]$parte.nome)) { continue }
    $role = Get-ContactRole $parte $representedPole
    $isCliente = $role -eq "Cliente"
    $externalId = Build-ExternalId $proc.id $parte.id $role
    $entry = [ordered]@{
      parte_id = $parte.id
      nome = $parte.nome
      polo = $parte.polo
      tipo_contato = $role
      external_id = $externalId
      cliente_hmadv = $isCliente
      representada_pelo_escritorio = $isCliente
      principal_no_account = ($isCliente -and ($parte.polo -eq $representedPole))
      contato_freshsales_id = $parte.contato_freshsales_id
      resultado = $null
    }

    if ($Aplicar) {
      $result = Upsert-FreshsalesContact $parte $proc $role
      $entry.resultado = $result
      if ($result.ok -and $result.contact.id) {
        $contactId = [string]$result.contact.id
        $patch = [ordered]@{
          contato_freshsales_id = $contactId
          cliente_hmadv = $isCliente
          representada_pelo_escritorio = $isCliente
          principal_no_account = ($isCliente -and ($parte.polo -eq $representedPole))
        }
        [void](Invoke-JsonPatch "partes" "id=eq.$($parte.id)" $patch)
        $existing = Get-ExistingProcessoContatoSync $proc.id $contactId
        if (@($existing).Count -eq 0) {
          $relacao = if ($role -eq "Cliente") { "cliente_principal" } elseif ($role -eq "Parte Adversa") { "parte_adversa" } else { "parte_relacionada" }
          [void](Invoke-JsonPost "processo_contato_sync" @{
            processo_id = $proc.id
            parte_id = $parte.id
            contact_id_freshsales = $contactId
            relacao = $relacao
            principal = [bool]$patch.principal_no_account
            origem = "fase8_contact_create"
            metadata = @{
              numero_cnj = $proc.numero_cnj
              tipo_contato = $role
              marker = $marker
              account_id_freshsales = $proc.account_id_freshsales
            }
          })
        }
        $created += 1
      } else {
        $failed += 1
      }
    }

    $parteOut += $entry
  }

  if (@($parteOut).Count -gt 0) {
    $sample += [ordered]@{
      processo_id = $proc.id
      numero_cnj = $proc.numero_cnj
      account_id_freshsales = $proc.account_id_freshsales
      represented_pole = $representedPole
      parte_contacts = $parteOut
    }
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  contact_type_field = $ContactTypeField
  processos_lidos = @($processos).Count
  contacts_criados_ou_atualizados = $created
  contacts_falha = $failed
  sample = $sample | Select-Object -First 20
} | ConvertTo-Json -Depth 10
