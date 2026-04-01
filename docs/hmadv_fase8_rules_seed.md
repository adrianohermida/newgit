# HMADV - Seed de Regras da Fase 8

## Objetivo

Persistir no banco um catalogo inicial de regras para:

- status processual
- identificacao de polos

Isso evita espalhar palavras-chave em varios pontos do codigo e prepara o reconciliador da fase 8 para operar de forma auditavel.

## Arquivo versionado

- [007_hmadv_contacts_status_rules.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/007_hmadv_contacts_status_rules.sql)

## O que entra no seed

### Status

Regras para classificar:

- `Baixado`
- `Suspenso`

com origem:

- `movimento`
- `publicacao`

### Polos

Regras para:

- `ativo`
- `passivo`

com termos como:

- `autor`
- `requerente`
- `exequente`
- `agravante`
- `reu`
- `requerido`
- `executado`
- `agravado`

## Uso esperado

Depois da migracao `006`, o reconciliador da fase 8 deve consultar `judiciario.processo_evento_regra` para:

- decidir `status_atual_processo`
- identificar `polo_ativo`
- identificar `polo_passivo`

## Ordem no rollout

Sem pular etapas:

1. aplicar grant de `audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. aplicar [006_hmadv_contacts_status.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/006_hmadv_contacts_status.sql)
4. aplicar [007_hmadv_contacts_status_rules.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/007_hmadv_contacts_status_rules.sql)
5. rodar validacao e reconciliacao da fase 8
