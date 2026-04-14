export const EMPTY_FORM = { numero_cnj_pai: "", numero_cnj_filho: "", tipo_relacao: "dependencia", status: "ativo", observacoes: "" };

export const PROCESS_VIEW_ITEMS = [
  { key: "operacao", label: "Visao geral" },
  { key: "filas", label: "Prioridades" },
  { key: "relacoes", label: "Relacionamentos" },
  { key: "resultado", label: "Resultado" },
];

export const HISTORY_STORAGE_KEY = "hmadv:interno-processos:history:v1";
export const UI_STATE_STORAGE_KEY = "hmadv:interno-processos:ui:v1";
export const SNAPSHOT_STORAGE_KEY = "hmadv:interno-processos:snapshot:v1";

export const ACTION_LABELS = {
  run_sync_worker: "Atualizar integracoes",
  push_orfaos: "Criar contas comerciais",
  repair_freshsales_accounts: "Corrigir dados comerciais",
  sync_supabase_crm: "Atualizar base comercial",
  sincronizar_movimentacoes_activity: "Refletir andamentos no CRM",
  sincronizar_publicacoes_activity: "Refletir publicacoes no CRM",
  reconciliar_partes_contatos: "Reconciliar partes com contatos",
  backfill_audiencias: "Atualizar audiencias",
  auditoria_sync: "Rodar auditoria",
  enriquecer_datajud: "Atualizar dados judiciais",
  monitoramento_status: "Atualizar monitoramento",
  executar_integracao_total_hmadv: "Rodar sincronizacao completa",
  salvar_relacao: "Salvar relacionamento",
  remover_relacao: "Remover relacionamento",
  run_pending_jobs: "Avancar fila automatica",
};

export const QUEUE_ERROR_TTL_MS = 1000 * 60 * 3;
export const GLOBAL_ERROR_TTL_MS = 1000 * 60 * 2;

export const ASYNC_PROCESS_ACTIONS = new Set([
  "push_orfaos",
  "enriquecer_datajud",
  "repair_freshsales_accounts",
  "sync_supabase_crm",
  "sincronizar_movimentacoes_activity",
  "sincronizar_publicacoes_activity",
  "backfill_audiencias",
]);

export const OPERATIONAL_VIEWS = new Set(["operacao", "filas"]);
export const COVERAGE_VIEWS = new Set(["filas", "resultado"]);
export const RELATION_VIEWS = new Set(["relacoes"]);

export const QUEUE_REFRESHERS = {
  sem_movimentacoes: "sem_movimentacoes",
  movimentacoes_pendentes: "movimentacoes_pendentes",
  publicacoes_pendentes: "publicacoes_pendentes",
  partes_sem_contato: "partes_sem_contato",
  audiencias_pendentes: "audiencias_pendentes",
  monitoramento_ativo: "monitoramento_ativo",
  monitoramento_inativo: "monitoramento_inativo",
  campos_orfaos: "campos_orfaos",
};

export const QUEUE_LABELS = {
  sem_movimentacoes: "Sem atualizacoes",
  movimentacoes_pendentes: "Andamentos pendentes",
  publicacoes_pendentes: "Publicacoes pendentes",
  partes_sem_contato: "Partes sem contato",
  audiencias_pendentes: "Audiencias em aberto",
  monitoramento_ativo: "Monitoramento ativo",
  monitoramento_inativo: "Monitoramento pausado",
  campos_orfaos: "Dados incompletos",
  orfaos: "Sem conta comercial",
  cobertura: "Cobertura da carteira",
};

export const MODULE_LIMITS = {
  maxProcessBatch: 25,
  maxMovementBatch: 25,
  maxPublicationBatch: 10,
  maxPartesBatch: 30,
  maxAudienciasBatch: 10,
};

export const DEFAULT_QUEUE_BATCHES = {
  sem_movimentacoes: 5,
  movimentacoes_pendentes: 5,
  publicacoes_pendentes: 5,
  partes_sem_contato: 10,
  audiencias_pendentes: 5,
  monitoramento_ativo: 5,
  monitoramento_inativo: 5,
  campos_orfaos: 1,
  orfaos: 5,
};
