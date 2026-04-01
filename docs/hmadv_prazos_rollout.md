# HMADV - Rollout da Fase PZ1

## Objetivo

Preparar o HMADV para:

- regras normativas de prazo;
- malha territorial;
- feriados e suspensoes;
- prazos calculados;
- tasks de prazo no Freshsales.

## Ordem

Sem pular etapas:

1. destravar `judiciario.audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. concluir `Contacts + Polos + Status`
4. aplicar [hmadv_prazos_schema.sql](/D:/Github/newgit/docs/hmadv_prazos_schema.sql)
   Migracao versionada: [008_hmadv_prazos_core.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/008_hmadv_prazos_core.sql)
5. rodar [hmadv_prazos_importacao.md](/D:/Github/newgit/docs/hmadv_prazos_importacao.md)
6. rodar [hmadv_prazos_validacao.md](/D:/Github/newgit/docs/hmadv_prazos_validacao.md)
7. portar o motor deterministico
8. integrar com `sync-worker`, `tpu-sync` e worker IA

## Estruturas criadas

- `judiciario.prazo_regra`
- `judiciario.prazo_regra_alias`
- `judiciario.estado_ibge`
- `judiciario.municipio_ibge`
- `judiciario.feriado_forense`
- `judiciario.calendario_forense_fonte`
- `judiciario.suspensao_expediente`
- `judiciario.prazo_calculado`
- `judiciario.prazo_evento`

## Criterio de aceite da fase PZ1

- schema aplicado sem erro;
- tabelas prontas para receber carga;
- `prazo_calculado` e `prazo_evento` disponiveis para integracao posterior;
- rollout de prazos fica desbloqueado para a fase de importacao.
