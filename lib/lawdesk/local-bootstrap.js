export function buildLocalBootstrapPlan({ localStackSummary = null, ragHealth = null } = {}) {
  const obsidian = ragHealth?.report?.obsidian || {};
  const supabase = ragHealth?.report?.supabase || {};
  const extension = localStackSummary?.extensionHealth || {};
  const localProvider = localStackSummary?.localProvider || {};
  const offlineMode = Boolean(localStackSummary?.offlineMode);

  const steps = [
    {
      id: "runtime",
      title: "Subir runtime local",
      done: Boolean(localProvider.available),
      detail: localProvider.available
        ? `${localProvider.runtimeLabel || "Runtime local"} respondendo em ${localProvider.transportEndpoint || localProvider.baseUrl || "endpoint local"}.`
        : localProvider.configured
          ? localProvider.diagnosticsError || "O endpoint local foi configurado, mas ainda nao respondeu."
          : "Configure LOCAL_LLM_BASE_URL e LOCAL_LLM_MODEL para o runtime da AetherLab, Ollama ou endpoint OpenAI-compatible local.",
      action: localProvider.available ? "testar_llm_local" : "abrir_diagnostico",
    },
    {
      id: "offline_mode",
      title: "Ativar modo offline",
      done: offlineMode,
      detail: offlineMode
        ? "Cloud, web e URLs remotas estao bloqueados; o fluxo prioriza somente o provider local."
        : "Ative AICORE_OFFLINE_MODE=true para isolar a operacao local e bloquear fallback remoto.",
      action: "abrir_diagnostico",
    },
    {
      id: "obsidian",
      title: "Validar Obsidian local",
      done: Boolean(obsidian.ok && obsidian.vaultPathConfigured),
      detail: obsidian.ok && obsidian.vaultPathConfigured
        ? `Vault conectado em ${obsidian.memoryDir || obsidian.vaultPath || "Obsidian local"}.`
        : "Confirme DOTOBOT_OBSIDIAN_VAULT_PATH e a pasta de memoria local para o RAG offline primario.",
      action: "abrir_diagnostico",
    },
    {
      id: "extension",
      title: "Ligar extensao local",
      done: Boolean(extension.ok),
      detail: extension.ok
        ? `Extensao local ativa em ${extension.endpoint || localStackSummary?.extensionBaseUrl || "endpoint local"}.`
        : "Ligue a Universal LLM Extension local para automacoes e navegacao assistida em modo seguro.",
      action: "abrir_diagnostico",
    },
    {
      id: "persistence",
      title: "Persistencia offline",
      done: Boolean(supabase.baseUrlConfigured && supabase.serviceKeyConfigured),
      optional: true,
      detail:
        supabase.baseUrlConfigured && supabase.serviceKeyConfigured
          ? "Supabase configurado para persistencia estruturada local/remota."
          : "Opcional: configure Supabase local para sessoes, logs e embeddings. Sem isso, o bootstrap minimo opera com Obsidian.",
      action: "abrir_diagnostico",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  const requiredCompleted = steps.filter((step) => !step.optional && step.done).length;
  const requiredTotal = steps.filter((step) => !step.optional).length;

  return {
    completed,
    total: steps.length,
    requiredCompleted,
    requiredTotal,
    readyForOfflineCore: requiredCompleted === requiredTotal,
    steps,
  };
}
