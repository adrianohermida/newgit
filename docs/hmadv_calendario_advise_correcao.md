# HMADV - Correcao do Calendario Advise

## Objetivo

Corrigir registros antigos de `judiciario.calendario_forense_fonte` que entraram com:

- `nome = Advise`
- `metadata.diario = null`

Mesmo com o CSV do Advise contendo o diario corretamente.

## Script

- [hmadv_corrigir_calendario_advise.ps1](/D:/Github/newgit/docs/hmadv_corrigir_calendario_advise.ps1)

## Fonte

- [AdviseData - DJE.csv](D:/Downloads/AdviseData%20-%20DJE.csv)

## Dry-run

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_corrigir_calendario_advise.ps1"
```

## Aplicacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_corrigir_calendario_advise.ps1" -Aplicar
```

## Criterio de aceite

- `calendario_forense_fonte.tipo = advise_dje` passa a ter `metadata.diario` preenchido;
- `nome` fica no formato `Advise <DIARIO>`;
- `tribunais_abrangidos` permanece preenchido.
