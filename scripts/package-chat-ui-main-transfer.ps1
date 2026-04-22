param(
  [string]$OutputRoot = "artifacts\chat-ui-main-transfer"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Copy-PathSafely([string]$Source, [string]$DestinationRoot, [System.Collections.Generic.List[string]]$Copied) {
  if (-not (Test-Path -LiteralPath $Source)) {
    return
  }
  $relative = Resolve-Path -LiteralPath $Source | ForEach-Object {
    $_.Path.Replace((Resolve-Path -LiteralPath ".").Path + "\", "")
  }
  $destination = Join-Path $DestinationRoot $relative
  $parent = Split-Path -Parent $destination
  Ensure-Directory $parent
  Copy-Item -LiteralPath $Source -Destination $destination -Recurse -Force
  $Copied.Add($relative) | Out-Null
}

$workspace = (Resolve-Path -LiteralPath ".").Path
$outputRootAbs = Join-Path $workspace $OutputRoot
if (Test-Path -LiteralPath $outputRootAbs) {
  Remove-Item -LiteralPath $outputRootAbs -Recurse -Force
}
Ensure-Directory $outputRootAbs

$copied = New-Object 'System.Collections.Generic.List[string]'

$pathsToCopy = @(
  # AI core (python orchestrator and API)
  "ai-core\api",
  "ai-core\src",
  "ai-core\pyproject.toml",
  "ai-core\api_orchestrate.py",
  # Cloudflare worker runtime used in production
  "workers\hmadv-process-ai",
  # Cloudflare Pages functions and shared libs for chat/providers/copilot
  "functions\api\admin-lawdesk-chat.js",
  "functions\api\admin-lawdesk-providers.js",
  "functions\api\admin-copilot-conversations.js",
  "functions\api\admin-copilot-attachments.js",
  "functions\api\admin-cloudflare-docs.js",
  "functions\lib",
  "lib\lawdesk",
  # React UI reference to port into chat-ui-main (Svelte)
  "components\interno\copilot",
  "components\interno\aitask",
  "pages\interno\copilot.js",
  "pages\interno\ai-task.js",
  # Deploy and runtime configuration references
  "wrangler.toml",
  "scripts\deploy-hmadv-process-ai.ps1",
  "scripts\release-cloudflare.ps1",
  "scripts\package-chat-ui-main-transfer.ps1",
  ".dev.vars.example",
  ".env.example"
)

foreach ($item in $pathsToCopy) {
  Copy-PathSafely -Source (Join-Path $workspace $item) -DestinationRoot $outputRootAbs -Copied $copied
}

$guide = @"
AI-CORE -> CHAT-UI-MAIN TRANSFER GUIDE
======================================

Objetivo
--------
Mover o núcleo de AI-Core + Cloudflare para um novo repositório baseado em chat-ui-main, sem perder backend, memória e integrações.

Pasta gerada
------------
$OutputRoot

Como alocar no novo repositório chat-ui-main
--------------------------------------------
1) Clone do base:
   - chat-ui-main (novo repositório base)

2) Copie estes blocos do pacote para dentro do clone:
   - ai-core\*                      -> /ai-core/
   - workers\hmadv-process-ai\*     -> /cloudflare/worker-hmadv-process-ai/
   - functions\*                    -> /cloudflare/pages-functions/
   - lib\lawdesk\*                  -> /cloudflare/shared/lib/lawdesk/
   - components\interno\copilot\*   -> /migration-reference/react/copilot/
   - components\interno\aitask\*    -> /migration-reference/react/aitask/
   - pages\interno\copilot.js       -> /migration-reference/react/pages/copilot.js
   - pages\interno\ai-task.js       -> /migration-reference/react/pages/ai-task.js
   - scripts\deploy-hmadv-process-ai.ps1 -> /scripts/deploy-hmadv-process-ai.ps1
   - scripts\release-cloudflare.ps1      -> /scripts/release-cloudflare.ps1
   - wrangler.toml                  -> /cloudflare/pages/wrangler.toml (ajustar nome de projeto)

3) Observação importante
   - O bloco React (components/pages) é referência funcional.
   - O frontend alvo (chat-ui-main) é Svelte: portar UX e regras, não copiar JSX direto para produção.

4) Ordem de integração recomendada
   1. Worker Cloudflare (hmadv-process-ai) e bindings (D1/KV/R2/AI/DO)
   2. Endpoints de chat/providers/copilot em Pages Functions
   3. Conectar chat-ui-main ao backend (SSE/messages/providers)
   4. Portar UI de histórico/compose/painéis para componentes Svelte
   5. Reativar Ai-Task/AgentLabs como módulos do rail direito

5) Secrets que devem existir no destino
   - CLOUDFLARE_WORKER_ACCOUNT_ID
   - CLOUDFLARE_WORKER_API_TOKEN
   - CLOUDFLARE_ACCOUNT_ID
   - CLOUDFLARE_API_TOKEN
   - COPILOT_CONVERSATIONS_DB
   - CLOUDFLARE_DOCS_KV
   - COPILOT_ATTACHMENTS_BUCKET
   - CLOUDFLARE_WORKERS_AI_MODEL

Comando para recriar este pacote no newgit
------------------------------------------
npm run package:chat-ui-main-transfer
"@

Set-Content -LiteralPath (Join-Path $outputRootAbs "TRANSFER_GUIDE.txt") -Value $guide -Encoding UTF8

$manifestObject = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  sourceRepository = "newgit"
  packageRoot = $OutputRoot
  copiedPaths = $copied
}

$manifestJson = $manifestObject | ConvertTo-Json -Depth 5
Set-Content -LiteralPath (Join-Path $outputRootAbs "TRANSFER_MANIFEST.json") -Value $manifestJson -Encoding UTF8

$zipPath = "$outputRootAbs.zip"
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $outputRootAbs "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Pacote gerado em: $outputRootAbs" -ForegroundColor Green
Write-Host "Zip gerado em: $zipPath" -ForegroundColor Green
