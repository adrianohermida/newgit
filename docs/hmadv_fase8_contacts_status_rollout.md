# HMADV - Fase 8 Rollout de Contacts, Polos e Status

## Pré-requisito

Executar esta fase somente após:

1. destravar `judiciario.audiencias`
2. homologar `Audiências + Consulta + Appointment`

## Ordem

1. Aplicar [hmadv_fase8_contacts_status_schema.sql](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_schema.sql)
2. Rodar [hmadv_fase8_contacts_status_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_validacao.ps1)
3. Implementar reconciliador de:
   - cliente principal
   - contacts relacionados
   - polos
   - status processual
4. Rodar novo backfill de account no Freshsales
5. Homologar `Contacts + cf_polo_ativo + cf_parte_adversa + cf_status`

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
