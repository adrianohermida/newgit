param(
  [string]$BaseUrl = "",
  [string]$Model = "",
  [string]$ApiKey = "",
  [string]$AuthToken = ""
)

$ErrorActionPreference = "Stop"

function First-Value([string[]]$Candidates) {
  foreach ($item in $Candidates) {
    if (-not [string]::IsNullOrWhiteSpace($item)) {
      return $item.Trim()
    }
  }
  return ""
}

function Invoke-JsonRequest {
  param(
    [string]$Uri,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $requestParams = @{
    Uri = $Uri
    Method = $Method
    Headers = $Headers
    TimeoutSec = 30
    UseBasicParsing = $true
  }

  if ($Body -ne $null) {
    $requestParams.ContentType = "application/json"
    $requestParams.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    $response = Invoke-WebRequest @requestParams
    $raw = $response.Content
    $data = $null
    if ($raw) {
      try {
        $data = $raw | ConvertFrom-Json
      } catch {
        $data = $null
      }
    }
    return @{
      ok = $true
      status = [int]$response.StatusCode
      data = $data
      raw = $raw
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
    return @{
      ok = $false
      status = $status
      raw = $raw
      error = $_.Exception.Message
    }
  }
}

$resolvedBaseUrl = First-Value @(
  $BaseUrl,
  $env:LOCAL_LLM_BASE_URL,
  $env:LLM_BASE_URL,
  $env:LAWDESK_CODE_API_BASE_URL,
  $env:AICORE_API_BASE_URL,
  $env:DOTOBOT_PYTHON_API_BASE
)
$resolvedModel = First-Value @($Model, $env:LOCAL_LLM_MODEL, $env:LLM_MODEL, "default-model")
$resolvedApiKey = First-Value @($ApiKey, $env:LOCAL_LLM_API_KEY, $env:LLM_API_KEY)
$resolvedAuthToken = First-Value @($AuthToken, $env:LOCAL_LLM_AUTH_TOKEN, $env:LLM_AUTH_TOKEN)

$report = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  configured = -not [string]::IsNullOrWhiteSpace($resolvedBaseUrl)
  config = [ordered]@{
    baseUrl = $resolvedBaseUrl
    model = $resolvedModel
    apiKeyConfigured = -not [string]::IsNullOrWhiteSpace($resolvedApiKey)
    authTokenConfigured = -not [string]::IsNullOrWhiteSpace($resolvedAuthToken)
  }
  probe = $null
  diagnosis = @()
}

if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
  $report.diagnosis += "Base URL do LLM local nao configurada."
  $report.diagnosis += "Defina LOCAL_LLM_BASE_URL, LLM_BASE_URL, LAWDESK_CODE_API_BASE_URL, AICORE_API_BASE_URL ou DOTOBOT_PYTHON_API_BASE."
  $report | ConvertTo-Json -Depth 8
  exit 0
}

$base = $resolvedBaseUrl.Trim().TrimEnd("/")
$headers = @{
  "Content-Type" = "application/json"
  "x-llm-version" = "2023-06-01"
}
if (-not [string]::IsNullOrWhiteSpace($resolvedApiKey)) {
  $headers["x-api-key"] = $resolvedApiKey
}
if (-not [string]::IsNullOrWhiteSpace($resolvedAuthToken)) {
  $headers["Authorization"] = "Bearer $resolvedAuthToken"
}

$body = @{
  model = $resolvedModel
  max_tokens = 300
  system = "Diagnostico do endpoint local compatível com /v1/messages."
  stream = $false
  messages = @(
    @{
      role = "user"
      content = @(
        @{
          type = "text"
          text = "Responda com uma frase curta confirmando se o endpoint local está funcional."
        }
      )
    }
  )
}

$response = Invoke-JsonRequest -Uri "$base/v1/messages" -Method "POST" -Headers $headers -Body $body
$report.probe = [ordered]@{
  ok = $response.ok
  status = $response.status
  error = if ($response.data.error) { $response.data.error } else { $response.error }
  model = if ($response.data.model) { $response.data.model } else { $null }
  preview = if ($response.data.content[0].text) { [string]$response.data.content[0].text.Substring(0, [Math]::Min(160, $response.data.content[0].text.Length)) } else { $null }
  raw = if ($response.ok) { $response.data } else { $response.raw }
}

if ($response.ok) {
  $report.diagnosis += "O endpoint local /v1/messages respondeu com sucesso."
} else {
  $report.diagnosis += "O endpoint local /v1/messages falhou."
  $report.diagnosis += "Se o backend roda na sua maquina, confirme que o processo esta ativo e ouvindo na porta configurada."
}

$report | ConvertTo-Json -Depth 8
