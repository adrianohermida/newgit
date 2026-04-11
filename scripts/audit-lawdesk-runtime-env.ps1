param()

$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param(
    [string[]]$Names
  )

  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return [pscustomobject]@{
        name = $name
        value = $value
      }
    }
  }

  return [pscustomobject]@{
    name = $null
    value = $null
  }
}

function New-Check {
  param(
    [string]$Id,
    [string]$Scope,
    [string[]]$Keys,
    [bool]$Required = $true,
    [string]$Description = ""
  )

  $resolved = Get-EnvValue -Names $Keys
  [pscustomobject]@{
    id = $Id
    scope = $Scope
    required = $Required
    configured = -not [string]::IsNullOrWhiteSpace($resolved.value)
    configuredFrom = $resolved.name
    expectedKeys = $Keys
    description = $Description
  }
}

$checks = @(
  (New-Check -Id "pages_process_ai_base" -Scope "pages" -Keys @("PROCESS_AI_BASE", "LAWDESK_AI_BASE_URL") -Description "Base URL do worker HMADV IA usada pelo provider gpt no Pages."),
  (New-Check -Id "pages_shared_secret" -Scope "pages" -Keys @("HMDAV_AI_SHARED_SECRET", "HMADV_AI_SHARED_SECRET", "LAWDESK_AI_SHARED_SECRET") -Description "Secret compartilhado entre Pages e worker HMADV IA."),
  (New-Check -Id "pages_supabase_url" -Scope "pages" -Keys @("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") -Description "URL do Supabase usada por auth e rotas administrativas."),
  (New-Check -Id "pages_supabase_service_role" -Scope "pages" -Keys @("SUPABASE_SERVICE_ROLE_KEY") -Description "Credencial administrativa do Supabase para runtime protegido."),
  (New-Check -Id "pages_supabase_anon" -Scope "pages" -Keys @("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY") -Description "Bootstrap publico do dashboard administrativo."),
  (New-Check -Id "worker_shared_secret" -Scope "worker" -Keys @("HMDAV_AI_SHARED_SECRET", "HMADV_AI_SHARED_SECRET", "LAWDESK_AI_SHARED_SECRET") -Description "Secret que protege /execute e /v1/execute."),
  (New-Check -Id "worker_supabase_url" -Scope "worker" -Keys @("SUPABASE_URL") -Description "Base do Supabase para persistencia e reconcile."),
  (New-Check -Id "worker_supabase_service_role" -Scope "worker" -Keys @("SUPABASE_SERVICE_ROLE_KEY") -Description "Credencial administrativa do Supabase para worker."),
  (New-Check -Id "worker_freshsales_api_base" -Scope "worker" -Keys @("FRESHSALES_API_BASE") -Required $false -Description "Necessario para reconcile com CRM."),
  (New-Check -Id "worker_freshsales_api_key" -Scope "worker" -Keys @("FRESHSALES_API_KEY") -Required $false -Description "Necessario para reconcile com CRM."),
  (New-Check -Id "admin_token" -Scope "diagnostics" -Keys @("LAW_DESK_ADMIN_TOKEN", "LAWDESK_ADMIN_TOKEN", "HMADV_ADMIN_TOKEN") -Required $false -Description "Permite validar as rotas protegidas do Pages no gate.")
)

$missingRequired = @($checks | Where-Object { $_.required -and -not $_.configured })
$missingOptional = @($checks | Where-Object { -not $_.required -and -not $_.configured })

$diagnosis = New-Object System.Collections.Generic.List[string]
if ($missingRequired.Count -gt 0) {
  $diagnosis.Add("Existem variaveis obrigatorias ausentes para Pages/worker.")
}
if (($checks | Where-Object { $_.id -eq "pages_process_ai_base" -and -not $_.configured }).Count -gt 0) {
  $diagnosis.Add("O Pages nao encontrara o worker HMADV IA sem PROCESS_AI_BASE ou LAWDESK_AI_BASE_URL.")
}
if (($checks | Where-Object { $_.id -eq "admin_token" -and -not $_.configured }).Count -gt 0) {
  $diagnosis.Add("Sem token admin, o gate nao valida as rotas protegidas do Pages.")
}

$report = [ordered]@{
  checkedAt = (Get-Date).ToString("o")
  ok = ($missingRequired.Count -eq 0)
  checks = $checks
  summary = [ordered]@{
    total = $checks.Count
    configured = @($checks | Where-Object { $_.configured }).Count
    missingRequired = $missingRequired.Count
    missingOptional = $missingOptional.Count
  }
  diagnosis = @($diagnosis)
}

$report | ConvertTo-Json -Depth 8
