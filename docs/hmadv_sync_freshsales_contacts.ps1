param(
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$ServiceRole = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$FreshsalesApiBase = $env:FRESHSALES_API_BASE,
  [string]$FreshsalesApiKey = $env:FRESHSALES_API_KEY,
  [string]$WorkspaceId = $env:HMADV_WORKSPACE_ID,
  [int]$Limite = 1000,
  [switch]$DryRun
)

if (-not $SupabaseUrl) { throw "Defina -SupabaseUrl ou env:SUPABASE_URL" }
if (-not $ServiceRole) { throw "Defina -ServiceRole ou env:SUPABASE_SERVICE_ROLE_KEY" }
if (-not $FreshsalesApiBase) { throw "Defina -FreshsalesApiBase ou env:FRESHSALES_API_BASE" }
if (-not $FreshsalesApiKey) { throw "Defina -FreshsalesApiKey ou env:FRESHSALES_API_KEY" }

$env:SUPABASE_URL = $SupabaseUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $ServiceRole
$env:FRESHSALES_API_BASE = $FreshsalesApiBase
$env:FRESHSALES_API_KEY = $FreshsalesApiKey
if ($WorkspaceId) { $env:HMADV_WORKSPACE_ID = $WorkspaceId }

$args = @(
  "scripts/sync-hmadv-freshsales-contacts-direct.js",
  "--limit", "$Limite"
)

if ($WorkspaceId) {
  $args += @("--workspace-id", "$WorkspaceId")
}

if ($DryRun) {
  $args += "--dry-run"
}

& node @args
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao executar sync-hmadv-freshsales-contacts-direct.js"
}
