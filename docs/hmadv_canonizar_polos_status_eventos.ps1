param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$Aplicar,
  [string[]]$ProcessoIds,
  [int]$Limite = 50,
  [int]$LimiteEventos = 20
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
  return (($sb.ToString().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()) -replace '\s+', ' ').Trim()
}

function Normalize-Name([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  return (($value -replace '\s+', ' ').Trim() -replace '^\W+|\W+$', '').Trim()
}

function Get-TermVariants([string]$term) {
  $variants = New-Object System.Collections.Generic.HashSet[string]
  if ([string]::IsNullOrWhiteSpace($term)) { return @() }
  $normalized = Normalize-Text $term
  [void]$variants.Add($normalized)

  if ($normalized -match 'o$') {
    [void]$variants.Add(($normalized -replace 'o$', 'a'))
    [void]$variants.Add(($normalized -replace 'o$', 'os'))
    [void]$variants.Add(($normalized -replace 'o$', 'as'))
  }
  if ($normalized -match 'ado$') {
    [void]$variants.Add(($normalized -replace 'ado$', 'ada'))
    [void]$variants.Add(($normalized -replace 'ado$', 'ados'))
    [void]$variants.Add(($normalized -replace 'ado$', 'adas'))
  }
  if ($normalized -match 'ido$') {
    [void]$variants.Add(($normalized -replace 'ido$', 'ida'))
    [void]$variants.Add(($normalized -replace 'ido$', 'idos'))
    [void]$variants.Add(($normalized -replace 'ido$', 'idas'))
  }
  if ($normalized -match 'nte$') {
    [void]$variants.Add(($normalized -replace 'nte$', 'ntes'))
  }

  return @($variants)
}

function Text-MatchesRule([string]$text, [string]$term) {
  foreach ($variant in (Get-TermVariants $term)) {
    if ($text -like "*$variant*") { return $true }
  }
  return $false
}

function Invoke-GetJson($url) {
  try {
    $response = Invoke-RestMethod -Method Get -Uri $url -Headers $readHeaders -TimeoutSec 120
    if ($response -is [System.Array]) { return @($response) }
    if ($null -eq $response) { return @() }
    if ($response.PSObject.Properties.Name -contains "value" -and $response.value -is [System.Array]) { return @($response.value) }
    return @($response)
  } catch {
    return @(@{ erro = $_.Exception.Message; url = $url })
  }
}

function Build-ProcessUrl() {
  $select = "id,numero_cnj,titulo,status_atual_processo,status_fonte,status_detectado_em,status_evento_origem,polo_ativo,polo_passivo,account_id_freshsales"
  if ($ProcessoIds -and $ProcessoIds.Count -gt 0) {
    $ids = ($ProcessoIds | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() }) -join ","
    return "$restBase/processos?id=in.($ids)&select=$select"
  }
  return "$restBase/processos?account_id_freshsales=not.is.null&select=$select&or=(polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null,status_fonte.eq.fallback)&limit=$Limite"
}

function Get-ActiveRules() {
  $rows = Invoke-GetJson "$restBase/processo_evento_regra?select=tipo,categoria,termo,valor_resultado,prioridade&ativo=is.true&order=tipo.asc,categoria.asc,prioridade.asc"
  return @($rows | Where-Object { -not $_.erro })
}

function Get-ProcessParts($processId) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri "$restBase/partes?processo_id=eq.$processId&select=id,nome,polo,fonte,cliente_hmadv,representada_pelo_escritorio,principal_no_account&limit=200" -Headers $readHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Get-ProcessMovements($processId) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri "$restBase/movimentos?processo_id=eq.$processId&select=id,codigo,descricao,data_movimento&order=data_movimento.desc.nullslast&limit=$LimiteEventos" -Headers $readHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Get-ProcessPublications($processId) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri "$restBase/publicacoes?processo_id=eq.$processId&select=id,conteudo,diario,data_publicacao,raw_payload&order=data_publicacao.desc.nullslast&limit=$LimiteEventos" -Headers $readHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Infer-PolosFromTitulo([string]$titulo) {
  $result = @{ polo_ativo = $null; polo_passivo = $null; fonte = $null }
  if ([string]::IsNullOrWhiteSpace($titulo)) { return $result }
  $m = [regex]::Match($titulo, '\((.+?) x (.+?)\)')
  if (-not $m.Success) { return $result }
  $result.polo_ativo = Normalize-Name $m.Groups[1].Value
  $result.polo_passivo = Normalize-Name $m.Groups[2].Value
  $result.fonte = "titulo"
  return $result
}

function Get-MostFrequentName($rows, $targetPolo) {
  $grouped = @($rows |
    Where-Object { $_.polo -eq $targetPolo -and -not [string]::IsNullOrWhiteSpace($_.nome) } |
    Group-Object -Property nome |
    Sort-Object -Property Count -Descending)
  if ($grouped.Count -eq 0) { return $null }
  return Normalize-Name $grouped[0].Name
}

function Infer-PolosFromParts($parts) {
  $ativo = Get-MostFrequentName $parts "ativo"
  $passivo = Get-MostFrequentName $parts "passivo"
  return @{
    polo_ativo = $ativo
    polo_passivo = $passivo
    fonte = if ($ativo -or $passivo) { "partes" } else { $null }
  }
}

function Extract-PublicationPairs($text) {
  $pairs = @()
  if ([string]::IsNullOrWhiteSpace($text)) { return $pairs }
  $regex = [regex]'(?<nome>[^()\r\n]{3,140}?)\s*\((?<papel>[^)]+)\)'
  foreach ($m in $regex.Matches($text)) {
    $nome = Normalize-Name $m.Groups["nome"].Value
    $papel = Normalize-Text $m.Groups["papel"].Value
    if ($nome -and $papel) {
      $pairs += @{
        nome = $nome
        papel = $papel
      }
    }
  }
  return $pairs
}

function Infer-PolosFromPublications($publications, $rules) {
  $activeTerms = @($rules | Where-Object { $_.tipo -eq "polo" -and $_.categoria -eq "ativo" } | Sort-Object prioridade)
  $passiveTerms = @($rules | Where-Object { $_.tipo -eq "polo" -and $_.categoria -eq "passivo" } | Sort-Object prioridade)
  $ativos = @{}
  $passivos = @{}

  foreach ($pub in $publications) {
    $pairs = Extract-PublicationPairs $pub.conteudo
    foreach ($pair in $pairs) {
      foreach ($rule in $activeTerms) {
        if (Text-MatchesRule $pair.papel $rule.termo) {
          if (-not $ativos.ContainsKey($pair.nome)) { $ativos[$pair.nome] = 0 }
          $ativos[$pair.nome] += 1
        }
      }
      foreach ($rule in $passiveTerms) {
        if (Text-MatchesRule $pair.papel $rule.termo) {
          if (-not $passivos.ContainsKey($pair.nome)) { $passivos[$pair.nome] = 0 }
          $passivos[$pair.nome] += 1
        }
      }
    }
  }

  $ativo = $null
  $passivo = $null
  if ($ativos.Keys.Count -gt 0) {
    $ativo = ($ativos.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
  }
  if ($passivos.Keys.Count -gt 0) {
    $passivo = ($passivos.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
  }

  return @{
    polo_ativo = $ativo
    polo_passivo = $passivo
    fonte = if ($ativo -or $passivo) { "publicacao" } else { $null }
  }
}

function Get-StatusMatches($movements, $publications, $rules) {
  $matches = @()
  $statusRules = @($rules | Where-Object { $_.tipo -eq "status" })
  $strongPatterns = @(
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 1; termo = "julgo extinta" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 1; termo = "julgo extinto" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 2; termo = "extingo o processo" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 2; termo = "execucao extinta" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 3; termo = "arquivem-se os autos" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 1; termo = "declaro suspensa" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 1; termo = "declaro suspenso" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 2; termo = "sobreste-se o feito" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 2; termo = "suspensao do tramite processual" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 2; termo = "defiro a suspensao do tramite processual" }
  )

  foreach ($mov in $movements) {
    $text = Normalize-Text $mov.descricao
    if (-not $text) { continue }
    foreach ($rule in $statusRules | Where-Object { $_.categoria -eq "movimento" }) {
      if (Text-MatchesRule $text $rule.termo) {
        $matches += [pscustomobject]@{
          fonte = "movimento"
          valor = $rule.valor_resultado
          prioridade = [int]$rule.prioridade
          termo = $rule.termo
          evento_id = $mov.id
          evento_data = $mov.data_movimento
          texto = $mov.descricao
        }
      }
    }
  }

  foreach ($pub in $publications) {
    $text = Normalize-Text $pub.conteudo
    if (-not $text) { continue }
    foreach ($pattern in $strongPatterns) {
      if ($text -like "*$($pattern.termo)*") {
        $matches += [pscustomobject]@{
          fonte = $pattern.fonte
          valor = $pattern.valor
          prioridade = [int]$pattern.prioridade
          termo = $pattern.termo
          evento_id = $pub.id
          evento_data = $pub.data_publicacao
          texto = if ($pub.conteudo.Length -gt 180) { $pub.conteudo.Substring(0, 180) } else { $pub.conteudo }
        }
      }
    }
    foreach ($rule in $statusRules | Where-Object { $_.categoria -eq "publicacao" }) {
      if (Text-MatchesRule $text $rule.termo) {
        $matches += [pscustomobject]@{
          fonte = "publicacao"
          valor = $rule.valor_resultado
          prioridade = [int]$rule.prioridade
          termo = $rule.termo
          evento_id = $pub.id
          evento_data = $pub.data_publicacao
          texto = if ($pub.conteudo.Length -gt 180) { $pub.conteudo.Substring(0, 180) } else { $pub.conteudo }
        }
      }
    }
  }

  return @($matches)
}

function Find-StatusEvidence($movements, $publications, $rules) {
  $matches = Get-StatusMatches $movements $publications $rules
  if ($matches.Count -eq 0) { return $null }
  return @($matches | Sort-Object -Property prioridade, @{ Expression = { [datetime]($_.evento_data) }; Descending = $true })[0]
}

function Build-Patch($proc, $parts, $movements, $publications, $rules) {
  $patch = [ordered]@{}
  $evidence = [ordered]@{}

  $partInference = Infer-PolosFromParts $parts
  $pubInference = Infer-PolosFromPublications $publications $rules
  $titleInference = Infer-PolosFromTitulo $proc.titulo

  $finalAtivo = $proc.polo_ativo
  $finalPassivo = $proc.polo_passivo
  $poloFonte = $null

  if (-not $finalAtivo -and $partInference.polo_ativo) {
    $finalAtivo = $partInference.polo_ativo
    $poloFonte = $partInference.fonte
  }
  if (-not $finalPassivo -and $partInference.polo_passivo) {
    $finalPassivo = $partInference.polo_passivo
    $poloFonte = if ($poloFonte) { $poloFonte } else { $partInference.fonte }
  }
  if (-not $finalAtivo -and $pubInference.polo_ativo) {
    $finalAtivo = $pubInference.polo_ativo
    $poloFonte = if ($poloFonte) { $poloFonte } else { $pubInference.fonte }
  }
  if (-not $finalPassivo -and $pubInference.polo_passivo) {
    $finalPassivo = $pubInference.polo_passivo
    $poloFonte = if ($poloFonte) { $poloFonte } else { $pubInference.fonte }
  }
  if (-not $finalAtivo -and $titleInference.polo_ativo) {
    $finalAtivo = $titleInference.polo_ativo
    $poloFonte = if ($poloFonte) { $poloFonte } else { $titleInference.fonte }
  }
  if (-not $finalPassivo -and $titleInference.polo_passivo) {
    $finalPassivo = $titleInference.polo_passivo
    $poloFonte = if ($poloFonte) { $poloFonte } else { $titleInference.fonte }
  }

  if (-not $proc.polo_ativo -and $finalAtivo) { $patch["polo_ativo"] = $finalAtivo }
  if (-not $proc.polo_passivo -and $finalPassivo) { $patch["polo_passivo"] = $finalPassivo }
  if ($patch.Contains("polo_ativo") -or $patch.Contains("polo_passivo")) {
    $evidence["polo_fonte"] = $poloFonte
  }

  $statusMatches = Get-StatusMatches $movements $publications $rules
  $statusEvidence = $null
  if ($statusMatches.Count -gt 0) {
    $statusEvidence = @($statusMatches | Sort-Object -Property prioridade, @{ Expression = { [datetime]($_.evento_data) }; Descending = $true })[0]
  }
  if ($statusEvidence) {
    if ($proc.status_atual_processo -ne $statusEvidence.valor -or $proc.status_fonte -eq "fallback" -or -not $proc.status_fonte) {
      $patch["status_atual_processo"] = $statusEvidence.valor
      $patch["status_fonte"] = $statusEvidence.fonte
      $patch["status_detectado_em"] = (Get-Date).ToString("s")
      $patch["status_evento_origem"] = $statusEvidence.evento_id
      $evidence["status"] = $statusEvidence
    }
  } elseif (-not $proc.status_atual_processo) {
    $patch["status_atual_processo"] = "Ativo"
    $patch["status_fonte"] = "fallback"
    $patch["status_detectado_em"] = (Get-Date).ToString("s")
    $patch["status_evento_origem"] = "ausencia_de_evento_de_baixa_ou_suspensao"
    $evidence["status"] = @{
      fonte = "fallback"
      valor = "Ativo"
    }
  }

  return @{
    patch = $patch
    evidence = $evidence
    debug = @{
      publicacoes_tipo = if ($null -eq $publications) { "null" } else { $publications.GetType().FullName }
      movimentos_tipo = if ($null -eq $movements) { "null" } else { $movements.GetType().FullName }
      movimentos_lidos = @($movements).Count
      publicacoes_lidas = @($publications).Count
      status_matches = @($statusMatches).Count
      status_match_sample = @($statusMatches | Select-Object -First 5)
      publicacao_sample = if (@($publications).Count -gt 0 -and @($publications)[0].conteudo) {
        $normPub = Normalize-Text @($publications)[0].conteudo
        if ($normPub.Length -gt 220) { $normPub.Substring(0, 220) } else { $normPub }
      } else { $null }
      publicacao_props = if (@($publications).Count -gt 0) { @(@($publications)[0].PSObject.Properties.Name) } else { @() }
      movimento_sample = if (@($movements).Count -gt 0 -and @($movements)[0].descricao) {
        $normMov = Normalize-Text @($movements)[0].descricao
        if ($normMov.Length -gt 220) { $normMov.Substring(0, 220) } else { $normMov }
      } else { $null }
      movimento_props = if (@($movements).Count -gt 0) { @(@($movements)[0].PSObject.Properties.Name) } else { @() }
    }
  }
}

function Apply-ProcessPatch($processId, $patch) {
  $json = $patch | ConvertTo-Json -Depth 8 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Patch -Uri "$restBase/processos?id=eq.$processId" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

$rules = Get-ActiveRules
$processes = @(Invoke-GetJson (Build-ProcessUrl) | Where-Object { -not $_.erro })
$samples = @()
$applied = 0

foreach ($proc in $processes) {
  $parts = Get-ProcessParts $proc.id
  $movements = Get-ProcessMovements $proc.id
  $publications = Get-ProcessPublications $proc.id
  $decision = Build-Patch $proc $parts $movements $publications $rules
  $patch = $decision.patch

  $entry = [ordered]@{
    processo_id = $proc.id
    numero_cnj = $proc.numero_cnj
    titulo = $proc.titulo
    patch = $patch
    evidence = $decision.evidence
    debug = $decision.debug
  }

  if ($patch.Keys.Count -eq 0 -and (-not $ProcessoIds -or $ProcessoIds.Count -eq 0)) { continue }

  if ($Aplicar) {
    try {
      $entry["resultado"] = Apply-ProcessPatch $proc.id $patch
      $applied += 1
    } catch {
      $entry["erro"] = $_.Exception.Message
    }
  }

  $samples += $entry
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  regras_carregadas = $rules.Count
  processos_lidos = $processes.Count
  processos_com_patch = $samples.Count
  processos_aplicados = $applied
  sample = $samples | Select-Object -First 20
} | ConvertTo-Json -Depth 10
