param(
  [string]$AiCoreBaseUrl = "",
  [string]$LocalLlmBaseUrl = "",
  [string]$ExtensionBaseUrl = "",
  [string]$SupabaseUrl = "",
  [string]$ObsidianVaultPath = ""
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

function Parse-Bool([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }
  return @("1", "true", "yes", "y", "on") -contains $Value.Trim().ToLowerInvariant()
}

function Invoke-JsonRequest {
  param(
    [string]$Uri,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [int]$TimeoutSec = 20
  )

  $requestParams = @{
    Uri = $Uri
    Method = $Method
    Headers = $Headers
    TimeoutSec = $TimeoutSec
    UseBasicParsing = $true
  }

  if ($null -ne $Body) {
    $requestParams.ContentType = "application/json"
    $requestParams.Body = ($Body | ConvertTo-Json -Depth 12)
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

function Build-Check {
  param(
    [string]$Id,
    [string]$Label,
    [bool]$Ok,
    [string]$Status,
    [object]$Details
  )
  return [ordered]@{
    id = $Id
    label = $Label
    ok = $Ok
    status = $Status
    details = $Details
  }
}

function Join-Url([string]$BaseUrl, [string]$Path) {
  if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    return $Path
  }
  return $BaseUrl.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function New-LocalProbeResult {
  return [ordered]@{
    ok = $false
    runtime = $null
    baseUrl = $null
    probeUrl = $null
    configured = $false
    model = $null
    httpStatus = $null
    raw = $null
    error = $null
    recommendation = $null
  }
}

function Test-AnthropicMessagesProbe {
  param(
    [string]$BaseUrl,
    [string]$Model,
    [string]$ApiKey,
    [string]$AuthToken
  )

  $result = New-LocalProbeResult
  $result.runtime = "anthropic-compatible"
  $result.baseUrl = $BaseUrl
  $result.probeUrl = (Join-Url $BaseUrl "/v1/messages")
  $result.model = $Model
  $result.configured = -not [string]::IsNullOrWhiteSpace($BaseUrl)
  $result.recommendation = "Servidor OpenAI/Anthropic-compatible local respondendo em /v1/messages."

  if (-not $result.configured) {
    return $result
  }

  $headers = @{
    "Content-Type" = "application/json"
    "x-llm-version" = "2023-06-01"
  }
  if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
    $headers["x-api-key"] = $ApiKey
  }
  if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
    $headers["Authorization"] = "Bearer $AuthToken"
  }

  $probe = Invoke-JsonRequest -Uri $result.probeUrl -Method "POST" -Headers $headers -Body @{
    model = $Model
    max_tokens = 80
    stream = $false
    messages = @(
      @{
        role = "user"
        content = @(
          @{
            type = "text"
            text = "Responda apenas: ok"
          }
        )
      }
    )
  }

  $result.ok = $probe.ok
  $result.httpStatus = $probe.status
  $result.raw = if ($probe.ok) { $probe.data } else { $probe.raw }
  $result.error = $probe.error
  return $result
}

function Test-OpenAiModelsProbe {
  param(
    [string]$BaseUrl,
    [string]$ApiKey,
    [string]$AuthToken
  )

  $result = New-LocalProbeResult
  $result.runtime = "openai-compatible"
  $result.baseUrl = $BaseUrl
  $result.probeUrl = (Join-Url $BaseUrl "/v1/models")
  $result.configured = -not [string]::IsNullOrWhiteSpace($BaseUrl)
  $result.recommendation = "Servidor OpenAI-compatible local encontrado. Aponte LOCAL_LLM_BASE_URL para ele ou deixe o ai-core consumi-lo diretamente."

  if (-not $result.configured) {
    return $result
  }

  $headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($ApiKey)) {
    $headers["x-api-key"] = $ApiKey
    $headers["Authorization"] = "Bearer $ApiKey"
  } elseif (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
    $headers["Authorization"] = "Bearer $AuthToken"
  }

  $probe = Invoke-JsonRequest -Uri $result.probeUrl -Method "GET" -Headers $headers
  $result.ok = $probe.ok
  $result.httpStatus = $probe.status
  $result.raw = if ($probe.ok) { $probe.data } else { $probe.raw }
  $result.error = $probe.error

  if ($probe.ok -and $probe.data -and $probe.data.data -and $probe.data.data.Count -gt 0) {
    $result.model = $probe.data.data[0].id
  }

  return $result
}

function Test-OllamaProbe {
  param(
    [string]$BaseUrl
  )

  $result = New-LocalProbeResult
  $result.runtime = "ollama"
  $result.baseUrl = $BaseUrl
  $result.probeUrl = (Join-Url $BaseUrl "/api/tags")
  $result.configured = -not [string]::IsNullOrWhiteSpace($BaseUrl)
  $result.recommendation = "Ollama local encontrado. Aponte LOCAL_LLM_BASE_URL para ele ou deixe o ai-core usar /api/chat diretamente."

  if (-not $result.configured) {
    return $result
  }

  $probe = Invoke-JsonRequest -Uri $result.probeUrl -Method "GET"
  $result.ok = $probe.ok
  $result.httpStatus = $probe.status
  $result.raw = if ($probe.ok) { $probe.data } else { $probe.raw }
  $result.error = $probe.error

  if ($probe.ok -and $probe.data -and $probe.data.models -and $probe.data.models.Count -gt 0) {
    $result.model = $probe.data.models[0].name
  }

  return $result
}

function Resolve-LocalLlmRuntime {
  param(
    [string]$PreferredBaseUrl,
    [string]$PreferredModel,
    [string]$ApiKey,
    [string]$AuthToken
  )

  $candidates = @()
  foreach ($candidate in @(
    $PreferredBaseUrl,
    $env:LOCAL_LLM_BASE_URL,
    $env:LLM_BASE_URL,
    $env:AICORE_LOCAL_LLM_BASE_URL,
    "http://127.0.0.1:11434",
    "http://127.0.0.1:1234",
    "http://127.0.0.1:8001"
  )) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      $trimmed = $candidate.Trim().TrimEnd("/")
      if ($candidates -notcontains $trimmed) {
        $candidates += $trimmed
      }
    }
  }

  $attempts = @()
  foreach ($candidate in $candidates) {
    foreach ($probeResult in @(
      (Test-AnthropicMessagesProbe -BaseUrl $candidate -Model $PreferredModel -ApiKey $ApiKey -AuthToken $AuthToken),
      (Test-OpenAiModelsProbe -BaseUrl $candidate -ApiKey $ApiKey -AuthToken $AuthToken),
      (Test-OllamaProbe -BaseUrl $candidate)
    )) {
      $attempts += $probeResult
      if ($probeResult.ok) {
        return [ordered]@{
          selected = $probeResult
          attempts = $attempts
        }
      }
    }
  }

  return [ordered]@{
    selected = $null
    attempts = $attempts
  }
}

$resolvedAiCoreBaseUrl = First-Value @(
  $AiCoreBaseUrl,
  $env:AICORE_API_BASE_URL,
  "http://127.0.0.1:8000"
)
$resolvedLocalLlmBaseUrl = First-Value @(
  $LocalLlmBaseUrl,
  $env:LOCAL_LLM_BASE_URL,
  $env:LLM_BASE_URL,
  $env:AICORE_LOCAL_LLM_BASE_URL
)
$resolvedExtensionBaseUrl = First-Value @(
  $ExtensionBaseUrl,
  $env:UNIVERSAL_LLM_EXTENSION_BASE_URL,
  $env:UNIVERSAL_LLM_ASSISTANT_BASE_URL,
  "http://127.0.0.1:32123"
)
$resolvedSupabaseUrl = First-Value @(
  $SupabaseUrl,
  $env:SUPABASE_URL,
  $env:NEXT_PUBLIC_SUPABASE_URL
)
$resolvedVaultPath = First-Value @(
  $ObsidianVaultPath,
  $env:DOTOBOT_OBSIDIAN_VAULT_PATH,
  $env:LAWDESK_OBSIDIAN_VAULT_PATH,
  $env:OBSIDIAN_VAULT_PATH
)

$offlineMode = Parse-Bool(First-Value @(
  $env:LAWDESK_OFFLINE_MODE,
  $env:NEXT_PUBLIC_LAWDESK_OFFLINE_MODE,
  $env:AICORE_OFFLINE_MODE,
  $env:AI_CORE_OFFLINE_MODE
))

$checks = @()
$diagnosis = @()

$envCheck = Build-Check -Id "offline-flags" -Label "Flags de offline" -Ok $offlineMode -Status ($(if ($offlineMode) { "ok" } else { "warning" })) -Details ([ordered]@{
  offlineMode = $offlineMode
  lawdeskOffline = $env:LAWDESK_OFFLINE_MODE
  nextPublicOffline = $env:NEXT_PUBLIC_LAWDESK_OFFLINE_MODE
  aiCoreOffline = First-Value @($env:AICORE_OFFLINE_MODE, $env:AI_CORE_OFFLINE_MODE)
})
$checks += $envCheck
if (-not $offlineMode) {
  $diagnosis += "Ative LAWDESK_OFFLINE_MODE=true e AICORE_OFFLINE_MODE=true para travar o modo offline."
}

$obsidianExists = $false
$memoryDirExists = $false
$memoryDir = $null
if (-not [string]::IsNullOrWhiteSpace($resolvedVaultPath)) {
  $obsidianExists = Test-Path -LiteralPath $resolvedVaultPath
  $memoryDir = Join-Path $resolvedVaultPath "Dotobot\\Memory"
  $memoryDirExists = Test-Path -LiteralPath $memoryDir
}
$checks += Build-Check -Id "obsidian-vault" -Label "Obsidian local" -Ok $obsidianExists -Status ($(if ($obsidianExists) { "ok" } else { "error" })) -Details ([ordered]@{
  vaultPath = $resolvedVaultPath
  vaultExists = $obsidianExists
  memoryDir = $memoryDir
  memoryDirExists = $memoryDirExists
})
if (-not $obsidianExists) {
  $diagnosis += "Configure DOTOBOT_OBSIDIAN_VAULT_PATH com um vault local valido."
} elseif (-not $memoryDirExists) {
  $diagnosis += "Crie a pasta Dotobot\\Memory dentro do vault do Obsidian para persistencia local."
}

$aiCoreHealth = Invoke-JsonRequest -Uri ($resolvedAiCoreBaseUrl.TrimEnd("/") + "/health") -Method "GET"
$checks += Build-Check -Id "ai-core" -Label "ai-core local" -Ok $aiCoreHealth.ok -Status ($(if ($aiCoreHealth.ok) { "ok" } else { "error" })) -Details ([ordered]@{
  baseUrl = $resolvedAiCoreBaseUrl
  httpStatus = $aiCoreHealth.status
  offlineMode = if ($aiCoreHealth.data) { $aiCoreHealth.data.offline_mode } else { $null }
  raw = if ($aiCoreHealth.ok) { $aiCoreHealth.data } else { $aiCoreHealth.raw }
  error = $aiCoreHealth.error
})
if (-not $aiCoreHealth.ok) {
  $diagnosis += "Suba o ai-core local com npm run start:ai-core-local."
}

$resolvedLocalLlmModel = First-Value @(
  $env:LOCAL_LLM_MODEL,
  $env:LLM_MODEL,
  "aetherlab-legal-local-v1"
)
$localLlmRuntime = Resolve-LocalLlmRuntime `
  -PreferredBaseUrl $resolvedLocalLlmBaseUrl `
  -PreferredModel $resolvedLocalLlmModel `
  -ApiKey (First-Value @($env:LOCAL_LLM_API_KEY, $env:LLM_API_KEY)) `
  -AuthToken (First-Value @($env:LOCAL_LLM_AUTH_TOKEN, $env:LLM_AUTH_TOKEN))
$selectedLocalLlm = $localLlmRuntime.selected
$localLlmOk = $null -ne $selectedLocalLlm -and $selectedLocalLlm.ok
$localLlmDetails = [ordered]@{
  baseUrl = $resolvedLocalLlmBaseUrl
  configured = -not [string]::IsNullOrWhiteSpace($resolvedLocalLlmBaseUrl)
  requestedModel = $resolvedLocalLlmModel
  detectedRuntime = if ($selectedLocalLlm) { $selectedLocalLlm.runtime } else { $null }
  resolvedBaseUrl = if ($selectedLocalLlm) { $selectedLocalLlm.baseUrl } else { $null }
  resolvedProbeUrl = if ($selectedLocalLlm) { $selectedLocalLlm.probeUrl } else { $null }
  resolvedModel = if ($selectedLocalLlm) { $selectedLocalLlm.model } else { $null }
  httpStatus = if ($selectedLocalLlm) { $selectedLocalLlm.httpStatus } else { $null }
  raw = if ($selectedLocalLlm) { $selectedLocalLlm.raw } else { $null }
  error = if ($selectedLocalLlm) { $selectedLocalLlm.error } else { $null }
  recommendation = if ($selectedLocalLlm) { $selectedLocalLlm.recommendation } else { "Nenhum runtime local conhecido respondeu." }
  attempts = $localLlmRuntime.attempts
}
$checks += Build-Check -Id "local-llm" -Label "LLM local real" -Ok $localLlmOk -Status ($(if ($localLlmOk) { "ok" } elseif ([string]::IsNullOrWhiteSpace($resolvedLocalLlmBaseUrl)) { "warning" } else { "error" })) -Details $localLlmDetails
if (-not $localLlmOk) {
  $diagnosis += "Nenhum runtime local compativel respondeu. Tente Ollama em 11434, LM Studio/OpenAI-compatible em 1234 ou um gateway local /v1/messages para o AetherLab."
} elseif ($selectedLocalLlm.runtime -eq "ollama") {
  $diagnosis += "Ollama local foi detectado. Agora basta apontar LOCAL_LLM_BASE_URL para esse runtime e subir o ai-core."
} elseif ($selectedLocalLlm.runtime -eq "openai-compatible") {
  $diagnosis += "Servidor OpenAI-compatible local detectado. Agora basta apontar LOCAL_LLM_BASE_URL para esse runtime e subir o ai-core."
}

$extensionHealth = Invoke-JsonRequest -Uri ($resolvedExtensionBaseUrl.TrimEnd("/") + "/health") -Method "GET"
$checks += Build-Check -Id "universal-extension" -Label "Universal LLM Assistant local" -Ok $extensionHealth.ok -Status ($(if ($extensionHealth.ok) { "ok" } else { "warning" })) -Details ([ordered]@{
  baseUrl = $resolvedExtensionBaseUrl
  httpStatus = $extensionHealth.status
  raw = if ($extensionHealth.ok) { $extensionHealth.data } else { $extensionHealth.raw }
  error = $extensionHealth.error
})
if (-not $extensionHealth.ok) {
  $diagnosis += "Suba a extensao local com npm run start:universal-llm-extension."
}

$supabaseLocal = $false
$supabaseDetails = [ordered]@{
  url = $resolvedSupabaseUrl
  configured = -not [string]::IsNullOrWhiteSpace($resolvedSupabaseUrl)
}
if (-not [string]::IsNullOrWhiteSpace($resolvedSupabaseUrl)) {
  $authConfigProbe = Invoke-JsonRequest -Uri ($resolvedSupabaseUrl.TrimEnd("/") + "/rest/v1/") -Method "GET" -Headers @{
    apikey = (First-Value @($env:SUPABASE_ANON_KEY, $env:NEXT_PUBLIC_SUPABASE_ANON_KEY))
  }
  $supabaseLocal = $authConfigProbe.ok
  $supabaseDetails.httpStatus = $authConfigProbe.status
  $supabaseDetails.raw = if ($authConfigProbe.ok) { $authConfigProbe.data } else { $authConfigProbe.raw }
  $supabaseDetails.error = $authConfigProbe.error
}
$checks += Build-Check -Id "supabase-local" -Label "Supabase local" -Ok $supabaseLocal -Status ($(if ($supabaseLocal) { "ok" } elseif ([string]::IsNullOrWhiteSpace($resolvedSupabaseUrl)) { "warning" } else { "error" })) -Details $supabaseDetails
if (-not $supabaseLocal) {
  $diagnosis += "Se quiser persistencia estruturada offline, suba o Supabase local com supabase start."
}

$readyForOffline = (
  $offlineMode -and
  $obsidianExists -and
  $aiCoreHealth.ok -and
  $localLlmOk
)

$report = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  readyForOffline = $readyForOffline
  summary = [ordered]@{
    offlineMode = $offlineMode
    obsidianReady = $obsidianExists
    aiCoreReady = $aiCoreHealth.ok
    localLlmReady = $localLlmOk
    extensionReady = $extensionHealth.ok
    supabaseLocalReady = $supabaseLocal
  }
  checks = $checks
  diagnosis = $diagnosis
}

$report | ConvertTo-Json -Depth 10
