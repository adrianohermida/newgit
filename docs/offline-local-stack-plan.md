# Offline Local Stack Plan

Plano operacional para deixar o `ai-core`, o Copilot e o AI Task funcionando sem internet, usando a sua máquina como fonte principal de inferência, memória e persistência.

## Estado atual

Já disponível:

- `Obsidian` local conectado como memória e base documental
- `ai-core` local servindo `GET /health`, `GET /v1/providers`, `POST /execute`, `POST /v1/messages`
- Copilot e AI Task com suporte ao provider `local`
- catálogo administrativo agora reconhece `LAWDESK_OFFLINE_MODE=true`

Ainda dependente de internet:

- inferência real do modelo quando o runtime local ainda aponta para endpoints externos
- persistência estruturada equivalente ao Supabase remoto
- embeddings vetoriais remotos
- automações web da Universal LLM Assistant

## Meta final

Rodar localmente, mesmo sem internet:

- LLM principal AetherLab local
- RAG local via Obsidian
- histórico e estado operacional
- persistência estruturada opcional via Supabase local
- browser automation restrita ao ambiente local

## Sprint 1 - Inferência local real

Objetivo: remover dependência de cloud para o provider `local`.

Pendências:

1. Escolher runtime local do modelo
2. Publicar endpoint OpenAI-compatible local (`/v1/messages`)
3. Fixar alias `aetherlab-legal-local-v1`
4. Definir timeout, contexto máximo e limites de tokens
5. Garantir que `LAWDESK_OFFLINE_MODE=true` desabilite `gpt`, `custom` e `cloudflare`

Critério de pronto:

- `provider=local` responde com a internet desligada
- Copilot e AI Task continuam operando

## Sprint 2 - RAG offline consistente

Objetivo: garantir recuperação de contexto local sem serviços externos.

Pendências:

1. Manter Obsidian como fonte primária
2. Melhorar índice local e cache incremental
3. Criar modo explícito de busca sem embeddings remotos
4. Unificar política de fallback quando não houver notas relevantes

Critério de pronto:

- pergunta com contexto local responde usando apenas Obsidian

## Sprint 3 - Supabase local opcional

Objetivo: persistência estruturada offline.

Quando vale a pena:

- histórico de runs
- memória vetorial local
- tabelas equivalentes ao ambiente remoto
- testes de integração sem depender do Supabase cloud

### Instalação base

Pré-requisitos:

- Docker Desktop
- Supabase CLI

Fluxo:

```powershell
supabase init
supabase start
```

Endpoints típicos locais:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

### Variáveis locais esperadas

```env
SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<gerado pelo supabase start>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<gerado pelo supabase start>
SUPABASE_SERVICE_ROLE_KEY=<gerado pelo supabase start>
```

### Pendências de banco

1. Portar migrations mínimas do Lawdesk
2. Criar tabelas de memória, task runs e logs
3. Habilitar `pgvector` se houver busca vetorial local no Postgres
4. Recriar RPCs equivalentes às funções usadas em produção

Critério de pronto:

- dashboard e runtime funcionam com Supabase local

## Sprint 4 - Embeddings locais

Objetivo: eliminar dependência do embed remoto.

Pendências:

1. Escolher modelo de embedding local
2. Padronizar dimensão única
3. Atualizar persistência para evitar mistura `384` vs `768`
4. Reindexar memória local

Critério de pronto:

- embeddings e consulta vetorial funcionam offline

## Sprint 5 - Universal LLM Assistant offline

Objetivo: usar a extensão para tarefas locais sem depender de internet.

Pendências:

1. Criar perfil `offline`
2. Desabilitar `web_search`
3. Permitir apenas:
   - `search_files`
   - `open_url` local
   - comandos locais controlados
4. Integrar isso ao AI Task como ferramenta operacional local

Critério de pronto:

- missões locais conseguem operar arquivos e páginas locais sem acessar web

## Variáveis mínimas para operação offline

```env
LAWDESK_OFFLINE_MODE=true
NEXT_PUBLIC_LAWDESK_OFFLINE_MODE=true
AICORE_OFFLINE_MODE=true

LOCAL_LLM_BASE_URL=http://127.0.0.1:8000
LOCAL_LLM_MODEL=aetherlab-legal-local-v1
LOCAL_LLM_API_KEY=
LOCAL_LLM_AUTH_TOKEN=

DOTOBOT_OBSIDIAN_VAULT_PATH=D:\\Obsidian\\hermidamaia

UNIVERSAL_LLM_EXTENSION_BASE_URL=http://127.0.0.1:32123
UNIVERSAL_LLM_DEFAULT_BASE_PATH=D:\\Obsidian\\hermidamaia
```

## Ordem recomendada

1. Fechar runtime local do modelo
2. Validar Copilot + AI Task offline
3. Melhorar RAG Obsidian local
4. Subir Supabase local
5. Adicionar embeddings locais
6. Restringir extensão para modo offline

## Doctor local

Existe um diagnóstico consolidado do stack offline:

```powershell
npm run doctor:offline-local
```

Ele verifica:

- flags de offline
- `Obsidian` local
- `ai-core` local
- `LLM local` real com autodeteccao de:
  - `/v1/messages`
  - `/v1/models`
  - `Ollama` via `/api/tags`
- Universal LLM Assistant local
- `Supabase local`

Ele tambem informa:

- runtime detectado (`anthropic-compatible`, `openai-compatible` ou `ollama`)
- base efetivamente resolvida
- tentativas executadas
- recomendacao operacional para fechar a ponte local do AetherLab

## Bootstrap local

Existe tambem um bootstrap para abrir o stack base local em novas janelas do PowerShell:

```powershell
npm run bootstrap:offline-local
```

Para subir e diagnosticar em seguida:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-offline-local.ps1 -RunDoctorAfterStart
```

Sem informar `-LocalLlmBaseUrl`, o bootstrap tenta usar nesta ordem:

1. `LOCAL_LLM_BASE_URL`
2. `LLM_BASE_URL`
3. `AICORE_LOCAL_LLM_BASE_URL`
4. `http://127.0.0.1:11434`

Template de ambiente:

- [.env.offline-local.example](D:/Github/newgit/.env.offline-local.example)

## Decisão prática

Se a prioridade é colocar em produção interna rápido:

- primeiro: `LLM local + Obsidian`
- depois: `Supabase local`
- por último: `vetores locais + extensão offline completa`
