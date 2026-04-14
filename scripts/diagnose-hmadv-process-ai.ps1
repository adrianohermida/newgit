param(
  [string]$BaseUrl = "https://ai.hermidamaia.adv.br",
  [string]$SharedSecret = ""
)

$ErrorActionPreference = "Stop"

function Import-LocalEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if (-not $name) { return }
    if ([string]::IsNullOrWhiteSpace((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
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
    $requestParams.Body = ($Body | ConvertTo-Json -Depth 8)
  }

  try {
    $response = Invoke-WebRequest @requestParams
    return @{
      ok = $true
      status = [int]$response.StatusCode
      data = ($response.Content | ConvertFrom-Json)
      raw = $response.Content
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

    $parsed = $null
    if ($raw) {
      try {
        $parsed = $raw | ConvertFrom-Json
      } catch {
        $parsed = $null
      }
    }

    return @{
      ok = $false
      status = $status
      data = $parsed
      raw = $raw
      error = $_.Exception.Message
    }
  }
}

function Get-Headers {
  $headers = @{}
  if (-not [string]::IsNullOrWhiteSpace($SharedSecret)) {
    $headers["x-shared-secret"] = $SharedSecret
  }
  return $headers
}

Import-LocalEnvFile (Join-Path $PSScriptRoot '..\.dev.vars')
if ([string]::IsNullOrWhiteSpace($SharedSecret)) {
  $SharedSecret = $env:HMDAV_AI_SHARED_SECRET
}

$base = $BaseUrl.Trim().TrimEnd("/")
$headers = Get-Headers

$health = Invoke-JsonRequest -Uri "$base/health" -Headers $headers
$executeBody = @{
  query = "diagnostico smoke"
  context = @{
    route = "/diagnose-hmadv-process-ai"
    assistant = @{
      role = "diagnostics"
      mode = "analysis"
    }
  }
}
$execute = Invoke-JsonRequest -Uri "$base/execute" -Method "POST" -Headers $headers -Body $executeBody
$executeV1 = Invoke-JsonRequest -Uri "$base/v1/execute" -Method "POST" -Headers $headers -Body $executeBody
$messagesBody = @{
  model = "aetherlab-legal-v1"
  max_tokens = 300
  system = "Diagnostico tecnico do endpoint custom."
  stream = $false
  messages = @(
    @{
      role = "user"
      content = @(
        @{
          type = "text"
          text = "Responda com uma confirmacao curta de que o endpoint /v1/messages esta funcional."
        }
      )
    }
  )
}
$messagesV1 = Invoke-JsonRequest -Uri "$base/v1/messages" -Method "POST" -Headers $headers -Body $messagesBody

$messagesPreview = $null
$messagesModel = $null
if ($messagesV1.ok -and $messagesV1.data) {
  $messagesModel = if ($messagesV1.data.model) { [string]$messagesV1.data.model } else { $null }
  $contentItems = @()
  if ($messagesV1.data.content) {
    $contentItems = @($messagesV1.data.content)
  }
  if ($contentItems.Count -gt 0 -and $contentItems[0] -and $contentItems[0].text) {
    $messagesPreview = [string]$contentItems[0].text
  } elseif ($messagesV1.data.resultText) {
    $messagesPreview = [string]$messagesV1.data.resultText
  } elseif ($messagesV1.data.response) {
    $messagesPreview = [string]$messagesV1.data.response
  }
}

$healthData = $health.data
$routes = @()
if ($healthData -and $healthData.routes) {
  $routes = @($healthData.routes)
}

$report = [ordered]@{
  baseUrl = $base
  health = [ordered]@{
    ok = $health.ok
    status = $health.status
    service = $healthData.service
    now = $healthData.now
    routes = $routes
    authConfigured = $healthData.auth_configured
    vectorize = $healthData.vectorize
    d1 = $healthData.d1
    kv = $healthData.kv
    r2 = $healthData.r2
    raw = if ($health.ok) { $healthData } else { $health.raw }
  }
  execute = [ordered]@{
    ok = $execute.ok
    status = $execute.status
    error = if ($execute.data.error) { $execute.data.error } else { $execute.error }
    resultTextPreview = if ($execute.data.resultText) { [string]$execute.data.resultText.Substring(0, [Math]::Min(160, $execute.data.resultText.Length)) } else { $null }
    raw = if ($execute.ok) { $execute.data } else { $execute.raw }
  }
  executeV1 = [ordered]@{
    ok = $executeV1.ok
    status = $executeV1.status
    error = if ($executeV1.data.error) { $executeV1.data.error } else { $executeV1.error }
    resultTextPreview = if ($executeV1.data.resultText) { [string]$executeV1.data.resultText.Substring(0, [Math]::Min(160, $executeV1.data.resultText.Length)) } else { $null }
    raw = if ($executeV1.ok) { $executeV1.data } else { $executeV1.raw }
  }
  messagesV1 = [ordered]@{
    ok = $messagesV1.ok
    status = $messagesV1.status
    error = if ($messagesV1.data.error) { $messagesV1.data.error } else { $messagesV1.error }
    resultTextPreview = if ($messagesPreview) { [string]$messagesPreview.Substring(0, [Math]::Min(160, $messagesPreview.Length)) } else { $null }
    model = $messagesModel
    raw = if ($messagesV1.ok) { $messagesV1.data } else { $messagesV1.raw }
  }
  diagnosis = @()
}

if (-not $health.ok) {
  $report.diagnosis += "Health falhou. Prioridade total em disponibilidade do worker."
}
if ($execute.ok -and $executeV1.ok) {
  $report.diagnosis += "As rotas /execute e /v1/execute responderam com sucesso."
}
if ($execute.ok -and -not $executeV1.ok) {
  $report.diagnosis += "A rota /execute respondeu, mas /v1/execute falhou. Ha divergencia de runtime ou deploy parcial."
}
if (-not $execute.ok -and $executeV1.ok) {
  $report.diagnosis += "A rota /v1/execute respondeu, mas /execute falhou. Ha divergencia de runtime ou deploy parcial."
}
if (-not $execute.ok -and -not $executeV1.ok) {
  $report.diagnosis += "As rotas /execute e /v1/execute falharam. A camada de execucao do worker nao esta estavel."
}
if ($messagesV1.ok) {
  $report.diagnosis += "A rota /v1/messages respondeu com sucesso para o alias do modelo AetherLab."
}
if (-not $messagesV1.ok) {
  $report.diagnosis += "A rota /v1/messages falhou. O provider custom nao esta operacional no worker remoto."
}
if ($health.ok -and (-not $routes -or $routes.Count -eq 0)) {
  $report.diagnosis += "O health nao anuncia rotas suportadas. Isso sugere deploy antigo do payload de health ou build remoto ainda sem fingerprint novo."
}
if ($health.ok -and $execute.ok -and $executeV1.ok) {
  $report.diagnosis += "Se o provider gpt segue falhando na aplicacao, revise PROCESS_AI_BASE/LAWDESK_AI_BASE_URL, cache de build e secrets do app, nao o worker."
}
if ($health.ok -and $healthData.auth_configured -eq $false) {
  $report.diagnosis += "O worker publico esta sem secret configurado; isso merece endurecimento antes de producao."
}

$report | ConvertTo-Json -Depth 8
