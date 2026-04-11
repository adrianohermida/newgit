# Integration Kit

Este runbook transforma a integracao atual em um pacote reaproveitavel para novos nichos, novos repositorios, novos projetos Supabase e novas contas Freshworks.

## O que exportamos

- `integration.config.json`: visao principal do workspace, provedores e defaults.
- `field-mapping.json`: mapeamentos entre entidades e campos customizados do Freshsales.
- `business-rules.json`: scripts operacionais e regras de bootstrap/sync.
- `mcp.config.json`: conexao MCP do Supabase pronta para receber o `project_ref`.
- `.mcp.json`: contexto complementar para GitHub e conectores locais.
- `credential-checklist.json`: cobertura de credenciais e passos pendentes por sistema.
- `.env.bootstrap`: arquivo ambiente para o novo projeto.
- `authorize-url.json`: URL guiada para concluir o OAuth do Freshsales Suite.

## Fluxo recomendado para um projeto novo

1. Abrir `/interno/setup-integracao` e preencher os dados do novo workspace.
2. Informar tambem `SUPABASE_PROJECT_REF`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` e as credenciais Freshsales/Freshdesk.
3. Salvar localmente ou baixar `setup.secrets.json` para `setup/integration-kit/`.
4. Rodar `npm run integration:validate`.
5. Rodar `npm run integration:bootstrap`.
6. Revisar os arquivos gerados em `setup/integration-kit/generated/<workspace>`.
7. Rodar `npm run integration:go` quando quiser aplicar migrations e publicar edge functions automaticamente.
8. Abrir `authorize-url.json` para concluir a autorizacao OAuth da nova conta Freshworks.
9. Rodar `npm run integration:sync` para popular produtos, contatos e deals.

## Comandos do kit

- `npm run integration:doctor`: valida envs, URLs derivadas e readiness minima.
- `npm run integration:authorize-url`: gera a authorize URL OAuth.
- `npm run integration:export-config`: materializa o bundle exportavel em `artifacts/integration-kit/<workspace>`.
- `npm run integration:init`: imprime a sequencia minima de bootstrap e as migrations detectadas.
- `npm run integration:validate`: valida `setup.secrets.json`, project ref do Supabase, repo GitHub e credenciais minimas.
- `npm run integration:bootstrap`: gera o pacote operacional em `setup/integration-kit/generated/<workspace>`.
- `npm run integration:go`: executa o bootstrap completo com `--execute-supabase`.
- `npm run integration:seed-products`: aplica os produtos canonicos definidos no setup.
- `npm run integration:sync`: usa o bundle gerado para sincronizar produtos, contatos e deals.
- `npm run integration:ops`: executa a esteira operacional inicial completa.

## Hardening do runner

- A API administrativa que executa comandos locais so funciona quando `INTEGRATION_KIT_COMMAND_RUNNER_ENABLED=true`.
- O runner web e o salvamento server-side do `setup.secrets.json` devem ser usados apenas em runtime local explicito.
- Em producao, o runner permanece bloqueado por padrao; para liberar, use `INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION=true`.
- Acoes mais sensiveis (`go` e `ops`) exigem confirmacao explicita na UI: `EXECUTAR GO` e `EXECUTAR OPS`.
- O bootstrap e o validate falham fechados sem `setup.secrets.json`; para reutilizar o ambiente atual de forma intencional, use `--allow-ambient-env`.

## Sequencia recomendada para a equipe

### 1. Preparar o setup

- Abrir `/interno/setup-integracao`
- Preencher os dados do workspace
- Informar Supabase project ref, owner/repo do GitHub e credenciais Freshworks/Freshdesk
- Gerar a pre-visualizacao
- Salvar `setup.secrets.json` localmente

### 2. Gerar o pacote

- Rodar `npm run integration:validate`
- Rodar `npm run integration:bootstrap`
- Conferir os arquivos em `setup/integration-kit/generated/<workspace>`
- Revisar `integration.config.json`, `field-mapping.json`, `mcp.config.json` e `credential-checklist.json`

### 3. Provisionar infraestrutura

- Rodar `npm run integration:go`
- Validar o deploy de migrations e edge functions no Supabase
- Abrir `authorize-url.json` e concluir o OAuth do Freshworks

### 4. Popular a base inicial

- Rodar `npm run integration:seed-products`
- Rodar `npm run integration:sync`

## Pasta de setup

- `setup/integration-kit/setup.template.json`: modelo versionado de coleta.
- `setup/integration-kit/setup.secrets.json`: arquivo local com segredos reais; nao commitar.
- `setup/integration-kit/templates/.env.bootstrap.example`: referencia rapida para variaveis.
- `setup/integration-kit/templates/canonical-products.json`: catalogo base reutilizavel por nicho.
- `setup/integration-kit/generated/<workspace>`: saida pronta para bootstrap e deploy.
- `setup/integration-kit/generated/<workspace>/mcp.config.json`: conexao MCP do Supabase por `project_ref`.
- `setup/integration-kit/generated/<workspace>/.mcp.json`: contexto local para GitHub/MCP complementar.
- `setup/integration-kit/generated/<workspace>/credential-checklist.json`: status do onboarding de segredos e acessos.
- `setup/integration-kit/bootstrap.ps1` e `bootstrap.cmd`: launchers para Windows apontando para `npm run integration:go`.
