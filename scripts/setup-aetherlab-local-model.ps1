param(
  [string]$BaseModel = "llama3.2",
  [string]$Alias = "aetherlab-legal-local-v1",
  [string]$ModelFilePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedModelFile = if ([string]::IsNullOrWhiteSpace($ModelFilePath)) {
  Join-Path $root "setup\aetherlab-local\Modelfile"
} elseif ([System.IO.Path]::IsPathRooted($ModelFilePath)) {
  $ModelFilePath
} else {
  Join-Path $root $ModelFilePath
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw "Ollama nao encontrado no PATH."
}

if (-not (Test-Path -LiteralPath $resolvedModelFile)) {
  throw "Modelfile nao encontrado em $resolvedModelFile"
}

Write-Host "Verificando runtime Ollama..."
$version = & ollama --version
Write-Host "  $version"

Write-Host "Baixando modelo base: $BaseModel"
& ollama pull $BaseModel
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao baixar o modelo base $BaseModel"
}

Write-Host "Criando alias local: $Alias"
& ollama create $Alias -f $resolvedModelFile
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao criar o alias $Alias"
}

Write-Host "Catalogo local:"
& ollama list
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao listar o catalogo local do Ollama"
}
