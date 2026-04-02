# HMADV - Fase 8 Rollout de Contacts, Polos e Status

## Pre-requisito

Executar esta fase somente apos:

1. destravar `judiciario.audiencias`
2. homologar `Audiencias + Consulta + Appointment`

## Ordem

1. Aplicar [hmadv_fase8_contacts_status_schema.sql](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_schema.sql)
   Arquivo de migracao versionado: [006_hmadv_contacts_status.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/006_hmadv_contacts_status.sql)
2. Aplicar o seed de regras em [hmadv_fase8_rules_seed.md](/D:/Github/newgit/docs/hmadv_fase8_rules_seed.md)
3. Revisar a baseline em [hmadv_fase8_baseline_2026-04-01.md](/D:/Github/newgit/docs/hmadv_fase8_baseline_2026-04-01.md)
4. Revisar as regras operacionais em [hmadv_fase8_contacts_status_regras.md](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_regras.md)
5. Rodar [hmadv_fase8_contacts_status_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_validacao.ps1)
   O script funciona antes e depois da migracao `006`: quando colunas novas ainda nao existirem, ele devolve aviso em vez de falhar.
6. Rodar a canonizacao por eventos em [hmadv_fase8_canonizacao_eventos.md](/D:/Github/newgit/docs/hmadv_fase8_canonizacao_eventos.md)
7. Rodar a trilha operacional em [hmadv_fase8_reconciliacao.md](/D:/Github/newgit/docs/hmadv_fase8_reconciliacao.md)
8. Rodar o backfill inicial em [hmadv_fase8_backfill.md](/D:/Github/newgit/docs/hmadv_fase8_backfill.md)
9. Implementar reconciliador de:
   - cliente principal
   - contacts relacionados
   - polos
   - status processual
10. Garantir persistencia em `judiciario.processos`, nao so no Freshsales
11. Rodar novo backfill de account no Freshsales
12. Homologar `Contacts + cf_polo_ativo + cf_parte_adversa + cf_status`

## Regras minimas

### Cliente principal

- identificar a parte representada pelo escritorio
- vincular ou criar `Contact` no Freshsales
- marcar um principal por processo quando houver evidencia suficiente

### Polos

- preencher a partir de publicacoes e `judiciario.partes`
- sincronizar:
  - `cf_polo_ativo`
  - `cf_parte_adversa`

### Status

- `Baixado` quando houver evento de baixa, arquivamento, cancelamento ou extincao
- `Suspenso` quando houver evento de suspensao ou sobrestamento
- `Ativo` em qualquer outro caso

## Validacao

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_fase8_contacts_status_validacao.ps1"
```

## Criterio de aceite

- processos com account tem polos em cobertura aceitavel
- `cliente_hmadv` aparece em `judiciario.partes`
- `processo_contato_sync` comeca a ser preenchida
- `cf_status` fica restrito a `Ativo`, `Baixado`, `Suspenso`
