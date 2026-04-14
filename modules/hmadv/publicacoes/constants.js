export const PUBLICACOES_VIEW_ITEMS = [
  { key: "operacao", label: "Triagem" },
  { key: "filas", label: "Mesa" },
  { key: "resultado", label: "Execucao" },
];

export const HISTORY_STORAGE_KEY = "hmadv:interno-publicacoes:history:v1";
export const UI_STATE_STORAGE_KEY = "hmadv:interno-publicacoes:ui:v1";
export const VALIDATION_STORAGE_KEY = "hmadv:interno-publicacoes:validations:v1";

export const ACTION_LABELS = {
  criar_processos_publicacoes: "Criar processos a partir das publicacoes",
  sincronizar_publicacoes_activity: "Refletir publicacoes no CRM",
  orquestrar_drenagem_publicacoes: "Avancar fila prioritaria",
  backfill_partes: "Atualizar partes do historico",
  sincronizar_partes: "Atualizar partes e contatos",
  reconciliar_partes_contatos: "Reconciliar partes com contatos",
  run_sync_worker: "Atualizar integracoes do CRM",
  run_advise_sync: "Atualizar leitura incremental do Advise",
  run_advise_backfill: "Importar historico do Advise",
  refresh_snapshot_filas: "Atualizar visao das filas",
  run_pending_jobs: "Avancar fila automatica",
};

export const CONTACT_TYPE_OPTIONS = [
  "Cliente",
  "Parte Adversa",
  "Advogado Adverso",
  "Correspondente",
  "Terceiro Interessado",
  "Prestador de Servico",
  "Fornecedor",
  "Perito",
  "Juiz",
  "Promotor",
  "Desembargador",
  "Testemunha",
];

export const ASYNC_PUBLICACOES_ACTIONS = new Set([
  "criar_processos_publicacoes",
  "orquestrar_drenagem_publicacoes",
  "backfill_partes",
  "sincronizar_partes",
  "reconciliar_partes_contatos",
]);

export const QUEUE_ERROR_TTL_MS = 1000 * 60 * 3;
export const GLOBAL_ERROR_TTL_MS = 1000 * 60 * 2;
export const PROCESS_QUEUE_REFRESH_TTL_MS = 1000 * 8;
export const PARTES_QUEUE_REFRESH_TTL_MS = 1000 * 45;
export const PARTES_QUEUE_RESOURCE_ERROR_TTL_MS = 1000 * 90;

export const MODULE_LIMITS = {
  maxCreateProcess: 15,
  maxBackfillPartes: 50,
  maxSyncPartes: 20,
  maxSyncWorker: 2,
  maxAdviseSync: 12,
  maxDefault: 20,
};

export const PUBLICACOES_QUEUE_VIEWS = new Set(["filas"]);

export const QUEUE_LABELS = {
  candidatos_processos: "Processos disponiveis",
  candidatos_partes: "Partes disponiveis",
  mesa_integrada: "Visao integrada",
};
