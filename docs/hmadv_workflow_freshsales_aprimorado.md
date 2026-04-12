# HMADV Workflow Aprimorado para Freshsales

## Objetivo

Garantir que o Freshsales seja atualizado em camadas:

1. o processo entra ou Ã© vinculado;
2. o DataJud enriquece o processo no Supabase;
3. o Sales Account recebe os campos estruturados corretos;
4. andamentos e publicaÃ§Ãµes sÃ£o exportados como activities.

## Fluxo recomendado

### 1. Entrada e enriquecimento judicial

- `fs-webhook`
  - recebe o processo vindo do Freshsales;
  - enfileira `fs_webhook_sync`.
- `datajud-worker`
  - consulta/persiste DataJud;
  - atualiza o processo no Supabase;
  - cria a activity de consulta.

### 2. ReparaÃ§Ã£o do Sales Account

- `fs-account-repair`
  - usa os campos reais do catÃ¡logo do Freshsales;
  - preenche tÃ­tulo, comarca, classe, nÃºmero do juÃ­zo, descriÃ§Ã£o do Ãºltimo movimento, diÃ¡rio e conteÃºdo da Ãºltima publicaÃ§Ã£o;
  - reaproveita partes, movimentos e publicaÃ§Ãµes jÃ¡ existentes no Supabase.

### 3. ExportaÃ§Ã£o operacional

- `sync-worker`
  - cria/vincula accounts pendentes;
  - sincroniza dados bidirecionais bÃ¡sicos;
  - exporta `movimentos` como activities;
  - exporta `publicacoes` como activities.

## Cron recomendado

### Frequente

- `datajud-worker`: a cada 5 minutos
- `sync-worker`: a cada 2 minutos

### CompletaÃ§Ã£o do Sales Account

Enquanto a chamada interna do `sync-worker -> fs-account-repair` nÃ£o estiver consolidada no runtime, rodar `fs-account-repair` como cron separado:

- `fs-account-repair?action=batch&limit=5&offset=0`
- repetir com offsets progressivos ou com janelas rotativas

SugestÃ£o prÃ¡tica:

- `fs-account-repair`: a cada 10 minutos, em lotes pequenos

## Prova jÃ¡ validada

No processo `0000204-50.2021.8.26.0441`, o fluxo corrigido jÃ¡ preencheu corretamente no Freshsales:

- `city`
- `cf_numero_do_juizo`
- `cf_classe`
- `cf_descricao_ultimo_movimento`
- `cf_DJ`
- `cf_publicacao_em`
- `cf_contedo_publicacao`

TambÃ©m jÃ¡ estava comprovado:

- `142` andamentos exportados
- `1` publicaÃ§Ã£o exportada

## Endpoint operacional

### Reparo unitÃ¡rio

- `fs-account-repair`

### Reparo em lote

- `fs-account-repair?action=batch&limit=N&offset=M`

## Leitura operacional

O workflow antigo atualizava o account de forma parcial e depois partia para timeline.
O workflow aprimorado insere uma etapa de completude do Sales Account antes da exportaÃ§Ã£o de andamentos/publicaÃ§Ãµes.

Isso melhora:

- qualidade dos detalhes do processo no Freshsales;
- consistÃªncia entre Supabase e CRM;
- rastreabilidade para o usuÃ¡rio final antes mesmo da timeline estar 100% drenada.

## PendÃªncias atualizadas em 2026-04-12

### JÃ¡ consolidado no `main`

- trilha financeira canÃ´nica `Freshsales + Supabase billing`;
- painel e API operacional HMADV com leituras de overview, filas e histÃ³rico;
- worker HMADV IA e deploy Cloudflare estabilizados;
- migraÃ§Ã£o [040_create_hmadv_processo_cobertura_sync.sql](D:/Github/newgit/supabase/migrations/040_create_hmadv_processo_cobertura_sync.sql) adicionada para destravar a leitura de cobertura processual esperada pelo painel.

### Parcial no `main`

- endpoints e telas administrativas jÃ¡ consultam `processo_cobertura_sync`;
- o lote essencial de edge functions tambÃ©m jÃ¡ foi portado:
  - `datajud-search`
  - `datajud-worker`
  - `fs-account-repair`
  - `processo-sync`
  - `sync-worker`
- o lote complementar de integraÃ§Ã£o tambÃ©m jÃ¡ foi trazido para o `main`:
  - `fs-webhook`
  - `sync-advise-backfill`
  - `sync-advise-publicacoes`
  - `sync-advise-realtime`
  - `publicacoes-freshsales`
  - `tpu-sync`
- migrations auxiliares deste lote tambÃ©m jÃ¡ foram versionadas:
  - `041_create_hmadv_sync_worker_status.sql`
  - `042_create_hmadv_advise_sync_and_divergencias.sql`
  - `043_create_hmadv_monitoramento_queue.sql`
  - `044_extend_hmadv_advise_sync_status.sql`
  - `045_create_hmadv_tpu_core.sql`
  - `046_extend_hmadv_tpu_gateway_fields.sql`
- integraÃ§Ã£o `custom provider -> worker HMADV IA` validada, mas a validaÃ§Ã£o ponta a ponta do fluxo judicial operacional ainda depende de aplicar as migrations no banco e exercitar as funÃ§Ãµes em ambiente com `Supabase CLI`/deploy.

### Ainda pendente de portar do `_hmadv_review`

- migrations HMADV operacionais complementares:
  - grants/complementos TPU
  - contatos/status
  - prazos
  - operaÃ§Ã£o execuÃ§Ãµes/jobs
  - cobertura/sync complementar
- integraÃ§Ãµes externas/auxiliares ainda nÃ£o internalizadas:
  - `extractPartiesFromProcess` segue como chamada externa tolerante a falha dentro de `publicacoes-freshsales`
- funÃ§Ãµes legadas avaliadas como superseded no `main` atual:
  - `fs-exec`
  - `fs-populate`
  - `fs-runner`
  - `process-datajud-queue`
  Essas rotas antigas foram mantidas fora do `main` porque duplicam responsabilidades hoje cobertas por `fs-webhook`, `fs-account-repair`, `processo-sync`, `publicacoes-freshsales`, `datajud-webhook` e `sync-worker`.

### PrÃ³xima ordem recomendada

1. aplicar as migrations HMADV novas no banco de destino e validar permissÃµes/relaÃ§Ãµes reais;
2. executar validaÃ§Ã£o integrada das funÃ§Ãµes `datajud-worker`, `processo-sync`, `fs-account-repair`, `sync-worker`, `publicacoes-freshsales`, `tpu-sync`, `datajud-webhook` e `advise-sync`;
3. decidir se `extractPartiesFromProcess` serÃ¡ internalizado no repositÃ³rio ou mantido como integraÃ§Ã£o externa opcional;
4. sÃ³ entÃ£o ligar a esteira completa em produÃ§Ã£o sem fallback manual.

