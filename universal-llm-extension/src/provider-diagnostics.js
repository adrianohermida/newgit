const { htmlSnippet } = require("./utils");

function describeAttempt(attempt, hint) {
  const details = classifyAttempt(attempt, hint);
  return { ...attempt, hint: hint || null, ...details, ...extractWarnings(attempt) };
}

function classifyAttempt(attempt, hint) {
  const raw = String(attempt?.rawSnippet || attempt?.error || "").toLowerCase();
  const errorType = String(attempt?.body?.errorType || "").toLowerCase();
  const detail = String(attempt?.body?.detail || "").toLowerCase();
  const apiErrors = Array.isArray(attempt?.body?.errors) ? attempt.body.errors : [];
  const apiMessage = String(apiErrors[0]?.message || "").toLowerCase();
  const attemptUrl = String(attempt?.url || "");
  if (raw.includes("<!doctype") || raw.includes("<html")) {
    return {
      issue: "html_response",
      summary: "A URL respondeu HTML, provavelmente uma pagina web e nao uma API JSON.",
      recommendation: "Ajuste para um endpoint de API real. Ex.: ai-core em /v1/messages ou proxy que responda JSON.",
    };
  }
  if (raw.includes("error code: 1101")) {
    return {
      issue: "cloudflare_worker_exception",
      summary: "O endpoint respondeu, mas o worker remoto falhou internamente durante o processamento.",
      recommendation: "Verifique o deploy e os logs do endpoint remoto em ai.hermidamaia.adv.br. O problema atual esta no worker/upstream, nao no painel da extensao.",
    };
  }
  if (raw.includes("timeout") || detail.includes("timed out")) {
    return {
      issue: "service_timeout",
      summary: "O servico respondeu tarde demais ou travou durante o processamento.",
      recommendation: "Verifique se o processo esta saudavel, se a rota conclui a resposta e se nao ha bloqueio por compilacao ou dependencia externa.",
    };
  }
  if (
    raw.includes("econnrefused") ||
    raw.includes("connect econnrefused") ||
    raw.includes("econnreset") ||
    raw.includes("read econnreset") ||
    raw.includes("socket hang up") ||
    raw.includes("falha de conexao")
  ) {
    return {
      issue: "service_offline",
      summary: "Nao foi possivel abrir conexao com o servico configurado.",
      recommendation: "Confirme se o processo esta rodando na porta informada e se a URL esta correta.",
    };
  }
  if (attempt?.status === 404) {
    return {
      issue: "route_not_found",
      summary: "O servidor respondeu, mas a rota esperada nao existe.",
      recommendation: "Revise a base URL. Ela deve apontar para a API correta, nao apenas para a home da aplicacao.",
    };
  }
  if (apiMessage.includes("no route for that uri")) {
    return {
      issue: "route_not_found",
      summary: "A API respondeu, mas a rota configurada nao existe para esta conta/modelo.",
      recommendation: "Revise Account ID, disponibilidade do Workers AI nesta conta e a rota direta usada para Cloudflare.",
    };
  }
  if (attempt?.status === 401 && apiErrors[0]?.code === 10000) {
    return {
      issue: "auth_failed",
      summary: "A API direta da Cloudflare rejeitou o token informado.",
      recommendation: "Revise o API Token usado pelo bridge/extensao. Se houver .dev.vars local, confirme se as credenciais persistidas no settings da extensao nao estao desatualizadas.",
    };
  }
  if (detail.includes("model") && detail.includes("not found")) {
    return {
      issue: "model_not_found",
      summary: "O servico respondeu, mas o modelo configurado nao existe neste runtime.",
      recommendation: attemptUrl.includes(":8000")
        ? "O ai-core respondeu, mas o runtime local configurado por tras dele nao tem esse modelo carregado. Revise LOCAL_LLM_MODEL e confira o catalogo exposto pelo runtime em 11434."
        : "Revise o nome do modelo configurado para este provider.",
    };
  }
  if (attempt?.status >= 500) {
    return {
      issue: "proxy_runtime_error",
      summary: "A aplicacao respondeu com erro interno ao processar o proxy do provider.",
      recommendation: "Verifique os logs do Next/app local. Se estiver usando dev server, confirme se a rota compilou sem erro.",
    };
  }
  if (attempt?.status === 401 || attempt?.status === 403 || errorType === "missing_token" || errorType === "invalid_session" || errorType === "inactive_profile") {
    return {
      issue: "auth_failed",
      summary: "O endpoint respondeu, mas exige autenticacao administrativa valida.",
      recommendation: "Preencha o token Bearer admin no painel ou use uma API direta que aceite o secret configurado.",
    };
  }
  if (raw.includes("401") || raw.includes("403") || raw.includes("unauthorized") || raw.includes("forbidden")) {
    return {
      issue: "auth_failed",
      summary: "A autenticacao falhou para o endpoint configurado.",
      recommendation: "Revise token, secret ou permissoes do provider.",
    };
  }
  return {
    issue: "unknown",
    summary: attempt?.ok ? "Conexao valida." : `Falha: ${htmlSnippet(attempt?.error || attempt?.rawSnippet || "Sem detalhes")}`,
    recommendation: hint || "Revise a URL, o modelo e a autenticacao deste provider.",
  };
}

function extractWarnings(attempt) {
  const metadata = attempt?.body?.metadata || {};
  if (metadata.degraded) {
    return {
      warning: "degraded_local_runtime",
      warningSummary: "O runtime local respondeu em modo degradado.",
      warningDetail: String(metadata.fallback_reason || "O modelo local nao conseguiu executar normalmente."),
    };
  }
  return {};
}

module.exports = {
  describeAttempt,
};
