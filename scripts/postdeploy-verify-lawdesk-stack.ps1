param(
  [string]$PagesBaseUrl = "https://hermidamaia.adv.br",
  [string]$AiBaseUrl = "https://ai.hermidamaia.adv.br",
  [string]$AdminToken = "",
  [string]$SharedSecret = ""
)

$ErrorActionPreference = "Stop"

function Resolve-EnvValue {
  param(
    [string]$ExplicitValue,
    [string[]]$Names
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
    return $ExplicitValue
  }

  foreach ($name in $Names) {
    $candidate = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return $candidate
    }
  }

  return ""
}

function Read-JsonFromProcess {
  param(
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  $output = & powershell -ExecutionPolicy Bypass -File $FilePath @Arguments
  $text = ($output | Out-String).Trim()
  if (-not $text) {
    throw "Nenhuma saida retornada por $FilePath."
  }
  return $text | ConvertFrom-Json
}

function Add-Diagnosis {
  param(
    [System.Collections.Generic.List[string]]$Target,
    [string]$Message
  )

  if (-not [string]::IsNullOrWhiteSpace($Message)) {
    [void]$Target.Add($Message)
  }
}

$resolvedAdminToken = Resolve-EnvValue -ExplicitValue $AdminToken -Names @(
  "LAW_DESK_ADMIN_TOKEN",
  "LAWDESK_ADMIN_TOKEN",
  "HMADV_ADMIN_TOKEN"
)

$resolvedSharedSecret = Resolve-EnvValue -ExplicitValue $SharedSecret -Names @(
  "PROCESS_AI_SHARED_SECRET",
  "HMADV_PROCESS_AI_SHARED_SECRET",
  "WORKER_SHARED_SECRET"
)

$pagesArgs = @("-BaseUrl", $PagesBaseUrl)
if (-not [string]::IsNullOrWhiteSpace($resolvedAdminToken)) {
  $pagesArgs += @("-AdminToken", $resolvedAdminToken, "-IncludeProtected")
}

$aiArgs = @("-BaseUrl", $AiBaseUrl)
if (-not [string]::IsNullOrWhiteSpace($resolvedSharedSecret)) {
  $aiArgs += @("-SharedSecret", $resolvedSharedSecret)
}

$pagesReport = Read-JsonFromProcess -FilePath "D:\Github\newgit\scripts\diagnose-pages-admin-runtime.ps1" -Arguments $pagesArgs
$aiReport = Read-JsonFromProcess -FilePath "D:\Github\newgit\scripts\diagnose-hmadv-process-ai.ps1" -Arguments $aiArgs

$diagnosis = New-Object 'System.Collections.Generic.List[string]'
foreach ($item in @($pagesReport.diagnosis)) {
  Add-Diagnosis -Target $diagnosis -Message $item
}
foreach ($item in @($aiReport.diagnosis)) {
  Add-Diagnosis -Target $diagnosis -Message $item
}

$providersRoute = @($pagesReport.results) | Where-Object { $_.name -eq "admin-lawdesk-providers" } | Select-Object -First 1
$ragRoute = @($pagesReport.results) | Where-Object { $_.name -eq "admin-dotobot-rag-health" } | Select-Object -First 1
$chatRoute = @($pagesReport.results) | Where-Object { $_.name -eq "admin-lawdesk-chat" } | Select-Object -First 1
$legacyChatRoute = @($pagesReport.results) | Where-Object { $_.name -eq "legacy-admin-lawdesk-chat" } | Select-Object -First 1
$legacyProvidersRoute = @($pagesReport.results) | Where-Object { $_.name -eq "legacy-admin-lawdesk-providers" } | Select-Object -First 1
$copilotPage = @($pagesReport.results) | Where-Object { $_.name -eq "page-interno-copilot" } | Select-Object -First 1
$processosPage = @($pagesReport.results) | Where-Object { $_.name -eq "page-interno-processos" } | Select-Object -First 1
$publicacoesPage = @($pagesReport.results) | Where-Object { $_.name -eq "page-interno-publicacoes" } | Select-Object -First 1

$stackHealthy = $false
if ($providersRoute -and $ragRoute -and $chatRoute) {
  $providersOk = ($providersRoute.status -ne 404 -and $providersRoute.errorType -ne "missing_token")
  $chatOk = ($chatRoute.status -ne 404)
  $ragOk = ($ragRoute.status -ne 404)
  $pagesOk = @($copilotPage, $processosPage, $publicacoesPage) | Where-Object { $_ } | ForEach-Object { $_.ok -eq $true } | Where-Object { $_ -eq $false } | Measure-Object | Select-Object -ExpandProperty Count
  $aiOk = $aiReport.execute.ok -and $aiReport.executeV1.ok
  $stackHealthy = [bool]($providersOk -and $chatOk -and $ragOk -and $aiOk -and $pagesOk -eq 0)
}

if (-not $providersRoute -and -not [string]::IsNullOrWhiteSpace($resolvedAdminToken)) {
  Add-Diagnosis -Target $diagnosis -Message "A verificacao protegida do Pages nao trouxe a rota de providers. Revise o diagnostico da camada administrativa."
}

if ($aiReport.health.ok -and $aiReport.execute.ok -and $aiReport.executeV1.ok -and -not $providersRoute) {
  Add-Diagnosis -Target $diagnosis -Message "O backend HMADV IA esta operacional; se a stack continua quebrada, concentre a investigacao no deploy de Pages e nas envs da app."
}

if (
  $providersRoute -and $providersRoute.status -eq 404 -and
  $chatRoute -and $chatRoute.status -eq 404 -and
  $legacyChatRoute -and $legacyChatRoute.status -eq 405 -and
  $legacyProvidersRoute -and $legacyProvidersRoute.status -eq 405
) {
  Add-Diagnosis -Target $diagnosis -Message "Sinal forte de deploy estatico puro: frontend publicado sem runtime administrativo do Pages."
  Add-Diagnosis -Target $diagnosis -Message "Republique o projeto newgit-pages pelo build conectado do Cloudflare Pages; evite upload manual apenas do diretorio out."
}

foreach ($pageCheck in @($copilotPage, $processosPage, $publicacoesPage)) {
  if (-not $pageCheck) { continue }
  if ($pageCheck.ok -ne $true) {
    Add-Diagnosis -Target $diagnosis -Message "A pagina $($pageCheck.path) carregou com falha de assets ou runtime publico."
  }
}

$report = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  pagesBaseUrl = $PagesBaseUrl
  aiBaseUrl = $AiBaseUrl
  adminTokenProvided = -not [string]::IsNullOrWhiteSpace($resolvedAdminToken)
  sharedSecretProvided = -not [string]::IsNullOrWhiteSpace($resolvedSharedSecret)
  stackHealthy = $stackHealthy
  pages = $pagesReport
  hmadvAi = $aiReport
  summary = [ordered]@{
    providersRouteStatus = if ($providersRoute) { $providersRoute.status } else { $null }
    providersRouteErrorType = if ($providersRoute) { $providersRoute.errorType } else { $null }
    ragRouteStatus = if ($ragRoute) { $ragRoute.status } else { $null }
    ragRouteErrorType = if ($ragRoute) { $ragRoute.errorType } else { $null }
    chatRouteStatus = if ($chatRoute) { $chatRoute.status } else { $null }
    chatRouteErrorType = if ($chatRoute) { $chatRoute.errorType } else { $null }
    legacyChatRouteStatus = if ($legacyChatRoute) { $legacyChatRoute.status } else { $null }
    legacyProvidersRouteStatus = if ($legacyProvidersRoute) { $legacyProvidersRoute.status } else { $null }
    copilotPageOk = if ($copilotPage) { $copilotPage.ok } else { $null }
    processosPageOk = if ($processosPage) { $processosPage.ok } else { $null }
    publicacoesPageOk = if ($publicacoesPage) { $publicacoesPage.ok } else { $null }
    executeOk = $aiReport.execute.ok
    executeV1Ok = $aiReport.executeV1.ok
  }
  diagnosis = @($diagnosis)
}

$report | ConvertTo-Json -Depth 10
