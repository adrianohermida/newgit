# HMADV - Fase 8 Rollout de Contacts, Polos e Status

## Pré-requisito

Executar esta fase somente após:

1. destravar `judiciario.audiencias`
2. homologar `Audiências + Consulta + Appointment`

## Ordem

1. Aplicar [hmadv_fase8_contacts_status_schema.sql](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_schema.sql)
2. Revisar a baseline em [hmadv_fase8_baseline_2026-04-01.md](/D:/Github/newgit/docs/hmadv_fase8_baseline_2026-04-01.md)
3. Rodar [hmadv_fase8_contacts_status_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_validacao.ps1)
4. Implementar reconciliador de:
   - cliente principal
   - contacts relacionados
   - polos
   - status processual
5. Garantir persistência em `judiciario.processos`, não só no Freshsales
6. Rodar novo backfill de account no Freshsales
7. Homologar `Contacts + cf_polo_ativo + cf_parte_adversa + cf_status`

## Regras mínimas

### Cliente principal

- identificar a parte representada pelo escritório
- vincular ou criar `Contact` no Freshsales
- marcar um principal por processo quando houver evidência suficiente

### Polos

- preencher a partir de publicações e `judiciario.partes`
- sincronizar:
  - `cf_polo_ativo`
  - `cf_parte_adversa`

### Status

- `Baixado` quando houver evento de baixa, arquivamento, cancelamento ou extinção
- `Suspenso` quando houver evento de suspensão ou sobrestamento
- `Ativo` em qualquer outro caso

## Validação

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_fase8_contacts_status_validacao.ps1"
```

## Critério de aceite

- processos com account têm polos em cobertura aceitável
- `cliente_hmadv` aparece em `judiciario.partes`
- `processo_contato_sync` começa a ser preenchida
- `cf_status` fica restrito a `Ativo`, `Baixado`, `Suspenso`
