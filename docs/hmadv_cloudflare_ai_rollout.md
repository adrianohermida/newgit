# HMADV - Rollout do Cloudflare Worker IA

## Diferenca entre credenciais e variaveis de runtime

### Credenciais de deploy do Cloudflare

Estas duas variaveis servem para publicar o worker com `wrangler`:

- `CLOUDFLARE_WORKER_ACCOUNT_ID`
- `CLOUDFLARE_WORKER_API_TOKEN`

Elas sao usadas pelo script [deploy-hmadv-process-ai.ps1](/D:/Github/newgit/scripts/deploy-hmadv-process-ai.ps1).

### Variaveis de runtime do worker e da integracao HMADV

Estas variaveis servem para o worker IA executar o trabalho e para o Supabase conseguir chamá-lo:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRESHSALES_API_BASE`
- `FRESHSALES_API_KEY`
- `FRESHSALES_OWNER_ID`
- `FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL`
- `FRESHSALES_ACTIVITY_TYPE_AUDIENCIA`
- `HMDAV_AI_SHARED_SECRET`
- `PROCESS_AI_BASE`
- `CLOUDFLARE_WORKERS_AI_MODEL`

## Fluxo alvo

1. `sync-worker` exporta andamento ou publicacao para o Freshsales
2. `sync-worker` chama `POST /reconcile/process` no worker IA
3. o worker IA consulta processo, movimentos, publicacoes e audiencias no Supabase
4. o worker IA gera:
   - anotacao automatica no account
   - sugestao de inconsistencias
   - sugestao ou criacao de tarefas/prazos
   - atualizacao inferida de status, fase e instancia

## Deploy

Se as credenciais de deploy estiverem no shell:

```powershell
npm run deploy:hmadv-ai
```

## Setup automatizado

Existe um caminho unico para:

- publicar o worker
- gravar os secrets no Cloudflare
- configurar `PROCESS_AI_BASE` e `HMDAV_AI_SHARED_SECRET` no HMADV

Uso:

```powershell
$env:CLOUDFLARE_WORKER_ACCOUNT_ID = "SEU_ACCOUNT_ID"
$env:CLOUDFLARE_WORKER_API_TOKEN = "SEU_API_TOKEN"
$env:SUPABASE_URL = "https://sspvizogbcyigquqycsz.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "SUA_SERVICE_ROLE"
$env:FRESHSALES_API_BASE = "https://hmadv-org.myfreshworks.com/crm/sales"
$env:FRESHSALES_API_KEY = "SUA_FRESHSALES_API_KEY"
$env:FRESHSALES_OWNER_ID = "31000147944"
$env:FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL = "31001147751"
$env:FRESHSALES_ACTIVITY_TYPE_AUDIENCIA = "31001147752"

npm run setup:hmadv-ai
```

Se voce ja souber a URL final do worker:

```powershell
$env:PROCESS_AI_BASE = "https://hmadv-process-ai.seu-subdominio.workers.dev"
$env:HMDAV_AI_SHARED_SECRET = "seu-segredo-forte"
npm run setup:hmadv-ai
```

Se nao informar `HMDAV_AI_SHARED_SECRET`, o script gera um automaticamente.
Se nao informar `PROCESS_AI_BASE`, o script publica o worker e avisa para voce gravar a URL final no HMADV depois.

## Validacoes minimas

1. `npx wrangler deploy --config workers/hmadv-process-ai/wrangler.toml --dry-run`
2. `GET /health`
3. `POST /analyze/activity`
4. `POST /analyze/process`
5. `POST /reconcile/process`

## Dependencia no HMADV

O runtime do Supabase precisa conhecer:

- `PROCESS_AI_BASE`
- `HMDAV_AI_SHARED_SECRET`

Sem essas duas variaveis, o `sync-worker` continua exportando activities normalmente, mas nao dispara a reconciliacao inteligente do processo.

## Feature flags de rollout gradual

Para liberar a nova pilha em canario (chat unificado, skills e fullscreen lateral), use as flags abaixo.

### Flags de backend/chat

- `ENABLE_DOTOBOT_CHAT` (default: `true`)
- `ENABLE_SKILLS_DETECTION` (default: `true`)

Quando `ENABLE_DOTOBOT_CHAT=false`, os endpoints de chat retornam `503` com `errorType=feature_disabled`.
Quando `ENABLE_SKILLS_DETECTION=false`, o chat continua funcionando sem enriquecimento por skill.

### Flag de UI

- `NEXT_PUBLIC_ENABLE_AI_TASK_FULLSCREEN_SIDEBAR` (default: `false`)

Quando `true`, o `AI Task` abre com painel direito expandido em modo fullscreen lateral.
Quando `false`, o layout atual e mantido sem rail expandido.

### Sequencia recomendada

1. `ENABLE_DOTOBOT_CHAT=true`
2. `ENABLE_SKILLS_DETECTION=false`
3. Validar estabilidade em producao
4. `ENABLE_SKILLS_DETECTION=true`
5. `NEXT_PUBLIC_ENABLE_AI_TASK_FULLSCREEN_SIDEBAR=true` para usuarios canario

### Rollback rapido

1. Desligar `NEXT_PUBLIC_ENABLE_AI_TASK_FULLSCREEN_SIDEBAR`
2. Desligar `ENABLE_SKILLS_DETECTION`
3. Se necessario, desligar `ENABLE_DOTOBOT_CHAT`

Com isso, a plataforma retorna ao comportamento anterior sem alteracao de schema.
