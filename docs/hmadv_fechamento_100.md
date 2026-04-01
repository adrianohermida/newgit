# HMADV - Fechamento 100% da Integracao

## Objetivo final

Considerar a integracao concluida somente quando:

- todo processo do Supabase existir no Freshsales;
- todo processo com Sales Account tiver status final de enriquecimento DataJud;
- toda publicacao nao-leilao estiver exportada ou classificada;
- partes vierem das publicacoes historicas quando possivel;
- audiencias estiverem detectadas e preparadas para exportacao;
- a operacao estiver sustentada por cron e reconciliacao.

## Fase 1 - Enriquecimento DataJud por status

Arquivos:

- [hmadv_p0_enriquecimento_schema.sql](/D:/Github/newgit/docs/hmadv_p0_enriquecimento_schema.sql)
- [hmadv_p0_validacao.ps1](/D:/Github/newgit/docs/hmadv_p0_validacao.ps1)
- [hmadv_backfill_enriquecimento.ps1](/D:/Github/newgit/docs/hmadv_backfill_enriquecimento.ps1)
- [hmadv_p0_rollout.md](/D:/Github/newgit/docs/hmadv_p0_rollout.md)

Aceite:

- `processos.sem_account` tende a zero;
- todo processo com `account_id_freshsales` tem `datajud_status`;
- `processando` stale deixa de ficar preso;
- `enriquecido` sobe continuamente.

## Fase 2 - Publicacoes nao-leilao

Arquivos:

- [hmadv_reconciliar_publicacoes.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_publicacoes.ps1)
- [hmadv_fase2_publicacoes.md](/D:/Github/newgit/docs/hmadv_fase2_publicacoes.md)

Aceite:

- `publicacoes` pendentes nao-leilao tende a zero;
- `LEILAO_IGNORADO` aparece apenas nos casos de leilao;
- publicacoes validas criam activity unica no Freshsales;
- account recalcula `Diario`, `Publicacao em`, `Conteudo publicacao`.
- cada publicacao nova relevante tambem gera registro correspondente em `Consulta`.

## Fase 3 - Partes por publicacoes

Arquivos:

- [hmadv_reconciliar_partes_publicacoes.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_partes_publicacoes.ps1)
- [hmadv_fase3_partes.md](/D:/Github/newgit/docs/hmadv_fase3_partes.md)

Aceite:

- `judiciario.partes` cresce a partir das publicacoes;
- `publicacoes.adriano_polo` deixa de ficar nulo nos casos processaveis;
- `processos_sem_polos` tende a cair;
- `fs-account-repair` passa a refletir melhor `polo_ativo` e `polo_passivo`.

## Fase 4 - Audiencias

Arquivos:

- [hmadv_fase4_audiencias_schema.sql](/D:/Github/newgit/docs/hmadv_fase4_audiencias_schema.sql)
- [hmadv_reconciliar_audiencias.ps1](/D:/Github/newgit/docs/hmadv_reconciliar_audiencias.ps1)
- [hmadv_fase4_audiencias.md](/D:/Github/newgit/docs/hmadv_fase4_audiencias.md)
- [hmadv_freshsales_consulta_rollout.md](/D:/Github/newgit/docs/hmadv_freshsales_consulta_rollout.md)
- [hmadv_deploy_homologacao.md](/D:/Github/newgit/docs/hmadv_deploy_homologacao.md)

Aceite:

- `judiciario.audiencias` aplicada;
- candidatas auditadas;
- `sales_activity_type_id` de Audiencias definido no Freshsales;
- exportacao idempotente pronta para entrar no `sync-worker`;
- audiencias futuras criam `Reuniões/Appointments` automaticamente quando possivel;
- cada nova audiencia relevante tambem gera registro correspondente em `Consulta`.

## Fase 5 - TPU / SGT

Arquivos:

- [hmadv_p1_tpu_schema.sql](/D:/Github/newgit/docs/hmadv_p1_tpu_schema.sql)
- [hmadv_p1_tpu_validacao.ps1](/D:/Github/newgit/docs/hmadv_p1_tpu_validacao.ps1)
- [hmadv_import_tpu_sql_itens.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_sql_itens.ps1)
- [hmadv_descobrir_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_descobrir_tpu_anual.ps1)
- [hmadv_preview_tpu_sql.ps1](/D:/Github/newgit/docs/hmadv_preview_tpu_sql.ps1)
- [hmadv_rodar_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_anual.ps1)
- [hmadv_fase5_tpu_importacao.md](/D:/Github/newgit/docs/hmadv_fase5_tpu_importacao.md)
- [hmadv_fase5_tpu_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase5_tpu_validacao.ps1)
- [hmadv_fase5_tpu_rollout.md](/D:/Github/newgit/docs/hmadv_fase5_tpu_rollout.md)
- [hmadv_fase5_tpu_integracao_local.md](/D:/Github/newgit/docs/hmadv_fase5_tpu_integracao_local.md)
- [hmadv_fase53_tpu_complementos_schema.sql](/D:/Github/newgit/docs/hmadv_fase53_tpu_complementos_schema.sql)
- [hmadv_import_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_complementos.ps1)
- [hmadv_rodar_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_complementos.ps1)
- [hmadv_fase53_tpu_complementos.md](/D:/Github/newgit/docs/hmadv_fase53_tpu_complementos.md)
- [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)

Aceite:

- movimentos novos resolvem `movimento_tpu_id` ou `tpu_status` na entrada;
- backlog de movimentos sem TPU tende a zero;
- carga anual da TPU fica repetivel a partir dos dumps reais `ITENS`;
- complementos e temporalidade ficam disponiveis para movimentos e futuras regras de audiencia/prazo.

### Fase 5.4 - Gateway TPU detalhado

- `tpu-sync` deve consultar:
  - `/api/v1/publico/consulta/detalhada/movimentos?codigo=...`
  - `/api/v1/publico/consulta/detalhada/classes?codigo=...`
  - `/api/v1/publico/consulta/detalhada/assuntos?codigo=...`
  - `/api/v1/publico/consulta/detalhada/documentos?codigo=...`
- actions esperadas:
  - `resolver_movimento_detalhado`
  - `sync_movimentos_gateway`
  - `sync_classes_gateway`
  - `sync_assuntos_gateway`
  - `sync_documentos_gateway`

### Fase 5.5 - Persistencia dos campos ricos do Gateway

- `visibilidade_externa`
- `flg_eletronico`
- `monocratico`
- `colegiado`
- `presidente_vice`
- `glossario`
- `complementos_detalhados`
- `gateway_payload`

### Fase 5.6 - Sinais de negocio a partir da TPU

- detectar audiencia
- detectar publicacao relevante
- detectar conclusao
- detectar remessa
- detectar decisao
- detectar despacho

## Fase 6 - Camada institucional CNJ

Arquivos base:

- [hmadv_p1_tpu_schema.sql](/D:/Github/newgit/docs/hmadv_p1_tpu_schema.sql)
- [hmadv_import_serventia_cnj.ps1](/D:/Github/newgit/docs/hmadv_import_serventia_cnj.ps1)
- [hmadv_import_juizo_cnj.ps1](/D:/Github/newgit/docs/hmadv_import_juizo_cnj.ps1)
- [hmadv_import_codigo_foro_tjsp.ps1](/D:/Github/newgit/docs/hmadv_import_codigo_foro_tjsp.ps1)
- [hmadv_parser_adapters_design.md](/D:/Github/newgit/docs/hmadv_parser_adapters_design.md)

Aceite:

- `parser_tribunal_schema`, `parser_grau` e `parser_sistema` persistidos;
- melhora de foro, serventia, juizo e instancia.

## Cron oficial

- `datajud-worker`: 5 min
- `sync-worker`: 2 min
- `advise-sync`: incremental diario
- `fs-account-repair`: janelas pequenas ate estabilizar os accounts
- `tpu-sync`: diario ou semanal, depois da carga anual
- `hmadv-process-ai`: cron no Cloudflare para reconciliacao e resumos

## Fase 7 - Cloudflare AI

Arquivos:

- [wrangler.toml](/D:/Github/newgit/workers/hmadv-process-ai/wrangler.toml)
- [index.ts](/D:/Github/newgit/workers/hmadv-process-ai/src/index.ts)
- [prompts.ts](/D:/Github/newgit/workers/hmadv-process-ai/src/prompts.ts)
- [hmadv_cloudflare_ai_rollout.md](/D:/Github/newgit/docs/hmadv_cloudflare_ai_rollout.md)

Aceite:

- worker publicado no Cloudflare;
- `POST /reconcile/process` funcionando;
- novas publicacoes e andamentos disparam reconciliacao inteligente;
- anotacoes automaticas no Freshsales;
- tarefas e prazos preditivos a partir de publicacoes;
- apoio a status, fase, instancia e inconsistencias;
- `Consulta` registra solicitacao, sucesso e eventos relevantes do processo.

## Fase 8 - Prazos Processuais

Arquivos:

- [hmadv_prazos_implantacao.md](/D:/Github/newgit/docs/hmadv_prazos_implantacao.md)

Aceite:

- biblioteca normativa de prazos carregada;
- feriados nacionais, estaduais e municipais carregados;
- controle de calendarios forenses e atos de suspensao operacional;
- calculo automatico de prazo a partir de publicacoes, movimentos e audiencias;
- `Tasks` no Freshsales vinculadas ao processo;
- IA preenchendo descricoes e contexto das tasks de prazo e audiencia.

## Indicadores de pronto

- `processos.sem_account = 0`
- `datajud_status` sem backlog estrutural
- `publicacoes.pendentes_fs` nao-leilao = 0
- `processos_sem_polos` em queda sustentada
- `audiencias` detectadas e prontas para exportacao
- `movimentos` com TPU em cobertura aceitavel
- `prazos_calculados` com tasks geradas para eventos elegiveis

## Ordem recomendada

1. Aplicar P0 e estabilizar `datajud_status`
2. Drenar publicacoes nao-leilao
3. Rodar backfill de partes
4. Auditar e estruturar audiencias
5. Rodar a carga anual da TPU
6. Resolver backlog historico via `tpu-sync`
7. Concluir camada institucional
8. Publicar e integrar o Cloudflare Worker IA
9. Destravar audiencias e appointments
10. Implantar motor de prazos processuais
11. Fechar reconciliacao diaria Freshsales x Supabase
