# HMADV - Rollout do P1 (TPU + Parser institucional)

## Objetivo

Ativar o `P1` sem quebrar o fluxo oficial que ja esta funcionando em producao.

## Pre-requisitos

- `datajud-search` com registry de adapters ja implantado
- `sync-worker` e `datajud-worker` ativos
- SQL do `P0` aplicado ou pelo menos planejado

## Ordem recomendada

### 1. Aplicar schema do P1

Aplicar:

- `D:\Github\newgit\docs\hmadv_p1_tpu_schema.sql`

Isso cria:

- `serventia_cnj`
- `juizo_cnj`
- `codigo_foro_tjsp`
- colunas de parser em `judiciario.processos`
- colunas TPU em `judiciario.movimentos`

### 2. Validar schema

Rodar:

- `D:\Github\newgit\docs\hmadv_p1_tpu_validacao.ps1`

Objetivo:

- confirmar que as colunas/tabelas estao acessiveis
- medir baseline de movimentos sem TPU
- medir baseline de processos sem camada institucional

### 3. Popular parser nos processos novos

Nao exige acao extra.

Com o `datajud-search` atual, todo processo novo que passar pelo worker ja usa:

- `defaultAdapter`
- `tjsp:1:*`
- `tjsp:2:*`
- `trf4:*:eproc`

### 4. Backfill dos processos antigos

Rodar:

- `D:\Github\newgit\docs\hmadv_p1_parser_backfill.ps1`

Modos uteis:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_p1_parser_backfill.ps1" -EnqueueOnlyMissingParser
```

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_p1_parser_backfill.ps1" -EnqueueOnlyMissingParser -RunDatajudWorker
```

### 5. Revalidar

Rodar novamente:

- `D:\Github\newgit\docs\hmadv_p1_tpu_validacao.ps1`

E comparar:

- `sem_parser_schema`
- `sem_juizo_cnj`
- `sem_serventia_cnj`
- `sem_tpu`

## Critérios de sucesso

- processos novos passam a gravar `parser_tribunal_schema`
- backlog de processos sem parser cai apos backfill
- movimentos novos passam a carregar `tpu_status`
- base institucional fica pronta para `juizo_cnj` e `serventia_cnj`

## Próximo passo depois do rollout

1. criar importadores oficiais de `juizo_cnj` e `serventia_cnj`
2. ligar enriquecimento institucional dentro do `datajud-search`
3. subir a function `tpu-sync`
4. medir completude por adapter e por tribunal
