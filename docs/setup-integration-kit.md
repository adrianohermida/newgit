# Integration Kit

Este runbook transforma a integração atual em um pacote reaproveitável para novos nichos, novos repositórios, novos projetos Supabase e novas contas Freshworks.

## O que exportamos

- `integration.config.json`: visão principal do workspace, provedores e defaults.
- `field-mapping.json`: mapeamentos entre entidades/campos do domínio e os campos customizados do Freshsales.
- `business-rules.json`: scripts operacionais e regras de bootstrap/sync.
- `.env.integration.example`: modelo consolidado de variáveis de ambiente.

## Fluxo recomendado para um projeto novo

1. Copiar o starter para o novo repositório.
2. Copiar os arquivos exportados deste kit para `config/` ou `integration-kit/` do projeto novo.
3. Criar um novo projeto Supabase.
4. Aplicar as migrations em `supabase/migrations`.
5. Configurar as variáveis do `.env.integration.example` no ambiente local e no deploy.
6. Rodar `npm run integration:doctor`.
7. Gerar a authorize URL com `npm run integration:authorize-url`.
8. Autorizar a nova conta Freshworks e persistir o refresh token.
9. Revisar `field-mapping.json` conforme os campos reais da nova conta.
10. Rodar `npm run integration:init` para revisar o bootstrap mínimo.

## Comandos do kit

- `npm run integration:doctor`: valida envs, URLs derivadas e readiness mínima.
- `npm run integration:authorize-url`: gera a authorize URL OAuth.
- `npm run integration:export-config`: materializa o bundle exportável em `artifacts/integration-kit/<workspace>`.
- `npm run integration:init`: imprime a sequência mínima de bootstrap e as migrations detectadas.

## Convenções para não reescrever por cliente

- Toda regra específica de nicho deve ir para `business-rules.json`.
- Todo id de campo, stage, pipeline e owner deve ir para `field-mapping.json`.
- O código operacional deve receber `workspaceSlug`, `entityMap` e `businessRules` por configuração.
- Evite novos scripts com prefixos de cliente; prefira nomes por capacidade (`sync-*`, `publish-*`, `reconcile-*`).

## Próxima etapa sugerida

A próxima evolução é mover os scripts hoje específicos do cliente para uma camada genérica que consuma esse bundle, começando por:

- OAuth e token refresh do Freshworks.
- Sync de contatos/deals/produtos.
- Export/import de dados intermediários do Supabase.
- Healthchecks do setup.
