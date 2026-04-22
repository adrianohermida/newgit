param(
  [string]$CommitMessage,
  [switch]$SkipCommit,
  [switch]$SkipPush,
  [switch]$SkipWorkerDeploy,
  [switch]$StaticPagesDeploy,
  [string]$PagesProject = "newgit-pages"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step([string]$Label, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
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

Invoke-Step "Validando repositório Git" {
  $inside = Get-GitOutput -GitArgs @("rev-parse", "--is-inside-work-tree")
  if ($inside -ne "true") {
    throw "Diretório atual não é um repositório git."
  }
}

if (-not $SkipCommit) {
  if (Has-GitChanges) {
    Invoke-Step "Rodando teste de build antes do commit" {
      $env:RELEASE_PIPELINE_RUNNING = "1"
      try {
        npm run build:pages
      } finally {
        Remove-Item Env:RELEASE_PIPELINE_RUNNING -ErrorAction SilentlyContinue
      }
    }
    Invoke-Step "Criando commit" {
      $message = $CommitMessage
      if ([string]::IsNullOrWhiteSpace($message)) {
        $message = "chore: release cloudflare $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
      }
      git add -A
      if ($LASTEXITCODE -ne 0) { throw "Falha ao adicionar arquivos no git." }
      git commit -m $message
      if ($LASTEXITCODE -ne 0) { throw "Falha ao criar commit." }
    }
  } else {
    Write-Host "Sem alterações locais para commit." -ForegroundColor Yellow
  }
}

$currentBranch = Get-GitOutput -GitArgs @("rev-parse", "--abbrev-ref", "HEAD")
if (-not $SkipPush) {
  Invoke-Step "Enviando branch para origin/$currentBranch" {
    git push origin $currentBranch
    if ($LASTEXITCODE -ne 0) { throw "Falha no git push." }
  }
}

if (-not $SkipWorkerDeploy) {
  Invoke-Step "Deploy do Worker hmadv-process-ai" { npm run deploy:hmadv-ai }
}

if ($StaticPagesDeploy) {
  Invoke-Step "Deploy estático do Pages (opt-in explícito)" {
    $env:ALLOW_STATIC_ONLY_PAGES_DEPLOY = "1"
    try {
      npm run deploy:pages
    } finally {
      Remove-Item Env:ALLOW_STATIC_ONLY_PAGES_DEPLOY -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host ""
  Write-Host "Pages em modo seguro: sem deploy estático local." -ForegroundColor Yellow
  Write-Host "Após o push, o frontend deve publicar pelo build conectado do projeto '$PagesProject'." -ForegroundColor Yellow
  Write-Host "Para forçar deploy imediato via Wrangler, rode: npm run release:cf -- -StaticPagesDeploy" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Release Cloudflare concluído." -ForegroundColor Green
