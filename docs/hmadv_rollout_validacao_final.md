# HMADV Rollout Final

## Objetivo

Fechar a ativacao operacional do stack HMADV ja portado para o `main`, validando:

- migrations do schema `judiciario`;
- deploy das edge functions HMADV;
- runner agendado;
- fluxo ponta a ponta `DataJud -> Supabase -> Freshsales -> Activities`;
- integracao opcional `extractPartiesFromProcess`.

## Estado Atual do Repositorio

Ja portado para o `main`:

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

Ja versionado em migrations:

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

Mantidas fora do `main` por serem legadas ou superseded:

- `fs-exec`
- `fs-populate`
- `fs-runner`
- `process-datajud-queue`

## Secrets Esperadas

Supabase e runtime:

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

Integracoes auxiliares:

- `HMADV_AI_SHARED_SECRET`
- `BASE44_WORKSPACE_ID` se o extractor externo continuar ativo

## Ordem de Execucao Recomendada

1. Rodar preflight local do repositorio.
2. Auditar se o projeto alvo HMADV e o mesmo projeto atualmente linkado no workspace.
3. Aplicar migrations no banco alvo.
4. Fazer deploy das edge functions HMADV.
5. Validar runner agendado no GitHub Actions.
6. Executar smoke tests por funcao.
7. Executar teste ponta a ponta com um processo controlado.
8. Confirmar metricas operacionais no painel HMADV.

## Preflight Local

No workspace:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/hmadv-rollout-preflight.ps1
```

Criterios de aceite:

- `supabase` CLI disponivel globalmente ou via `npx supabase`;
- `docs` e `functions` HMADV presentes;
- migrations `040` ate `054` detectadas;
- workflow [hmadv-runner.yml](D:\Github\newgit\.github\workflows\hmadv-runner.yml) presente.

## Auditoria do Projeto Supabase Alvo

Antes de publicar ou reconciliar migrations, confirmar se o alvo HMADV e realmente o projeto judicial ativo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/hmadv-audit-supabase-target.ps1
```

No estado auditado em `2026-04-12`:

- projeto HMADV operacional: `sspvizogbcyigquqycsz`
- projeto atualmente linkado no workspace: `ampwhwqbtuwxpgnzsxau`

Ou seja, o projeto linkado e o projeto HMADV ativo nao coincidem.

## Aplicacao das Migrations

Exemplo:

```powershell
npx supabase db push
```

Se o workspace continuar linkado em outro projeto, prefira operar HMADV com `--project-ref` explicito nos comandos e scripts dedicados.

Depois validar no banco:

- existencia das tabelas `monitoramento_queue`, `sync_worker_status`, `advise_sync_status`, `advise_sync_log`, `datajud_sync_status`;
- existencia das tabelas TPU `tpu_movimento`, `tpu_classe`, `tpu_assunto`, `tpu_documento`;
- existencia das tabelas de prazos `prazo_regra`, `prazo_calculado`, `prazo_evento`;
- grants esperados em `audiencias`, `operacao_execucoes`, `processo_evento_regra`.

## Deploy das Edge Functions

Funcoes prioritarias:

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

Exemplo:

```powershell
npx supabase functions deploy datajud-search --use-api
npx supabase functions deploy datajud-worker --use-api
npx supabase functions deploy datajud-webhook --use-api
npx supabase functions deploy advise-sync --use-api
npx supabase functions deploy fs-webhook --use-api
npx supabase functions deploy fs-account-repair --use-api
npx supabase functions deploy processo-sync --use-api
npx supabase functions deploy publicacoes-freshsales --use-api
npx supabase functions deploy sync-advise-backfill --use-api
npx supabase functions deploy sync-advise-publicacoes --use-api
npx supabase functions deploy sync-advise-realtime --use-api
npx supabase functions deploy sync-worker --use-api
npx supabase functions deploy tpu-sync --use-api
```

Para o projeto HMADV explicito:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/hmadv-deploy-supabase-functions.ps1 -ProjectRef sspvizogbcyigquqycsz -SmokeTest
```

## Smoke Tests

### `tpu-sync`

- chamar `action=status`;
- validar escrita em `tpu_sync_log` quando houver sync real;
- validar update em `tpu_movimento`.

### `datajud-search`

- enviar um CNJ conhecido;
- validar persistencia em `processos`, `movimentacoes` e `partes`.

### `datajud-worker`

- inserir item controlado em `monitoramento_queue`;
- validar transicao `pendente -> processando -> processado/concluido`.

### `publicacoes-freshsales`

- usar publicacao ja vinculada a processo;
- validar update de `freshsales_activity_id`;
- aceitar `warn` no extractor externo sem falha total da funcao.

### `sync-worker`

- chamar `action=status` e depois lote pequeno;
- validar atualizacao de `sync_worker_status`;
- validar criacao ou atualizacao de activities no Freshsales.

### `advise-sync`

- chamar `action=status`;
- rodar `sync_range` curto;
- validar `advise_sync_log`;
- validar avanco de cursor em `advise_sync_status`.

## Teste Ponta a Ponta

Cenario minimo:

1. escolher um processo com `account_id_freshsales`;
2. rodar `datajud-search`;
3. rodar `datajud-worker` ou `datajud-webhook?action=sync_account`;
4. rodar `publicacoes-freshsales` para um lote pequeno;
5. rodar `sync-worker`;
6. confirmar no Freshsales:
   - campos do Sales Account atualizados;
   - activities de andamentos;
   - activities de publicacoes;
   - eventual activity de consulta;
   - ausencia de duplicacao imediata.

## Pendencia Residual Conhecida

`extractPartiesFromProcess` nao esta internalizado no repositorio atual.

Comportamento atual:

- `publicacoes-freshsales` persiste partes localmente;
- a chamada ao extractor externo e tolerante a falha;
- uma falha no extractor nao deve impedir o restante do fluxo.

Decisao pendente:

- internalizar a funcao no repositorio; ou
- mante-la como integracao externa opcional e monitorada.

## Criterio de Conclusao

Considerar o projeto HMADV concluido no nivel operacional quando:

- migrations aplicarem sem erro;
- edge functions principais estiverem deployadas;
- runner agendado executar com sucesso;
- um processo de teste percorrer o fluxo completo sem fallback manual;
- painel HMADV refletir filas, historico e metricas coerentes.

## Auditoria operacional em 2026-04-12

### Ja confirmado

- preflight local validado com `npx supabase`;
- deploy remoto concluido para as 13 functions prioritarias do lote HMADV;
- smoke test `tpu-sync?action=status` retornando `ok: true`.

### Bloqueios reais remanescentes

- o workspace estava ligado ao projeto `Lawdesk`, enquanto o HMADV ativo esta em `sspvizogbcyigquqycsz`;
- no projeto `Lawdesk`, `sync-worker?action=status` retornou modo degradado com `read: Invalid schema: judiciario`;
- no projeto `Lawdesk`, `advise-sync?action=status` confirmou `token_ok: false`;
- `npx supabase db push --dry-run` falhou por divergencia entre historico remoto de migrations e diretorio local.

### Leitura tecnica do momento

O porte e o deploy das functions estao concluidos, mas a esteira HMADV precisa mirar explicitamente o projeto Supabase judicial correto. O projeto ativo `hmadv` ja responde com backlog e secrets coerentes, enquanto o projeto `Lawdesk` nao tem o schema judicial ativo.

Antes de qualquer `db push` definitivo:

1. fixar o projeto alvo HMADV nos scripts por `--project-ref`;
2. rodar `npx supabase db pull` mirando o projeto judicial correto, se necessario;
3. revisar os arquivos timestampados trazidos do remoto;
4. decidir entre `migration repair` ou rebase da trilha HMADV sobre o estado remoto;
5. so entao aplicar as migrations `040` a `054` com seguranca.

### Pendencia final para encerramento total

O projeto so entra em estado realmente concluido quando os tres itens abaixo forem fechados juntos:

- schema `judiciario` existente e compativel no remoto;
- secret `ADVISE_TOKEN` configurada no runtime da function `advise-sync`;
- teste ponta a ponta com processo real controlado executado sem fallback manual.
