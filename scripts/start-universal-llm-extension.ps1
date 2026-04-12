Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$extensionDir = Join-Path $root "universal-llm-extension"

if (-not (Test-Path $extensionDir)) {
  throw "Diretorio universal-llm-extension nao encontrado em $extensionDir"
}

Push-Location $extensionDir
try {
  node server.js
}
finally {
  Pop-Location
}
