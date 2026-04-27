# Relatório de Auditoria Completa — Integrações Freshsales
**Data:** 27 de Abril de 2026  
**Autor:** Manus AI  
**Projeto:** newgit / HMADV — Sistema de Orquestração de Sincronização

---

## 1. Resumo Executivo

A auditoria identificou **cinco pipelines de sincronização com falhas estruturais** que impedem a drenagem automática das filas de pendências para o Freshsales. O orquestrador (`orchestrator-engine`) está funcional e disparando os jobs corretamente, mas cada pipeline downstream tem um problema específico que bloqueia o processamento efetivo. O módulo de rate limit foi corrigido na sessão anterior, mas ainda há um gargalo de dependência em cascata: a maioria das filas só pode ser processada **depois** que os processos tiverem `account_id_freshsales` preenchido, o que ainda está em andamento.

---

## 2. Estado Atual das Filas (27/04/2026)

| Entidade | Ação | Pendentes Reais | Processados | Status Orquestrador | Bloqueio |
|---|---|---|---|---|---|
| `processos` | `create_account` | **3.022** | 10 | `done` (desatualizado) | Progresso lento — ~150/hora |
| `publicacoes` | `sync_activity` | **11.204** | 0 | `idle` | Depende de `account_id_freshsales` |
| `movimentos` | `sync_activity` | **17.224** | 0 | `idle` | Depende de `fs_deal_id` (coluna errada) |
| `partes` | `create_contact` | **5.027** | 0 | `idle` | Depende de `account_id_freshsales` |
| `prazos` | `create_task` | **2.942** | 0 | `idle` | Coluna `freshsales_account_id` não existe |
| `datajud` | `fetch_movimentos` | **7.158** | 0 | `idle` | Depende de `account_id_freshsales` |
| `billing_receivables` | `sync_deals` | **596** | 0 | Fora do orquestrador | Erro 400 do Freshsales (campo obrigatório) |
| `advise` | `drain_publicacoes` | 3 | 0 | `idle` | Depende de `account_id_freshsales` |

> **Observação crítica:** O `sync_orchestrator` mostra `pendentes=0` para a maioria das filas porque o campo `pendentes` na tabela **não é atualizado automaticamente** — ele reflete o último valor registrado pelo orquestrador, não o estado real. A função `orchestrator_check_pendencias()` retorna os valores reais acima.

---

## 3. Diagnóstico Detalhado por Pipeline

### 3.1 Pipeline: `processos → create_account`

**Função:** `processo-sync` com `action=push_freshsales`  
**Status:** Funcionando, mas com throughput limitado.

O pipeline está operacional. A fila reduziu de 5.777 para 3.022 pendências (2.755 contas criadas). O gargalo é o rate limit: cada processo consome 4 chamadas ao Freshsales (GET + POST account + 2 custom fields), resultando em ~150 processos/hora com a quota de 600 slots/hora alocada para `processo-sync`.

**Estimativa de conclusão:** ~20 horas de processamento contínuo para zerar os 3.022 restantes.

---

### 3.2 Pipeline: `publicacoes → sync_activity`

**Função:** `publicacoes-freshsales` com `action=sync`  
**Status:** Parcialmente bloqueado — 57,4% das publicações podem ser processadas agora.

Dos 11.204 registros pendentes:
- **6.436** têm processo vinculado com `account_id_freshsales` preenchido → **podem ser processados imediatamente**
- **4.768** têm processo vinculado mas sem `account_id_freshsales` → aguardam o `create_account` terminar

**Problema adicional:** O orquestrador envia `batch_size` como parâmetro, mas a função lê o parâmetro `batch` (não `batch_size`) da query string. O batch efetivo sempre cai para o padrão de 25 itens, ignorando o batch_size calculado pelo orquestrador.

**Problema de prioridade:** O orquestrador só processa `publicacoes:sync_activity` depois de zerar `processos:create_account` (prioridade 1 vs 2). Com 3.022 processos pendentes, as publicações ficam bloqueadas por ~20 horas.

---

### 3.3 Pipeline: `movimentos → sync_activity`

**Função:** `datajud-andamentos-sync` com `action=sync_batch`  
**Status:** Bloqueado — coluna errada na query.

A função filtra processos com `.not('fs_deal_id', 'is', null)`, mas a coluna `fs_deal_id` **não existe** na tabela `processos`. A coluna correta é `account_id_freshsales`. Isso faz com que o filtro retorne zero processos, e nenhum andamento é sincronizado.

Adicionalmente, a função usa a tabela `andamentos` (0 registros sem `fs_activity_id`) em vez da tabela `movimentos` (17.224 registros sem `freshsales_activity_id`). Há uma **inconsistência de nomenclatura**: o orquestrador conta `movimentos`, mas a função processa `andamentos`.

---

### 3.4 Pipeline: `prazos → create_task`

**Função:** `publicacoes-prazos` com `action=criar_tasks_pendentes`  
**Status:** Bloqueado — coluna errada na query de lookup.

A função busca o account do processo com `.select('freshsales_account_id')`, mas a coluna correta é `account_id_freshsales`. O resultado é que `accountId` sempre retorna `null`, e as tasks são criadas no Freshsales **sem vínculo com nenhum Account**, o que pode causar rejeição pela API ou tasks órfãs.

Há **2.942 prazos calculados** sem `freshsales_task_id`. Todos os processos associados já têm `account_id_freshsales` preenchido (confirmado por query direta).

---

### 3.5 Pipeline: `billing_receivables → deals`

**Função:** `billing-deals-sync` com `action=sync_batch`  
**Status:** Bloqueado — erro 400 do Freshsales ao criar deals.

Dos 615 receivables, 596 não têm `freshsales_deal_id`. A função tenta criar deals via `POST /deals`, mas retorna `erros=15, deals_criados=0` em cada execução. O erro ocorre porque:

1. **Nenhum receivable tem `freshsales_account_id`** preenchido (apenas 22 dos 615 têm). O payload do deal não inclui o `account_id`, e o Freshsales pode exigir esse vínculo.
2. **`invoice_number` com valor `#REF!`** — 591 registros têm número de fatura inválido (`#REF!`), indicando que foram importados de uma planilha com erro de referência. O Freshsales pode rejeitar campos com esse valor.
3. **`billing-deals-sync` não está no orquestrador** — o job roda apenas via CRON horário independente, sem controle de prioridade ou dependência.

---

### 3.6 Problema Transversal: Atualização do `sync_orchestrator`

O campo `pendentes` na tabela `sync_orchestrator` não é atualizado em tempo real. O orquestrador atualiza o campo apenas quando executa o job, mas o valor permanece desatualizado entre as execuções. Isso cria uma falsa impressão de que as filas estão zeradas quando na verdade têm dezenas de milhares de itens pendentes.

---

## 4. Plano de Correção Incremental

O plano está organizado em **4 sprints** de correção, ordenados por dependência e impacto.

---

### Sprint 1 — Correções Críticas de Código (Impacto Imediato)

Estas correções desbloqueiam pipelines que estão parados por bugs de nomenclatura de colunas.

#### 1.1 Corrigir `publicacoes-prazos` — coluna `freshsales_account_id`

**Arquivo:** `supabase/functions/publicacoes-prazos/index.ts`  
**Linha ~1087:**

```typescript
// ANTES (errado):
.select("freshsales_account_id")

// DEPOIS (correto):
.select("account_id_freshsales")

// E na leitura do resultado:
// ANTES:
accountId = proc?.freshsales_account_id ? String(proc.freshsales_account_id) : null;

// DEPOIS:
accountId = proc?.account_id_freshsales ? String(proc.account_id_freshsales) : null;
```

**Impacto:** Desbloqueia a criação de 2.942 tasks de prazo no Freshsales.

#### 1.2 Corrigir `publicacoes-freshsales` — parâmetro `batch` vs `batch_size`

**Arquivo:** `supabase/functions/publicacoes-freshsales/index.ts`  
**Linha ~696:**

```typescript
// ANTES:
const raw = url.searchParams.get('batch') ?? String(body.batch ?? 25);

// DEPOIS:
const raw = url.searchParams.get('batch_size') ?? url.searchParams.get('batch') ?? String(body.batch_size ?? body.batch ?? 25);
```

**Impacto:** O orquestrador passa o batch_size calculado corretamente, aumentando o throughput.

#### 1.3 Corrigir `datajud-andamentos-sync` — coluna `fs_deal_id` → `account_id_freshsales`

**Arquivo:** `supabase/functions/datajud-andamentos-sync/index.ts`  
**Linha ~240:**

```typescript
// ANTES (errado):
.select('id, cnj, fs_deal_id, tribunal_sigla')
.not('fs_deal_id', 'is', null)

// DEPOIS (correto):
.select('id, numero_cnj, account_id_freshsales, tribunal_sigla')
.not('account_id_freshsales', 'is', null)
```

E na linha ~110, substituir o uso de `fs_deal_id` pelo campo correto para identificar o deal/account no Freshsales.

**Impacto:** Desbloqueia a sincronização de 17.224 movimentos como atividades no Freshsales.

---

### Sprint 2 — Correção do Pipeline de Deals

#### 2.1 Corrigir `billing-deals-sync` — incluir `account_id` no payload

**Arquivo:** `supabase/functions/billing-deals-sync/index.ts`

O payload do deal precisa incluir o `account_id` do Freshsales. A função deve:
1. Buscar o `freshsales_account_id` do contato via `freshsales_contacts`
2. Se não encontrar, buscar via `billing_receivables.freshsales_account_id`
3. Incluir no payload: `sales_account: { id: accountId }`

```typescript
// Adicionar ao dealPayload:
const accountId = rec.freshsales_account_id 
  ? Number(rec.freshsales_account_id) 
  : await resolverAccountIdBilling(rec.contact_id as string);

// No payload:
...(accountId ? { sales_account: { id: accountId } } : {}),
```

#### 2.2 Limpar `invoice_number` com valor `#REF!`

**SQL de migração:**

```sql
UPDATE public.billing_receivables
SET invoice_number = 'IMPORTADO-' || EXTRACT(YEAR FROM issue_date) || '-' || EXTRACT(MONTH FROM issue_date)
WHERE invoice_number = '#REF!' OR invoice_number IS NULL;
```

#### 2.3 Adicionar `billing:sync_deals` ao orquestrador

**Arquivo:** `supabase/functions/orchestrator-engine/index.ts`

```typescript
// Adicionar ao JOB_FUNCTION_MAP:
"billing:sync_deals": {
  fn: "billing-deals-sync",
  payload: (_, bs) => ({ action: "sync_batch", batch_size: bs }),
},
```

**SQL para adicionar ao sync_orchestrator:**

```sql
INSERT INTO public.sync_orchestrator (entidade, acao, status, pendentes, processados, erros)
VALUES ('billing', 'sync_deals', 'idle', 596, 0, 0)
ON CONFLICT (entidade, acao) DO NOTHING;
```

**SQL para adicionar à `orchestrator_check_pendencias`:**

```sql
UNION ALL SELECT 'billing', 'sync_deals',
  (SELECT COUNT(*) FROM public.billing_receivables
   WHERE freshsales_deal_id IS NULL
     AND status != 'cancelled')::BIGINT,
  10
```

---

### Sprint 3 — Otimização de Throughput e Prioridade

#### 3.1 Processar `publicacoes:sync_activity` em paralelo com `processos:create_account`

O orquestrador atual processa apenas o job de maior prioridade. Para as publicações que já têm `account_id_freshsales`, não há razão para aguardar o `create_account` terminar.

**Modificação no `orchestrator-engine`:** Permitir execução paralela de jobs de prioridades diferentes quando não há dependência direta.

#### 3.2 Aumentar batch_size do `processo-sync`

O batch atual é 10 processos por execução (limitado pelo rate limit). Com a correção do schema de rate limit (Sprint anterior), o registro agora é correto. Pode-se aumentar para 20 processos por execução sem violar o limite de 600 chamadas/hora.

#### 3.3 Atualizar `pendentes` no `sync_orchestrator` em tempo real

Criar um trigger ou função que atualiza o campo `pendentes` na tabela `sync_orchestrator` sempre que a `orchestrator_check_pendencias()` for chamada pelo orquestrador, garantindo que o painel reflita o estado real.

---

### Sprint 4 — Monitoramento e Alertas

#### 4.1 Criar view de saúde do sistema

```sql
CREATE OR REPLACE VIEW public.vw_sync_health AS
SELECT 
  cp.entidade,
  cp.acao,
  cp.pendentes as pendentes_reais,
  so.processados,
  so.erros,
  so.proximo_run,
  CASE 
    WHEN cp.pendentes = 0 THEN 'ok'
    WHEN so.proximo_run < NOW() - INTERVAL '30 minutes' THEN 'atrasado'
    ELSE 'processando'
  END as saude
FROM orchestrator_check_pendencias() cp
LEFT JOIN public.sync_orchestrator so ON so.entidade = cp.entidade AND so.acao = cp.acao
ORDER BY cp.prioridade;
```

#### 4.2 Alerta de violação de rate limit

Criar um CRON que verifica se o total de `calls_used` na última hora ultrapassou 900 (90% do limite) e envia alerta via Slack/Dotobot.

---

## 5. Ordem de Execução Recomendada

| Ordem | Ação | Tempo Estimado | Impacto |
|---|---|---|---|
| 1 | Corrigir coluna `freshsales_account_id` no `publicacoes-prazos` | 15 min | Desbloqueia 2.942 tasks |
| 2 | Corrigir parâmetro `batch` → `batch_size` no `publicacoes-freshsales` | 10 min | Aumenta throughput |
| 3 | Corrigir coluna `fs_deal_id` → `account_id_freshsales` no `datajud-andamentos-sync` | 30 min | Desbloqueia 17.224 movimentos |
| 4 | Corrigir payload de deals no `billing-deals-sync` | 45 min | Desbloqueia 596 receivables |
| 5 | Limpar `invoice_number = '#REF!'` no banco | 5 min | Pré-requisito para deals |
| 6 | Adicionar `billing:sync_deals` ao orquestrador | 20 min | Integra deals ao fluxo controlado |
| 7 | Permitir execução paralela no orquestrador | 60 min | Aumenta throughput geral |
| 8 | Criar view `vw_sync_health` | 15 min | Visibilidade em tempo real |

---

## 6. Estimativa de Tempo para Drenagem Total

Assumindo as correções aplicadas e o rate limit de 990 chamadas/hora:

| Fila | Pendentes | Chamadas/item | Horas estimadas |
|---|---|---|---|
| `processos:create_account` | 3.022 | 4 | ~12h |
| `publicacoes:sync_activity` | 11.204 | 3 | ~34h |
| `movimentos:sync_activity` | 17.224 | 1 | ~17h |
| `partes:create_contact` | 5.027 | 2 | ~10h |
| `prazos:create_task` | 2.942 | 1 | ~3h |
| `billing:sync_deals` | 596 | 2 | ~1h |

> **Nota:** As filas são processadas sequencialmente por prioridade. O tempo total sequencial seria ~77 horas. Com paralelização (Sprint 3), pode ser reduzido para ~34 horas (limitado pela fila de publicações).

---

## 7. Conclusão

O sistema de orquestração está estruturalmente correto e o rate limit está sendo respeitado após as correções da sessão anterior. Os problemas identificados são todos **bugs de código corrigíveis** (nomes de colunas errados, parâmetros divergentes, campos ausentes no payload). Nenhum problema requer mudança de arquitetura.

A prioridade imediata é o **Sprint 1**, que pode ser executado em menos de 1 hora e desbloqueará imediatamente a criação de tasks de prazo e a sincronização de movimentos — dois pipelines completamente parados por bugs triviais.
