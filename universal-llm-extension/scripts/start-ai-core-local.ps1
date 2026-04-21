# start-ai-core-local.ps1
# Bootstrap script for Universal LLM Assistant - Ai-Core Local Runtime
# Called by local-runtime-bootstrap.js via PowerShell
#
# Parameters:
#   -Port           Port the ai-core FastAPI server should listen on (default: 8000)
#   -LocalLlmModel  Model name to pre-load in the runtime (optional)

param(
    [int]$Port = 8000,
    [string]$LocalLlmModel = ""
)

$ErrorActionPreference = "SilentlyContinue"

# ─── Resolve ai-core directory ───────────────────────────────────────────────
$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot      = Split-Path -Parent $ScriptDir
$AiCoreDir     = Join-Path $RepoRoot "ai-core"
$LogDir        = Join-Path $RepoRoot ".runtime-logs"
$StdoutLog     = Join-Path $LogDir "ai-core-startup.out.log"
$StderrLog     = Join-Path $LogDir "ai-core-startup.err.log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log {
    param([string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $StdoutLog -Value "[$ts] $Msg"
}

Write-Log "=== Ai-Core bootstrap iniciado === Port=$Port Model=$LocalLlmModel"

# ─── Guard: check if already running ─────────────────────────────────────────
try {
    $healthUrl = "http://127.0.0.1:$Port/health"
    $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($resp.ok -eq $true) {
        Write-Log "Runtime ja esta ativo em $healthUrl — bootstrap cancelado."
        exit 0
    }
} catch {}

# ─── Locate Python / uv ──────────────────────────────────────────────────────
function Find-Executable {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $found = Get-Command $name -ErrorAction SilentlyContinue
        if ($found) { return $found.Source }
    }
    return $null
}

$uvPath     = Find-Executable @("uv")
$pythonPath = Find-Executable @("python3", "python", "python3.11", "python3.12")

if (-not (Test-Path $AiCoreDir)) {
    Write-Log "ERRO: diretorio ai-core nao encontrado em $AiCoreDir"
    exit 1
}

# ─── Build launch command ─────────────────────────────────────────────────────
$env:AI_CORE_PORT     = "$Port"
$env:AI_CORE_HOST     = "0.0.0.0"
if ($LocalLlmModel) { $env:LOCAL_LLM_MODEL = $LocalLlmModel }

Push-Location $AiCoreDir

# Prefer uv run (handles venv automatically); fall back to direct uvicorn
if ($uvPath) {
    Write-Log "Usando uv para iniciar ai-core na porta $Port"
    $proc = Start-Process `
        -FilePath $uvPath `
        -ArgumentList @("run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$Port", "--log-level", "warning") `
        -WorkingDirectory $AiCoreDir `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError  $StderrLog `
        -NoNewWindow `
        -PassThru
} elseif ($pythonPath) {
    Write-Log "Usando $pythonPath para iniciar ai-core na porta $Port"
    # activate venv if present
    $venvActivate = Join-Path $AiCoreDir ".venv\Scripts\Activate.ps1"
    if (Test-Path $venvActivate) {
        Write-Log "Ativando venv: $venvActivate"
        & $venvActivate
    }
    $proc = Start-Process `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$Port", "--log-level", "warning") `
        -WorkingDirectory $AiCoreDir `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError  $StderrLog `
        -NoNewWindow `
        -PassThru
} else {
    Write-Log "ERRO: nem uv nem python encontrados no PATH. Instale Python 3.11+ ou uv."
    Pop-Location
    exit 1
}

Pop-Location

if ($proc) {
    Write-Log "Processo iniciado: PID=$($proc.Id) Port=$Port"
} else {
    Write-Log "AVISO: nao foi possivel obter handle do processo. Runtime pode ter iniciado."
}

# ─── Wait until healthy (max 40s) ────────────────────────────────────────────
$healthUrl  = "http://127.0.0.1:$Port/health"
$maxWaitSec = 40
$interval   = 2
$elapsed    = 0
$ready      = $false

Write-Log "Aguardando runtime ficar saudavel em $healthUrl ..."

while ($elapsed -lt $maxWaitSec) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    try {
        $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 -ErrorAction Stop
        if ($resp.ok -eq $true) {
            Write-Log "Runtime saudavel apos ${elapsed}s."
            $ready = $true
            break
        }
    } catch {}
    Write-Log "Aguardando... ${elapsed}s/${maxWaitSec}s"
}

if (-not $ready) {
    Write-Log "AVISO: Runtime nao respondeu dentro de ${maxWaitSec}s. Verifique $StderrLog"
    exit 2
}

Write-Log "=== Bootstrap concluido com sucesso ==="
exit 0
