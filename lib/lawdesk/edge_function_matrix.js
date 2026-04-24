import { HMADV_EDGE_FUNCTION_CATALOG } from "./platform_catalog.js";

export const HMADV_EDGE_FUNCTION_EXECUTION_MATRIX = [
  { name: "advise-ai-enricher", userFacing: true, class: "user_facing", mode: "edge_function", intent: "enrich_publications", dispatcherStatus: "routed", notes: "Enriquecimento semantico de publicacoes." },
  { name: "advise-backfill-lido", userFacing: false, class: "admin", mode: "edge_function", intent: "advise_backfill_lido", dispatcherStatus: "cataloged", notes: "Operacao administrativa de backfill." },
  { name: "advise-backfill-runner", userFacing: false, class: "admin", mode: "edge_function", intent: "advise_backfill", dispatcherStatus: "cataloged", notes: "Backfill por janelas." },
  { name: "advise-diag", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "advise_diagnostics", dispatcherStatus: "blocked_for_end_user", notes: "Diagnostico tecnico." },
  { name: "advise-drain-by-date", userFacing: false, class: "admin", mode: "edge_function", intent: "advise_drain_by_date", dispatcherStatus: "cataloged", notes: "Drenagem por periodo." },
  { name: "advise-drain-contratos", userFacing: false, class: "admin", mode: "edge_function", intent: "advise_drain_contracts", dispatcherStatus: "cataloged", notes: "Drenagem focada em contratos." },
  { name: "advise-drain-reverse", userFacing: false, class: "admin", mode: "edge_function", intent: "advise_drain_reverse", dispatcherStatus: "cataloged", notes: "Drenagem reversa." },
  { name: "advise-sync", userFacing: true, class: "user_facing", mode: "edge_function", intent: "sync_publications", dispatcherStatus: "routed", notes: "Sincronizacao incremental." },
  { name: "advise-test-params", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "advise_test_params", dispatcherStatus: "blocked_for_end_user", notes: "Teste tecnico de parametros." },
  { name: "advise-token-check", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "advise_token_check", dispatcherStatus: "blocked_for_end_user", notes: "Validacao de token." },
  { name: "agentLabDashboardProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "agentlab_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe do dashboard." },
  { name: "billing-debug", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "billing_debug", dispatcherStatus: "blocked_for_end_user", notes: "Diagnostico financeiro." },
  { name: "billing-import", userFacing: false, class: "admin", mode: "edge_function", intent: "billing_import", dispatcherStatus: "cataloged", notes: "Importacao de faturamento." },
  { name: "datajud-search", userFacing: true, class: "user_facing", mode: "edge_function", intent: "datajud_search", dispatcherStatus: "routed", notes: "Consulta e persistencia DataJud." },
  { name: "datajud-webhook", userFacing: false, class: "admin", mode: "edge_function", intent: "datajud_webhook", dispatcherStatus: "cataloged", notes: "Recepcao de payloads." },
  { name: "datajud-worker", userFacing: false, class: "admin", mode: "edge_function", intent: "datajud_worker", dispatcherStatus: "cataloged", notes: "Worker de fila judicial." },
  { name: "dotobot-embed", userFacing: false, class: "internal", mode: "internal", intent: "dotobot_embed", dispatcherStatus: "internal_only", notes: "Embeddings para memoria." },
  { name: "dotobot-slack", userFacing: true, class: "user_facing", mode: "edge_function", intent: "slack_entrypoint", dispatcherStatus: "active", notes: "Interface Slack do DotoBot." },
  { name: "fc-ingest-conversations", userFacing: true, class: "user_facing", mode: "edge_function", intent: "freshchat_ingest", dispatcherStatus: "routed", notes: "Ingestao de conversas." },
  { name: "fc-last-conversation", userFacing: true, class: "user_facing", mode: "edge_function", intent: "freshchat_last_conversation", dispatcherStatus: "routed", notes: "Ultima conversa do contato." },
  { name: "fc-update-conversation", userFacing: true, class: "user_facing", mode: "edge_function", intent: "freshchat_update_conversation", dispatcherStatus: "routed", notes: "Atualizacao de conversa." },
  { name: "freshchatAgentProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshchat_agent_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshchatAgentsInventoryProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshchat_agents_inventory_probe", dispatcherStatus: "blocked_for_end_user", notes: "Inventario tecnico de agentes." },
  { name: "freshsalesBatchSyncProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_batch_sync_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesCanonicalAdapterProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_canonical_adapter_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesEnrichedActivitiesProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_enriched_activities_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesEntityBundleProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_entity_bundle_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesEntityDetailProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_entity_detail_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesFilteredViewProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_filtered_view_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesInventoryProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_inventory_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesRecordsProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_records_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesSchemaProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_schema_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesSnapshotsReadProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_snapshots_read_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesSyncSnapshotsProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_sync_snapshots_probe", dispatcherStatus: "blocked_for_end_user", notes: "Probe tecnico." },
  { name: "freshsalesWhoamiProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_whoami_probe", dispatcherStatus: "blocked_for_end_user", notes: "Whoami tecnico." },
  { name: "freshworksAuthorizeUrlProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshworks_authorize_url_probe", dispatcherStatus: "blocked_for_end_user", notes: "OAuth tecnico." },
  { name: "freshworksOauthCallbackProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshworks_oauth_callback_probe", dispatcherStatus: "blocked_for_end_user", notes: "OAuth tecnico." },
  { name: "freshworksOauthExchangeProbe", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshworks_oauth_exchange_probe", dispatcherStatus: "blocked_for_end_user", notes: "OAuth tecnico." },
  { name: "fs-account-enricher", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_account_enrich", dispatcherStatus: "cataloged", notes: "Enriquecimento de accounts." },
  { name: "fs-account-repair", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_account_repair", dispatcherStatus: "cataloged", notes: "Reparo de accounts." },
  { name: "fs-activity-consolidate", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_activity_consolidate", dispatcherStatus: "cataloged", notes: "Consolidacao de activities." },
  { name: "fs-contacts-sync", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_contacts_sync", dispatcherStatus: "cataloged", notes: "Sincronizacao de contatos." },
  { name: "fs-fix-activities", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_fix_activities", dispatcherStatus: "cataloged", notes: "Correcao de activities." },
  { name: "fs-inspect-account", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "freshsales_inspect_account", dispatcherStatus: "blocked_for_end_user", notes: "Inspecao tecnica." },
  { name: "fs-repair-orphans", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_repair_orphans", dispatcherStatus: "cataloged", notes: "Reparo de campos orfaos." },
  { name: "fs-tag-leilao", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_tag_leilao", dispatcherStatus: "cataloged", notes: "Aplicacao de tag." },
  { name: "fs-webhook", userFacing: false, class: "admin", mode: "edge_function", intent: "freshsales_webhook", dispatcherStatus: "cataloged", notes: "Webhook do Freshsales." },
  { name: "get-fs-key", userFacing: false, class: "blocked", mode: "blocked", intent: "get_fs_key", dispatcherStatus: "blocked_for_end_user", notes: "Segredo sensivel." },
  { name: "oauth", userFacing: false, class: "admin", mode: "edge_function", intent: "freshworks_oauth", dispatcherStatus: "cataloged", notes: "Gerencia OAuth." },
  { name: "processo-sync", userFacing: true, class: "user_facing", mode: "edge_function", intent: "process_sync", dispatcherStatus: "routed", notes: "Sincronizacao bidirecional de processo." },
  { name: "publicacoes-audiencias", userFacing: true, class: "user_facing", mode: "edge_function", intent: "extract_audiencias", dispatcherStatus: "routed", notes: "Extracao de audiencias." },
  { name: "publicacoes-freshsales", userFacing: true, class: "user_facing", mode: "edge_function", intent: "sync_publications_to_crm", dispatcherStatus: "routed", notes: "Publicacoes para CRM." },
  { name: "publicacoes-prazos", userFacing: true, class: "user_facing", mode: "edge_function", intent: "calculate_deadlines", dispatcherStatus: "routed", notes: "Calculo de prazos." },
  { name: "read-secrets-temp", userFacing: false, class: "blocked", mode: "blocked", intent: "read_secrets_temp", dispatcherStatus: "blocked_for_end_user", notes: "Leitura de segredo." },
  { name: "slack-diag", userFacing: false, class: "diagnostic", mode: "diagnostic", intent: "slack_diag", dispatcherStatus: "blocked_for_end_user", notes: "Diagnostico do Slack." },
  { name: "slack-notify", userFacing: false, class: "admin", mode: "edge_function", intent: "slack_notify", dispatcherStatus: "cataloged", notes: "Envio de notificacoes." },
  { name: "sync-advise-backfill", userFacing: false, class: "legacy", mode: "legacy", intent: "legacy_advise_backfill", dispatcherStatus: "legacy_only", notes: "Fluxo legado." },
  { name: "sync-advise-publicacoes", userFacing: false, class: "legacy", mode: "legacy", intent: "legacy_advise_publications", dispatcherStatus: "legacy_only", notes: "Fluxo legado." },
  { name: "sync-advise-realtime", userFacing: false, class: "legacy", mode: "legacy", intent: "legacy_advise_realtime", dispatcherStatus: "legacy_only", notes: "Fluxo legado." },
  { name: "sync-worker", userFacing: false, class: "admin", mode: "edge_function", intent: "sync_worker", dispatcherStatus: "cataloged", notes: "Worker central de sincronizacao." },
  { name: "tpu-enricher", userFacing: true, class: "user_facing", mode: "edge_function", intent: "tpu_enrich", dispatcherStatus: "routed", notes: "Enriquecimento local TPU." },
  { name: "tpu-sync", userFacing: false, class: "admin", mode: "edge_function", intent: "tpu_sync", dispatcherStatus: "routed_admin", notes: "Sincronizacao detalhada TPU." },
];

export function listHmadvEdgeFunctionExecutionMatrix(options = {}) {
  const userFacingOnly = options.userFacingOnly === true;
  const klass = typeof options.class === "string" ? options.class.trim() : null;
  return HMADV_EDGE_FUNCTION_EXECUTION_MATRIX.filter((item) => {
    if (userFacingOnly && !item.userFacing) return false;
    if (klass && item.class !== klass) return false;
    return true;
  });
}

export function buildHmadvEdgeFunctionExecutionSummary() {
  const summary = {
    total_cataloged: HMADV_EDGE_FUNCTION_CATALOG.length,
    user_facing: 0,
    admin: 0,
    diagnostic: 0,
    blocked: 0,
    legacy: 0,
    internal: 0,
  };

  for (const item of HMADV_EDGE_FUNCTION_EXECUTION_MATRIX) {
    if (item.class === "user_facing") summary.user_facing += 1;
    if (item.class === "admin") summary.admin += 1;
    if (item.class === "diagnostic") summary.diagnostic += 1;
    if (item.class === "blocked") summary.blocked += 1;
    if (item.class === "legacy") summary.legacy += 1;
    if (item.class === "internal") summary.internal += 1;
  }

  return summary;
}

export function getHmadvEdgeFunctionExecutionEntry(name) {
  return HMADV_EDGE_FUNCTION_EXECUTION_MATRIX.find((item) => item.name === name) || null;
}
