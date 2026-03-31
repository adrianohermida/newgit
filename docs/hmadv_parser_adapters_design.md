# HMADV - Design dos Adapters DataJud por tribunal, grau e sistema

## Objetivo

Criar uma camada oficial de adapters para o HMADV conseguir:

- interpretar respostas heterogeneas do DataJud
- normalizar campos por tribunal, grau e sistema
- enriquecer `judiciario.processos` com o maximo de dados aproveitaveis
- reduzir falhas de parsing causadas por schemas diferentes

Este documento complementa:

- `D:\Github\newgit\docs\hmadv_p1_tpu_schema.sql`
- `D:\Github\newgit\docs\hmadv_tpu_sync_design.md`
- `D:\Github\newgit\docs\hmadv_matriz_execucao.md`

## Problema

O DataJud nao devolve um schema uniforme entre:

- tribunais
- graus de jurisdicao
- sistemas processuais
- orgaos julgadores

Na pratica, o mesmo dado pode chegar com caminhos diferentes:

- `classe.nome`
- `classeProcessual.nome`
- `dadosBasicos.classeProcessual.descricao`

O mesmo vale para:

- assunto principal
- orgao julgador
- codigo do orgao
- datas
- movimentos
- complementos
- metadados institucionais

## Estrategia

Separar o parsing em 3 camadas:

### 1. Parser canonico

Responsavel por montar um payload normalizado para o HMADV:

- `numero_processo`
- `numero_cnj`
- `tribunal`
- `grau`
- `sistema`
- `classe_codigo`
- `classe_nome`
- `assunto_principal_codigo`
- `assunto_principal_nome`
- `assuntos_codigos`
- `orgao_julgador_codigo`
- `orgao_julgador_nome`
- `data_ajuizamento`
- `data_distribuicao`
- `data_ultima_movimentacao`
- `valor_causa`
- `segredo_justica`
- `arquivado`
- `movimentos`
- `raw_origem`

### 2. Adapter especifico

Responsavel por conhecer excecoes de um recorte institucional:

- tribunal
- grau
- sistema

Cada adapter recebe o payload bruto e devolve um payload canonico.

### 3. Enriquecimento institucional

Responsavel por completar o payload canonico com tabelas locais:

- `juizo_cnj`
- `serventia_cnj`
- `codigo_foro_tjsp`
- `tpu_orgao`
- `tpu_classe`
- `tpu_assunto`

## Chave de resolucao do adapter

O adapter deve ser escolhido pela combinacao:

- `tribunal`
- `grau`
- `sistema`

Formato sugerido:

- `TJSP:1:PJE`
- `TJSC:2:ESAJ`
- `TRF4:1:EPROC`

Fallbacks:

1. `tribunal:grau:sistema`
2. `tribunal:grau:*`
3. `tribunal:*:*`
4. `default`

## Contrato do adapter

Assinatura sugerida:

```ts
type DataJudAdapterInput = {
  numeroProcesso: string;
  tribunal?: string | null;
  grau?: string | number | null;
  sistema?: string | null;
  payload: unknown;
};

type CanonicalMovimento = {
  codigo?: number | null;
  descricao?: string | null;
  data_movimento?: string | null;
  complemento?: string | null;
  raw?: unknown;
};

type CanonicalProcesso = {
  numero_processo?: string | null;
  numero_cnj?: string | null;
  tribunal?: string | null;
  grau?: string | null;
  sistema?: string | null;
  classe_codigo?: number | null;
  classe_nome?: string | null;
  assunto_principal_codigo?: number | null;
  assunto_principal_nome?: string | null;
  assuntos_codigos?: number[];
  orgao_julgador_codigo?: number | null;
  orgao_julgador_nome?: string | null;
  data_ajuizamento?: string | null;
  data_distribuicao?: string | null;
  data_ultima_movimentacao?: string | null;
  valor_causa?: number | null;
  segredo_justica?: boolean | null;
  arquivado?: boolean | null;
  movimentos?: CanonicalMovimento[];
  raw_origem: unknown;
  parser_tribunal_schema?: string | null;
};

type DataJudAdapter = {
  key: string;
  match: (meta: {
    tribunal?: string | null;
    grau?: string | number | null;
    sistema?: string | null;
    payload: unknown;
  }) => boolean;
  parse: (input: DataJudAdapterInput) => CanonicalProcesso;
};
```

## Registro oficial de adapters

Criar um modulo central:

- `supabase/functions/_shared/datajud/adapters/registry.ts`

Conteudo esperado:

- lista de adapters registrados
- funcao `resolverAdapter(meta)`
- funcao `parseDataJudPayload(input)`
- fallback `defaultAdapter`

Estrutura sugerida:

- `defaultAdapter.ts`
- `tjsp1grauEsajAdapter.ts`
- `tjsp2grauEsajAdapter.ts`
- `trf4EprocAdapter.ts`
- `tjspPjeAdapter.ts`

## Responsabilidade do default adapter

O `defaultAdapter` deve:

- tentar caminhos mais comuns
- nunca descartar `raw_origem`
- devolver movimentos mesmo sem TPU
- preencher `parser_tribunal_schema='default'`

Ele e o fallback seguro, nao o parser ideal.

## Responsabilidade dos adapters especificos

Cada adapter especializado deve:

- conhecer aliases de campos do tribunal
- normalizar nome/codigo de classe
- normalizar assunto principal
- extrair orgao julgador com maior precisao
- normalizar datas
- mapear a lista real de movimentos
- preservar o payload original

## Persistencia no banco

Em `judiciario.processos`, aproveitar os campos do `P1`:

- `parser_tribunal_schema`
- `parser_grau`
- `parser_sistema`
- `juizo_cnj_id`
- `serventia_cnj_id`
- `codigo_foro_local`

Em `judiciario.movimentos`:

- `codigo`
- `descricao`
- `data_movimento`
- `movimento_tpu_id`
- `tpu_status`
- `tpu_resolvido_em`

## Fluxo integrado com `datajud-search`

1. descobrir metadados do processo:
   - tribunal
   - grau
   - sistema
2. resolver adapter
3. transformar em payload canonico
4. enriquecer com:
   - TPU
   - JuizoCNJ
   - Serventia
   - CodigoForoTJSP quando aplicavel
5. persistir processo
6. persistir movimentos
7. marcar:
   - `parser_tribunal_schema`
   - `parser_grau`
   - `parser_sistema`

## Fluxo integrado com `tpu-sync`

O adapter nao traduz o movimento sozinho.

Ele deve:

- extrair `codigo` do movimento
- extrair `descricao`
- entregar isso para a camada TPU

Depois:

1. `datajud-search` tenta resolver `movimento_tpu_id`
2. se nao resolver, marca `tpu_status='pendente'`
3. `tpu-sync` ou `resolver_lote_movimentos` completa depois

## Fluxo integrado com publicacoes/partes

Os adapters DataJud nao devem ser a fonte primaria de partes.

Responsabilidade dos adapters:

- preencher metadados processuais
- preencher orgao, classe, assunto, movimentos

Responsabilidade do pipeline de publicacoes:

- extrair partes
- montar polos
- enriquecer `judiciario.partes`
- atualizar `processos.polo_ativo` e `processos.polo_passivo`

## Tabelas auxiliares necessarias

Ja previstas no `P1`:

- `judiciario.juizo_cnj`
- `judiciario.serventia_cnj`
- `judiciario.codigo_foro_tjsp`

Opcional futura:

- `judiciario.datajud_adapter_catalog`

Campos sugeridos:

- `tribunal`
- `grau`
- `sistema`
- `adapter_key`
- `ativo`
- `observacoes`
- `updated_at`

Essa tabela ajudaria a administrar overrides sem redeploy imediato.

## Cron e manutencao

Rotinas sugeridas:

- `datajud-worker` continuo para enriquecimento diario
- `tpu-sync` diario/semanal
- rotina de auditoria dos adapters 1x por dia

Auditoria minima:

- processos por `parser_tribunal_schema`
- taxa de falha por adapter
- processos sem `orgao_julgador_codigo`
- processos sem `classe_codigo`
- movimentos sem `codigo`

## Painel de excecoes

Criar relatorios para:

- `parser_tribunal_schema='default'` com baixa completude
- processos sem `juizo_cnj_id`
- processos TJSP sem `codigo_foro_local`
- movimentos sem `movimento_tpu_id`
- processos com `datajud_status='falha_temporaria'`

## Ordem incremental de implementacao

### Fase 1

- criar `registry.ts`
- criar `defaultAdapter`
- adaptar `datajud-search` para usar parser canonico

### Fase 2

- criar adapters especializados para os tribunais com maior volume
- persistir `parser_tribunal_schema`, `parser_grau`, `parser_sistema`
- medir taxa de completude por adapter

### Fase 3

- integrar `juizo_cnj`, `serventia_cnj`, `codigo_foro_tjsp`
- revisar backfill dos processos antigos

### Fase 4

- adicionar catalogo configuravel de adapters
- fallback inteligente por tribunal/grau

## Criterio de pronto

- todo processo enriquecido pelo DataJud passa por parser canonico
- o HMADV consegue saber qual adapter foi usado
- a completude por tribunal/grau/sistema fica mensuravel
- os maiores tribunais deixam de depender do `defaultAdapter`
- os movimentos chegam ao pipeline TPU com `codigo` consistente
