# HMADV - Fase 8 Reconciliacao Operacional

## Objetivo

Executar uma trilha operacional unica para:

- localizar processos com `Sales Account` ainda sem polos ou status;
- medir quantas partes ja estao marcadas como cliente do escritorio;
- medir quantas partes ja possuem `contact_id` no Freshsales;
- preparar o backfill de account depois que a canonizacao no Supabase estiver consistente.

## Script operacional

- [hmadv_reconciliar_contacts_status.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_contacts_status.ps1)

## Uso

### Auditoria

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_contacts_status.ps1"
```

### Auditoria com amostra maior

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_contacts_status.ps1" -Limite 200
```

### Backfill de account apos reconciliacao

Usar somente depois que:

1. a migracao [006_hmadv_contacts_status.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/006_hmadv_contacts_status.sql) estiver aplicada;
2. a logica de cliente/polos/status ja estiver persistindo em `judiciario.processos` e `judiciario.partes`.

```powershell
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
powershell -ExecutionPolicy Bypass -File "D:\Github\newgit\docs\hmadv_reconciliar_contacts_status.ps1" -ExecutarBackfillAccount -Limite 50
```

## Leitura do resultado

Os campos mais importantes sao:

- `processos_candidatos_fase8`
- `processos_sem_polo_ativo`
- `processos_sem_polo_passivo`
- `processos_sem_status`
- `partes_cliente_hmadv`
- `partes_representadas`
- `partes_com_contato`
- `contatos_sync`

## Relacao com o rollout

Sem pular etapas:

1. aplicar grant de `audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. aplicar [006_hmadv_contacts_status.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/006_hmadv_contacts_status.sql)
4. rodar [hmadv_fase8_contacts_status_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase8_contacts_status_validacao.ps1)
5. rodar [hmadv_reconciliar_contacts_status.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_contacts_status.ps1)
6. so depois disparar backfill de account
