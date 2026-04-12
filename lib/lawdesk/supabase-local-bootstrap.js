function normalizeTone(mode) {
  if (mode === "supabase_local_ready") return "success";
  if (mode === "supabase_remote_ready") return "accent";
  if (mode === "supabase_local_candidate" || mode === "supabase_partial" || mode === "supabase_local_partial") return "accent";
  return "danger";
}

function classifyPersistenceMode({ offlineMode = false, configured = false, ready = false, baseUrlKind = "unconfigured" } = {}) {
  if (!configured) return "obsidian_only";
  if (baseUrlKind === "local" && ready) return "supabase_local_ready";
  if (baseUrlKind === "local") return "supabase_local_partial";
  if (baseUrlKind === "remote" && ready) return "supabase_remote_ready";
  if (baseUrlKind === "remote") return "supabase_remote_partial";
  if (offlineMode) return ready ? "supabase_local_candidate" : "supabase_partial";
  return ready ? "supabase_remote_ready" : "supabase_partial";
}

export function buildSupabaseLocalBootstrap({ localStackSummary = null, ragHealth = null } = {}) {
  const offlineMode = Boolean(localStackSummary?.offlineMode);
  const supabase = ragHealth?.report?.supabase || {};
  const supabaseEmbedding = ragHealth?.report?.supabaseEmbedding || {};
  const supabaseQuery = ragHealth?.report?.supabaseQuery || {};
  const configured = Boolean(supabase.baseUrlConfigured && supabase.serviceKeyConfigured);
  const ready = Boolean(configured && supabaseEmbedding.ok && supabaseQuery.ok);
  const mode = classifyPersistenceMode({
    offlineMode,
    configured,
    ready,
    baseUrlKind: supabase.baseUrlKind || "unconfigured",
  });

  const summaryMap = {
    obsidian_only: {
      label: "Obsidian only",
      detail: "O fluxo offline minimo ja funciona com vault local, sem persistencia estruturada.",
    },
    supabase_local_ready: {
      label: "Supabase local pronto",
      detail: "Persistencia estruturada local confirmada para sessoes, memoria e embeddings.",
    },
    supabase_local_partial: {
      label: "Supabase local parcial",
      detail: "O endpoint local existe, mas embeddings, query ou upsert ainda precisam fechar o circuito.",
    },
    supabase_remote_ready: {
      label: "Supabase remoto ativo",
      detail: "A persistencia estruturada atual depende de um backend remoto; isso nao e offline isolado.",
    },
    supabase_remote_partial: {
      label: "Supabase remoto parcial",
      detail: "Ha dependencia remota configurada, mas a saude ainda nao fechou completamente.",
    },
    supabase_local_candidate: {
      label: "Supabase candidato local",
      detail: "O modo offline esta ativo, mas o health ainda nao conseguiu comprovar se a persistencia e local.",
    },
    supabase_partial: {
      label: "Supabase parcial",
      detail: "As variaveis de persistencia existem, mas o circuito ainda nao esta consistente.",
    },
  };

  const summary = summaryMap[mode] || summaryMap.supabase_partial;
  const shouldRecommendLocalBootstrap = !configured || mode === "supabase_remote_ready" || mode === "supabase_remote_partial";

  return {
    mode,
    tone: normalizeTone(mode),
    label: summary.label,
    detail: summary.detail,
    configured,
    ready,
    baseUrlPreview: supabase.baseUrlPreview || null,
    baseUrlHost: supabase.baseUrlHost || null,
    baseUrlKind: supabase.baseUrlKind || "unconfigured",
    sourceLabel: supabase.baseUrlSource || null,
    commands: [
      "Docker Desktop ativo",
      "npm install -g supabase",
      "supabase start",
      "Aplicar schema local e, se necessario, habilitar pgvector",
    ],
    envs: [
      "SUPABASE_URL=http://127.0.0.1:54321",
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
      "SUPABASE_SERVICE_ROLE_KEY=<service-role-local>",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-local>",
    ],
    envBlock: [
      "SUPABASE_URL=http://127.0.0.1:54321",
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
      "SUPABASE_SERVICE_ROLE_KEY=<service-role-local>",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-local>",
      "DOTOBOT_SUPABASE_EMBED_FUNCTION=dotobot-embed",
      "DOTOBOT_SUPABASE_MEMORY_TABLE=dotobot_memory_embeddings",
      "DOTOBOT_SUPABASE_EMBEDDING_MODEL=supabase/gte-small",
    ].join("\n"),
    recommendations: shouldRecommendLocalBootstrap
      ? [
          "Para offline completo, prefira Supabase local ou mantenha apenas Obsidian ate a persistencia estruturada ficar pronta.",
          "Se quiser espelhar o contrato remoto, rode `supabase start` e aponte o app para 127.0.0.1:54321.",
        ]
      : [
          "A persistencia estruturada ja esta conectada; agora vale validar schema, embeddings e historico de sessoes.",
        ],
    schema: [
      {
        id: "dotobot_memory_embeddings",
        label: "Memória vetorial",
        migration: "supabase/migrations/024_create_dotobot_memory_embeddings.sql",
        detail: "Cria tabela, HNSW e upsert da memória Dotobot com vetor 384.",
      },
      {
        id: "search_dotobot_memory_embeddings",
        label: "Busca vetorial",
        migration: "supabase/migrations/025_create_search_dotobot_memory_embeddings.sql",
        detail: "Expõe RPC search_dotobot_memory_embeddings para recuperação semântica.",
      },
      {
        id: "dotobot_task_runs",
        label: "Task runs",
        migration: "supabase/migrations/027_create_dotobot_task_runs.sql",
        detail: "Persiste runs e eventos do AI Task com RLS e índices.",
      },
      {
        id: "dotobot_embed_function",
        label: "Embedding function",
        migration: "supabase/functions/dotobot-embed/index.ts",
        detail: "Edge Function usada para gerar embeddings do circuito Supabase.",
      },
    ],
    actions: shouldRecommendLocalBootstrap
      ? ["copiar_envs_supabase_local", "open_environment", "open_runtime_config"]
      : ["copiar_envs_supabase_local", "abrir_diagnostico", "testar_llm_local"],
  };
}
