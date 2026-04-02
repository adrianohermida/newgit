param(
  [string]$ServiceRole = $env:HMADV_SERVICE_ROLE,
  [switch]$Aplicar,
  [string[]]$ProcessoIds,
  [int]$Limite = 50
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
  return @($variants)
}

function Text-MatchesRule([string]$text, [string]$term) {
  foreach ($variant in (Get-TermVariants $term)) {
    if ($text -like "*$variant*") { return $true }
  }
  return $false
}

function Invoke-JsonGet([string]$url) {
  try {
    return @(Invoke-RestMethod -Method Get -Uri $url -Headers $readHeaders -TimeoutSec 120)
  } catch {
    return @()
  }
}

function Get-ActiveRules() {
  return @(Invoke-JsonGet "$restBase/processo_evento_regra?select=tipo,categoria,termo,valor_resultado,prioridade&ativo=is.true&tipo=eq.status&order=categoria.asc,prioridade.asc")
}

function Get-Processes() {
  $select = "id,numero_cnj,titulo,status_atual_processo,status_fonte,status_evento_origem,account_id_freshsales"
  if ($ProcessoIds -and $ProcessoIds.Count -gt 0) {
    $ids = ($ProcessoIds | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() }) -join ","
    return @(Invoke-JsonGet "$restBase/processos?id=in.($ids)&select=$select")
  }
  return @(Invoke-JsonGet "$restBase/processos?account_id_freshsales=not.is.null&select=$select&or=(status_atual_processo.is.null,status_fonte.eq.fallback)&limit=$Limite")
}

function Get-Movements($processId) {
  return @(Invoke-JsonGet "$restBase/movimentos?processo_id=eq.$processId&select=id,descricao,data_movimento&order=data_movimento.desc.nullslast&limit=20")
}

function Get-Publications($processId) {
  return @(Invoke-JsonGet "$restBase/publicacoes?processo_id=eq.$processId&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=20")
}

function Get-StrongPatterns() {
  return @(
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 1; termo = "julgo extinta" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 1; termo = "julgo extinto" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 2; termo = "extingo o processo" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 2; termo = "execucao extinta" },
    @{ fonte = "publicacao"; valor = "Baixado"; prioridade = 3; termo = "arquivem-se os autos" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 1; termo = "declaro suspensa a execucao" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 1; termo = "declaro suspenso o processo" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 1; termo = "declaro suspensa" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 1; termo = "declaro suspenso" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 2; termo = "sobreste-se o feito" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 2; termo = "suspensao do tramite processual" },
    @{ fonte = "publicacao"; valor = "Suspenso"; prioridade = 2; termo = "defiro a suspensao do tramite processual" }
  )
}

function Get-StatusMatches($movements, $publications, $rules) {
  $matches = @()
  $strongPatterns = Get-StrongPatterns

  foreach ($mov in @($movements)) {
    if (-not $mov) { continue }
    $text = Normalize-Text $mov.descricao
    if (-not $text) { continue }
    foreach ($rule in @($rules | Where-Object { $_.categoria -eq "movimento" })) {
      if (Text-MatchesRule $text $rule.termo) {
        $matches += [pscustomobject]@{
          fonte = "movimento"
          valor = $rule.valor_resultado
          prioridade = [int]$rule.prioridade
          termo = $rule.termo
          evento_id = $mov.id
          evento_data = $mov.data_movimento
        }
      }
    }
  }

  foreach ($pub in @($publications)) {
    if (-not $pub) { continue }
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
        }
      }
    }

    foreach ($rule in @($rules | Where-Object { $_.categoria -eq "publicacao" })) {
      if (Text-MatchesRule $text $rule.termo) {
        $matches += [pscustomobject]@{
          fonte = "publicacao"
          valor = $rule.valor_resultado
          prioridade = [int]$rule.prioridade
          termo = $rule.termo
          evento_id = $pub.id
          evento_data = $pub.data_publicacao
        }
      }
    }
  }

  return @($matches)
}

function Apply-StatusPatch($processId, $patch) {
  $json = $patch | ConvertTo-Json -Depth 8 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method Patch -Uri "$restBase/processos?id=eq.$processId" -Headers ($writeHeaders + @{ Prefer = "return=representation" }) -Body $body -TimeoutSec 120
}

$rules = Get-ActiveRules
$processes = Get-Processes
$sample = @()
$applied = 0

foreach ($proc in @($processes)) {
  $movements = Get-Movements $proc.id
  $publications = Get-Publications $proc.id
  $matches = Get-StatusMatches $movements $publications $rules
  $best = $null
  if ($matches.Count -gt 0) {
    $best = $matches | Sort-Object -Property prioridade, @{ Expression = { [datetime]($_.evento_data) }; Descending = $true } | Select-Object -First 1
  }

  $patch = [ordered]@{}
  if ($best) {
    if ($proc.status_atual_processo -ne $best.valor -or $proc.status_fonte -eq "fallback" -or -not $proc.status_fonte) {
      $patch["status_atual_processo"] = $best.valor
      $patch["status_fonte"] = $best.fonte
      $patch["status_detectado_em"] = (Get-Date).ToString("s")
      $patch["status_evento_origem"] = $best.evento_id
    }
  } elseif (-not $proc.status_atual_processo) {
    $patch["status_atual_processo"] = "Ativo"
    $patch["status_fonte"] = "fallback"
    $patch["status_detectado_em"] = (Get-Date).ToString("s")
    $patch["status_evento_origem"] = "ausencia_de_evento_de_baixa_ou_suspensao"
  }

  $entry = [ordered]@{
    processo_id = $proc.id
    numero_cnj = $proc.numero_cnj
    status_atual = $proc.status_atual_processo
    status_fonte_atual = $proc.status_fonte
    patch = $patch
    matches = @($matches | Select-Object -First 5)
    movimentos_lidos = @($movements | Where-Object { $_ }).Count
    publicacoes_lidas = @($publications | Where-Object { $_ }).Count
  }

  if ($Aplicar -and $patch.Keys.Count -gt 0) {
    try {
      $entry["resultado"] = Apply-StatusPatch $proc.id $patch
      $applied += 1
    } catch {
      $entry["erro"] = $_.Exception.Message
    }
  }

  if ($patch.Keys.Count -gt 0 -or ($ProcessoIds -and $ProcessoIds.Count -gt 0)) {
    $sample += $entry
  }
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  regras_carregadas = @($rules).Count
  processos_lidos = @($processes).Count
  processos_com_patch = @($sample | Where-Object { $_.patch.Keys.Count -gt 0 }).Count
  processos_aplicados = $applied
  sample = $sample | Select-Object -First 20
} | ConvertTo-Json -Depth 10
