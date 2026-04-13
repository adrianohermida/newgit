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

function Test-CommandExists([string]$Name) {
  try {
    $null = Get-Command $Name -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Test-DockerEngineAvailable {
  if (-not (Test-CommandExists "docker")) {
    return $false
  }

  try {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
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

function Build-SupabaseProbe {
  param(
    [string]$Id,
    [string]$Label,
    [bool]$Ok,
    [object]$Details
  )
  return [ordered]@{
    id = $Id
    label = $Label
    ok = $Ok
    status = $(if ($Ok) { "ok" } else { "error" })
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
$dockerAvailable = Test-CommandExists "docker"
$dockerEngineAvailable = Test-DockerEngineAvailable

$checks += Build-Check -Id "docker-engine" -Label "Docker Desktop" -Ok $dockerEngineAvailable -Status ($(if ($dockerEngineAvailable) { "ok" } elseif ($dockerAvailable) { "warning" } else { "error" })) -Details ([ordered]@{
  dockerInstalled = $dockerAvailable
  dockerEngineAvailable = $dockerEngineAvailable
})
if (-not $dockerAvailable) {
  $diagnosis += "Instale o Docker Desktop para subir o Supabase local."
} elseif (-not $dockerEngineAvailable) {
  $diagnosis += "Abra o Docker Desktop e aguarde o engine Linux iniciar antes de rodar npm run supabase:start-local."
}

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

$aiCoreCandidates = @(
  $resolvedAiCoreBaseUrl,
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8010"
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim().TrimEnd("/") } | Select-Object -Unique

$aiCoreHealth = $null
$resolvedAiCoreHealthBaseUrl = $resolvedAiCoreBaseUrl
$aiCoreSuccessfulProbes = @()
foreach ($candidate in $aiCoreCandidates) {
  $probe = Invoke-JsonRequest -Uri ($candidate + "/health") -Method "GET"
  if ($probe.ok) {
    $probeOffline = $false
    $probeLocalConfigured = $false
    if ($probe.data -and $probe.data.offline_mode -ne $null) {
      $probeOffline = [bool]$probe.data.offline_mode
    }
    if ($probe.data -and $probe.data.providers -and $probe.data.providers.local -and $probe.data.providers.local.configured -ne $null) {
      $probeLocalConfigured = [bool]$probe.data.providers.local.configured
    }
    $aiCoreSuccessfulProbes += @{
      candidate = $candidate
      probe = $probe
      isPreferred = $probeOffline -or $probeLocalConfigured
    }
  }
  if ($null -eq $aiCoreHealth) {
    $aiCoreHealth = $probe
  }
}
if ($aiCoreSuccessfulProbes.Count -gt 0) {
  $preferredProbe = $aiCoreSuccessfulProbes | Where-Object { $_.isPreferred } | Select-Object -First 1
  if ($null -eq $preferredProbe) {
    $preferredProbe = $aiCoreSuccessfulProbes | Select-Object -First 1
  }
  $aiCoreHealth = $preferredProbe.probe
  $resolvedAiCoreHealthBaseUrl = $preferredProbe.candidate
}
$checks += Build-Check -Id "ai-core" -Label "ai-core local" -Ok $aiCoreHealth.ok -Status ($(if ($aiCoreHealth.ok) { "ok" } else { "error" })) -Details ([ordered]@{
  baseUrl = $resolvedAiCoreHealthBaseUrl
  requestedBaseUrl = $resolvedAiCoreBaseUrl
  httpStatus = $aiCoreHealth.status
  offlineMode = if ($aiCoreHealth.data) { $aiCoreHealth.data.offline_mode } else { $null }
  raw = if ($aiCoreHealth.ok) { $aiCoreHealth.data } else { $aiCoreHealth.raw }
  error = $aiCoreHealth.error
  candidates = $aiCoreCandidates
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
  configured = (-not [string]::IsNullOrWhiteSpace($resolvedLocalLlmBaseUrl)) -or $localLlmOk
  autoDetected = [string]::IsNullOrWhiteSpace($resolvedLocalLlmBaseUrl) -and $localLlmOk
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
$supabaseSchemaChecks = @()
if (-not [string]::IsNullOrWhiteSpace($resolvedSupabaseUrl)) {
  $anonKey = First-Value @($env:SUPABASE_ANON_KEY, $env:NEXT_PUBLIC_SUPABASE_ANON_KEY)
  $serviceRoleKey = First-Value @($env:SUPABASE_SERVICE_ROLE_KEY)
  $embedSecret = First-Value @($env:DOTOBOT_SUPABASE_EMBED_SECRET, $env:HMDAV_AI_SHARED_SECRET, $env:HMADV_AI_SHARED_SECRET, $env:LAWDESK_AI_SHARED_SECRET)
  $restHeaders = @{}
  if (-not [string]::IsNullOrWhiteSpace($anonKey)) {
    $restHeaders.apikey = $anonKey
  }
  $authConfigProbe = Invoke-JsonRequest -Uri ($resolvedSupabaseUrl.TrimEnd("/") + "/rest/v1/") -Method "GET" -Headers $restHeaders
  $supabaseLocal = $authConfigProbe.ok
  $supabaseDetails.httpStatus = $authConfigProbe.status
  $supabaseDetails.raw = if ($authConfigProbe.ok) { $authConfigProbe.data } else { $authConfigProbe.raw }
  $supabaseDetails.error = $authConfigProbe.error
  $supabaseDetails.anonKeyConfigured = -not [string]::IsNullOrWhiteSpace($anonKey)
  $supabaseDetails.serviceRoleConfigured = -not [string]::IsNullOrWhiteSpace($serviceRoleKey)

  if (-not [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    $serviceHeaders = @{
      apikey = $serviceRoleKey
      Authorization = "Bearer $serviceRoleKey"
      Accept = "application/json"
    }

    $memoryTableProbe = Invoke-JsonRequest -Uri ($resolvedSupabaseUrl.TrimEnd("/") + "/rest/v1/dotobot_memory_embeddings?select=id&limit=1") -Method "GET" -Headers $serviceHeaders
    $supabaseSchemaChecks += Build-SupabaseProbe -Id "supabase-table-memory" -Label "Tabela dotobot_memory_embeddings" -Ok $memoryTableProbe.ok -Details ([ordered]@{
      endpoint = "/rest/v1/dotobot_memory_embeddings?select=id&limit=1"
      httpStatus = $memoryTableProbe.status
      error = $memoryTableProbe.error
      raw = if ($memoryTableProbe.ok) { $memoryTableProbe.data } else { $memoryTableProbe.raw }
    })

    $taskRunsProbe = Invoke-JsonRequest -Uri ($resolvedSupabaseUrl.TrimEnd("/") + "/rest/v1/dotobot_task_runs?select=id&limit=1") -Method "GET" -Headers $serviceHeaders
    $supabaseSchemaChecks += Build-SupabaseProbe -Id "supabase-table-task-runs" -Label "Tabela dotobot_task_runs" -Ok $taskRunsProbe.ok -Details ([ordered]@{
      endpoint = "/rest/v1/dotobot_task_runs?select=id&limit=1"
      httpStatus = $taskRunsProbe.status
      error = $taskRunsProbe.error
      raw = if ($taskRunsProbe.ok) { $taskRunsProbe.data } else { $taskRunsProbe.raw }
    })

    $rpcProbe = Invoke-JsonRequest -Uri ($resolvedSupabaseUrl.TrimEnd("/") + "/rest/v1/rpc/search_dotobot_memory_embeddings") -Method "POST" -Headers $serviceHeaders -Body @{
      query_embedding = @(0.0, 0.0, 0.0)
      match_count = 1
      match_threshold = $null
    }
    $rpcOk = $rpcProbe.ok -or ($rpcProbe.status -in @(400, 404, 422) -and [string]::IsNullOrWhiteSpace($rpcProbe.error) -eq $false -and $rpcProbe.raw -notmatch "Could not find")
    $supabaseSchemaChecks += Build-SupabaseProbe -Id "supabase-rpc-search-memory" -Label "RPC search_dotobot_memory_embeddings" -Ok $rpcOk -Details ([ordered]@{
      endpoint = "/rest/v1/rpc/search_dotobot_memory_embeddings"
      httpStatus = $rpcProbe.status
      error = $rpcProbe.error
      raw = if ($rpcProbe.ok) { $rpcProbe.data } else { $rpcProbe.raw }
    })

    $embedHeaders = @{
      apikey = $serviceRoleKey
      Authorization = "Bearer $serviceRoleKey"
      "Content-Type" = "application/json"
    }
    if (-not [string]::IsNullOrWhiteSpace($embedSecret)) {
      $embedHeaders["x-dotobot-embed-secret"] = $embedSecret
    }
    $embedProbe = Invoke-JsonRequest -Uri ($resolvedSupabaseUrl.TrimEnd("/") + "/functions/v1/dotobot-embed") -Method "POST" -Headers $embedHeaders -Body @{
      input = "healthcheck dotobot offline local"
      model = "supabase/gte-small"
    }
    $embedOk = $embedProbe.ok
    $supabaseSchemaChecks += Build-SupabaseProbe -Id "supabase-function-dotobot-embed" -Label "Function dotobot-embed" -Ok $embedOk -Details ([ordered]@{
      endpoint = "/functions/v1/dotobot-embed"
      httpStatus = $embedProbe.status
      error = $embedProbe.error
      raw = if ($embedProbe.ok) { $embedProbe.data } else { $embedProbe.raw }
      embedSecretConfigured = -not [string]::IsNullOrWhiteSpace($embedSecret)
    })
  }
}
$checks += Build-Check -Id "supabase-local" -Label "Supabase local" -Ok $supabaseLocal -Status ($(if ($supabaseLocal) { "ok" } elseif ([string]::IsNullOrWhiteSpace($resolvedSupabaseUrl)) { "warning" } else { "error" })) -Details $supabaseDetails
$checks += $supabaseSchemaChecks
if (-not $supabaseLocal) {
  $diagnosis += "Se quiser persistencia estruturada offline, suba o Supabase local com npm run supabase:start-local."
}
if ($supabaseLocal -and $supabaseSchemaChecks.Count -gt 0) {
  $failedSupabaseChecks = @($supabaseSchemaChecks | Where-Object { -not $_.ok })
  if ($failedSupabaseChecks.Count -gt 0) {
    $diagnosis += "Supabase local respondeu, mas o contrato offline ainda esta incompleto: $((@($failedSupabaseChecks.label) -join ', '))."
  } else {
    $diagnosis += "Supabase local com contrato principal validado: tabelas Dotobot, RPC de busca e function dotobot-embed."
  }
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
    supabaseSchemaReady = ($supabaseSchemaChecks.Count -gt 0 -and (@($supabaseSchemaChecks | Where-Object { -not $_.ok }).Count -eq 0))
  }
  checks = $checks
  diagnosis = $diagnosis
}

$report | ConvertTo-Json -Depth 10
