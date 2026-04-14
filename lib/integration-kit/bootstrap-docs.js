"use strict";

function buildLocalOpsReadme() {
  return [
    "# Local Ops Backend",
    "",
    "Este pacote e opcional. Use apenas quando quiser habilitar o backend local do integration kit em uma maquina operacional controlada.",
    "",
    "O frontend portatil continua funcionando sem esta pasta.",
    "",
    "## O que este pacote habilita",
    "",
    "- Salvar `setup.secrets.json` no repo local via UI",
    "- Executar `validate`, `bootstrap`, `go`, `sync` e `ops` pela UI",
    "- Manter o frontend estatico separado do backend local",
    "",
  ].join("\n");
}

function buildReplicationChecklist() {
  return [
    "# Replication Checklist",
    "",
    "Use este checklist para replicar o kit em um repo novo, um Supabase novo e contas novas do Freshsales Suite e Freshdesk.",
    "",
    "## 1. Novo repositorio",
    "",
    "- Copiar a pasta `setup/integration-kit/` para o novo repositorio",
    "- Confirmar que os scripts `integration:*` estao presentes no `package.json`",
    "- Confirmar que as rotas e telas do setup foram copiadas se o projeto usar o frontend interno",
    "- Definir owner, repo e branch padrao no setup",
    "",
  ].join("\n");
}

function buildHandoffSummary() {
  return [
    "# Handoff Summary",
    "",
    "Este repositorio contem um kit reutilizavel para onboarding e operacao da integracao entre Supabase, Freshsales Suite e Freshdesk.",
    "",
    "## O que ja esta pronto",
    "",
    "- Wizard de setup para coleta de credenciais e geracao de arquivos",
    "- Preview portatil que funciona ate em frontend estatico",
    "- Bundle com config, mappings, checklist e manifesto operacional",
    "- Backend local opcional para salvar setup no repo e executar comandos via UI",
    "",
  ].join("\n");
}

function buildReadmeTemplate() {
  return [
    "# Setup Integration Kit",
    "",
    "- Preencha `setup.secrets.json` a partir de `setup.template.json`.",
    "- Ou use a tela `/interno/setup-integracao` para gerar o arquivo localmente.",
    "- Depois rode `npm run integration:bootstrap`.",
    "",
    "Arquivos importantes:",
    "",
    "- `setup.template.json`: modelo versionado.",
    "- `setup.secrets.json`: arquivo local com segredos reais. Nao commitar.",
    "- `generated/`: saida do bootstrap guiado.",
    "",
  ].join("\n");
}

module.exports = {
  buildHandoffSummary,
  buildLocalOpsReadme,
  buildReadmeTemplate,
  buildReplicationChecklist,
};
