import { isBrowserLocalProvider } from "../../lib/lawdesk/browser-local-runtime";

export function buildRagAlert(health) {
  if (!health || health.status === "operational") return null;
  const signals = health.signals || {};
  const normalizedError = String(health.error || "").toLowerCase();

  if (signals.supabaseAuthMismatch) {
    return { tone: "danger", title: "RAG com falha de autenticacao no Supabase", body: "O embed do Supabase recusou a autenticacao. Confira o DOTOBOT_SUPABASE_EMBED_SECRET no app e na function dotobot-embed." };
  }
  if (signals.appEmbedSecretMissing) {
    return { tone: "warning", title: "Segredo do embed ausente", body: "O dashboard nao encontrou DOTOBOT_SUPABASE_EMBED_SECRET. Embedding e consulta vetorial podem falhar ou operar de forma superficial." };
  }
  if (normalizedError.includes("expected 768 dimensions") || normalizedError.includes("not 384")) {
    return { tone: "danger", title: "Dimensao vetorial inconsistente no Supabase", body: "O backend principal ja opera com embeddings em 768 dimensoes, mas a persistencia do Supabase ainda espera 384. Revise a RPC upsert_dotobot_memory_embedding, a coluna vector e a function dotobot-embed para alinhar tudo em 768." };
  }
  return { tone: "warning", title: "Memoria RAG degradada", body: health.error || "Embedding, consulta vetorial ou persistencia de memoria precisam de revisao." };
}

export function buildLocalInferenceAlert({ provider, error, localStackSummary }) {
  if (!isBrowserLocalProvider(provider)) return null;
  const normalizedError = String(error || "").toLowerCase();
  const inferenceFailure = String(localStackSummary?.localProvider?.inferenceFailure?.message || "").toLowerCase();
  const combinedError = `${normalizedError} ${inferenceFailure}`.trim();

  if (normalizedError.includes("nao conseguiu reservar memoria suficiente")) {
    return { tone: "danger", title: "Inferencia local indisponivel nesta maquina", body: "O Copilot continua util para historico, handoff e navegacao operacional, mas o modelo local nao cabe na memoria disponivel agora.", actions: ["retry_runtime_local", "open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (normalizedError.includes("nao conseguiu concluir a inferencia no runtime configurado")) {
    return { tone: "warning", title: "Copilot local em contingencia", body: "O runtime local falhou ao responder a inferencia. O painel segue util para historico, handoff, navegacao contextual e AI Task.", actions: ["retry_runtime_local", "open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (combinedError.includes("base url ausente")) {
    return { tone: "danger", title: "Runtime local sem endpoint configurado", body: "Ainda falta configurar LOCAL_LLM_BASE_URL, LLM_BASE_URL, AICORE_API_BASE_URL ou equivalente para o ai-core local. Sem isso o chat local e o AI Task nao conseguem responder.", actions: ["open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (localStackSummary?.localProvider?.inferenceFailure?.message) {
    return { tone: "warning", title: "Inferencia local indisponivel temporariamente", body: "O ultimo teste do runtime local falhou recentemente. O Copilot vai priorizar contingencia operacional ate o runtime estabilizar.", actions: ["retry_runtime_local", "open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (localStackSummary?.offlineMode && !localStackSummary?.localProvider?.available) {
    return { tone: "warning", title: "Runtime local ainda nao respondeu", body: "O painel segue em modo offline, mas o ai-core local ainda nao esta pronto para responder mensagens nesta sessao.", actions: ["open_runtime_config", "abrir_diagnostico"] };
  }
  return null;
}
