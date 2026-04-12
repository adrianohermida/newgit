Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$aiCore = Join-Path $root "ai-core"

if (-not (Test-Path $aiCore)) {
  throw "Diretorio ai-core nao encontrado em $aiCore"
}

Push-Location $aiCore
try {
  python -m uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload
}
finally {
  Pop-Location
}
