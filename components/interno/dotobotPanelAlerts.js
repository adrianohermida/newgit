import { isBrowserLocalProvider } from "../../lib/lawdesk/browser-local-runtime";

export function buildRagAlert(health) {
  if (!health || health.status === "operational") return null;
  const signals = health.signals || {};
  if (signals.supabaseAuthMismatch) {
    return { tone: "danger", title: "RAG com falha de autenticacao no Supabase", body: "O embed do Supabase recusou a autenticacao. Confira o DOTOBOT_SUPABASE_EMBED_SECRET no app e na function dotobot-embed." };
  }
  if (signals.appEmbedSecretMissing) {
    return { tone: "warning", title: "Segredo do embed ausente", body: "O dashboard nao encontrou DOTOBOT_SUPABASE_EMBED_SECRET. Embedding e consulta vetorial podem falhar ou operar de forma superficial." };
  }
  return { tone: "warning", title: "Memoria RAG degradada", body: health.error || "Embedding, consulta vetorial ou persistencia de memoria precisam de revisao." };
}

export function buildLocalInferenceAlert({ provider, error, localStackSummary }) {
  if (!isBrowserLocalProvider(provider)) return null;
  const normalizedError = String(error || "").toLowerCase();
  if (normalizedError.includes("nao conseguiu reservar memoria suficiente")) {
    return { tone: "danger", title: "Inferência local indisponível nesta máquina", body: "O Copilot continua útil para histórico, handoff e navegação operacional, mas o modelo local não cabe na memória disponível agora.", actions: ["retry_runtime_local", "open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (normalizedError.includes("nao conseguiu concluir a inferencia no runtime configurado")) {
    return { tone: "warning", title: "Copilot local em contingência", body: "O runtime local falhou ao responder à inferência. O painel segue útil para histórico, handoff, navegação contextual e AI Task.", actions: ["retry_runtime_local", "open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (localStackSummary?.localProvider?.inferenceFailure?.message) {
    return { tone: "warning", title: "Inferência local indisponível temporariamente", body: "O último teste do runtime local falhou recentemente. O Copilot vai priorizar contingência operacional até o runtime estabilizar.", actions: ["retry_runtime_local", "open_runtime_config", "open_llm_test", "open_ai_task"] };
  }
  if (localStackSummary?.offlineMode && !localStackSummary?.localProvider?.available) {
    return { tone: "warning", title: "Runtime local ainda não respondeu", body: "O painel segue em modo offline, mas o ai-core local ainda não está pronto para responder mensagens nesta sessão.", actions: ["open_runtime_config", "abrir_diagnostico"] };
  }
  return null;
}
