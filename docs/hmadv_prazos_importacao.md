# HMADV - Importacao Base de Prazos

## Objetivo

Carregar no HMADV:

- regras normativas de prazo
- estados
- municipios
- feriados
- mapa de diarios do Advise

## Script

- [hmadv_import_prazos_base.ps1](/D:/Github/newgit/docs/hmadv_import_prazos_base.ps1)

## Fontes usadas

- [prazos_processuais_cpc_rows.csv](D:/Downloads/prazos_processuais_cpc_rows.csv)
- [prazos_processuais_penais_rows.csv](D:/Downloads/prazos_processuais_penais_rows.csv)
- [prazos_processuais_trabalhistas_rows.csv](D:/Downloads/prazos_processuais_trabalhistas_rows.csv)
- [prazos_processuais_juizados_rows.csv](D:/Downloads/prazos_processuais_juizados_rows.csv)
- [Feriado_export (1).csv](D:/Downloads/Feriado_export%20(1).csv)
- [Estado_export (3).csv](D:/Downloads/Estado_export%20(3).csv)
- [Municipio_export (1).csv](D:/Downloads/Municipio_export%20(1).csv)
- [AdviseData - DJE.csv](D:/Downloads/AdviseData%20-%20DJE.csv)

## Dry-run

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_prazos_base.ps1" -DryRun
```

## Importacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_import_prazos_base.ps1" -Importar
```

## Ordem no rollout

Sem pular etapas:

1. destravar `judiciario.audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. concluir `Contacts + Polos + Status`
4. aplicar [008_hmadv_prazos_core.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/008_hmadv_prazos_core.sql)
5. rodar [hmadv_import_prazos_base.ps1](/D:/Github/newgit/docs/hmadv_import_prazos_base.ps1)
6. validar o estoque carregado

## Observacoes

- `prazo_dias` so e preenchido quando o CSV traz numero puro;
- casos como `15 minutos antes da audiência`, `subsidiário ao CPC` ou `Prazo determinado pelo juiz` entram com `aplica_ia = true`;
- o calculo final continua sendo deterministico, com IA apenas para sugestao e enriquecimento.
