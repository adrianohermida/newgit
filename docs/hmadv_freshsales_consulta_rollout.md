# HMADV - Rollout Freshsales `Consulta`, `Andamentos`, `Publicações`, `Audiências`

## Objetivo

Garantir que o fluxo `DataJud + Advise + Freshsales` registre:

- `Consulta` quando a sincronização for solicitada
- `Consulta` quando a sincronização com o CNJ for concluída com sucesso
- `Consulta` quando houver alteração de detalhes do processo
- `Consulta` quando surgir novo andamento
- `Consulta` quando surgir nova publicação
- `Consulta` quando surgir nova audiência
- activity correspondente em:
  - `Andamentos`
  - `Publicações`
  - `Audiências`
- `Reuniões/Appointments` para audiências futuras

## Arquivos operacionais envolvidos

- [fs-webhook](D:/Github/newgit/_hmadv_review/supabase/functions/fs-webhook/index.ts)
- [datajud-worker](D:/Github/newgit/_hmadv_review/supabase/functions/datajud-worker/index.ts)
- [sync-worker](D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts)
- [hmadv_fechamento_100.md](D:/Github/newgit/docs/hmadv_fechamento_100.md)
- [hmadv_plano_incremental_gateway_ai.md](D:/Github/newgit/_hmadv_review/docs/hmadv_plano_incremental_gateway_ai.md)

## Configuração necessária

### Freshsales

- workflow/webhook deve disparar para `Datajud` e `datajud`
- o payload precisa enviar:
  - `cf_processo`
  - `account_id`
  - quando possível, o nome da tag adicionada

### HMADV / Supabase

- `FRESHSALES_API_KEY`
- `FRESHSALES_DOMAIN`
- `FS_OWNER_ID`
- `FRESHSALES_ACTIVITY_TYPE_CONSULTA`
- `FRESHSALES_ACTIVITY_TYPE_AUDIENCIA`
- `PROCESS_AI_BASE`
- `HMDAV_AI_SHARED_SECRET`

## Ordem de deploy

1. publicar [fs-webhook](D:/Github/newgit/_hmadv_review/supabase/functions/fs-webhook/index.ts)
2. publicar [datajud-worker](D:/Github/newgit/_hmadv_review/supabase/functions/datajud-worker/index.ts)
3. publicar [sync-worker](D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts)
4. publicar o worker IA conforme [hmadv_cloudflare_ai_rollout.md](D:/Github/newgit/docs/hmadv_cloudflare_ai_rollout.md)

## Homologação manual

### Cenário 1 - Tag `Datajud`

1. adicionar a tag `Datajud` em um Sales Account com `cf_processo`
2. verificar se o webhook gera uma `Consulta` com o título:
   - `Sincronização com o CNJ solicitada - <CNJ>`
3. verificar se o processo entra na fila no HMADV

### Cenário 2 - Sucesso do DataJud

1. aguardar o [datajud-worker](D:/Github/newgit/_hmadv_review/supabase/functions/datajud-worker/index.ts)
2. verificar se surge uma `Consulta` com o título:
   - `Sincronização com o CNJ realizada com sucesso - <CNJ>`
3. verificar se, havendo mudança de campos, surge também:
   - `Detalhes do processo atualizados - <CNJ>`

### Cenário 3 - Novo andamento

1. garantir um movimento novo sem `freshsales_activity_id`
2. rodar o [sync-worker](D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts)
3. verificar:
   - nova activity em `Andamentos`
   - nova activity em `Consulta` correspondente ao mesmo evento

### Cenário 4 - Nova publicação

1. garantir uma publicação nova não-leilão sem `freshsales_activity_id`
2. rodar o [sync-worker](D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts)
3. verificar:
   - nova activity em `Publicações`
   - nova activity em `Consulta` correspondente
4. confirmar que publicações com `LEILÃO` ou `LEILÕES` não geram activity

### Cenário 5 - Nova audiência

1. garantir uma audiência sem `freshsales_activity_id`
2. rodar o [sync-worker](D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts)
3. verificar:
   - nova activity em `Audiências`
   - nova activity em `Consulta`
4. se `data_audiencia` for futura:
   - verificar criação automática de `Reunião/Appointment`

## Critério de aceite

- tag `Datajud` e `datajud` disparam o fluxo
- `Consulta` registra solicitação, sucesso e eventos relevantes
- `Andamentos`, `Publicações` e `Audiências` recebem seus eventos próprios
- `Reuniões/Appointments` são criados para audiências futuras
- o worker IA continua podendo enriquecer notas, inconsistências e tarefas
