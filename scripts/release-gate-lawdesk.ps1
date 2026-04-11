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

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  try {
    $global:LASTEXITCODE = 0
    $result = & $Action
    $exitCode = $global:LASTEXITCODE
    if ($null -eq $exitCode) {
      $exitCode = 0
    }

    if ([int]$exitCode -ne 0) {
      return [ordered]@{
        name = $Name
        ok = $false
        result = $result
        error = "Exit code $exitCode"
      }
    }

    return [ordered]@{
      name = $Name
      ok = $true
      result = $result
      error = $null
    }
  } catch {
    return [ordered]@{
      name = $Name
      ok = $false
      result = $null
      error = $_.Exception.Message
    }
  }
}

$resolvedAdminToken = Resolve-EnvValue -ExplicitValue $AdminToken -Names @(
  "LAW_DESK_ADMIN_TOKEN",
  "LAWDESK_ADMIN_TOKEN",
  "HMADV_ADMIN_TOKEN"
)

$resolvedSharedSecret = Resolve-EnvValue -ExplicitValue $SharedSecret -Names @(
  "PROCESS_AI_SHARED_SECRET",
  "HMDAV_AI_SHARED_SECRET",
  "HMADV_AI_SHARED_SECRET",
  "LAWDESK_AI_SHARED_SECRET",
  "HMADV_PROCESS_AI_SHARED_SECRET",
  "WORKER_SHARED_SECRET"
)

$steps = @()
$steps += Invoke-Step -Name "audit:lawdesk-runtime-env" -Action {
  & powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\scripts\audit-lawdesk-runtime-env.ps1" *>&1 | Out-String
}
$steps += Invoke-Step -Name "test:functions-admin-providers-route" -Action {
  $env:NODE_NO_WARNINGS = "1"
  try {
    & node --experimental-vm-modules "D:\Github\newgit\tests\lawdesk\functions-admin-lawdesk-providers-route.test.cjs" 2>&1 | Out-String
  } finally {
    Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue
  }
}
$steps += Invoke-Step -Name "test:providers-health" -Action {
  $env:NODE_NO_WARNINGS = "1"
  try {
    & node --experimental-vm-modules "D:\Github\newgit\tests\lawdesk\providers-health.test.cjs" 2>&1 | Out-String
  } finally {
    Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue
  }
}
$steps += Invoke-Step -Name "test:llm-test" -Action {
  $env:NODE_NO_WARNINGS = "1"
  try {
    & node --experimental-vm-modules "D:\Github\newgit\tests\lawdesk\llm-test-console.test.cjs" 2>&1 | Out-String
  } finally {
    Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue
  }
}
$steps += Invoke-Step -Name "diagnose:hmadv-ai" -Action {
  $args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", "D:\Github\newgit\scripts\diagnose-hmadv-process-ai.ps1",
    "-BaseUrl", $AiBaseUrl
  )
  if (-not [string]::IsNullOrWhiteSpace($resolvedSharedSecret)) {
    $args += @("-SharedSecret", $resolvedSharedSecret)
  }
  & powershell @args *>&1 | Out-String
}
$steps += Invoke-Step -Name "verify:lawdesk-stack" -Action {
  $args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", "D:\Github\newgit\scripts\postdeploy-verify-lawdesk-stack.ps1",
    "-PagesBaseUrl", $PagesBaseUrl,
    "-AiBaseUrl", $AiBaseUrl
  )
  if (-not [string]::IsNullOrWhiteSpace($resolvedAdminToken)) {
    $args += @("-AdminToken", $resolvedAdminToken)
  }
  if (-not [string]::IsNullOrWhiteSpace($resolvedSharedSecret)) {
    $args += @("-SharedSecret", $resolvedSharedSecret)
  }
  & powershell @args *>&1 | Out-String
}

$failedSteps = @($steps | Where-Object { -not $_.ok })
$verifyStep = @($steps | Where-Object { $_.name -eq "verify:lawdesk-stack" } | Select-Object -First 1)
$envAuditStep = @($steps | Where-Object { $_.name -eq "audit:lawdesk-runtime-env" } | Select-Object -First 1)
$verifySummary = $null
$envAuditSummary = $null
if ($verifyStep -and $verifyStep.result) {
  try {
    $verifySummary = $verifyStep.result | ConvertFrom-Json
  } catch {
    $verifySummary = $null
  }
}
if ($envAuditStep -and $envAuditStep.result) {
  try {
    $envAuditSummary = $envAuditStep.result | ConvertFrom-Json
  } catch {
    $envAuditSummary = $null
  }
}

$releaseReady = $false
if (
  $failedSteps.Count -eq 0 -and
  $verifySummary -and $verifySummary.stackHealthy -eq $true -and
  $envAuditSummary -and $envAuditSummary.ok -eq $true
) {
  $releaseReady = $true
}

$report = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  pagesBaseUrl = $PagesBaseUrl
  aiBaseUrl = $AiBaseUrl
  adminTokenProvided = -not [string]::IsNullOrWhiteSpace($resolvedAdminToken)
  sharedSecretProvided = -not [string]::IsNullOrWhiteSpace($resolvedSharedSecret)
  gateOk = ($failedSteps.Count -eq 0)
  releaseReady = $releaseReady
  steps = $steps
  diagnosis = @()
}

if (-not $report.adminTokenProvided) {
  $report.diagnosis += "Token admin ausente: as rotas protegidas do Pages podem ficar parcialmente verificadas."
}

if (-not $report.sharedSecretProvided) {
  $report.diagnosis += "Shared secret ausente: o worker HMADV IA sera validado sem header autenticado."
}

if ($envAuditSummary -and $envAuditSummary.ok -eq $false) {
  $report.diagnosis += "O ambiente local/deploy ainda nao atende aos requisitos minimos de runtime do Lawdesk."
  $missingRequiredChecks = @($envAuditSummary.checks | Where-Object { $_.required -and -not $_.configured })
  if ($missingRequiredChecks.Count -gt 0) {
    $topMissing = @(
      $missingRequiredChecks |
        Select-Object -First 4 |
        ForEach-Object {
          if ($_.expectedKeys -and $_.expectedKeys.Count -gt 0) {
            $_.expectedKeys -join " | "
          } else {
            $_.id
          }
        }
    )
    if ($topMissing.Count -gt 0) {
      $report.diagnosis += "Envs obrigatorias ausentes: $($topMissing -join '; ')."
    }
  }
}

if ($verifySummary -and $verifySummary.summary) {
  if ($verifySummary.summary.executeOk -eq $true -and $verifySummary.summary.executeV1Ok -eq $false) {
    $report.diagnosis += "O worker HMADV IA esta divergente: /execute OK e /v1/execute falhou."
  } elseif ($verifySummary.summary.executeOk -eq $false -and $verifySummary.summary.executeV1Ok -eq $true) {
    $report.diagnosis += "O worker HMADV IA esta divergente: /v1/execute OK e /execute falhou."
  } elseif ($verifySummary.summary.executeOk -eq $false -and $verifySummary.summary.executeV1Ok -eq $false) {
    $report.diagnosis += "O worker HMADV IA falhou nas duas rotas de execucao."
  }
}

if ($failedSteps.Count -gt 0) {
  $report.diagnosis += "Ha falhas no gate. Priorize os passos com ok=false antes de validar UI."
} elseif (-not $report.releaseReady) {
  $report.diagnosis += "O gate executou, mas o stack ainda nao esta pronto para liberacao completa."
} else {
  $report.diagnosis += "Gate concluido com stack validado para liberacao."
}

$report | ConvertTo-Json -Depth 8
