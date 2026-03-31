# HMADV - Plano Incremental Gateway TPU + Cloudflare AI

## Fase 5.4

Adicionar suporte no [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts) para:

- `resolver_movimento_detalhado`
- `sync_movimentos_gateway`
- `sync_classes_gateway`
- `sync_assuntos_gateway`
- `sync_documentos_gateway`

Usando os endpoints:

- `GET /api/v1/publico/consulta/detalhada/movimentos?codigo=...`
- `GET /api/v1/publico/consulta/detalhada/classes?codigo=...`
- `GET /api/v1/publico/consulta/detalhada/assuntos?codigo=...`
- `GET /api/v1/publico/consulta/detalhada/documentos?codigo=...`

## Fase 5.5

Persistir no banco os campos adicionais do Gateway, sobretudo em `tpu_movimento`:

- `visibilidade_externa`
- `flg_eletronico`
- `monocratico`
- `colegiado`
- `presidente_vice`
- `glossario`
- `complementos_detalhados`
- `gateway_payload`

Arquivos:

- [hmadv_fase54_tpu_gateway_schema.sql](/D:/Github/newgit/docs/hmadv_fase54_tpu_gateway_schema.sql)
- [004_hmadv_tpu_gateway_fields.sql](/D:/Github/newgit/_hmadv_review/supabase/migrations/004_hmadv_tpu_gateway_fields.sql)

## Fase 5.6

Usar os complementos para melhorar o negocio:

- detectar audiencia
- detectar publicacao relevante
- detectar conclusao
- detectar remessa
- detectar decisao
- detectar despacho
- estruturar melhor a activity no Freshsales

## Fase 7

Usar o worker Cloudflare AI em [index.ts](/D:/Github/newgit/workers/hmadv-process-ai/src/index.ts) para:

- resumir andamentos
- resumir publicacoes
- resumir audiencias
- interpretar mudancas de status, fase e instancia
- perceber inconsistencias
- criar anotacoes automaticas no account
- criar tarefas e prazos preditivos a partir de publicacoes associadas
