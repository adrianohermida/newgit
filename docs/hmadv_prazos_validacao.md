# HMADV - Validacao da Base de Prazos

## Objetivo

Confirmar se a carga base de prazos entrou corretamente no HMADV apos:

- aplicar [008_hmadv_prazos_core.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/008_hmadv_prazos_core.sql)
- rodar [hmadv_import_prazos_base.ps1](/D:/Github/newgit/docs/hmadv_import_prazos_base.ps1)

## Script

- [hmadv_prazos_validacao.ps1](/D:/Github/newgit/docs/hmadv_prazos_validacao.ps1)

## Uso

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_prazos_validacao.ps1"
```

## O que ele valida

- quantidade total de regras em `prazo_regra`
- separacao por:
  - `cpc`
  - `penal`
  - `trabalhista`
  - `juizados`
- quantidade de regras com `aplica_ia = true`
- quantidade de:
  - estados
  - municipios
  - feriados
  - entradas `advise_dje`
- amostras reais das regras e do calendario

## Criterio de aceite

- `prazo_regra_total` maior que zero
- quatro ritos presentes
- `estado_ibge_total` e `municipio_ibge_total` maiores que zero
- `feriado_forense_total` maior que zero
- `calendario_advise_total` maior que zero
- regras marcadas com `aplica_ia = true` aparecem nos casos nao deterministas
