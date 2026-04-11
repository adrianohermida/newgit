# HMADV - Quickstart Operacional

## Arquivos principais

- [Operacao final](D:/Github/newgit/docs/hmadv_operacao_final.md)
- [Schema de referencia](D:/Github/newgit/docs/schema_judiciario_datajud_advise.sql)
- [SQL de ajuste do sync worker](D:/Github/newgit/docs/hmadv_sync_worker_status_fix.sql)
- [Monitoramento diario](D:/Github/newgit/docs/hmadv_monitoramento_diario.ps1)
- [Execucao controlada](D:/Github/newgit/docs/hmadv_execucao_controlada.ps1)

## Variaveis de ambiente

Definir no PowerShell antes de rodar os scripts:

```powershell
$env:HMADV_ANON_KEY="SEU_ANON_KEY"
$env:HMADV_SERVICE_ROLE="SEU_SERVICE_ROLE"
```

## Monitoramento diario

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_monitoramento_diario.ps1"
```

Esse comando mostra:

- status do `sync-worker`
- cursor do `advise-sync`
- pendencias e enviados no Freshsales

## Disparo manual do sync-worker

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_execucao_controlada.ps1" -RunSyncWorker
```

## Disparo manual do advise-sync em lote pequeno

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_execucao_controlada.ps1" `
  -RunAdviseSync `
  -DataInicio 2026-03-30 `
  -DataFim 2026-03-31 `
  -PorPagina 10 `
  -MaxPaginas 1
```

## Disparo combinado

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_execucao_controlada.ps1" `
  -RunSyncWorker `
  -RunAdviseSync `
  -DataInicio 2026-03-30 `
  -DataFim 2026-03-31 `
  -PorPagina 10 `
  -MaxPaginas 1
```

## Leitura rapida de saude

Os numeros abaixo devem cair com o tempo:

- `processos.sem_account`
- `publicacoes.pendentes_fs`
- `movimentacoes.pendentes_fs`
- `fila_dj`

## Fluxo oficial

- `fs-webhook`
- `datajud-worker`
- `datajud-search`
- `advise-sync`
- `sync-worker`
- `processo-sync`

## Fluxos que nao devem ser religados como principais

- `datajud-webhook`
- `process-datajud-queue`
- `fs-populate`
- `fs-runner` como executor
- `fs-exec`
- `publicacoes-freshsales`
- `sync-advise-realtime`
