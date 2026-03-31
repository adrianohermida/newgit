# HMADV - Fase 5.3: Integracao imediata DataJud -> TPU local

## Objetivo

Fazer o `datajud-search` tentar resolver `movimento_tpu_id` ja no momento da persistencia dos movimentos, sem depender apenas do `tpu-sync` posterior.

## O que foi ajustado

- [datajud-search](/D:/Github/newgit/_hmadv_review/supabase/functions/datajud-search/index.ts)
  - busca em lote os codigos de movimento na `judiciario.tpu_movimento`
  - grava `movimento_tpu_id` quando o codigo ja existe no estoque local
  - grava `tpu_status = resolvido|pendente`
  - faz fallback tolerante caso `tpu_status` / `tpu_resolvido_em` ainda nao existam no schema

## Efeito pratico

Assim que a carga anual da TPU entrar no banco:

1. processos novos do DataJud ja passam a gravar movimentos com TPU resolvida;
2. o `tpu-sync` fica focado no backlog historico;
3. a cobertura de movimentos traduzidos sobe mais rapido.

## Critério de aceite

- processo novo com movimentos conhecidos ja sai do `datajud-search` com `movimento_tpu_id` preenchido quando houver codigo no estoque local;
- backlog historico segue sendo reduzido via [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts).
