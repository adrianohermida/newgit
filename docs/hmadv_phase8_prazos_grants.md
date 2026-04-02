# HMADV - Grants da Fase 8 e Prazos

## Objetivo

Liberar escrita e leitura via PostgREST para as tabelas novas de:

- `Contacts + Polos + Status`
- `Prazos Processuais`

## Arquivo versionado

- [009_hmadv_phase8_prazos_grants.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/009_hmadv_phase8_prazos_grants.sql)

## Tabelas cobertas

- `judiciario.processo_contato_sync`
- `judiciario.processo_evento_regra`
- `judiciario.prazo_regra`
- `judiciario.prazo_regra_alias`
- `judiciario.estado_ibge`
- `judiciario.municipio_ibge`
- `judiciario.feriado_forense`
- `judiciario.calendario_forense_fonte`
- `judiciario.suspensao_expediente`
- `judiciario.prazo_calculado`
- `judiciario.prazo_evento`

## Quando aplicar

Aplicar depois de:

- [006_hmadv_contacts_status.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/006_hmadv_contacts_status.sql)
- [007_hmadv_contacts_status_rules.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/007_hmadv_contacts_status_rules.sql)
- [008_hmadv_prazos_core.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/008_hmadv_prazos_core.sql)

## Sintoma que ele corrige

Se a leitura funciona mas `POST`/`UPSERT` por REST devolve `404`, este grant normalmente e o que esta faltando no HMADV.
