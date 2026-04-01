# HMADV - Seed de Aliases de Prazo

## Objetivo

Gerar aliases em `judiciario.prazo_regra_alias` a partir de `prazo_regra`, para melhorar:

- matching deterministico;
- matching assistido por IA;
- detecao de prazo em publicacoes, movimentos e audiencias.

## Script

- [hmadv_seed_prazo_alias.ps1](/D:/Github/newgit/docs/hmadv_seed_prazo_alias.ps1)

## Dry-run

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_seed_prazo_alias.ps1" -DryRun
```

## Importacao real

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_seed_prazo_alias.ps1" -Importar
```

## O que ele gera

- alias normalizado do `ato_praticado`
- tokens relevantes do `ato_praticado`
- alguns sinônimos úteis como:
  - `contestacao`
  - `embargos`
  - `apelacao`
  - `audiencia`
  - `pericia`
  - `alegacoes finais`
  - `recurso`
  - `manifestacao`
  - `juntada`

## Ordem no rollout

Sem pular etapas:

1. destravar `judiciario.audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. concluir `Contacts + Polos + Status`
4. aplicar [008_hmadv_prazos_core.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/008_hmadv_prazos_core.sql)
5. rodar [hmadv_import_prazos_base.ps1](/D:/Github/newgit/docs/hmadv_import_prazos_base.ps1)
6. rodar [hmadv_seed_prazo_alias.ps1](/D:/Github/newgit/docs/hmadv_seed_prazo_alias.ps1)
7. rodar [hmadv_prazos_validacao.ps1](/D:/Github/newgit/docs/hmadv_prazos_validacao.ps1)
