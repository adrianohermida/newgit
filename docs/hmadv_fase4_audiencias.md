# HMADV - Fase 4 Audiencias por Publicacoes

## Objetivo

Extrair audiencias retroativas do conteudo das publicacoes e persistir em `judiciario.audiencias`.

## Script

- [hmadv_reconciliar_audiencias.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_audiencias.ps1)

## Regra atual

- identificar sinal de:
  - `audiencia`
  - `sessao de julgamento`
  - `designada audiencia`
- extrair data `dd/MM/yyyy`
- extrair hora quando aparecer `HH:mm`
- persistir:
  - `processo_id`
  - `data_audiencia`
  - `titulo`
  - `descricao`

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"

powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_audiencias.ps1" -Limite 100
```

Aplicacao real:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_audiencias.ps1" -Aplicar -Limite 100
```

Com lista de processos:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_audiencias.ps1" `
  -Aplicar `
  -ProcessNumbers "0000107-86.2021.5.05.0311","0244818-04.2025.8.04.1000"
```

## Criterio de aceite

- `publicacoes_com_sinal_audiencia_sem_linha_audiencia = 0`
- audiencias futuras passam a poder gerar `Activity` e `Appointment`
