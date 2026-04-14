const { htmlSnippet } = require("./utils");

function describeAttempt(attempt, hint) {
  const details = classifyAttempt(attempt, hint);
  return { ...attempt, hint: hint || null, ...details, ...extractWarnings(attempt) };
}

function classifyAttempt(attempt, hint) {
  const raw = String(attempt?.rawSnippet || attempt?.error || "").toLowerCase();
  const errorType = String(attempt?.body?.errorType || "").toLowerCase();
  const detail = String(attempt?.body?.detail || "").toLowerCase();
  if (raw.includes("<!doctype") || raw.includes("<html")) {
    return {
      issue: "html_response",
      summary: "A URL respondeu HTML, provavelmente uma pagina web e nao uma API JSON.",
      recommendation: "Ajuste para um endpoint de API real. Ex.: ai-core em /v1/messages ou proxy que responda JSON.",
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
