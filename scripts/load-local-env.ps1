param(
  [string]$Path = ".local.supabase.env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedPath = if ([System.IO.Path]::IsPathRooted($Path)) {
  $Path
} else {
  Join-Path $root $Path
}

if (-not (Test-Path -LiteralPath $resolvedPath)) {
  throw "Arquivo de env nao encontrado em $resolvedPath"
}

$loaded = @()
foreach ($line in (Get-Content -Path $resolvedPath -Encoding UTF8)) {
  $trimmed = [string]$line
  if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.TrimStart().StartsWith("#")) {
    continue
  }
  if ($trimmed -notmatch '^\s*([^=]+)=(.*)$') {
    continue
  }

  $name = $matches[1].Trim()
  $value = $matches[2]
  [Environment]::SetEnvironmentVariable($name, $value, "Process")
  $loaded += [ordered]@{
    name = $name
    value = $value
  }
}

[ordered]@{
  checkedAt = (Get-Date).ToString("o")
  ok = $true
  path = $resolvedPath
  loaded = $loaded
  count = $loaded.Count
} | ConvertTo-Json -Depth 6
