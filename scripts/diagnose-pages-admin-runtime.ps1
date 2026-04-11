param(
  [string]$BaseUrl = "https://hermidamaia.adv.br",
  [string]$AdminToken = "",
  [switch]$IncludeProtected
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

function Invoke-DiagnosticRequest {
  param(
    [string]$Uri,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $params = @{
    Uri = $Uri
    Method = $Method
    Headers = $Headers
    TimeoutSec = 30
    UseBasicParsing = $true
  }

  if ($Body -ne $null) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    $response = Invoke-WebRequest @params
    $content = $response.Content
    $json = $null
    if ($content) {
      try { $json = $content | ConvertFrom-Json } catch { $json = $null }
    }
    return [pscustomobject]@{
      ok = $true
      status = [int]$response.StatusCode
      json = $json
      raw = $content
      error = $null
    }
  } catch {
    $status = $null
    $raw = ""
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $raw = $reader.ReadToEnd()
      }
    }
    $json = $null
    if ($raw) {
      try { $json = $raw | ConvertFrom-Json } catch { $json = $null }
    }
    return [pscustomobject]@{
      ok = $false
      status = $status
      json = $json
      raw = $raw
      error = $_.Exception.Message
    }
  }
}

function New-EndpointResult {
  param(
    [string]$Name,
    [string]$Path,
    [object]$Response
  )

  [pscustomobject]@{
    name = $Name
    path = $Path
    ok = $Response.ok
    status = $Response.status
    error = if ($Response.json.error) { $Response.json.error } else { $Response.error }
    errorType = if ($Response.json.errorType) { $Response.json.errorType } else { $null }
    details = if ($Response.json.details) { $Response.json.details } else { $null }
    body = $Response.json
  }
}

$resolvedAdminToken = Resolve-EnvValue -ExplicitValue $AdminToken -Names @(
  "LAW_DESK_ADMIN_TOKEN",
  "LAWDESK_ADMIN_TOKEN",
  "HMADV_ADMIN_TOKEN"
)

$root = $BaseUrl.Trim().TrimEnd("/")
$publicChecks = @(
  @{ name = "admin-auth-config"; path = "/api/admin-auth-config"; method = "GET"; body = $null },
  @{ name = "public-chat-config"; path = "/api/public-chat-config"; method = "GET"; body = $null }
)

$protectedChecks = @(
  @{ name = "admin-lawdesk-providers"; path = "/api/admin-lawdesk-providers?include_health=1"; method = "GET"; body = $null },
  @{ name = "admin-dotobot-rag-health"; path = "/api/admin-dotobot-rag-health?include_upsert=0"; method = "GET"; body = $null },
  @{ name = "admin-lawdesk-chat"; path = "/api/admin-lawdesk-chat"; method = "POST"; body = @{ query = "smoke"; context = @{ route = "/diagnose-pages-admin-runtime" } } }
)

$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($resolvedAdminToken)) {
  $headers["Authorization"] = "Bearer $resolvedAdminToken"
}

$results = @()
foreach ($check in $publicChecks) {
  $response = Invoke-DiagnosticRequest -Uri ($root + $check.path) -Method $check.method -Body $check.body
  $results += New-EndpointResult -Name $check.name -Path $check.path -Response $response
}

if ($IncludeProtected -or -not [string]::IsNullOrWhiteSpace($resolvedAdminToken)) {
  foreach ($check in $protectedChecks) {
    $response = Invoke-DiagnosticRequest -Uri ($root + $check.path) -Method $check.method -Headers $headers -Body $check.body
    $results += New-EndpointResult -Name $check.name -Path $check.path -Response $response
  }
}

$diagnosis = New-Object System.Collections.Generic.List[string]

$providersCheck = $results | Where-Object { $_.name -eq "admin-lawdesk-providers" } | Select-Object -First 1
$ragCheck = $results | Where-Object { $_.name -eq "admin-dotobot-rag-health" } | Select-Object -First 1
$chatCheck = $results | Where-Object { $_.name -eq "admin-lawdesk-chat" } | Select-Object -First 1
$authConfigCheck = $results | Where-Object { $_.name -eq "admin-auth-config" } | Select-Object -First 1
$publicChatConfigCheck = $results | Where-Object { $_.name -eq "public-chat-config" } | Select-Object -First 1

if ($authConfigCheck) {
  if ($authConfigCheck.status -ge 500) {
    $diagnosis.Add("A rota publica /api/admin-auth-config falhou; o bootstrap de auth do dashboard pode estar quebrado.")
  } elseif ($authConfigCheck.body -and $authConfigCheck.body.ok -eq $false) {
    $diagnosis.Add("A configuracao publica do Supabase esta incompleta para o dashboard administrativo.")
  }
}

if ($publicChatConfigCheck) {
  if ($publicChatConfigCheck.status -ge 500) {
    $diagnosis.Add("A rota publica /api/public-chat-config falhou; o bootstrap do chat pode estar quebrado.")
  }
}

if ($providersCheck) {
  if ($providersCheck.status -eq 404) {
    $diagnosis.Add("A rota canonica /api/admin-lawdesk-providers nao esta publicada no Pages runtime.")
  } elseif ($providersCheck.errorType) {
    $diagnosis.Add("Providers route respondeu com errorType=$($providersCheck.errorType).")
    if ($providersCheck.errorType -eq "missing_token") {
      $diagnosis.Add("O runtime administrativo existe, mas a validacao protegida depende de token admin.")
    }
  }
}

if ($ragCheck -and $ragCheck.errorType) {
  $diagnosis.Add("RAG health respondeu com errorType=$($ragCheck.errorType).")
  if ($ragCheck.errorType -eq "missing_token") {
    $diagnosis.Add("O health do RAG esta protegido e exige token admin valido.")
  }
}

if ($chatCheck -and $chatCheck.errorType) {
  $diagnosis.Add("Lawdesk chat respondeu com errorType=$($chatCheck.errorType).")
  if ($chatCheck.errorType -eq "missing_token") {
    $diagnosis.Add("A rota de chat administrativo existe, mas exige token admin valido.")
  }
}

if (-not $providersCheck -and -not $ragCheck -and -not $chatCheck) {
  $diagnosis.Add("Somente rotas publicas foram verificadas. Informe -AdminToken ou -IncludeProtected para validar o runtime administrativo.")
}

$report = [ordered]@{
  baseUrl = $root
  checkedAt = (Get-Date).ToString("o")
  adminTokenProvided = -not [string]::IsNullOrWhiteSpace($resolvedAdminToken)
  protectedChecksIncluded = [bool]($IncludeProtected -or -not [string]::IsNullOrWhiteSpace($resolvedAdminToken))
  results = $results
  diagnosis = @($diagnosis)
}

$report | ConvertTo-Json -Depth 8
