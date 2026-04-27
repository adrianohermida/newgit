# Gabarito de Homologação — Estado Funcional Homologado

> **Data de homologação:** 27 de abril de 2026  
> **Responsável:** Dr. Adriano Hermida  
> **Status:** ✅ AMBOS OS AGENTES FUNCIONANDO E HOMOLOGADOS

---

## Estado Homologado

| Função | Versão | Status | verify_jwt | Token |
|---|---|---|---|---|
| `cida-slack` | **v104** | ACTIVE | `false` | `CIDA_BOT_TOKEN` |
| `dotobot-slack` | **v165** | ACTIVE | `false` | `SLACK_BOT_TOKEN` |

**Commit de referência:** `e654b423` (branch `main`, repositório `adrianohermida/newgit`)

---

## Comportamento Homologado — cida-slack v104

### Confirmado funcionando
- Recebe eventos `event_callback` do Slack (DM e `app_mention`)
- Responde **na mesma conversa** usando `thread_ts = event.thread_ts || event.ts`
- Usa `CIDA_BOT_TOKEN` para `chat.postMessage`
- **Reality Context Engine**: injeta data/hora real de Brasília (UTC-3) no system prompt
- **skipRag**: pula embedding + busca vetorial para saudações simples e perguntas temporais
- **Sistema de personas**: owner (Dr. Adriano, sem limites), interno (equipe), cliente (externo)
- Deduplicação de eventos via tabela `processed_events`
- Histórico de 6 mensagens × 400 chars por mensagem
- RAG comprimido: máximo 800 chars de contexto quando ativado
- Modo aprendizado (`learning_items`) preservado e funcional

### Variáveis de ambiente necessárias
```
CIDA_BOT_TOKEN           — token do app Cida no Slack
SUPABASE_URL             — URL do projeto Supabase
SUPABASE_SERVICE_ROLE_KEY — chave de serviço do Supabase
CF_ACCOUNT_ID            — Cloudflare Account ID (para embeddings e LLM)
CF_API_TOKEN             — Cloudflare API Token
HF_API_KEY               — HuggingFace API Key (fallback de embedding)
OWNER_SLACK_ID           — Slack ID do Dr. Adriano (para notificações de aprendizado)
```

### Logs esperados (operação normal)
```
[rce] 11:01:00 segunda-feira, 27 de abril de 2026
[rag] pulando RAG — saudação simples
[handler] input ok: { channel_id: "...", messagePreview: "..." }
Message sent to Slack successfully { channel: "..." }
```

---

## Comportamento Homologado — dotobot-slack v165

### Confirmado funcionando
- Recebe eventos `event_callback` do Slack (DM `im` e `app_mention`)
- Responde **na mesma conversa** usando `thread_ts = event.thread_ts || event.ts`
- Usa `SLACK_BOT_TOKEN` (prioridade) → `SLACK_USER_TOKEN` (fallback)
- **Reality Context Engine**: usa `getNowInSaoPaulo()` com `timeZone: "America/Sao_Paulo"`
- Perguntas temporais resolvidas deterministicamente via `resolveTemporalAnswer()` (sem LLM)
- **Sistema de personas**: owner (Dr. Adriano, sem limites), interno (equipe), cliente (externo)
- RAG via `dotobot-rag` (top_k: 5, máx 800 chars)
- `dispatchSlackTextCommand` roteia comandos e IA conversacional
- `handleIaPerguntar` com `thread_ts` propagado por toda a cadeia

### Variáveis de ambiente necessárias
```
SLACK_BOT_TOKEN          — token do app Dotobot no Slack
SLACK_USER_TOKEN         — token de usuário (fallback)
SUPABASE_URL             — URL do projeto Supabase
SUPABASE_SERVICE_ROLE_KEY — chave de serviço do Supabase
CF_ACCOUNT_ID            — Cloudflare Account ID (para LLM)
CF_API_TOKEN             — Cloudflare API Token
SLACK_NOTIFY_CHANNEL     — canal padrão para notificações (ex: C09E59J77EU)
```

### Logs esperados (operação normal)
```
booted (time: 25ms)
[dotobot] event: { eventType: "message", eventChannelType: "im", eventUser: "U01FHTM68AH", isHumanMessage: true, ... }
[dotobot][rce] 11:01:00 segunda-feira, 27 de abril de 2026
[dotobot] token usado: SLACK_BOT_TOKEN
[llm-hub][cloudflare] chamando Cloudflare Workers AI, msgs: 2
[llm-hub][cloudflare] ✓ resposta recebida, chars: NNN
[dotobot] postSlack ok: { channel: "D0988CVDHNF", chars: NNN, thread_ts: "..." }
```

---

## Regras de Proteção do Gabarito

1. **NUNCA alterar** `cida-slack` ou `dotobot-slack` sem criar primeiro uma versão de homologação (`cida-slack-v2-homolog` ou `dotobot-slack-v2-homolog`)
2. **NUNCA fazer deploy** via Management API REST — usar **exclusivamente** `supabase functions deploy --no-verify-jwt` via CLI
3. **SEMPRE aplicar** `PATCH verify_jwt=false` após cada deploy via CLI
4. **SEMPRE fazer commit** antes e depois de qualquer alteração
5. O `dotobot-agent`, `dotobot-rag` e todas as outras funções do ecossistema **não devem ser alterados** durante upgrades da Cida ou do Dotobot-slack

---

## Como restaurar em caso de regressão

```bash
# Restaurar cida-slack para o estado homologado
cd /home/ubuntu/newgit2
git checkout e654b423 -- supabase/functions/cida-slack/index.ts
SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy cida-slack --no-verify-jwt
curl -X PATCH "https://api.supabase.com/v1/projects/sspvizogbcyigquqycsz/functions/cida-slack" \
  -H "Authorization: Bearer <token>" -d '{"verify_jwt": false}'

# Restaurar dotobot-slack para o estado homologado
git checkout e654b423 -- supabase/functions/dotobot-slack/index.ts
SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy dotobot-slack --no-verify-jwt
curl -X PATCH "https://api.supabase.com/v1/projects/sspvizogbcyigquqycsz/functions/dotobot-slack" \
  -H "Authorization: Bearer <token>" -d '{"verify_jwt": false}'
```
