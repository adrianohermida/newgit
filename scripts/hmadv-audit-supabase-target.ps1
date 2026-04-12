param(
  [string]$HmadvProjectRef = "sspvizogbcyigquqycsz",
  [string]$LinkedProjectRef = "",
  [switch]$Json
)

$ErrorActionPreference = "Stop"

function Invoke-SupabaseJson([string[]]$SupabaseArgs) {
  $output = & npx supabase @SupabaseArgs --output json 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: npx supabase $($SupabaseArgs -join ' ')"
  }
  $jsonText = ($output | Out-String).Trim()
  $arrayStart = $jsonText.IndexOf("[")
  $objectStart = $jsonText.IndexOf("{")
  $start = -1
  if ($arrayStart -ge 0 -and $objectStart -ge 0) {
    $start = [Math]::Min($arrayStart, $objectStart)
  } elseif ($arrayStart -ge 0) {
    $start = $arrayStart
  } elseif ($objectStart -ge 0) {
    $start = $objectStart
  }
  if ($start -gt 0) {
    $jsonText = $jsonText.Substring($start)
  }
  return $jsonText | ConvertFrom-Json
}

function Get-ServiceRoleKey([string]$ProjectRef) {
  $keys = Invoke-SupabaseJson @("projects", "api-keys", "--project-ref", $ProjectRef)
  $serviceRole = $keys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1
  if (-not $serviceRole) {
    throw "Nao foi possivel localizar service_role para o projeto $ProjectRef."
  }
  return $serviceRole.api_key
}

function Invoke-FunctionStatus([string]$ProjectRef, [string]$Path) {
  $serviceRole = Get-ServiceRoleKey $ProjectRef
  $headers = @{
    Authorization = "Bearer $serviceRole"
    apikey        = $serviceRole
  }
  $uri = "https://$ProjectRef.supabase.co/functions/v1/$Path"
  try {
    return Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
  } catch {
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
      try {
        return $raw | ConvertFrom-Json
      } catch {
        return @{ ok = $false; raw = $raw; error = $_.Exception.Message }
      }
    }
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

function Build-ProjectSnapshot([string]$ProjectRef) {
  $functions = & npx supabase functions list --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao listar functions do projeto $ProjectRef."
  }

  [ordered]@{
    projectRef     = $ProjectRef
    tpuStatus      = Invoke-FunctionStatus $ProjectRef "tpu-sync?action=status"
    syncWorker     = Invoke-FunctionStatus $ProjectRef "sync-worker?action=status"
    adviseStatus   = Invoke-FunctionStatus $ProjectRef "advise-sync?action=status"
    functionsTable = ($functions -join [Environment]::NewLine)
  }
}

$linked = Invoke-SupabaseJson @("projects", "list")
if ([string]::IsNullOrWhiteSpace($LinkedProjectRef)) {
  $linkedProject = $linked | Where-Object { $_.linked -eq $true } | Select-Object -First 1
  if ($linkedProject) {
    $LinkedProjectRef = $linkedProject.ref
  }
}

$report = [ordered]@{
  generatedAt      = (Get-Date).ToString("o")
  hmadvProjectRef  = $HmadvProjectRef
  linkedProjectRef = $LinkedProjectRef
  hmadvSnapshot    = Build-ProjectSnapshot $HmadvProjectRef
}

if (-not [string]::IsNullOrWhiteSpace($LinkedProjectRef) -and $LinkedProjectRef -ne $HmadvProjectRef) {
  $report.linkedSnapshot = Build-ProjectSnapshot $LinkedProjectRef
}

if ($Json) {
  $report | ConvertTo-Json -Depth 10
} else {
  Write-Host ""
  Write-Host "HMADV project ref: $HmadvProjectRef" -ForegroundColor Cyan
  Write-Host "Linked project ref: $LinkedProjectRef" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "== HMADV snapshot ==" -ForegroundColor Green
  ($report.hmadvSnapshot | ConvertTo-Json -Depth 8)
  if ($report.Contains("linkedSnapshot")) {
    Write-Host ""
    Write-Host "== Linked snapshot ==" -ForegroundColor Yellow
    ($report.linkedSnapshot | ConvertTo-Json -Depth 8)
  }
}
