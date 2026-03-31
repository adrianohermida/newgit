# HMADV - Implementacao do P1 de adapters DataJud

## Objetivo

Traduzir o design dos adapters em entregas concretas no codigo das Edge Functions.

## Arquivos/modulos a criar

Dentro de `D:\Github\newgit\_hmadv_review\supabase\functions\_shared\datajud\adapters`:

- `types.ts`
- `registry.ts`
- `defaultAdapter.ts`
- `helpers.ts`
- `tjsp1grauEsajAdapter.ts`
- `tjsp2grauEsajAdapter.ts`
- `trf4EprocAdapter.ts`

## Arquivos a alterar

- `D:\Github\newgit\_hmadv_review\supabase\functions\datajud-search\index.ts`
- `D:\Github\newgit\_hmadv_review\supabase\functions\datajud-worker\index.ts`
- `D:\Github\newgit\_hmadv_review\supabase\functions\sync-worker\index.ts`

## Fase 1

### Entrega

- criar contrato de parser canonico
- criar `defaultAdapter`
- integrar o `registry` ao `datajud-search`

### Resultado esperado

- todo payload DataJud passa por uma camada padronizada
- `parser_tribunal_schema='default'` fica persistido

## Fase 2

### Entrega

- detectar `tribunal`, `grau`, `sistema`
- persistir:
  - `parser_tribunal_schema`
  - `parser_grau`
  - `parser_sistema`
- adicionar relatorio por adapter usado

### Resultado esperado

- o HMADV passa a medir completude por recorte institucional

## Fase 3

### Entrega

- adapter especializado para `TJSP 1 grau`
- adapter especializado para `TJSP 2 grau`
- adapter especializado para `TRF4 eproc`

### Resultado esperado

- os tribunais de maior volume saem do fallback generico

## Fase 4

### Entrega

- integrar `juizo_cnj`
- integrar `serventia_cnj`
- integrar `codigo_foro_tjsp`

### Resultado esperado

- orgao julgador, foro e competencia ficam mais completos

## Regras de implementacao

- nunca remover `raw_origem`
- nunca bloquear persistencia so porque o adapter caiu no default
- sempre salvar movimentos mesmo sem TPU resolvida
- manter o parser deterministico e idempotente

## Validacoes minimas

- processo novo gera `parser_tribunal_schema`
- movimento novo gera `codigo` quando existir no payload
- processos com orgao julgador conhecido resolvem `juizo_cnj_id`
- processos TJSP conseguem tentar `codigo_foro_local`

## Dependencias

- aplicar `D:\Github\newgit\docs\hmadv_p1_tpu_schema.sql`
- seguir o desenho de `D:\Github\newgit\docs\hmadv_parser_adapters_design.md`
- seguir o desenho de `D:\Github\newgit\docs\hmadv_tpu_sync_design.md`
