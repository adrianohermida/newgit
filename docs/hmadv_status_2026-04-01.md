# HMADV - Status em 2026-04-01

## Produção

- `sync-worker`: runtime `versao = 10`
- `tpu-sync`: online e funcionando
- `fs-webhook`, `datajud-worker`, `sync-worker`, `tpu-sync` já publicados no HMADV

## Sync Worker

- último lote: `publicacoes = 21`
- filtro de leilão: `leilao = 0` na rodada reprocessada com regra nova
- pendências atuais:
  - `pubs = 2718`
  - `proc_sem_acc = 1481`
  - `movs_advise = 63`
  - `fila_dj = 1596`
  - `total = 5858`

## TPU

- estoque local:
  - `movimentos = 202`
  - `classes = 200`
  - `assuntos = 200`
  - `documentos = 200`
- backlog:
  - `movimentos_pendentes = 54`
  - `movimentos_resolvidos = 196`
- suporte online:
  - `gateway = true`
  - `sgt = false`

## Audiências

- `sync-worker?action=inspect_audiencias` já está publicado
- bloqueio atual: `permission denied for table audiencias`
- grant pronto em:
  - [005_hmadv_audiencias_grants.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/005_hmadv_audiencias_grants.sql)

## Próximo Passo

1. Aplicar o grant de `judiciario.audiencias`.
2. Rodar `sync-worker?action=inspect_audiencias`.
3. Rodar `sync-worker?action=run`.
4. Homologar `Audiências`, `Consulta` e `Appointment` futuro.
