# Relatório de Verificação do Sistema Automático
**Data:** 2026-04-26 | **Projeto:** newgit (Supabase: sspvizogbcyigquqycsz)

---

## Resumo Executivo

O sistema de orquestração automática foi **corrigido e está operacional**. Todos os 5 jobs principais do orchestrator-engine retornam `status: ok`. O job `processos:create_account` já está processando ativamente (5.731 → 5.674 pendentes = **57 processos criados** nesta sessão).

---

## Correções Aplicadas

### 1. Bug de Ambiguidade SQL (`orchestrator_get_next_jobs`)
**Problema:** A função PL/pgSQL tinha conflito de nome entre a coluna `pendentes` do CTE e a variável local do mesmo nome, causando erro `ERROR: column reference "pendentes" is ambiguous`.

**Solução:** Migração completa de `LANGUAGE plpgsql` para `LANGUAGE sql` puro, eliminando o escopo de variáveis que causava a ambiguidade. Batch sizes também foram reduzidos para evitar timeouts.

### 2. Erro 401 JWT nas Edge Functions (`orchestrator-engine`)
**Problema:** O Supabase migrou para novo formato de chaves (`sb_secret_...` e `sb_publishable_...`) que **não são JWTs válidos**. O endpoint `/functions/v1/` com `verify_jwt=true` rejeitava essas chaves com `UNAUTHORIZED_INVALID_JWT_FORMAT`.

**Solução:** Adicionado `verify_jwt = false` no `config.toml` para as funções invocadas pelo orchestrator: `publicacoes-freshsales`, `datajud-andamentos-sync`, `publicacoes-partes`, `orchestrator-engine`, `datajud-worker`.

### 3. Invocação via Query String (`orchestrator-engine`)
**Problema:** O SDK `supabase.functions.invoke()` envia parâmetros no body JSON, mas as Edge Functions leem `action` via `url.searchParams.get('action')` (query string).

**Solução:** Substituído `supabase.functions.invoke()` por `fetch()` direto com parâmetros na query string.

### 4. Extração de Métricas Flexível (`orchestrator-engine`)
**Problema:** O orchestrator lia apenas o campo `processados` da resposta, mas `publicacoes-freshsales` retorna `sucesso` e outras funções retornam `total`.

**Solução:** Extração com fallback: `processados ?? sucesso ?? total ?? 0`.

### 5. Quotas de Rate Limit (`_shared/rate-limit.ts`)
**Problema:** `datajud-andamentos-sync` tinha quota de 60/hora no código TypeScript mas 200 no banco, causando bloqueio prematuro.

**Solução:** Quotas atualizadas e harmonizadas:
- `datajud-andamentos-sync`: 60 → 150
- `processo-sync`: 120 → 150
- Adicionados: `publicacoes-partes` (100), `publicacoes-prazos` (60), `publicacoes-audiencias` (40)

---

## Estado Atual do Sistema

### CRONs Ativos (40 total)

| Job | Schedule | Frequência |
|-----|----------|------------|
| `orchestrator-engine-cron` | `*/5 * * * *` | A cada 5 min |
| `orchestrator-dag-runner-cron` | `*/1 * * * *` | A cada 1 min |
| `datajud-andamentos-sync-cron` | `0 * * * *` | A cada hora |
| `datajud-worker` | `*/15 * * * *` | A cada 15 min |
| `advise-drain-contratos-cron` | `*/10 * * * *` | A cada 10 min |
| `billing-import-cron` | `*/5 * * * *` | A cada 5 min |
| `advise-ai-enricher-cron` | `*/10 * * * *` | A cada 10 min |
| `agentlab-runner-cron` | `*/10 * * * *` | A cada 10 min |
| `fix_fs_account_repair_batch` | `*/15 * * * *` | A cada 15 min |
| `processo-sync-bidirectional` | `*/30 * * * *` | A cada 30 min |

### Filas Pendentes (Orchestrator)

| Entidade | Ação | Pendentes | Status |
|----------|------|-----------|--------|
| `movimentos` | `sync_activity` | 17.467 | Em processamento |
| `publicacoes` | `sync_activity` | 11.217 | Aguardando accounts |
| `processos` | `create_account` | 5.674 | **Processando ativo** |
| `partes` | `create_contact` | 5.027 | Em processamento |
| `prazos` | `create_task` | 2.942 | Em processamento |

### Rate Limit Freshsales

| Caller | Quota/hora | Usado (janela atual) | Disponível |
|--------|-----------|---------------------|------------|
| `publicacoes-freshsales` | 300 | 0 | 300 |
| `fs-account-repair` | 200 | 0 | 200 |
| `processo-sync` | 150 | 0 | 150 |
| `datajud-andamentos-sync` | 150 | 120 | 30 |
| `publicacoes-partes` | 100 | 0 | 100 |
| **Total Global** | **990** | **120** | **870** |

---

## Observações Importantes

### Por que `publicacoes:sync_activity` tem processados=0?
Os 11.217 itens pendentes têm `sem_account=23` e `cnj_invalido=2` nos primeiros 25 testados. Isso significa que a maioria das publicações ainda não tem uma conta (`fs_deal_id`) criada no Freshsales. O job `processos:create_account` precisa processar os 5.674 processos primeiro para criar as contas, e então `publicacoes:sync_activity` poderá sincronizar.

### Por que `datajud-andamentos-sync` tem processados=0?
A quota de 150 calls/hora já foi consumida (120 usados). O job processará novamente na próxima janela de hora. Com quota de 150 e 3 calls/processo, processa ~50 processos/hora.

### Próximos passos recomendados
1. **Aguardar** o `processos:create_account` processar os 5.674 pendentes (a ~10 por execução, ~5 min cada = ~47 horas)
2. **Considerar** aumentar o `batch_size` do `processos:create_account` para 20-30 após confirmar estabilidade
3. **Monitorar** o rate limit do Freshsales para garantir que não ultrapasse 990 calls/hora

---

## Arquivos Modificados

```
supabase/config.toml                              ← verify_jwt=false para funções
supabase/functions/_shared/rate-limit.ts          ← quotas atualizadas
supabase/functions/orchestrator-engine/index.ts   ← fetch direto + métricas flexíveis
supabase/migrations/20260426_orchestrator_fix_batch_size.sql ← migração SQL
```

**Commit:** `fix: corrige orchestrator-engine e funções de orquestração`
**Push:** `main` branch → `adrianohermida/newgit`
