# HMADV - Fase 8 Canonizacao de Status por Eventos

## Objetivo

Isolar a canonizacao de `status_atual_processo` em uma trilha propria, baseada em:

- `judiciario.movimentos`
- `judiciario.publicacoes`
- `judiciario.processo_evento_regra`

## Script operacional

- [hmadv_canonizar_status_eventos.ps1](/D:/Github/newgit/docs/hmadv_canonizar_status_eventos.ps1)

## Uso

### Auditoria

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_canonizar_status_eventos.ps1" -Limite 50
```

### Caso pontual

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_canonizar_status_eventos.ps1" -ProcessoIds "UUID_DO_PROCESSO"
```

### Aplicacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_canonizar_status_eventos.ps1" -Aplicar -Limite 100
```

## Criterio de aceite

- processos com evento forte deixam de ficar em `fallback`
- `Baixado` e `Suspenso` passam a refletir evento auditavel
- `status_evento_origem` fica preenchido com o evento que motivou a classificacao
