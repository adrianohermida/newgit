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

$stackHealthy = $false
if ($providersRoute -and $ragRoute -and $chatRoute) {
  $providersOk = ($providersRoute.status -ne 404 -and $providersRoute.errorType -ne "missing_token")
  $chatOk = ($chatRoute.status -ne 404)
  $ragOk = ($ragRoute.status -ne 404)
  $aiOk = $aiReport.execute.ok -and $aiReport.executeV1.ok
  $stackHealthy = [bool]($providersOk -and $chatOk -and $ragOk -and $aiOk)
}

if (-not $providersRoute -and -not [string]::IsNullOrWhiteSpace($resolvedAdminToken)) {
  Add-Diagnosis -Target $diagnosis -Message "A verificacao protegida do Pages nao trouxe a rota de providers. Revise o diagnostico da camada administrativa."
}

if ($aiReport.health.ok -and $aiReport.execute.ok -and $aiReport.executeV1.ok -and -not $providersRoute) {
  Add-Diagnosis -Target $diagnosis -Message "O backend HMADV IA esta operacional; se a stack continua quebrada, concentre a investigacao no deploy de Pages e nas envs da app."
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
    executeOk = $aiReport.execute.ok
    executeV1Ok = $aiReport.executeV1.ok
  }
  diagnosis = @($diagnosis)
}

$report | ConvertTo-Json -Depth 10
