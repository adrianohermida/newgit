# HMADV - Fase 5: TPU / SGT

## Objetivo

Tirar a resolução de movimentos da TPU do campo de planejado e colocar o fluxo em operação.

## Artefatos oficiais

- [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)
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

## O que esta primeira versão já faz

- `action=status`
  - mostra tamanho do estoque TPU local e backlog de movimentos sem `movimento_tpu_id`
- `action=resolver_movimento&codigo_cnj=...`
  - procura um código no `judiciario.tpu_movimento`
- `action=resolver_lote_movimentos&limite=...`
  - pega movimentos sem `movimento_tpu_id`
  - tenta resolver pelo TPU já carregado no banco
  - marca `tpu_status`
- `action=enriquecer_processo&processo_id=...`
  - resolve o lote de movimentos de um processo específico

## O que ainda falta

- executar a carga anual da TPU no HMADV;
- opcionalmente adicionar fallback online por Gateway/SGT;
- evoluir `sync_classes`, `sync_assuntos` e `sync_all` se um dia a carga deixar de ser por dump anual.
- carregar complementos e temporalidade da estrutura nova do CNJ.

## Estratégia correta para este projeto

Como a TPU muda pouco e os dumps anuais reais já existem localmente:

1. usar os arquivos anuais como carga principal;
2. usar o `tpu-sync` para resolver movimentos contra esse estoque local;
3. carregar complementos/temporalidade para movimentos quando o dump atualizado estiver disponível;
4. deixar Gateway/SGT online só como fallback futuro.

## Dado importante descoberto

Os dumps reais em `D:\Downloads\tpu` usam uma tabela unificada `ITENS`, com `tipo_item`:

- `C` = classe
- `A` = assunto
- `M` = movimento
- `D` = documento

Por isso, o importador operacional correto é o [hmadv_import_tpu_sql_itens.ps1](/D:/Github/newgit/docs/hmadv_import_tpu_sql_itens.ps1).

## Critério de aceite da Fase 5

- `tpu_movimento` carregada no banco;
- `tpu_classe` e `tpu_assunto` carregadas no banco;
- complementos de movimento e temporalidade carregados quando a fase 5.3 entrar;
- `resolver_lote_movimentos` começa a reduzir o backlog;
- [datajud-search](/D:/Github/newgit/_hmadv_review/supabase/functions/datajud-search/index.ts) passa a gravar `movimento_tpu_id` na entrada quando o código já existir no estoque local.

## Execução recomendada agora

1. rodar o `dry-run` de [hmadv_rodar_tpu_anual.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_anual.ps1);
2. importar `classe`, `assunto` e `movimento`;
3. validar com [hmadv_fase5_tpu_validacao.ps1](/D:/Github/newgit/docs/hmadv_fase5_tpu_validacao.ps1);
4. aplicar [hmadv_fase53_tpu_complementos_schema.sql](/D:/Github/newgit/docs/hmadv_fase53_tpu_complementos_schema.sql) e rodar [hmadv_rodar_tpu_complementos.ps1](/D:/Github/newgit/docs/hmadv_rodar_tpu_complementos.ps1);
5. publicar a versão nova da [tpu-sync](/D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts);
6. chamar `tpu-sync?action=resolver_lote_movimentos`;
7. medir a queda do backlog.

