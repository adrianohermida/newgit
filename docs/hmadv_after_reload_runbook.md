# HMADV - Orquestrador Pós Reload

## Objetivo

Rodar em sequência, logo após o `notify pgrst, 'reload schema';`:

1. smoke test do PostgREST;
2. validação inicial da fase 8;
3. backfill inicial de polos e status;
4. importação base de prazos;
5. seed de aliases;
6. validações finais.

## Script

- [hmadv_after_reload_runbook.ps1](/D:/Github/newgit/docs/hmadv_after_reload_runbook.ps1)

## Execução sugerida

### Só smoke test e validações

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_after_reload_runbook.ps1"
```

### Rodada completa após reload

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_after_reload_runbook.ps1" `
  -AplicarBackfillFase8 `
  -ImportarPrazos `
  -SemearAliases `
  -LimiteFase8 100
```

## Comportamento

- se o smoke test falhar, o script para e devolve o bloqueio;
- se o smoke test passar, ele continua com fase 8 e `PZ1`.

## Relacao com o plano

Esse orquestrador nao muda a ordem do rollout.
Ele apenas junta em uma corrida unica os passos que ja estavam previstos logo apos o reload do schema cache do PostgREST.
