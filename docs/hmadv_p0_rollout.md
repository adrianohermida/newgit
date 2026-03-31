# HMADV - Rollout do P0

## Objetivo

Aplicar o schema de status de enriquecimento DataJud e validar o comportamento no HMADV.

## 1. Aplicar o SQL

Arquivo:

- [hmadv_p0_enriquecimento_schema.sql](D:/Github/newgit/docs/hmadv_p0_enriquecimento_schema.sql)

Aplicar no projeto HMADV `sspvizogbcyigquqycsz`.

Esse SQL:

- cria colunas de status em `judiciario.processos`
- cria colunas de classificacao em `judiciario.publicacoes`
- inicializa `datajud_status`
- classifica publicacoes administrativas sem processo

## 2. Validar o schema aplicado

Rodar:

```powershell
$env:HMADV_ANON_KEY="SEU_ANON_KEY"
$env:HMADV_SERVICE_ROLE="SEU_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_p0_validacao.ps1"
```

O esperado:

- `sem_status` deve tender a `0`
- parte dos processos deve aparecer como `enriquecido`
- publicacoes administrativas sem processo devem aparecer em `administrativas`

## 3. Disparar uma rodada de enriquecimento

Rodar:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_execucao_controlada.ps1" -RunSyncWorker
```

E depois:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_p0_validacao.ps1"
```

O esperado:

- `pendentes` cair
- `processando` oscilar durante as rodadas
- `enriquecidos` subir
- `fila processo_pendente` cair

## 3.1 Reconciliar backlog pelo `datajud_status`

Depois que o schema entrar, usar o backfill em modo orientado por status:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_backfill_enriquecimento.ps1" -QueueBackfill -UseDatajudStatus
```

Esse modo:

- reenfileira apenas `pendente`, `falha_temporaria` e `sem_status`
- ignora `enriquecido` e `nao_enriquecivel`
- reconcilia processos presos em `processando` por muito tempo para `falha_temporaria`

## 4. Confirmar comportamento do datajud-worker

Como o `datajud-worker` ja foi publicado com suporte ao novo status:

- antes do SQL ele so emitia aviso
- depois do SQL ele passa a persistir:
  - `enriquecido`
  - `falha_temporaria`
  - `nao_enriquecivel`

## 5. Meta de encerramento do P0

Considerar P0 concluido quando:

- `processos.sem_account = 0`
- todo processo com `account_id_freshsales` tiver `datajud_status`
- as `2` publicacoes sem processo estiverem classificadas como administrativas/manual
- o backlog pendente de enriquecimento estiver sob controle operacional

## 6. Proximo passo apos o P0

Quando o P0 estiver estabilizado:

1. subir `tpu-sync`
2. resolver `movimento_tpu_id` obrigatoriamente
3. iniciar camada institucional `serventia_cnj / juizo_cnj / codigo_foro_tjsp`
