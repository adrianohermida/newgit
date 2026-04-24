# HMADV Supabase Function Audit

Data da auditoria: 2026-04-24

## Escopo

Esta auditoria considera a superficie real encontrada em `D:\Github\newgit\supabase\functions`.
No workspace atual nao existe um MCP Supabase HMADV configurado em `.mcp.json`; portanto, a fonte de verdade operacional e o conjunto de Edge Functions versionadas no repositorio.

Resumo:

- 62 Edge Functions nomeadas
- 1 pasta `_shared` de bibliotecas internas
- Cobertura real forte em `Advise`, `DataJud`, `TPU`, `Freshsales`, `Freshchat`, `Slack` e pipeline HMADV
- Cobertura parcial em `Freshdesk` via bibliotecas do worker, mas sem Edge Function dedicada ativa no Supabase
- `Google Calendar` existe em helper local, mas nao aparece como Edge Function dedicada
- `Google Drive` nao apareceu como Edge Function ativa no Supabase

## Achados principais

1. O backend HMADV tem mais capacidade do que o DotoBot atualmente expoe.
2. Ha muitas funcoes de probe/diagnostico e leitura de segredo que nao devem virar tools do bot.
3. O melhor desenho para o DotoBot e separar:
   - tools executaveis para usuario interno
   - tools administrativas para operador
   - probes e segredos mantidos fora do catalogo conversacional
4. `Freshdesk`, `Google Calendar` e `Google Drive` nao podem ser tratados como paridade completa com `Freshsales` hoje.

## Classificacao por dominio

### 1. Advise e ingestao de publicacoes

Funcoes:

- `advise-ai-enricher`
- `advise-backfill-lido`
- `advise-backfill-runner`
- `advise-diag`
- `advise-drain-by-date`
- `advise-drain-contratos`
- `advise-drain-reverse`
- `advise-sync`
- `advise-test-params`
- `advise-token-check`
- `sync-advise-backfill`
- `sync-advise-publicacoes`
- `sync-advise-realtime`

Leitura da auditoria:

- O dominio de Advise esta maduro para ingestao, backfill, drenagem incremental e enriquecimento por IA.
- `advise-ai-enricher`, `advise-sync`, `advise-backfill-lido`, `advise-backfill-runner`, `advise-drain-*` sao candidatos claros a tools operacionais.
- `advise-diag`, `advise-test-params` e `advise-token-check` sao diagnosticos; nao devem aparecer para uso conversacional comum.

Exposicao recomendada ao DotoBot:

- `sync_publicacoes_advise`
- `rodar_backfill_advise`
- `enriquecer_publicacoes_ia`
- `consultar_status_advise`

### 2. DataJud, TPU e processos judiciais

Funcoes:

- `datajud-search`
- `datajud-webhook`
- `datajud-worker`
- `processo-sync`
- `tpu-enricher`
- `tpu-sync`

Leitura da auditoria:

- Este e o nucleo judicial mais forte do projeto.
- `datajud-search`, `datajud-worker`, `processo-sync`, `tpu-enricher` e `tpu-sync` sustentam consulta, persistencia, enriquecimento e sincronizacao.
- `datajud-webhook` e poderoso, mas precisa continuar protegido e tratado como ferramenta administrativa.

Exposicao recomendada ao DotoBot:

- `consultar_processo_cnj`
- `resumir_processo_cnj`
- `listar_movimentacoes_processo`
- `sincronizar_processos_fs`
- `enriquecer_processo_tpu`
- `processar_fila_datajud`

### 3. Publicacoes, audiencias e prazos

Funcoes:

- `publicacoes-audiencias`
- `publicacoes-freshsales`
- `publicacoes-prazos`

Leitura da auditoria:

- O projeto tem pipeline real de extração de audiencias, calculo de prazos e sincronizacao de publicacoes para Freshsales.
- Este conjunto deve virar um grupo de tools de alta prioridade, porque o usuario pede esse tipo de acao e a arquitetura ja suporta.

Exposicao recomendada ao DotoBot:

- `listar_publicacoes_recentes`
- `sincronizar_publicacoes_freshsales`
- `extrair_audiencias_publicacoes`
- `calcular_prazos_publicacoes`
- `atualizar_prazo_fim_accounts`

### 4. Freshsales, Freshworks e CRM

Funcoes:

- `freshsalesBatchSyncProbe`
- `freshsalesCanonicalAdapterProbe`
- `freshsalesEnrichedActivitiesProbe`
- `freshsalesEntityBundleProbe`
- `freshsalesEntityDetailProbe`
- `freshsalesFilteredViewProbe`
- `freshsalesInventoryProbe`
- `freshsalesRecordsProbe`
- `freshsalesSchemaProbe`
- `freshsalesSnapshotsReadProbe`
- `freshsalesSyncSnapshotsProbe`
- `freshsalesWhoamiProbe`
- `freshworksAuthorizeUrlProbe`
- `freshworksOauthCallbackProbe`
- `freshworksOauthExchangeProbe`
- `fs-account-enricher`
- `fs-account-repair`
- `fs-activity-consolidate`
- `fs-contacts-sync`
- `fs-fix-activities`
- `fs-inspect-account`
- `fs-repair-orphans`
- `fs-tag-leilao`
- `fs-webhook`
- `get-fs-key`
- `oauth`
- `billing-debug`
- `billing-import`

Leitura da auditoria:

- O dominio CRM e amplo, mas misturado com muitas probes.
- `fs-account-enricher`, `fs-account-repair`, `fs-contacts-sync`, `fs-fix-activities`, `fs-repair-orphans`, `fs-tag-leilao`, `billing-import` e `oauth` sao funcionais.
- `freshsales*Probe`, `freshworks*Probe`, `billing-debug`, `get-fs-key` e `fs-inspect-account` devem ficar fora do catalogo de tools para uso cotidiano.

Exposicao recomendada ao DotoBot:

- `consultar_contato_crm`
- `consultar_conta_crm`
- `sincronizar_contatos_crm`
- `corrigir_accounts_crm`
- `corrigir_activities_crm`
- `corrigir_orfaos_crm`
- `taguear_leilao_crm`
- `importar_faturamento_crm`
- `oauth_freshworks_status`

### 5. Freshchat e memoria conversacional

Funcoes:

- `fc-ingest-conversations`
- `fc-last-conversation`
- `fc-update-conversation`
- `freshchatAgentProbe`
- `freshchatAgentsInventoryProbe`

Leitura da auditoria:

- Aqui existe base real para ingestao de conversas, consulta da ultima thread e atualizacao de status/roteamento de conversa.
- `fc-ingest-conversations`, `fc-last-conversation` e `fc-update-conversation` devem entrar no catalogo de tools.
- As duas probes sao administrativas.

Exposicao recomendada ao DotoBot:

- `sincronizar_conversas_freshchat`
- `buscar_ultima_conversa_freshchat`
- `atualizar_conversa_freshchat`

### 6. Slack e interfaces do DotoBot

Funcoes:

- `dotobot-embed`
- `dotobot-slack`
- `slack-diag`
- `slack-notify`

Leitura da auditoria:

- `dotobot-slack` e a principal interface conversacional e operacional.
- `dotobot-embed` e utilitario tecnico.
- `slack-notify` e tool interna valida.
- `slack-diag` deve permanecer administrativo.

Exposicao recomendada ao DotoBot:

- `publicar_no_slack`
- `painel_dotobot_slack`

### 7. AgentLab e governanca

Funcoes:

- `agentLabDashboardProbe`

Leitura da auditoria:

- Existe capacidade administrativa, mas o nome e o codigo sugerem modo probe/dashboard.
- Deve ficar como tool administrativa, nao como tool principal de usuario final.

### 8. Sensiveis ou nao expor

Nao expor ao DotoBot como tool conversacional comum:

- `get-fs-key`
- `read-secrets-temp`
- `advise-diag`
- `advise-test-params`
- `advise-token-check`
- `slack-diag`
- `freshchatAgentProbe`
- `freshchatAgentsInventoryProbe`
- `freshsalesBatchSyncProbe`
- `freshsalesCanonicalAdapterProbe`
- `freshsalesEnrichedActivitiesProbe`
- `freshsalesEntityBundleProbe`
- `freshsalesEntityDetailProbe`
- `freshsalesFilteredViewProbe`
- `freshsalesInventoryProbe`
- `freshsalesRecordsProbe`
- `freshsalesSchemaProbe`
- `freshsalesSnapshotsReadProbe`
- `freshsalesSyncSnapshotsProbe`
- `freshsalesWhoamiProbe`
- `freshworksAuthorizeUrlProbe`
- `freshworksOauthCallbackProbe`
- `freshworksOauthExchangeProbe`
- `billing-debug`
- `fs-inspect-account`

Motivo:

- diagnostico
- leitura de segredo
- bootstrap OAuth
- validacao tecnica
- inspeção de schema ou inventario

## Lacunas reais encontradas

### Freshdesk

Nao foi encontrada Edge Function dedicada ativa em `supabase/functions` para:

- triar fila de tickets
- processar ticket individual
- sincronizar Freshsales x Freshdesk

Ha bibliotecas e chamadas no worker principal para Freshdesk, entao existe base de integracao, mas nao paridade de Edge Functions no Supabase.

### Google Calendar

Existe integracao helper em `functions/lib/agendamento-helpers.js`, inclusive chamadas ao Google Calendar, mas nao uma Edge Function dedicada em `supabase/functions` para o DotoBot operar diretamente.

### Google Drive

Nao apareceu Edge Function dedicada no Supabase para Google Drive.

## Recomendacao de catalogo de tools do DotoBot

### Grupo `processos`

- consultar processo por CNJ
- resumir processo por CNJ
- listar movimentacoes recentes
- enriquecer processo via TPU
- sincronizar processo com Freshsales

### Grupo `publicacoes`

- listar publicacoes recentes
- sincronizar publicacoes para Freshsales
- extrair audiencias das publicacoes
- calcular prazos
- enriquecer publicacoes por IA

### Grupo `crm`

- consultar contato
- consultar conta
- sincronizar contatos
- corrigir accounts
- corrigir activities
- reparar orfaos
- importar faturamento

### Grupo `freshchat`

- sincronizar conversas
- buscar ultima conversa
- atualizar conversa

### Grupo `freshdesk`

- listar fila Freshdesk
- abrir ticket

Observacao: hoje isso depende mais da camada do worker do que de Edge Functions do Supabase.

### Grupo `pipeline`

- status do pipeline HMADV
- rodar DataJud
- rodar backfill Advise
- consultar backlog e pendencias

### Grupo `slack`

- publicar notificacao
- atualizar painel do DotoBot

## Conclusao

O HMADV nao tem problema de falta de capacidade de backend. O problema atual e de exposicao, curadoria e roteamento. O DotoBot ainda usa uma parcela pequena da superficie real disponivel.

Proximo passo correto:

1. usar este inventario como fonte de verdade do catalogo de tools
2. expor apenas funcoes operacionais estaveis
3. manter probes e secrets fora do bot
4. tratar Freshdesk, Google Calendar e Google Drive como trilhas de integracao diferentes:
   - Freshdesk: parcial
   - Google Calendar: helper existente, sem Edge Function dedicada
   - Google Drive: lacuna atual
