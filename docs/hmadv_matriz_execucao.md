# HMADV - Matriz de Execucao

## Objetivo

Traduzir o backlog incremental em alteracoes concretas de:

- schema
- edge functions
- crons
- operacao

## 1. Fechar 100% dos processos no Freshsales

### Meta

Todo processo do Supabase deve ter `account_id_freshsales`.

### Schema impactado

- `judiciario.processos`

### Functions envolvidas

- `sync-worker`
- `processo-sync`
- `fs-webhook`

### Acoes

- manter `sync-worker` como executor oficial
- manter `processo-sync?action=push_freshsales` como motor de criacao/vinculo
- garantir cron continuo ate zerar `processos.sem_account`

### Validacao

- `fs-runner?action=status`
- `processos.sem_account = 0`

## 2. Fechar 100% do enriquecimento DataJud

### Meta

Todo processo com Sales Account deve:

- estar enriquecido
- ou estar marcado como nao enriquecivel

### Schema a criar/alterar

Em `judiciario.processos`:

- `datajud_status text`
- `datajud_last_attempt_at timestamptz`
- `datajud_last_success_at timestamptz`
- `datajud_last_error text`
- `datajud_nao_enriquecivel boolean default false`
- `datajud_payload_hash text`

### Functions envolvidas

- `datajud-worker`
- `datajud-search`
- `sync-worker`

### Acoes

- `datajud-worker` deve atualizar status de enriquecimento por processo
- `sync-worker` deve continuar reencaminhando backlog
- criar cron de manutencao para reprocessar processos com status:
  - `pendente`
  - `falha_temporaria`

### Validacao

- consulta de processos com `account_id_freshsales` e `datajud_status in ('pendente','falha_temporaria')`
- tendencia de queda diaria

## 3. Vincular ou classificar publicacoes sem processo

### Meta

Nenhuma publicacao ficar “sem processo” sem justificativa.

### Schema a criar/alterar

Em `judiciario.publicacoes`:

- `processual boolean default true`
- `tipo_documento text`
- `motivo_sem_processo text`
- `triagem_manual boolean default false`

### Functions envolvidas

- `advise-sync`
- rotina de backfill de publicacoes

### Acoes

- tentar vinculo automatico quando houver CNJ/processo
- marcar como administrativa quando o documento nao for processual

### Validacao

- `publicacoes sem processo` deve ser:
  - vinculavel e processada
  - ou classificada como administrativa

## 4. Traducao obrigatoria dos movimentos via TPU/SGT

### Meta

Todo movimento novo do DataJud deve tentar resolver `movimento_tpu_id`.

### Schema a criar/alterar

Em `judiciario.movimentos`:

- `tpu_status text`
- `tpu_resolvido_em timestamptz`

Em `judiciario.tpu_movimento`:

- garantir `codigo_cnj`
- `nome`
- `descricao`
- `tipo`
- `gera_prazo`

### Functions a criar/alterar

- nova `tpu-sync`
- alterar `datajud-search`
- alterar `sync-worker`

Documento de desenho:

- `D:\Github\newgit\docs\hmadv_tpu_sync_design.md`

### Acoes

- sync TPU via gateway ou SGT
- ao persistir movimento:
  - procurar codigo local
  - fallback online
  - registrar status

### Validacao

- relatorio de `movimentos` sem `movimento_tpu_id`
- tendencia de queda

## 5. Camada institucional CNJ

### Meta

Resolver ambiguidade de tribunal, foro, serventia e juizo.

### Schema a criar

- `judiciario.serventia_cnj`
- `judiciario.juizo_cnj`
- `judiciario.codigo_foro_tjsp`

Campos base:

- tribunal
- uf
- municipio
- codigo_municipio_ibge
- nome
- codigo_cnj
- grau
- competencia
- serventia_id

### Functions/modulos

- novo importador institucional
- novo parser `cnj-parse`
- adaptar `datajud-search`

Documento de desenho:

- `D:\Github\newgit\docs\hmadv_parser_adapters_design.md`

### Fontes locais de referencia

- `D:\Github\newgit\_analysis\ServentiasTable`
- `D:\Github\newgit\_analysis\cnjparse`

### Validacao

- processos com orgao julgador normalizado
- melhor resolucao de foro/comarca/competencia

## 6. Partes a partir das publicacoes

### Meta

Polos processuais devem vir prioritariamente das publicacoes.

### Schema impactado

- `judiciario.partes`
- `judiciario.processos`
- `judiciario.publicacoes`

### Functions a criar/alterar

- extrator de partes por publicacao
- `advise-sync`
- rotina de backfill historico

### Acoes

- extrair autores/reus/agravantes/agravados etc
- extrair advogados e OAB
- deduplicar por processo
- atualizar `processos.polo_ativo` e `processos.polo_passivo`

### Validacao

- queda de processos com polos nulos

## 7. Cron oficial

### Deve existir

- `datajud-worker`: 5 min
- `sync-worker`: 2 min
- `advise-sync`: diario/incremental
- `tpu-sync`: diario ou semanal

### Nao deve existir como principal

- `datajud-webhook`
- `process-datajud-queue`
- `fs-populate`
- `fs-exec`
- `publicacoes-freshsales`
- `sync-advise-realtime`

## 8. Ordem de implementacao

### Passo 1

- zerar `processos.sem_account`
- consumir fila de enriquecimento DataJud

### Passo 2

- adicionar status formal de enriquecimento em `processos`
- separar `nao enriquecivel` de `pendente`

### Passo 3

- subir `tpu-sync`
- resolver traducao obrigatoria dos movimentos

### Passo 4

- subir camada institucional `serventia/juizo/foro`

### Passo 5

- consolidar partes por publicacao

### Passo 6

- fechar reconciliacao diaria Freshsales x Supabase
