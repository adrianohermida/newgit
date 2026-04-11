# HMADV - Backlog Incremental DataJud / TPU / Advise / Freshsales

## Objetivo macro

Garantir que:

- todo processo existente no Supabase exista no Freshsales
- todo processo com Sales Account tenha passado por enriquecimento DataJud
- toda publicacao esteja associada a um processo quando isso for juridicamente possivel
- todo movimento do DataJud seja traduzido pela TPU/SGT do CNJ
- a operacao diaria impeÃ§a o surgimento de novos processos sem enriquecimento

## Estado de partida

- `processos.sem_account`: ainda precisa ser zerado
- `1243` processos com `account_id_freshsales` possuem gap de enriquecimento
- `2` publicacoes seguem sem `processo_id`, mas sao portarias administrativas sem CNJ recuperavel
- o pipeline oficial ja funciona:
  - `fs-webhook`
  - `datajud-worker`
  - `datajud-search`
  - `advise-sync`
  - `sync-worker`
  - `processo-sync`

## P0 - Estabilizacao e enriquecimento completo

### P0.1 Zerar processos sem account no Freshsales

Responsavel principal:

- `sync-worker`
- `processo-sync?action=push_freshsales`

Acoes:

- manter `sync-worker` no cron oficial
- manter `processo-sync` como unica trilha de criacao/vinculo de account
- acompanhar `processos.sem_account` ate zero

Criterio de aceite:

- todo processo no Supabase com CNJ valido possui `account_id_freshsales`

### P0.2 Garantir enriquecimento DataJud para todo processo com Sales Account

Responsavel principal:

- `datajud-worker`
- `datajud-search`
- `monitoramento_queue`

Acoes:

- consumir o backfill enfileirado para os `1243` processos com gap
- marcar resultado do enriquecimento no processo:
  - enriquecido com sucesso
  - falha temporaria
  - nao enriquecivel
- diferenciar backlog de excecao

Schema recomendado:

- adicionar em `judiciario.processos`:
  - `datajud_status`
  - `datajud_last_attempt_at`
  - `datajud_last_success_at`
  - `datajud_last_error`
  - `datajud_enrichment_hash`
  - `datajud_nao_enriquecivel boolean default false`

Criterio de aceite:

- todo processo com `account_id_freshsales` tem status claro de enriquecimento

### P0.3 Fechar o problema das publicacoes sem processo

Responsavel principal:

- `advise-sync`
- rotina de vinculacao complementar

Acoes:

- manter tentativa automatica de vinculo por CNJ
- classificar publicacoes sem processo em:
  - vinculavel
  - administrativa/sem processo
- criar flag para exclusao logica do outbound quando a publicacao nao for processual

Schema recomendado:

- adicionar em `judiciario.publicacoes`:
  - `tipo_documento`
  - `processual boolean default true`
  - `motivo_sem_processo`
  - `triagem_manual boolean default false`

Criterio de aceite:

- publicacoes sem `processo_id` deixam de ser pendencia opaca

## P1 - TPU, SGT e camada institucional

### P1.1 Sincronizacao oficial da TPU/SGT

Responsavel principal:

- nova function `tpu-sync`
- tabelas:
  - `tpu_movimento`
  - `tpu_classe`
  - `tpu_assunto`

Acoes:

- implementar sync online via:
  - Gateway TPU quando disponivel
  - fallback SGT SOAP/WSDL
- persistencia idempotente por codigo CNJ
- log por versao remota e data de sincronizacao

Schema recomendado:

- adicionar/garantir:
  - `tpu_sync_log`
  - versao CNJ
  - `codigo_pai`
  - `glossario`
  - chaves de hierarquia quando existirem

Criterio de aceite:

- movimento, classe e assunto conseguem ser resolvidos localmente na maioria dos casos

### P1.2 Traducao obrigatoria dos movimentos DataJud

Responsavel principal:

- `datajud-search`
- `sync-worker`
- `tpu-sync`

Acoes:

- ao persistir `movimentos`, resolver `movimento_tpu_id`
- se codigo nao existir localmente:
  - consultar TPU online
  - upsert
  - reprocessar o movimento
- exportar ao Freshsales com descricao traduzida e metadata TPU

Schema recomendado:

- consolidar em `judiciario.movimentos`:
  - `movimento_tpu_id`
  - `codigo`
  - `descricao`
  - `freshsales_activity_id`
- opcional:
  - `tpu_resolvido_em`
  - `tpu_status`

Criterio de aceite:

- backlog de movimentos sem correspondencia TPU tende a zero

### P1.3 Camada institucional CNJ

Responsavel principal:

- novo modulo `cnj-parse`
- importadores oficiais

Acoes:

- criar tabelas:
  - `serventia_cnj`
  - `juizo_cnj`
  - `codigo_foro_tjsp`
  - outras tabelas estaduais plugaveis
- importar dados oficiais de serventias/foros
- usar essa camada para resolver:
  - orgao julgador
  - foro
  - comarca
  - competencia
  - grau
  - sistema

Fontes de referencia local:

- `D:\Github\newgit\_analysis\ServentiasTable`
- `D:\Github\newgit\_analysis\cnjparse`

Criterio de aceite:

- parser institucional consegue reduzir ambiguidade de tribunal/grau/sistema

## P2 - Partes, qualidade e reconciliaÃ§Ã£o

### P2.1 Partes a partir das publicacoes

Responsavel principal:

- extrator de partes
- `advise-sync`
- rotina complementar de publicacoes historicas

Acoes:

- tornar oficial a extracao de partes das publicacoes
- deduplicar por processo + nome + polo
- extrair advogados e OAB
- inferir polo ativo/passivo prioritariamente das publicacoes

Fontes de referencia local:

- `D:\Github\newgit\_analysis\partes`

Criterio de aceite:

- `polo_ativo` e `polo_passivo` passam a vir das publicacoes quando ausentes no DataJud

### P2.2 ReconciliaÃ§Ã£o Supabase x Freshsales 100%

Responsavel principal:

- `sync-worker`
- `processo-sync`

Acoes:

- criar reconciliacao periodica:
  - processos sem account
  - processos com account mas campos vazios
  - activities faltantes
- garantir que nada saia para o Freshsales sem idempotencia

Schema recomendado:

- ampliar `sync_divergencias`
- registrar:
  - campo divergente
  - origem da divergencia
  - resolucao automatica ou manual

Criterio de aceite:

- relatorio diario de divergencias aberto tende a zero

### P2.3 Observabilidade e cron de manutencao

Responsavel principal:

- monitoramento
- scripts operacionais

Acoes:

- cron oficial:
  - `datajud-worker`: a cada 5 min
  - `sync-worker`: a cada 2 min
  - `advise-sync`: incremental diario
  - `tpu-sync`: diario ou semanal
- paines/consultas para:
  - processos nao enriquecidos
  - processos nao enriqueciveis
  - movimentos sem TPU
  - publicacoes sem processo
  - processos sem account

Criterio de aceite:

- backlog estrutural deixa de depender de acao manual

## Ordem recomendada de execucao

1. Fechar `processos.sem_account`
2. Fechar enriquecimento DataJud dos `1243` processos com account
3. Criar status formal de enriquecimento em `processos`
4. Subir `tpu-sync` oficial e resolver movimentos via TPU
5. Subir camada institucional `serventia/juizo/foro`
6. Consolidar extracao de partes por publicacao
7. Fechar reconciliacao diaria Supabase x Freshsales

## Entrega minima por sprint

### Sprint A

- status de enriquecimento DataJud por processo
- cron de backfill confiavel
- relatorio de processos com account ainda sem enrichment

### Sprint B

- `tpu-sync` oficial
- traducao de movimentos obrigatoria
- relatorio de movimentos sem mapeamento TPU

### Sprint C

- importador de serventias/juizos/foros
- adaptadores por tribunal/grau/sistema

### Sprint D

- partes a partir das publicacoes
- reconciliacao final com Freshsales

