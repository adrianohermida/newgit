# Dotobot RAG - Checklist de Secrets e Deploy

Este checklist existe para resolver o cenário em que o painel mostra:

- `Embedding: falhou`
- `Consulta vetorial: falhou`
- `Authentication error`

## O que precisa bater exatamente

O app e a Edge Function usam o mesmo segredo para o embedding do Supabase.

Valor esperado:

- `DOTOBOT_SUPABASE_EMBED_SECRET`

Esse mesmo valor precisa existir em dois lugares:

1. No app/web que chama o healthcheck e o chat
2. Na Edge Function `supabase/functions/dotobot-embed`

Se o segredo estiver ausente em um dos lados, ou se os valores forem diferentes, o healthcheck retorna `Authentication error`.

## Onde o app lê isso

O app usa:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DOTOBOT_SUPABASE_EMBED_SECRET`
- `DOTOBOT_SUPABASE_EMBED_FUNCTION`

Arquivos relevantes:

- [`lib/lawdesk/rag.js`](/D:/Github/newgit/lib/lawdesk/rag.js)
- [`pages/api/admin-dotobot-rag-health.js`](/D:/Github/newgit/pages/api/admin-dotobot-rag-health.js)

## Onde a function valida isso

A Edge Function `dotobot-embed` aceita o segredo por:

- header `x-dotobot-embed-secret`
- fallback `x-shared-secret`
- fallback `Authorization: Bearer <secret>`

Arquivo relevante:

- [`supabase/functions/dotobot-embed/index.ts`](/D:/Github/newgit/supabase/functions/dotobot-embed/index.ts)

## Checklist operacional

1. Definir no app/web:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DOTOBOT_SUPABASE_EMBED_SECRET`

2. Definir na Edge Function `dotobot-embed`:
- `DOTOBOT_SUPABASE_EMBED_SECRET`

3. Confirmar que `DOTOBOT_SUPABASE_EMBED_FUNCTION=dotobot-embed`

4. Confirmar que a tabela existe:
- `dotobot_memory_embeddings`

5. Confirmar que a RPC existe:
- `upsert_dotobot_memory_embedding`
- `search_dotobot_memory_embeddings`

6. Fazer deploy da function depois de atualizar os secrets

7. Rerodar o healthcheck em:
- `/api/admin-dotobot-rag-health`
- painel `/interno/agentlab/environment`

## Leitura do painel

Se aparecer:

- `Estado do backend: degraded`

Significa:

- o fallback do Obsidian está vivo
- os backends principais ainda não estão saudáveis

Se aparecer:

- `Sinal: o app que chama o healthcheck não tem DOTOBOT_SUPABASE_EMBED_SECRET configurado`

Significa:

- o segredo está faltando no app/web

Se aparecer:

- `Sinal: a autenticação do dotobot-embed falhou`

Significa:

- o segredo do app e o da function não batem
- ou a function não recebeu o secret esperado

## Resultado esperado após correção

No painel:

- `Status: Operacional`
- `Embedding Supabase: OK`
- `Consulta vetorial Supabase: OK`
- `Persistência Supabase: OK`

E, quando Cloudflare também estiver íntegro:

- `Embedding Cloudflare: OK`
- `Consulta vetorial Cloudflare: OK`

