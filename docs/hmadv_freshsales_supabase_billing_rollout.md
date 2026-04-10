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

## Auditoria de 2026-04-09

Achados principais da auditoria operacional:

1. a orquestração estava importando dois CSVs, mas materializando apenas o último `import_run`;
2. contratos materializados podiam ficar sem `freshsales_contact_id`, o que quebrava a associação real do `deal` no Freshsales;
3. o publicador tratava campos core como `deal_type_id` como se fossem `custom_field`, o que inviabiliza o mapeamento correto no tenant.

Correções já aplicadas:

- [orchestrate-hmadv-billing.js](D:/Github/newgit/scripts/orchestrate-hmadv-billing.js) agora importa e materializa cada CSV separadamente;
- [materialize-hmadv-billing.js](D:/Github/newgit/scripts/materialize-hmadv-billing.js) agora propaga `freshsales_contact_id` para `billing_contracts`;
- [publish-hmadv-deals.js](D:/Github/newgit/scripts/publish-hmadv-deals.js) agora separa campos core de `custom_field` e suporta `FRESHSALES_BILLING_DEAL_TYPE_ID_MAP`.

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

Observação:

- quando múltiplos CSVs forem passados, cada arquivo agora gera seu próprio `import_run` e sua própria materialização antes da publicação dos deals.

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

## Refresh do token Freshsales

Se os endpoints de escrita do Freshsales voltarem `401 login failed`, renove o OAuth local:

```bash
node scripts/refresh-freshsales-token.js
```

O script usa `FRESHSALES_OAUTH_CLIENT_ID`, `FRESHSALES_OAUTH_CLIENT_SECRET` e `FRESHSALES_REFRESH_TOKEN`, renova o `access_token` e atualiza o `.dev.vars`.

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

O bootstrap agora:

- agrupa por e-mail para evitar criação repetida;
- tenta múltiplas variantes de payload de `contact`;
- tenta mais de uma base do Freshsales quando o tenant varia entre `/api` e `/crm/sales/api`.

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

## Plano incremental atualizado

### Auditoria de 2026-04-10

Achados principais desta rodada:

1. placeholders como `SEU_UUID_REAL` e `ID_DO_IMPORT_RUN` estavam derrubando a execucao antes da carga real;
2. o relatorio operacional estava subcontando a base por ler apenas a primeira pagina do PostgREST;
3. a reconciliacao de processo/account estava conservadora demais, priorizando pouco a referencia do processo;
4. a materializacao ja exigia `contact + account`, mas a reconciliacao ainda nao alimentava isso em volume suficiente.

Correcoes aplicadas:

- [import-hmadv-billing-csv.js](D:/Github/newgit/scripts/import-hmadv-billing-csv.js) agora ignora placeholders invalidos de workspace;
- [materialize-hmadv-billing.js](D:/Github/newgit/scripts/materialize-hmadv-billing.js) aceita modo implicito do ultimo `import_run` valido;
- [reprocess-hmadv-billing.js](D:/Github/newgit/scripts/reprocess-hmadv-billing.js) ignora placeholders invalidos de workspace;
- [report-hmadv-ops.js](D:/Github/newgit/scripts/report-hmadv-ops.js) agora pagina toda a base;
- [reconcile-hmadv-processes.js](D:/Github/newgit/scripts/reconcile-hmadv-processes.js) agora combina match por e-mail com busca por referencia do processo e pagina os resultados.

### Fase 1. Ambiente e credenciais

1. estabilizar `.dev.vars` com `SUPABASE_*`, `FRESHSALES_*`, `FRESHSALES_DEFAULT_DEAL_STAGE_ID`;
2. confirmar `FRESHSALES_BILLING_DEAL_FIELD_MAP`;
3. preencher `FRESHSALES_BILLING_DEAL_TYPE_ID_MAP` se `billing_type` usar `deal_type_id`.

### Fase 2. Índices financeiros

1. importar CSV real de índices em `billing_indices`;
2. validar cobertura de meses para as faturas históricas;
3. só então liberar materialização financeira completa com correção monetária.

Modo alternativo para avanço operacional:

- se precisar avançar antes da carga de índices, configure `HMADV_ALLOW_MISSING_BILLING_INDICES=true`;
- nesse modo, a materialização segue com saldo nominal e sem correção monetária efetiva;
- use esse caminho apenas para teste operacional ou carga inicial controlada.

### Fase 3. Reconciliação de contatos

1. reexecutar `bootstrap` para ampliar `freshsales_contacts`;
2. rodar reconciliação assistida para os casos sem e-mail ou sem match automático;
3. reprocessar apenas linhas reconciliadas.

### Fase 4. Materialização canônica

1. materializar todos os `import_runs` pendentes;
2. validar `billing_contracts` e `billing_receivables` com vínculo Freshsales;
3. conferir cálculos de atraso, multa, juros e saldo corrigido.

### Fase 5. Publicação CRM

1. publicar deals apenas para recebíveis com `freshsales_contact_id`;
2. validar payload aceito pelo tenant para estágio, tipo e custom fields;
3. confirmar idempotência no `freshsales_deals_registry`.

### Fase 6. Automação operacional

1. processar `crm_event_queue`;
2. revisar transições de jornada e ciclo de vida;
3. ativar retry seletivo e relatório operacional como rotina.

## Portal e módulo interno financeiro

- O portal do cliente agora deve refletir prioritariamente `billing_receivables + billing_contracts`, e não apenas os views do Freshsales.
- O usuário `adrianohermida@gmail.com` pode atuar como observador técnico no portal, com um bloco de diagnóstico discreto sobre a origem da leitura financeira.
- O dashboard interno passa a ter uma torre dedicada em `/interno/financeiro`, alimentada por `/api/admin-hmadv-financeiro`.
- Esse módulo interno precisa mostrar:
  - volume de staging;
  - contratos e recebíveis canônicos;
  - pendências de `contact` e `account/processo`;
  - contratos `textual_only`;
  - falhas de publicação em Deals;
  - backlog da fila CRM.
- Quando a heurística de reconciliação não encontrar `account/processo`, a resolução passa a ser feita manualmente no módulo interno financeiro, aplicando `resolved_process_id`, `resolved_account_id_freshsales` e `resolved_process_reference` diretamente nas linhas `pendente_account`.
- A publicação em `Deals` segue restrita aos recebíveis com `freshsales_contact_id + freshsales_account_id`, enquanto o portal pode avançar com a base canônica mesmo antes da reconciliação completa de `accounts`.
