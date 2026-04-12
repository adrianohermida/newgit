# HMADV Rollout Final

## Objetivo

Fechar a ativação operacional do stack HMADV já portado para o `main`, validando:

- migrations do schema `judiciario`;
- deploy das edge functions HMADV;
- runner agendado;
- fluxo ponta a ponta `DataJud -> Supabase -> Freshsales -> Activities`;
- integração opcional `extractPartiesFromProcess`.

## Estado Atual do Repositório

Já portado para o `main`:

- `datajud-search`
- `datajud-worker`
- `datajud-webhook`
- `advise-sync`
- `fs-webhook`
- `fs-account-repair`
- `processo-sync`
- `publicacoes-freshsales`
- `sync-advise-backfill`
- `sync-advise-publicacoes`
- `sync-advise-realtime`
- `sync-worker`
- `tpu-sync`

Já versionado em migrations:

- `040_create_hmadv_processo_cobertura_sync.sql`
- `041_create_hmadv_sync_worker_status.sql`
- `042_create_hmadv_advise_sync_and_divergencias.sql`
- `043_create_hmadv_monitoramento_queue.sql`
- `044_extend_hmadv_advise_sync_status.sql`
- `045_create_hmadv_tpu_core.sql`
- `046_extend_hmadv_tpu_gateway_fields.sql`
- `047_hmadv_tpu_grants.sql`
- `048_hmadv_tpu_complementos.sql`
- `049_hmadv_tpu_complementos_grants.sql`
- `050_hmadv_contacts_status_and_execucoes.sql`
- `051_hmadv_prazos_core.sql`
- `052_hmadv_evento_regras.sql`
- `053_hmadv_audiencias_e_prazos_grants.sql`
- `054_hmadv_sync_logs_status.sql`

Mantidas fora do `main` por serem legadas/superseded:

- `fs-exec`
- `fs-populate`
- `fs-runner`
- `process-datajud-queue`

## Secrets Esperadas

Supabase / runtime:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Freshsales:

- `FRESHSALES_DOMAIN`
- `FRESHSALES_API_KEY`
- `FRESHSALES_WEBHOOK_SECRET`
- `FRESHSALES_OWNER_ID` ou `FS_OWNER_ID`
- `FRESHSALES_PUBLICACAO_ACTIVITY_TYPE_ID`
- `FRESHSALES_ACTIVITY_TYPE_ANDAMENTO`
- `FRESHSALES_ACTIVITY_TYPE_CONSULTA`
- `FRESHSALES_ACTIVITY_TYPE_AUDIENCIA`

Advise:

- `ADVISE_TOKEN`
- opcionalmente `ADVISE_API_URL`
- opcionalmente `ADVISE_CLIENTE_ID`

HMADV runner:

- `HMADV_RUNNER_URL`
- `HMADV_RUNNER_TOKEN`

Integrações auxiliares:

- `HMADV_AI_SHARED_SECRET`
- `BASE44_WORKSPACE_ID` se o extractor externo continuar ativo

## Ordem de Execução Recomendada

1. Rodar preflight local do repositório.
2. Aplicar migrations no banco alvo.
3. Fazer deploy das edge functions HMADV.
4. Validar runner agendado no GitHub Actions.
5. Executar smoke tests por função.
6. Executar teste ponta a ponta com um processo controlado.
7. Confirmar métricas operacionais no painel HMADV.

## Preflight Local

No workspace:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/hmadv-rollout-preflight.ps1
```

Critérios de aceite:

- `supabase` CLI disponível;
- `docs` e `functions` HMADV presentes;
- migrations `040` até `054` detectadas;
- workflow [hmadv-runner.yml](D:\Github\newgit\.github\workflows\hmadv-runner.yml) presente.

## Aplicação das Migrations

Exemplo:

```powershell
supabase db push
```

Depois validar no banco:

- existência das tabelas `monitoramento_queue`, `sync_worker_status`, `advise_sync_status`, `advise_sync_log`, `datajud_sync_status`;
- existência das tabelas TPU (`tpu_movimento`, `tpu_classe`, `tpu_assunto`, `tpu_documento`);
- existência das tabelas de prazos (`prazo_regra`, `prazo_calculado`, `prazo_evento`);
- grants esperados em `audiencias`, `operacao_execucoes`, `processo_evento_regra`.

## Deploy das Edge Functions

Funções prioritárias:

```text
datajud-search
datajud-worker
datajud-webhook
advise-sync
fs-webhook
fs-account-repair
processo-sync
publicacoes-freshsales
sync-advise-backfill
sync-advise-publicacoes
sync-advise-realtime
sync-worker
tpu-sync
```

Exemplo:

```powershell
supabase functions deploy datajud-search
supabase functions deploy datajud-worker
supabase functions deploy datajud-webhook
supabase functions deploy advise-sync
supabase functions deploy fs-webhook
supabase functions deploy fs-account-repair
supabase functions deploy processo-sync
supabase functions deploy publicacoes-freshsales
supabase functions deploy sync-advise-backfill
supabase functions deploy sync-advise-publicacoes
supabase functions deploy sync-advise-realtime
supabase functions deploy sync-worker
supabase functions deploy tpu-sync
```

## Smoke Tests

### `tpu-sync`

- chamar status/base sync;
- validar escrita em `tpu_sync_log`;
- validar update em `tpu_movimento`.

### `datajud-search`

- enviar um CNJ conhecido;
- validar persistência em `processos`, `movimentacoes` e `partes`.

### `datajud-worker`

- inserir item controlado em `monitoramento_queue`;
- validar transição `pendente -> processando -> processado/concluido`.

### `publicacoes-freshsales`

- usar publicação já vinculada a processo;
- validar update de `freshsales_activity_id`;
- aceitar `warn` no extractor externo sem falha total da função.

### `sync-worker`

- chamar com lote pequeno;
- validar atualização de `sync_worker_status`;
- validar criação/atualização de activities no Freshsales.

### `advise-sync`

- rodar `sync_range` curto;
- validar `advise_sync_log`;
- validar avanço de cursor em `advise_sync_status`.

## Teste Ponta a Ponta

Cenário mínimo:

1. escolher um processo com `account_id_freshsales`;
2. rodar `datajud-search`;
3. rodar `datajud-worker` ou `datajud-webhook?action=sync_account`;
4. rodar `publicacoes-freshsales` para um lote pequeno;
5. rodar `sync-worker`;
6. confirmar no Freshsales:
   - campos do Sales Account atualizados;
   - activities de andamentos;
   - activities de publicações;
   - eventual activity de consulta;
   - ausência de duplicação imediata.

## Pendência Residual Conhecida

`extractPartiesFromProcess` não está internalizado no repositório atual.

Comportamento atual:

- `publicacoes-freshsales` persiste partes localmente;
- a chamada ao extractor externo é tolerante a falha;
- uma falha no extractor não deve impedir o restante do fluxo.

Decisão pendente:

- internalizar a função no repositório; ou
- mantê-la como integração externa opcional e monitorada.

## Critério de Conclusão

Considerar o projeto HMADV concluído no nível operacional quando:

- migrations aplicarem sem erro;
- edge functions principais estiverem deployadas;
- runner agendado executar com sucesso;
- um processo de teste percorrer o fluxo completo sem fallback manual;
- painel HMADV refletir filas, histórico e métricas coerentes.
