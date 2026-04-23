# HMADV — Auditoria Completa de Sprints e Pendências
**Data:** 23 de Abril de 2026 | **Versão:** 5.0

---

## 1. Inventário do Repositório newgit

### Edge Functions Supabase (deployadas)
| Função | Versão | Status | Descrição |
|---|---|---|---|
| `dotobot-slack` | v4 | ACTIVE | Bot Slack com comandos Freshdesk + Agendamentos |
| `freshdesk-cnj-webhook` | v2 | ACTIVE | Detecção automática de CNJ em tickets |
| `agendamentos-sync` | v2 | ACTIVE | Google Calendar + Zoom + Freshsales |
| `freshdesk-ticket-process` | v1 | ACTIVE | Agente IA para suporte ao cliente |
| `fs-freshdesk-sync` | v1 | ACTIVE | Sincronização Freshsales ↔ Freshdesk |
| `billing-import` | v7 | ACTIVE | Importação financeira com produto dinâmico |
| `publicacoes-freshsales` | existente | ACTIVE | Sincronização publicações |
| `fs-webhook` | existente | ACTIVE | Webhook Freshsales |

### Libs do Frontend (Cloudflare Pages Functions) — NÃO extraídas para Supabase
| Arquivo | Linhas | Prioridade | Status |
|---|---|---|---|
| `freddy-memory-gateway.js` | ~600 | **CRÍTICA** | Pendente → deve virar `freddy-gateway` edge function |
| `slack-bot.js` | ~500 | **CRÍTICA** | Parcialmente extraída no dotobot-slack |
| `workspace-ops.js` | ~450 | **ALTA** | Pendente → deve virar `workspace-ops` edge function |
| `hmadv-runner.js` | ~400 | **ALTA** | Pendente → pipeline de filas Advise/Datajud |
| `hmadv-finance-admin.js` | ~380 | **ALTA** | Pendente → dashboard financeiro independente |
| `crm-dispatcher.js` | ~300 | **ALTA** | Pendente → automação de e-mail/WhatsApp |
| `agentlab-intelligence.js` | ~200 | MÉDIA | Pendente → ingestão de inteligência |
| `agentlab-sync.js` | ~200 | MÉDIA | Pendente → sincronização AgentLab |
| `freshsales-catalog.js` | ~200 | MÉDIA | Pendente → catálogo de produtos |
| `agendamento-integrations.js` | ~300 | ALTA | Parcialmente extraída no agendamentos-sync |
| `freshsales-billing.js` | ~250 | ALTA | Pendente → billing avançado |
| `hmadv-contacts.js` | ~200 | ALTA | Pendente → higienização de contatos |

### ai-core (Python + Cloudflare)
| Módulo | Status | Descrição |
|---|---|---|
| `api/app.py` | Implementado | FastAPI local com /v1/messages, /execute, /rag-context |
| `api/server.py` | Implementado | Roteamento multi-provider (GPT, local, Cloudflare, custom) |
| `adapters/supabase_rag_adapter.py` | Implementado | RAG via pgvector no Supabase |
| `adapters/crm_adapter.py` | **STUB** | Placeholder — não integrado com Freshsales |
| `adapters/supabase_adapter.py` | **STUB** | Placeholder — não integrado com dados reais |
| `core/cloudflare/agents-starter-main` | Template | Base para Cloudflare Worker com Durable Objects |
| `core/cloudflare/templates/llm-chat-app-template` | Template | Base para chat LLM no Cloudflare |

---

## 2. Sprints Pendentes (Priorizados)

### SPRINT 1 — ai-core como Cloudflare Worker Independente ⚡ CRÍTICO
**Objetivo:** Implementar o ai-core como Cloudflare Worker com roteamento multi-provider:
- Provider 1: **OpenAI-compatible** (gpt-4.1-mini via OPENAI_API_KEY)
- Provider 2: **HuggingFace gratuito** (fallback — modelos: Qwen2.5-72B-Instruct, Mistral-7B, Llama-3.1-8B)
- Provider 3: **Cloudflare Workers AI** (fallback secundário — @cf/meta/llama-3.1-8b-instruct)
- Endpoint: `POST /v1/messages` compatível com o padrão do ai-core existente
- Memória RAG: integração com `dotobot_memory_embeddings` no Supabase
- Deploy: Cloudflare Workers (wrangler)

**Arquivos a criar:**
- `cloudflare-workers/ai-core-worker/src/index.ts` — Worker principal
- `cloudflare-workers/ai-core-worker/src/providers.ts` — Roteamento de providers
- `cloudflare-workers/ai-core-worker/src/rag.ts` — Integração RAG Supabase
- `cloudflare-workers/ai-core-worker/wrangler.toml` — Configuração do Worker

### SPRINT 2 — freddy-gateway Edge Function ⚡ CRÍTICO
**Objetivo:** Extrair `freddy-memory-gateway.js` para edge function Supabase:
- `GET /contact360` — perfil completo do contato (Freshsales + processos + deals + tarefas)
- `POST /search-memory` — busca RAG na memória do Dotobot
- `POST /save-memory` — persistência de memória com embedding
- `POST /save-outcome` — registro de resultado de interação

### SPRINT 3 — workspace-ops Edge Function ⚡ ALTA
**Objetivo:** Extrair `workspace-ops.js` para edge function Supabase:
- CRUD completo de tarefas Freshsales
- Atualização de contatos e deals
- Listagem de agendamentos, tickets, atividades
- Operações de patch via texto natural

### SPRINT 4 — Dotobot v5 com IA Conversacional ⚡ ALTA
**Objetivo:** Evoluir o Dotobot para usar o ai-core como backend de IA:
- Integração com `freddy-gateway` para contexto 360 do contato
- Integração com `workspace-ops` para executar operações
- Memória RAG persistente entre sessões
- Modo conversacional com histórico de thread Slack

### SPRINT 5 — Produtos Freshsales + Billing Completo 🔴 BLOQUEADO (rate limit)
**Objetivo:** Completar a higienização de produtos e billing:
- Criar 3 produtos restantes (Despesa do Cliente, Fatura Avulsa, Consulta Jurídica)
- Atualizar `fs_product_map` com os IDs corretos
- Reprocessar os 6.764 registros da fila

### SPRINT 6 — crm-dispatcher Edge Function 📧 ALTA
**Objetivo:** Extrair `crm-dispatcher.js` para edge function Supabase:
- Envio de e-mails transacionais (templates)
- Envio de WhatsApp via Meta API
- Automação de comunicação com clientes

### SPRINT 7 — hmadv-runner Edge Function 🔄 ALTA
**Objetivo:** Extrair `hmadv-runner.js` para edge function Supabase:
- Pipeline Advise → Supabase → Freshsales
- Pipeline Datajud → enriquecimento de processos
- Controle de jobs com rate limit Freshsales (1000 req/h)

### SPRINT 8 — AgentLab Intelligence 🤖 MÉDIA
**Objetivo:** Implementar o AgentLab como módulo de treinamento do agente:
- Ingestão de inteligência jurídica (jurisprudências, modelos de petição)
- Sincronização com base de conhecimento do Supabase
- Integração com RAG do ai-core

---

## 3. Estado dos Dados no Supabase

| Tabela | Registros | Status |
|---|---|---|
| `freshdesk_contacts` | 5.999 | ✅ Importado |
| `freshdesk_tickets` | 66 | ✅ Importado + CNJ detectado |
| `billing_import_queue` | 6.764 | ✅ Importado, 0 sincronizados |
| `freshsales_deals_registry` | 19 | ⚠️ Parcial (rate limit) |
| `agendamentos` | existentes | ✅ Google Calendar OK, Zoom pendente |
| `dotobot_memory_embeddings` | 0 | ⚠️ RAG não populado |
| `fs_product_map` | 5 | ⚠️ 3 produtos sem ID Freshsales |

---

## 4. Secrets Configurados

### Supabase Project Secrets (Deno.env)
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN ✅
- ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_SECRET_TOKEN ✅
- FRESHSALES_API_KEY, FRESHSALES_DOMAIN, FRESHSALES_OWNER_ID ✅
- FRESHDESK_API_KEY ✅
- AI_GATEWAY_API_KEY ✅
- SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET ✅

### Vault SQL (leitura dinâmica)
- GOOGLE_CALENDAR_ID ✅
- ZOOM_ACCOUNT_ID ✅
- FRESHSALES_ACTIVITY_TYPE_BY_EVENT ✅
- FRESHSALES_APPOINTMENT_FIELD_MAP ✅
- FRESHSALES_STAGE_VALUE_MAP ✅

### Faltando (necessário para ai-core Cloudflare Worker)
- CLOUDFLARE_ACCOUNT_ID ❌
- CLOUDFLARE_API_TOKEN ❌
- HUGGINGFACE_API_KEY ❌ (gratuito — criar em huggingface.co)
- OPENAI_API_KEY ❌ (para o Worker — já existe no Supabase)
