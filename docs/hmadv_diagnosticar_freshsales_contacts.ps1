param(
  [string]$FreshsalesApiBase = $env:FRESHSALES_API_BASE,
  [string]$FreshsalesApiKey = $env:FRESHSALES_API_KEY,
  [string[]]$AccountIds = @("31013987059","31013987449","31013987096")
)

if (-not $FreshsalesApiBase) { throw "Defina -FreshsalesApiBase ou env:FRESHSALES_API_BASE" }
if (-not $FreshsalesApiKey) { throw "Defina -FreshsalesApiKey ou env:FRESHSALES_API_KEY" }

function Normalize-Base([string]$base) {
  $b = $base.Trim().TrimEnd('/')
  if ($b -match '\.freshsales\.io$') { return "$b/api" }
  if ($b -match '\.freshsales\.io/api$') { return $b }
  if ($b -match '/crm/sales/api$') { return $b }
  if ($b -match '/api$') { return $b }
  return "$b/crm/sales/api"
}

$base = Normalize-Base $FreshsalesApiBase
$headers = @{
  Authorization = "Token token=$FreshsalesApiKey"
  Accept = "application/json"
  "Content-Type" = "application/json"
}

function Invoke-Probe([string]$method, [string]$url, [string]$body) {
  try {
    if ($method -eq "GET") {
      $r = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -Headers $headers -TimeoutSec 30
    } elseif ($method -eq "POST") {
      $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $url -Headers $headers -Body $body -TimeoutSec 30
    } else {
      throw "Metodo nao suportado: $method"
    }
    return [pscustomobject]@{
      url = $url
      method = $method
      status = [int]$r.StatusCode
      body = $r.Content.Substring(0, [Math]::Min(400, $r.Content.Length))
    }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      $txt = $sr.ReadToEnd()
      return [pscustomobject]@{
        url = $url
        method = $method
        status = [int]$resp.StatusCode
        body = $txt.Substring(0, [Math]::Min(400, $txt.Length))
      }
    }
    return [pscustomobject]@{
      url = $url
      method = $method
      status = "ERR"
      body = $_.Exception.Message
    }
  }
}

$globalContacts = Invoke-Probe "GET" "$base/contacts/view/1?page=1&per_page=1" $null
$contactFields = Invoke-Probe "GET" "$base/settings/contacts/fields" $null
$accountChecks = @()
foreach ($accountId in @($AccountIds)) {
  $accountChecks += Invoke-Probe "GET" "$base/sales_accounts/$accountId/contacts" $null
}

[ordered]@{
  checked_at = (Get-Date).ToString("s")
  normalized_base = $base
  global_contacts_probe = $globalContacts
  contact_fields_probe = $contactFields
  sales_account_contacts_probe = $accountChecks
} | ConvertTo-Json -Depth 8
