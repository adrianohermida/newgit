# HMADV - Operacao Final do Pipeline Freshsales / DataJud / Advise

## Estado atual

Fluxo oficial validado em producao no projeto `sspvizogbcyigquqycsz`:

- `fs-webhook` recebe processo do Freshsales e coloca na fila
- `datajud-worker` enriquece processo e atualiza o Sales Account
- `advise-sync` busca publicacoes de forma incremental
- `sync-worker` exporta pendencias para o Freshsales

Correcões ja aplicadas:

- `sync-worker` com bootstrap e status funcional
- `advise-sync` incremental com cursor por pagina
- outbound para `sales_activities` corrigido para o formato aceito pelo Freshsales
- `datajud-worker` alinhado ao mesmo payload de activity

## Functions oficiais

Manter como principais:

- `fs-webhook`
- `datajud-worker`
- `datajud-search`
- `advise-sync`
- `sync-worker`
- `processo-sync`

Nao usar como trilha principal:

- `datajud-webhook`
- `process-datajud-queue`
- `fs-populate`
- `fs-runner` como executor
- `fs-exec`
- `publicacoes-freshsales`
- `sync-advise-realtime`

## Crons recomendados

- `datajud-worker`: a cada 5 minutos
- `sync-worker`: a cada 2 minutos
- `advise-sync`: diario em fatias pequenas

Sugestao para `advise-sync`:

- rodar com limites pequenos por execucao
- continuar enquanto `status_cursor.status = running`
- retomar automaticamente da `ultima_pagina`

## Monitoramento diario

### 1. sync-worker

Endpoint:

```text
/functions/v1/sync-worker?action=status
```

Conferir:

- `worker.em_execucao`
- `worker.ultima_execucao`
- `worker.ultimo_lote`
- `p.total`
- `p.proc_sem_acc`
- `p.pubs`
- `p.movs_advise`
- `p.fila_dj`

### 2. advise-sync

Endpoint:

```text
/functions/v1/advise-sync?action=status
```

Conferir:

- `status_cursor.status`
- `status_cursor.ultima_pagina`
- `status_cursor.total_paginas`
- `config.token_ok`
- `config.modo`

### 3. fs-runner

Endpoint:

```text
/functions/v1/fs-runner?action=status
```

Conferir:

- `processos.sem_account`
- `publicacoes.pendentes_fs`
- `movimentacoes.pendentes_fs`

## Criterio de saude

Os seguintes numeros precisam cair continuamente:

- `processos.sem_account`
- `publicacoes.pendentes_fs`
- `movimentacoes.pendentes_fs`
- `fila_dj`

## Comportamento esperado

- novo processo do Freshsales entra na fila
- DataJud atualiza detalhes e movimentos
- Advise adiciona publicacoes ao banco
- Freshsales recebe accounts, publicacoes e andamentos sem duplicidade

## Riscos remanescentes

- backlog ainda alto, exigindo varias rodadas
- necessidade de manter apenas o fluxo oficial ativo
- qualquer reativacao de pipeline legado pode gerar duplicidade

## Referencias locais

- `D:\Github\newgit\docs\schema_judiciario_datajud_advise.sql`
- `D:\Github\newgit\docs\hmadv_sync_worker_status_fix.sql`
