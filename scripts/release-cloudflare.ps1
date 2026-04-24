param(
  [string]$CommitMessage,
  [string[]]$Paths,
  [switch]$AllowAllChanges,
  [switch]$SkipCommit,
  [switch]$SkipPush,
  [switch]$SkipWorkerDeploy,
  [switch]$UseGitHubWorkerDeploy,
  [switch]$StaticPagesDeploy,
  [string]$PagesProject = "newgit-pages"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Import-LocalEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (-not $name) { return }
    $existing = Get-Item "Env:$name" -ErrorAction SilentlyContinue
    $existingValue = if ($null -eq $existing) { "" } else { [string]$existing.Value }
    if ([string]::IsNullOrWhiteSpace($existingValue)) {
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

function Invoke-Step([string]$Label, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
}

function Invoke-CheckedCommand([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar: $FilePath $($Arguments -join ' ') (exit code $LASTEXITCODE)."
  }
}

function Get-GitOutput([string[]]$GitArgs) {
  $result = & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar git $($GitArgs -join ' ')."
  }
  return ($result | Out-String).Trim()
}

function Has-GitChanges() {
  $status = & git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao verificar git status."
  }
  return -not [string]::IsNullOrWhiteSpace(($status | Out-String).Trim())
}

function Has-StagedChanges() {
  $status = & git diff --cached --name-only
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao verificar staged changes."
  }
  return -not [string]::IsNullOrWhiteSpace(($status | Out-String).Trim())
}

function Stage-ReleasePaths([string[]]$SelectedPaths, [bool]$AllowStageAll) {
  if ($AllowStageAll) {
    Invoke-CheckedCommand -FilePath "git" -Arguments @("add", "-A")
    return
  }

  if ($null -eq $SelectedPaths -or $SelectedPaths.Count -eq 0) {
    throw "Worktree com mudancas detectado. Informe -Paths com os arquivos deste release ou use -AllowAllChanges conscientemente."
  }

  $gitArgs = @("add", "--")
  $gitArgs += $SelectedPaths
  Invoke-CheckedCommand -FilePath "git" -Arguments $gitArgs
}

Import-LocalEnvFile (Join-Path $PSScriptRoot "..\.dev.vars")
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN) -and -not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_WORKER_API_TOKEN)) {
  $env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_WORKER_API_TOKEN
}
if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID) -and -not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_WORKER_ACCOUNT_ID)) {
  $env:CLOUDFLARE_ACCOUNT_ID = $env:CLOUDFLARE_WORKER_ACCOUNT_ID
}

Invoke-Step "Validating Git repository" {
  $inside = Get-GitOutput -GitArgs @("rev-parse", "--is-inside-work-tree")
  if ($inside -ne "true") {
    throw "Current directory is not a git repository."
  }
}

if (-not $SkipCommit) {
  if (Has-GitChanges) {
    Invoke-Step "Running build validation before commit" {
      $env:RELEASE_PIPELINE_RUNNING = "1"
      try {
        Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "build:pages")
      } finally {
        Remove-Item Env:RELEASE_PIPELINE_RUNNING -ErrorAction SilentlyContinue
      }
    }

    Invoke-Step "Creating commit" {
      $message = $CommitMessage
      if ([string]::IsNullOrWhiteSpace($message)) {
        $message = "chore: release cloudflare $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
      }
      Stage-ReleasePaths -SelectedPaths $Paths -AllowStageAll $AllowAllChanges

      if (-not (Has-StagedChanges)) {
        Write-Host "No staged changes to commit after git add." -ForegroundColor Yellow
      } else {
        Invoke-CheckedCommand -FilePath "git" -Arguments @("commit", "-m", $message)
      }
    }
  } else {
    Write-Host "No local changes to commit." -ForegroundColor Yellow
  }
}

$currentBranch = Get-GitOutput -GitArgs @("rev-parse", "--abbrev-ref", "HEAD")
if (-not $SkipPush) {
  Invoke-Step "Pushing branch to origin/$currentBranch" {
    Invoke-CheckedCommand -FilePath "git" -Arguments @("push", "origin", $currentBranch)
  }
}

if ($UseGitHubWorkerDeploy) {
  Write-Host ""
  Write-Host "Worker deploy local ignorado: o GitHub Actions fara o deploy via Wrangler apos o push." -ForegroundColor Yellow
} elseif (-not $SkipWorkerDeploy) {
  Invoke-Step "Deploying Worker hmadv-process-ai" {
    Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "deploy:hmadv-ai")
  }
}

if ($StaticPagesDeploy) {
  Invoke-Step "Deploying Pages static bundle (explicit opt-in)" {
    $env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
    try {
      Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "deploy:pages")
    } finally {
      Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host ""
  Write-Host "Pages safe mode: skipping local static Pages deploy." -ForegroundColor Yellow
  Write-Host "After push, frontend should publish via connected Pages build for '$PagesProject'." -ForegroundColor Yellow
  Write-Host "To force immediate static deploy: npm run release:cf -- -StaticPagesDeploy" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Cloudflare release completed." -ForegroundColor Green
