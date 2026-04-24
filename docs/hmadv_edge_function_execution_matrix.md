# HMADV Edge Function Execution Matrix

## Estado atual

Esta matriz organiza as `62` Edge Functions catalogadas do HMADV em classes operacionais para o DotoBot:

- `user_facing`: pode ser usada para responder ou executar acoes para o usuario final
- `admin`: pode ser usada em contexto operacional interno, manutencao ou orquestracao
- `diagnostic`: nao deve ser prometida ao usuario final
- `blocked`: nao deve ser exposta
- `legacy`: historico/compatibilidade; nao deve virar capacidade primaria
- `internal`: uso interno da plataforma

## Resumo

- Total catalogado: `62`
- User-facing: `12`
- Admin: `20`
- Diagnostic: `24`
- Blocked: `2`
- Legacy: `3`
- Internal: `1`

## Observacao importante

O DotoBot ja conhece essa matriz no contexto do repositorio, mas isso ainda nao significa despacho executavel completo para as `62` funcoes.

Estado honesto:

- catalogacao: concluida
- classificacao operacional: concluida
- treinamento de selecao: concluido em nivel estrutural
- execucao tool-by-tool: parcial, com dispatcher central ativo para `advise-sync`, `advise-ai-enricher`, `datajud-search`, `processo-sync`, `publicacoes-audiencias`, `publicacoes-freshsales`, `publicacoes-prazos`, `fc-ingest-conversations`, `fc-last-conversation`, `fc-update-conversation` e `tpu-enricher`
- suporte administrativo roteado: `tpu-sync`
- smoke tests funcao por funcao: pendente

## Prioridade de evolucao

1. Fechar dispatcher executavel para todas as funcoes `user_facing`
2. Encadear funcoes `admin` com controle de permissao e contexto
3. Manter `diagnostic`, `blocked`, `legacy` e `internal` fora do discurso de capacidade do usuario final
