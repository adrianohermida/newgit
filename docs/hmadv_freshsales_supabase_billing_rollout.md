# HMADV - Freshsales + Supabase Billing Rollout

## Objetivo

Implementar a trilha financeira canônica do HMADV em `Supabase`, mantendo o `Freshsales` como camada operacional para:

- `contacts`
- `products`
- `deals`
- automações de jornada e e-mail

O fluxo recomendado é:

`CSV -> billing_import_rows -> billing_contracts/billing_receivables -> recálculo financeiro -> sync para Freshsales`

## Entregas desta fase

- migration [013_create_hmadv_billing_core.sql](D:/Github/newgit/supabase/migrations/013_create_hmadv_billing_core.sql)
- biblioteca financeira [hmadv-billing.js](D:/Github/newgit/functions/lib/hmadv-billing.js)
- importador em lote [import-hmadv-billing-csv.js](D:/Github/newgit/scripts/import-hmadv-billing-csv.js)

## Como rodar o importador

### Dry run

```bash
node scripts/import-hmadv-billing-csv.js --dry-run
```

### Import real

```bash
node scripts/import-hmadv-billing-csv.js --workspace-id <uuid-do-workspace>
```

### Arquivos customizados

```bash
node scripts/import-hmadv-billing-csv.js "D:/Downloads/HMADV - Faturas (6).csv" "D:/Downloads/HMADV - Assinaturas (1).csv"
```

## Orquestração do pipeline

Para rodar a esteira principal em sequência:

```bash
node scripts/orchestrate-hmadv-billing.js --workspace-id <uuid> --indices-file "D:/Downloads/indices.csv" --publish-limit 10 --queue-limit 50
```

Ao final, o script:

- sincroniza produtos seed
- sincroniza `contacts`
- sincroniza `products`
- importa índices, quando informados
- importa os CSVs financeiros
- materializa contratos e recebíveis
- publica deals
- processa a fila de CRM

## Relatório de reconciliação

Para exportar as pendências de match, duplicidade e validação:

```bash
node scripts/export-hmadv-reconciliation-report.js
```

## Reconciliação assistida

Para gerar sugestões automáticas de match de contato por nome e telefone:

```bash
node scripts/reconcile-hmadv-contacts.js --limit 1000 --topn 3
```

Para aplicar automaticamente apenas sugestões acima do score mínimo:

```bash
node scripts/reconcile-hmadv-contacts.js --apply --min-score 0.72
```

## Reprocessamento incremental

Depois de reconciliar contatos pendentes, rode:

```bash
node scripts/reprocess-hmadv-billing.js --workspace-id <uuid> --limit 1000
```

Isso materializa apenas linhas já reconciliadas que ainda não viraram `receivable` e deixa prontas para nova publicação de deals.

## Retry e relatório operacional

Para tentar novamente deals que falharam na publicação:

```bash
node scripts/retry-hmadv-deals.js 20
```

Para gerar um relatório operacional consolidado:

```bash
node scripts/report-hmadv-ops.js
```

## Preflight

Antes de rodar publicação real, valide o ambiente:

```bash
node scripts/preflight-hmadv-billing.js
```

## Descoberta de campos financeiros no Freshsales

Para sugerir o `FRESHSALES_BILLING_DEAL_FIELD_MAP` a partir do tenant real:

```bash
node scripts/discover-freshsales-billing-fields.js
```

## Bootstrap de contatos

Se o tenant ainda estiver com poucos ou nenhum contato sincronizado, crie os contatos básicos a partir das linhas financeiras com e-mail:

```bash
node scripts/bootstrap-hmadv-contacts.js 100
```

## Regras já implementadas

- matching de contato por `e-mail`
- normalização de datas brasileiras
- normalização de moeda BRL
- inferência inicial de:
  - `billing_type`
  - `product_family`
  - `canonical_status`
- detecção de duplicidade por chave composta
- estrutura para cálculo de:
  - correção monetária
  - multa
  - juros de mora
  - juros compensatórios

## Regra de cálculo portada do GAS

A função SQL `public.recalculate_billing_receivable` replica a lógica-base do GAS:

- usa o índice do mês do vencimento
- se não houver, usa o mais próximo anterior
- para o índice atual, usa o mês corrente ou o mais recente disponível
- multa padrão de `10%`
- juros de mora de `1% a.m.`
- juros compensatórios de `1% a.m.`

Dois saldos são gravados:

- `balance_due`: compatível com a lógica nominal do GAS
- `balance_due_corrected`: saldo considerando o principal corrigido

## Próxima fase recomendada

1. popular `freshsales_contacts` a partir de `freshsales_sync_snapshots`
2. sincronizar catálogo `freshsales_products`
3. transformar staging válido em `billing_contracts` e `billing_receivables`
4. publicar `deals` com idempotência no `Freshsales`
5. ligar `crm_event_queue` ao fluxo de jornadas, campanhas e e-mail
