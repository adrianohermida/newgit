Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$extensionDir = Join-Path $root "universal-llm-extension"

if (-not (Test-Path $extensionDir)) {
  throw "Diretorio universal-llm-extension nao encontrado em $extensionDir"
}

Push-Location $extensionDir
try {
  $packageJson = Join-Path $extensionDir "package.json"
  if (-not (Test-Path $packageJson)) {
    throw "package.json da universal-llm-extension nao encontrado em $packageJson"
  }

  $nodeModulesDir = Join-Path $extensionDir "node_modules"
  if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "Instalando dependencias da universal-llm-extension..."
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao instalar dependencias da universal-llm-extension."
    }
  }

  node server.js
}
finally {
  Pop-Location
}
