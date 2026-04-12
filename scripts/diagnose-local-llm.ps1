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
    return @{
      ok = $false
      status = $status
      data = $null
      raw = $raw
      error = $_.Exception.Message
    }
  }
}

function Build-AuthHeaders([string]$ApiKey, [string]$AuthToken) {
  $headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
    $headers["x-api-key"] = $ApiKey
    $headers["Authorization"] = "Bearer $ApiKey"
  }
  if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
    $headers["Authorization"] = "Bearer $AuthToken"
  }
  return $headers
}

$resolvedBaseUrl = First-Value @(
  $BaseUrl,
  $env:LOCAL_LLM_BASE_URL,
  $env:LLM_BASE_URL,
  $env:LAWDESK_CODE_API_BASE_URL,
  $env:AICORE_LOCAL_LLM_BASE_URL,
  $env:AICORE_API_BASE_URL,
  $env:DOTOBOT_PYTHON_API_BASE
)
$resolvedModel = First-Value @($Model, $env:LOCAL_LLM_MODEL, $env:LLM_MODEL, "aetherlab-legal-local-v1")
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
  $report.diagnosis += "Defina LOCAL_LLM_BASE_URL, LLM_BASE_URL, LAWDESK_CODE_API_BASE_URL, AICORE_LOCAL_LLM_BASE_URL, AICORE_API_BASE_URL ou DOTOBOT_PYTHON_API_BASE."
  $report | ConvertTo-Json -Depth 8
  exit 0
}

$base = $resolvedBaseUrl.Trim().TrimEnd("/")
$authHeaders = Build-AuthHeaders -ApiKey $resolvedApiKey -AuthToken $resolvedAuthToken

$messagesHeaders = @{
  "Content-Type" = "application/json"
  "x-llm-version" = "2023-06-01"
}
foreach ($key in $authHeaders.Keys) {
  $messagesHeaders[$key] = $authHeaders[$key]
}

$messagesProbe = Invoke-JsonRequest -Uri "$base/v1/messages" -Method "POST" -Headers $messagesHeaders -Body @{
  model = $resolvedModel
  max_tokens = 120
  system = "Diagnostico do endpoint local compativel com /v1/messages."
  stream = $false
  messages = @(
    @{
      role = "user"
      content = @(
        @{
          type = "text"
          text = "Responda apenas com uma frase curta confirmando se o endpoint local esta funcional."
        }
      )
    }
  )
}

if ($messagesProbe.ok) {
  $items = @($messagesProbe.data.content)
  $preview = if ($items.Count -gt 0 -and $items[0].text) { [string]$items[0].text } else { $null }
  $report.probe = [ordered]@{
    ok = $true
    mode = "anthropic-compatible"
    status = $messagesProbe.status
    endpoint = "$base/v1/messages"
    error = $null
    model = if ($messagesProbe.data.model) { $messagesProbe.data.model } else { $resolvedModel }
    preview = if ($preview) { $preview.Substring(0, [Math]::Min(160, $preview.Length)) } else { $null }
    raw = $messagesProbe.data
  }
  $report.diagnosis += "O endpoint local respondeu via /v1/messages."
  $report | ConvertTo-Json -Depth 8
  exit 0
}

$modelsProbe = Invoke-JsonRequest -Uri "$base/v1/models" -Method "GET" -Headers $authHeaders
if ($modelsProbe.ok) {
  $models = @($modelsProbe.data.data)
  $detectedModel = if ($models.Count -gt 0 -and $models[0].id) { [string]$models[0].id } else { $resolvedModel }
  $report.probe = [ordered]@{
    ok = $true
    mode = "openai-compatible"
    status = $modelsProbe.status
    endpoint = "$base/v1/models"
    error = $null
    model = $detectedModel
    preview = "Servidor local respondeu com catalogo de modelos OpenAI-compatible."
    raw = $modelsProbe.data
  }
  $report.diagnosis += "O endpoint local respondeu via /v1/models (OpenAI-compatible)."
  $report.diagnosis += "Use o ai-core local como ponte para Copilot e AI Task, ou exponha tambem /v1/messages."
  $report | ConvertTo-Json -Depth 8
  exit 0
}

$ollamaProbe = Invoke-JsonRequest -Uri "$base/api/tags" -Method "GET"
if ($ollamaProbe.ok) {
  $models = @($ollamaProbe.data.models)
  $detectedModel = if ($models.Count -gt 0 -and $models[0].name) { [string]$models[0].name } else { $resolvedModel }
  $report.probe = [ordered]@{
    ok = $true
    mode = "ollama"
    status = $ollamaProbe.status
    endpoint = "$base/api/tags"
    error = $null
    model = $detectedModel
    preview = "Servidor local respondeu com catalogo de modelos Ollama."
    raw = $ollamaProbe.data
  }
  $report.diagnosis += "O endpoint local respondeu via /api/tags (Ollama)."
  $report.diagnosis += "Use o ai-core local como ponte para Copilot e AI Task, ou exponha um gateway compativel."
  $report | ConvertTo-Json -Depth 8
  exit 0
}

$report.probe = [ordered]@{
  ok = $false
  mode = $null
  status = if ($messagesProbe.status) { $messagesProbe.status } elseif ($modelsProbe.status) { $modelsProbe.status } else { $ollamaProbe.status }
  endpoint = $base
  error = if ($messagesProbe.error) { $messagesProbe.error } elseif ($modelsProbe.error) { $modelsProbe.error } else { $ollamaProbe.error }
  model = $null
  preview = $null
  raw = [ordered]@{
    messages = if ($messagesProbe.ok) { $messagesProbe.data } else { $messagesProbe.raw }
    models = if ($modelsProbe.ok) { $modelsProbe.data } else { $modelsProbe.raw }
    ollama = if ($ollamaProbe.ok) { $ollamaProbe.data } else { $ollamaProbe.raw }
  }
}
$report.diagnosis += "O endpoint local nao respondeu como /v1/messages, /v1/models nem /api/tags."
$report.diagnosis += "Se o backend roda na sua maquina, confirme que o processo esta ativo e ouvindo na porta configurada."

$report | ConvertTo-Json -Depth 8
