export const HMADV_EDGE_FUNCTION_CATALOG = [
  { name: "advise-ai-enricher", domain: "advise", exposure: "ready", source: "repo", purpose: "Enriquecimento semantico de publicacoes com IA." },
  { name: "advise-backfill-lido", domain: "advise", exposure: "admin", source: "repo", purpose: "Processa fila historica de publicacoes lidas e nao lidas." },
  { name: "advise-backfill-runner", domain: "advise", exposure: "admin", source: "repo", purpose: "Orquestra backfill incremental por janelas." },
  { name: "advise-diag", domain: "advise", exposure: "diagnostic", source: "repo", purpose: "Diagnostico tecnico do Advise." },
  { name: "advise-drain-by-date", domain: "advise", exposure: "admin", source: "repo", purpose: "Drenagem de publicacoes do Advise por janela de datas." },
  { name: "advise-drain-contratos", domain: "advise", exposure: "admin", source: "repo", purpose: "Drenagem focada nos contratos do escritorio." },
  { name: "advise-drain-reverse", domain: "advise", exposure: "admin", source: "repo", purpose: "Drenagem reversa priorizando paginas recentes do Advise." },
  { name: "advise-sync", domain: "advise", exposure: "ready", source: "repo", purpose: "Sincronizacao incremental de novas publicacoes." },
  { name: "advise-test-params", domain: "advise", exposure: "diagnostic", source: "repo", purpose: "Teste de parametros contra a API Advise." },
  { name: "advise-token-check", domain: "advise", exposure: "diagnostic", source: "repo", purpose: "Validacao tecnica do token Advise." },
  { name: "agentLabDashboardProbe", domain: "agentlab", exposure: "diagnostic", source: "repo", purpose: "Probe do dashboard AgentLab." },
  { name: "billing-debug", domain: "financeiro", exposure: "diagnostic", source: "repo", purpose: "Diagnostico da integracao de faturamento com Freshsales." },
  { name: "billing-import", domain: "financeiro", exposure: "admin", source: "repo", purpose: "Importa fila de faturamento e sincroniza deals/recebiveis." },
  { name: "datajud-search", domain: "datajud", exposure: "ready", source: "repo", purpose: "Consulta e persiste dados de processo via DataJud." },
  { name: "datajud-webhook", domain: "datajud", exposure: "admin", source: "repo", purpose: "Recebe payloads e sincroniza processo/account." },
  { name: "datajud-worker", domain: "datajud", exposure: "admin", source: "repo", purpose: "Processa fila judicial e atualiza CRM." },
  { name: "dotobot-embed", domain: "dotobot", exposure: "internal", source: "repo", purpose: "Gera embeddings para memoria do DotoBot." },
  { name: "dotobot-slack", domain: "dotobot", exposure: "ready", source: "repo", purpose: "Interface Slack do DotoBot com App Home e slash commands." },
  { name: "fc-ingest-conversations", domain: "freshchat", exposure: "ready", source: "repo", purpose: "Ingestao de conversas Freshchat no Supabase e memoria." },
  { name: "fc-last-conversation", domain: "freshchat", exposure: "ready", source: "repo", purpose: "Consulta ultima conversa Freshchat por contato." },
  { name: "fc-update-conversation", domain: "freshchat", exposure: "ready", source: "repo", purpose: "Atualiza status/roteamento de conversa Freshchat." },
  { name: "freshchatAgentProbe", domain: "freshchat", exposure: "diagnostic", source: "repo", purpose: "Probe de agente Freshchat." },
  { name: "freshchatAgentsInventoryProbe", domain: "freshchat", exposure: "diagnostic", source: "repo", purpose: "Inventario de agentes Freshchat." },
  { name: "freshsalesBatchSyncProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de sincronizacao em lote do Freshsales." },
  { name: "freshsalesCanonicalAdapterProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe do adapter canonico Freshsales." },
  { name: "freshsalesEnrichedActivitiesProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de activities enriquecidas." },
  { name: "freshsalesEntityBundleProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de bundle de entidades do Freshsales." },
  { name: "freshsalesEntityDetailProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de detalhe de entidade do Freshsales." },
  { name: "freshsalesFilteredViewProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de views filtradas do Freshsales." },
  { name: "freshsalesInventoryProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Inventario de entidades Freshsales." },
  { name: "freshsalesRecordsProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de registros do Freshsales." },
  { name: "freshsalesSchemaProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Probe de schema/campos do Freshsales." },
  { name: "freshsalesSnapshotsReadProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Leitura de snapshots do Freshsales." },
  { name: "freshsalesSyncSnapshotsProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Sincronizacao de snapshots Freshsales." },
  { name: "freshsalesWhoamiProbe", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Whoami e validacao de credenciais Freshsales." },
  { name: "freshworksAuthorizeUrlProbe", domain: "freshworks", exposure: "diagnostic", source: "repo", purpose: "Gera URL de autorizacao OAuth Freshworks." },
  { name: "freshworksOauthCallbackProbe", domain: "freshworks", exposure: "diagnostic", source: "repo", purpose: "Probe de callback OAuth Freshworks." },
  { name: "freshworksOauthExchangeProbe", domain: "freshworks", exposure: "diagnostic", source: "repo", purpose: "Probe de troca de codigo OAuth Freshworks." },
  { name: "fs-account-enricher", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Enriquece accounts com dados consolidados do processo." },
  { name: "fs-account-repair", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Repara inconsistencias de accounts no Freshsales." },
  { name: "fs-activity-consolidate", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Consolida activities no CRM." },
  { name: "fs-contacts-sync", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Sincroniza contatos entre Supabase e Freshsales." },
  { name: "fs-fix-activities", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Corrige activities pendentes ou inconsistentes." },
  { name: "fs-inspect-account", domain: "freshsales", exposure: "diagnostic", source: "repo", purpose: "Inspeciona account do Freshsales." },
  { name: "fs-repair-orphans", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Corrige campos orfaos de processos e reenvia para CRM." },
  { name: "fs-tag-leilao", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Aplica tag de leilao em accounts do Freshsales." },
  { name: "fs-webhook", domain: "freshsales", exposure: "admin", source: "repo", purpose: "Recebe webhook do Freshsales e enfileira processamento." },
  { name: "get-fs-key", domain: "freshsales", exposure: "blocked", source: "repo", purpose: "Ferramenta sensivel para leitura de chave." },
  { name: "oauth", domain: "freshworks", exposure: "admin", source: "repo", purpose: "Gerencia OAuth de Freshsales/Freshworks." },
  { name: "processo-sync", domain: "processos", exposure: "ready", source: "repo", purpose: "Sincronizacao bidirecional processo <-> Freshsales." },
  { name: "publicacoes-audiencias", domain: "publicacoes", exposure: "ready", source: "repo", purpose: "Extrai audiencias de publicacoes." },
  { name: "publicacoes-freshsales", domain: "publicacoes", exposure: "ready", source: "repo", purpose: "Envia publicacoes ao Freshsales como activities." },
  { name: "publicacoes-prazos", domain: "publicacoes", exposure: "ready", source: "repo", purpose: "Calcula prazos e alertas processuais." },
  { name: "read-secrets-temp", domain: "internal", exposure: "blocked", source: "repo", purpose: "Leitura de segredos temporarios; nao expor." },
  { name: "slack-diag", domain: "slack", exposure: "diagnostic", source: "repo", purpose: "Diagnostico de tokens e conectividade Slack." },
  { name: "slack-notify", domain: "slack", exposure: "admin", source: "repo", purpose: "Envia notificacoes ao Slack." },
  { name: "sync-advise-backfill", domain: "advise", exposure: "legacy", source: "repo", purpose: "Backfill paginado legado do Advise." },
  { name: "sync-advise-publicacoes", domain: "advise", exposure: "legacy", source: "repo", purpose: "Sincronizacao legada de publicacoes Advise." },
  { name: "sync-advise-realtime", domain: "advise", exposure: "legacy", source: "repo", purpose: "Ingestao incremental legada do Advise." },
  { name: "sync-worker", domain: "pipeline", exposure: "admin", source: "repo", purpose: "Worker central de sincronizacao do pipeline HMADV." },
  { name: "tpu-enricher", domain: "tpu", exposure: "ready", source: "repo", purpose: "Enriquecimento local de processo via TPU/CNJ." },
  { name: "tpu-sync", domain: "tpu", exposure: "admin", source: "repo", purpose: "Consulta e sincronizacao detalhada do gateway TPU." },
];

export const DOTOBOT_EXTERNAL_APP_COVERAGE = [
  {
    app: "freshsales",
    status: "partial_to_strong",
    connector: "none_in_codex_apps",
    localCoverage: [
      "contacts: lookup, view, update, upsert",
      "sales_accounts: view, contacts, enrichment, repair",
      "deals: view, list from views, billing import",
      "sales_activities: list and creation",
      "products: list via worker tool layer",
      "appointments: list, create, update, delete",
      "oauth: authorize, callback, exchange, refresh, status",
      "snapshots/inventory/schema: diagnostic probes",
    ],
    missingForTotalCoverage: [
      "catalogo formal de todos os endpoints REST do tenant",
      "cobertura explicita de products, pipelines, users/owners, notes e searches genericas",
      "surface unificada para o agente escolher endpoint por entidade e acao",
    ],
  },
  {
    app: "freshchat",
    status: "partial_to_strong",
    connector: "none_in_codex_apps",
    localCoverage: [
      "conversation sync ingestion",
      "last conversation lookup",
      "conversation update: status, group, agent, priority",
      "conversation list/detail via worker tool layer",
      "agent list, group list, user list via worker tool layer",
      "message send in conversation via worker tool layer",
      "agent inventory probes",
    ],
    missingForTotalCoverage: [
      "catalogo de todos os endpoints Freshchat v2 usados pelo tenant",
      "validacao tenant-specific de reply/send, contacts enrichment e automacoes mais sensiveis",
    ],
  },
  {
    app: "freshdesk",
    status: "partial",
    connector: "none_in_codex_apps",
    localCoverage: [
      "ticket listing via worker library",
      "ticket creation via worker library",
      "ticket detail, update and internal note via worker tool layer",
      "contacts, agents and groups listing via worker tool layer",
      "portal URL helpers e ticket normalization",
    ],
    missingForTotalCoverage: [
      "Edge Functions dedicadas no Supabase para Freshdesk",
      "assignment/ownership flows, companies, canned responses e automacoes avancadas",
      "cobertura tenant-specific dos endpoints Freshdesk relevantes para operacao do escritorio",
    ],
  },
  {
    app: "google_calendar",
    status: "strong_via_connector_plus_local",
    connector: "codex_apps.google_calendar",
    localCoverage: [
      "freebusy via helper local",
      "create/update/delete event via helper local",
      "simple availability and event tools via workspace layer",
      "access token retrieval local",
    ],
    connectorCoverage: [
      "list calendars",
      "search/read/update/delete events",
      "availability lookup",
      "create events with reminders, attendees and Google Meet",
    ],
    missingForTotalCoverage: [
      "orquestracao unificada entre connector e camada HMADV",
    ],
  },
  {
    app: "google_drive",
    status: "missing",
    connector: "none_detected",
    localCoverage: [],
    missingForTotalCoverage: [
      "connector ou camada local de Drive",
      "list/search/read/upload/share permissions",
    ],
  },
  {
    app: "zoom",
    status: "strong_local_no_connector",
    connector: "none_detected",
    localCoverage: [
      "oauth access token",
      "create meeting",
      "update meeting",
      "get meeting",
      "list participants",
      "delete meeting",
      "workspace-level tools for create/get/participants/delete",
      "snapshot extraction for CRM sync",
    ],
    missingForTotalCoverage: [
      "cobertura de recordings, webinars e reports alem de participants",
    ],
  },
  {
    app: "surveymonkey",
    status: "missing",
    connector: "none_detected",
    localCoverage: [],
    missingForTotalCoverage: [
      "qualquer integracao local ou connector",
      "catalogo de endpoints de surveys, collectors, responses e contacts",
    ],
  },
];

export function listHmadvEdgeFunctions(options = {}) {
  const exposure = Array.isArray(options.exposure) && options.exposure.length ? new Set(options.exposure) : null;
  const domain = typeof options.domain === "string" ? options.domain.trim() : null;
  return HMADV_EDGE_FUNCTION_CATALOG.filter((item) => {
    if (exposure && !exposure.has(item.exposure)) return false;
    if (domain && item.domain !== domain) return false;
    return true;
  });
}

export function getHmadvEdgeFunction(name) {
  return HMADV_EDGE_FUNCTION_CATALOG.find((item) => item.name === name) || null;
}

export function listExternalAppCoverage() {
  return DOTOBOT_EXTERNAL_APP_COVERAGE;
}

export function getExternalAppCoverage(app) {
  return DOTOBOT_EXTERNAL_APP_COVERAGE.find((item) => item.app === app) || null;
}
