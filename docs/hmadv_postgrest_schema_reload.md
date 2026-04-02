# HMADV - Reload do Schema Cache do PostgREST

## Achado operacional

No HMADV, as migracoes recentes ja criaram colunas e tabelas no banco, mas o PostgREST ainda nao esta enxergando tudo no cache.

Provas reais:

- `GET /rest/v1/processos?select=status_fonte` funciona
- `PATCH /rest/v1/processos` com `status_atual_processo` falha com:
  - `PGRST204 Could not find the 'status_atual_processo' column of 'processos' in the schema cache`
- `GET /rest/v1/prazo_regra?select=id` funciona
- `POST /rest/v1/prazo_regra` falha com:
  - `PGRST205 Could not find the table 'public.prazo_regra' in the schema cache`

Isso mostra:

- o banco recebeu as migracoes;
- o PostgREST ainda nao recarregou o schema.

## SQL para recarregar o cache

Arquivo:

- [hmadv_postgrest_schema_reload.sql](/D:/Github/newgit/docs/hmadv_postgrest_schema_reload.sql)

Conteudo:

```sql
notify pgrst, 'reload schema';
```

## Quando usar

Usar logo depois de aplicar migracoes que:

- criam tabelas novas;
- adicionam colunas novas;
- alteram grants relevantes para REST.

## Blocos afetados agora

- [006_hmadv_contacts_status.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/006_hmadv_contacts_status.sql)
- [007_hmadv_contacts_status_rules.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/007_hmadv_contacts_status_rules.sql)
- [008_hmadv_prazos_core.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/008_hmadv_prazos_core.sql)
- [009_hmadv_phase8_prazos_grants.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/009_hmadv_phase8_prazos_grants.sql)

## Ordem recomendada

1. aplicar as migracoes pendentes
2. executar `notify pgrst, 'reload schema';`
3. revalidar:
   - `PATCH` em `processos`
   - `POST` em `prazo_regra`
   - `POST` em `prazo_regra_alias`
