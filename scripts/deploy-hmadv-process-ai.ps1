param(
  [string]$AccountId = $env:CLOUDFLARE_WORKER_ACCOUNT_ID,
  [string]$ApiToken = $env:CLOUDFLARE_WORKER_API_TOKEN
)

if (-not $AccountId) { throw 'Defina CLOUDFLARE_WORKER_ACCOUNT_ID.' }
if (-not $ApiToken) { throw 'Defina CLOUDFLARE_WORKER_API_TOKEN.' }

$env:CLOUDFLARE_ACCOUNT_ID = $AccountId
$env:CLOUDFLARE_API_TOKEN = $ApiToken

Push-Location 'D:\Github\newgit'
try {
  npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml
} finally {
  Pop-Location
}

