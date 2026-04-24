import { persistDotobotMemory, retrieveDotobotRagContext } from "./rag.js";
import { buildEnhancedSystemPrompt } from "./skill_registry.js";
import { buildFeatureFlags } from "./feature-flags.js";
import {
  buildLawdeskExecutionPlan,
  formatLawdeskProviderLabel,
  isLawdeskOfflineMode,
} from "./providers.js";

const DOTOBOT_TIMEOUT_MS = 45_000;
const DOTOBOT_MAX_RETRIES = 2;

function getClean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getPythonRagBaseUrl(env) {
  return (
    getClean(env.DOTOBOT_PYTHON_API_BASE) ||
    getClean(env.LAWDESK_PYTHON_API_BASE) ||
    getClean(env.AICORE_API_BASE_URL) ||
    null
  );
}

function normalizeResultText(responseBody) {
  if (!responseBody) return "";
  if (typeof responseBody.result === "string") return responseBody.result;
  if (typeof responseBody.answer === "string") return responseBody.answer;
  if (typeof responseBody.output === "string") return responseBody.output;
  if (typeof responseBody.message === "string") return responseBody.message;
  if (typeof responseBody.result?.message === "string") return responseBody.result.message;
  if (typeof responseBody.result?.answer === "string") return responseBody.result.answer;
  if (typeof responseBody.result?.output === "string") return responseBody.result.output;
  if (typeof responseBody.result?.final_output === "string") return responseBody.result.final_output;
  if (responseBody.result != null) return JSON.stringify(responseBody.result);
  return "";
}

function toExecutionResultPayload(rawResult, fallbackMessage = "") {
  if (rawResult == null) {
    return {
      kind: "empty",
      message: fallbackMessage || "Nenhuma saida produzida.",
      data: {},
    };
  }

  if (typeof rawResult === "string") {
    return {
      kind: "message",
      message: rawResult,
      data: {},
    };
  }

  const message =
    (typeof rawResult.message === "string" && rawResult.message) ||
    (typeof rawResult.output === "string" && rawResult.output) ||
    (typeof rawResult.final_output === "string" && rawResult.final_output) ||
    fallbackMessage ||
    "Saida estruturada produzida.";

  return {
    kind: "structured",
    message,
    data: { ...rawResult },
  };
}

function normalizeStepResult(step, index = 0) {
  const dependencies = Array.isArray(step?.dependencies)
    ? step.dependencies
    : Array.isArray(step?.dependsOn)
      ? step.dependsOn
      : [];

  return {
    step_id: Number(step?.step_id ?? index + 1),
    action: step?.action || step?.name || `step_${index + 1}`,
    tool: step?.tool || null,
    status: step?.status || "ok",
    attempts: Number(step?.attempts || 1),
    input: step?.input ?? null,
    output: step?.output ?? step ?? null,
    error: step?.error || null,
    dependencies,
    telemetry: step?.telemetry && typeof step.telemetry === "object" ? step.telemetry : {},
  };
}

function createTelemetryEvent(event, details = {}) {
  return {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };
}

function sanitizeDotobotReply(text, context = {}) {
  let normalized = typeof text === "string" ? text : text == null ? "" : JSON.stringify(text);
  normalized = normalized.replace(/\r\n/g, "\n").trim();

  const lines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const compact = line.trim();
      if (!compact) return true;
      if (/^DotoBot v\d/i.test(compact)) return false;
      if (/^Llama\s/i.test(compact)) return false;
      if (/^Passos:\s*/i.test(compact)) return false;
      if (/^Mem[oó]ria:\s*/i.test(compact)) return false;
      if (/^Consultou:\s*/i.test(compact)) return false;
      if (/^Tokens:\s*/i.test(compact)) return false;
      if (/^Erro interno:/i.test(compact)) return false;
      if (/^Ferramentas:\s*/i.test(compact)) return false;
      return true;
    });

  normalized = lines.join("\n").trim();

  normalized = normalized.replace(/Ainda estou trabalhando no meu primeiro passo!?/gi, "");
  normalized = normalized.replace(/Vou (come[çc]ar|prosseguir|realizar) [^.:\n]*(teste|passo|ferramenta)[^.:\n]*/gi, "");
  normalized = normalized.replace(/\n{3,}/g, "\n\n").trim();

  if (/answer\.replace is not a function/i.test(normalized)) {
    normalized = "";
  }

  if (!normalized) {
    return context.channel === "slack"
      ? "Tive um problema ao acessar essa informação agora. Posso tentar novamente ou buscar de outra forma."
      : "Tive um problema ao processar isso agora. Posso tentar novamente ou seguir por outro caminho.";
  }

  return normalized;
}

function buildChatResponse({
  response,
  ragContext,
  memory,
  query,
  context,
  logs = [],
  errors = [],
  extraTelemetry = [],
}) {
  const structuredSteps = Array.isArray(response?.steps)
    ? response.steps.map((step, index) => normalizeStepResult(step, index))
    : [];
  const telemetry = [
    createTelemetryEvent("rag_lookup", {
      query_length: String(query || "").length,
      status: ragContext?.error ? "degraded" : "ok",
      matches: Array.isArray(ragContext?.matches) ? ragContext.matches.length : 0,
      trace: Array.isArray(ragContext?.trace) ? ragContext.trace : [],
    }),
    ...extraTelemetry,
    createTelemetryEvent("memory_persist", {
      status: memory?.stored ? "ok" : "degraded",
      trace: Array.isArray(memory?.trace) ? memory.trace : [],
    }),
    createTelemetryEvent("chat_complete", {
      status: response?.status || "ok",
      session_id: response?.sessionId || null,
      provider: response?._metadata?.source || null,
    }),
  ];

  const sanitizedResultText = sanitizeDotobotReply(response?.resultText || "", context);
  const resultPayload = toExecutionResultPayload(response?.result, sanitizedResultText);

  return {
    status: response?.status || "ok",
    session_id: response?.sessionId || null,
    result: resultPayload,
    steps: structuredSteps,
    logs: Array.isArray(response?.logs) ? response.logs : logs,
    errors,
    rag: {
      retrieval: ragContext,
      memory,
    },
    telemetry,

    // Legacy compatibility for current callers.
    resultText: sanitizedResultText || resultPayload.message,
    _metadata: {
      ...(response?._metadata || {}),
      context_route: context?.route || null,
      provider: response?._metadata?.source || null,
    },
  };
}

function buildDotobotSystemPrompt(context = {}) {
  const assistant = context.assistant || {};
  const isSlack = context.channel === "slack" || context.route === "/slack/events";
  const lines = [
    "Voce e o Dotobot, assistente interno da Hermida Maia Advocacia.",
    "Fale sempre em PT-BR, com tom profissional, natural, claro, objetivo e confiavel.",
    "Seu objetivo e ajudar o usuario a obter informacoes, executar acoes e analisar dados com clareza, rapidez e precisao.",
    "Antes de responder, classifique silenciosamente a solicitacao como consulta de dados, execucao de acao, pergunta informativa ou analise complexa.",
    "Se houver dados suficientes, responda diretamente. Se houver dados parciais, responda e indique a limitacao. Se nao houver dados, diga exatamente o que falta e sugira o proximo passo.",
    "Nunca invente dados, numeros, status processual, prazos, documentos ou resultados.",
    "Nunca exponha raciocinio interno, logs, passos, tokens, memoria, ferramentas, APIs, funcoes ou bastidores tecnicos.",
    "Nunca diga apenas que nao conseguiu. Sempre explique de forma simples e ofereca alternativa util.",
    "Se ocorrer erro de execucao, tente novamente silenciosamente antes de responder.",
    "Se o erro persistir, diga apenas que houve um problema momentaneo ao acessar a informacao e ofereca nova tentativa ou outra forma de busca.",
    "Nunca se contradiga com respostas anteriores. Se ja demonstrou acesso a um tipo de dado, trate falha posterior como instabilidade momentanea, nao como incapacidade estrutural.",
    "Nunca prometa capacidade que nao esteja validada no contexto atual. Se nao tiver certeza, diga que pode tentar.",
    "Evite jargoes tecnicos sem explicacao curta.",
    "Nunca invente status processual, prazos, documentos ou resultados.",
    "Nunca prometa ganho de causa ou resultado juridico.",
    "Quando faltar informacao, faca perguntas curtas e especificas antes de concluir.",
    "Quando o tema for processual, estrategico ou sensivel, explique de forma geral e recomende validacao humana com o time responsavel.",
    "Nao use ingles nem linguagem excessivamente tecnica; prefira frases curtas e claras.",
    "Responda primeiro e explique depois, apenas se isso adicionar utilidade pratica.",
    "Para consultas numericas, use este padrao: 'Atualmente temos X [item] cadastrados no sistema.' Se fizer sentido, complemente com uma opcao de detalhamento.",
    "Para acoes concluidas, use este padrao: 'A acao foi realizada com sucesso.' ou uma confirmacao equivalente com o resultado concreto.",
    "Para erros, use este padrao: 'Tive um problema ao acessar essa informacao agora. Posso tentar novamente ou buscar de outra forma.'",
    "Para analises complexas, estruture em introducao, desenvolvimento, limitacoes e versao aprimorada, sem interromper a resposta nem reiniciar o raciocinio.",
    "Se o usuario pedir um resumo, entregue em bullets objetivos.",
    "Em temas criticos, deixe explicito que a decisao final depende de validacao humana.",
  ];

  if (isSlack) {
    lines.push("No Slack, responda de forma escaneavel e curta, de preferencia em 2 a 4 linhas, exceto quando o usuario pedir analise mais profunda.");
    lines.push("No Slack, priorize resposta imediata, objetiva e limpa, sem blocos longos desnecessarios.");
  }

  if (assistant?.persona) {
    lines.push(`Persona base: ${assistant.persona}.`);
  }
  if (assistant?.role) {
    lines.push(`Papel operacional: ${assistant.role}.`);
  }

  return lines.join(" ");
}

function normalizeRagMatch(item, source = "python") {
  if (!item || typeof item !== "object") return null;
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const text = typeof item.text === "string" ? item.text : typeof item.excerpt === "string" ? item.excerpt : "";
  if (!text) return null;
  return {
    id: String(item.id || metadata.source_key || metadata.path || text.slice(0, 48)),
    score: typeof item.score === "number" ? item.score : 0,
    text,
    metadata: {
      ...metadata,
      source: metadata.source || source,
    },
  };
}

function mergeRagContexts(...contexts) {
  const matches = [];
  const sources = {};
  const errors = [];

  for (const [index, context] of contexts.entries()) {
    if (!context) continue;
    sources[`source_${index + 1}`] = {
      enabled: Boolean(context.enabled),
      error: context.error || null,
      count: Array.isArray(context.matches) ? context.matches.length : 0,
    };
    if (context.error) {
      errors.push(context.error);
    }
    for (const match of context.matches || []) {
      const normalized = normalizeRagMatch(match, context.source || `source_${index + 1}`);
      if (normalized) {
        matches.push(normalized);
      }
    }
  }

  const deduped = Array.from(
    new Map(matches.map((item) => [item.metadata?.source_key || item.id || item.text, item])).values()
  ).sort((left, right) => right.score - left.score);

  return {
    enabled: contexts.some((context) => Boolean(context?.enabled)),
    matches: deduped,
    sources,
    error: errors.length ? errors.join(" | ") : undefined,
  };
}

async function fetchPythonRagContext(env, { query, context, topK = 6 }) {
  const baseUrl = getPythonRagBaseUrl(env);
  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/rag-context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, context, top_k: topK }),
  });

  const raw = await response.text().catch(() => "");
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Falha ao recuperar contexto RAG do Python (${response.status}).`);
  }

  return {
    enabled: Boolean(data?.enabled),
    error: data?.error || null,
    source: "python",
    matches: Array.isArray(data?.matches)
      ? data.matches.map((item) => normalizeRagMatch(item, "python")).filter(Boolean)
      : [],
    vault_path: data?.vault_path || null,
    memory_dir: data?.memory_dir || null,
  };
}

export async function runLawdeskChat(env, payload) {
  const features = buildFeatureFlags(env);
  const offlineMode = isLawdeskOfflineMode(env);
  const pythonRagBaseUrl = getPythonRagBaseUrl(env);
  const query = payload?.query || "";
  const baseContext = payload?.context || {};
  const executionPlan = buildLawdeskExecutionPlan(env, payload?.provider || baseContext?.task_run?.provider || null, {
    allowLegacyCloudflareFallback: true,
  });
  const ragSources = [];
  const telemetry = [];
  if (pythonRagBaseUrl) {
    try {
      ragSources.push(await fetchPythonRagContext(env, { query, context: baseContext, topK: 6 }));
    } catch (error) {
      ragSources.push({
        enabled: false,
        error: error?.message || "Falha ao recuperar contexto RAG do Python.",
        source: "python",
        matches: [],
      });
    }
  }

  try {
    ragSources.push(await retrieveDotobotRagContext(env, { query, topK: 6 }));
  } catch (error) {
    ragSources.push({
      enabled: false,
      error: error?.message || "Falha ao recuperar contexto RAG do backend web.",
      source: "web",
      matches: [],
    });
  }

  const ragContext = mergeRagContexts(...ragSources);
  const baseSystemPrompt = buildDotobotSystemPrompt(baseContext);
  const effectiveSkill =
    baseContext?.skill ||
    baseContext?.selectedSkill ||
    baseContext?.repositoryContext?.skill ||
    null;
  const effectivePromptEnhancement =
    baseContext?.system_prompt_enhancement ||
    baseContext?.repositoryContext?.system_prompt_enhancement ||
    "";
  const finalSystemPrompt = effectivePromptEnhancement
    ? buildEnhancedSystemPrompt(baseSystemPrompt, {
        name: effectiveSkill?.name || "Skill detectada",
        category: effectiveSkill?.category || null,
        prompt: effectivePromptEnhancement,
      })
    : baseSystemPrompt;
  const context = {
    ...baseContext,
    features,
    requested_provider: executionPlan.requestedProvider,
    available_providers: executionPlan.providers,
    locale: baseContext.locale || "pt-BR",
    system_prompt: finalSystemPrompt,
    assistant: {
      ...(baseContext.assistant || {}),
      system_prompt: finalSystemPrompt,
    },
    rag: {
      enabled: ragContext.enabled,
      retrievalStatus: ragContext.error ? "degraded" : "ok",
      matches: ragContext.matches.map((item) => ({
        id: item.id,
        score: item.score,
        text: item.text,
      })),
      sources: ragContext.sources,
    },
  };
  const errors = [];

  if (!executionPlan.plan.length) {
    const label = formatLawdeskProviderLabel(executionPlan.requestedProvider);
    if (executionPlan.blockedReason) {
      throw new Error(`${executionPlan.blockedReason} Provider solicitado: ${label}.`);
    }
    if (offlineMode) {
      throw new Error(`Modo offline ativo: o provider solicitado (${label}) nao pode executar sem internet.`);
    }
    throw new Error(`O provider selecionado (${label}) nao esta configurado no servidor.`);
  }

  for (const strategy of executionPlan.plan) {
    try {
      const response = await executeProviderStrategy(env, strategy, {
        query,
        systemPrompt: finalSystemPrompt,
        ragContext,
        context,
      });
      const memory = await persistDotobotMemory(env, {
        sessionId: response.sessionId,
        query,
        responseText: response.resultText,
        context: baseContext,
        status: response.status,
        steps: response.steps,
      });
      telemetry.push(createTelemetryEvent("backend_execute", {
        status: response.status,
        provider: response?._metadata?.source || strategy.kind,
        requested_provider: executionPlan.requestedProvider,
        model: response?._metadata?.model || null,
        duration_ms: response?._metadata?.durationMs || null,
        retries_used: response?._metadata?.retriesUsed || 0,
        fallback: Boolean(strategy.fallback),
      }));
      return buildChatResponse({
        response,
        ragContext,
        memory,
        query,
        context: baseContext,
        errors,
        extraTelemetry: telemetry,
      });
    } catch (error) {
      const errorMessage = error?.message || `Falha no provider ${strategy.kind}.`;
      errors.push(`[${strategy.kind}] ${errorMessage}`);
      telemetry.push(createTelemetryEvent("backend_execute", {
        status: "error",
        provider: strategy.kind,
        requested_provider: executionPlan.requestedProvider,
        fallback: Boolean(strategy.fallback),
        error: errorMessage,
      }));
    }
  }

  throw new Error(
    `Nao foi possivel executar o Dotobot com o provider ${formatLawdeskProviderLabel(executionPlan.requestedProvider)}. ${errors.join(" | ")}`
  );
}

async function executeProviderStrategy(env, strategy, input) {
  if (strategy.kind === "primary_api") {
    return invokePrimaryApiStrategy(strategy, input);
  }

  if (strategy.kind === "supabase_edge") {
    return invokeDotobotEndpoint(
      strategy.config.baseUrl,
      {
        "Content-Type": "application/json",
        ...(strategy.config.sharedSecret ? { "x-shared-secret": strategy.config.sharedSecret } : {}),
        ...(strategy.config.apiKey ? { Authorization: `Bearer ${strategy.config.apiKey}`, apikey: strategy.config.apiKey } : {}),
      },
      { query: input.query, context: input.context },
      "supabase_edge"
    );
  }

  if (strategy.kind === "workers_ai_direct") {
    return invokeWorkersAiDirect(env, input.query, input.systemPrompt, input.ragContext, strategy.config.model);
  }

  if (strategy.kind === "local_llm_api" || strategy.kind === "custom_llm_api") {
    return invokeCompatibleLlmApi(
      strategy.config.baseUrl,
      {
        model: strategy.config.model,
        maxTokens: strategy.config.maxTokens,
        apiKey: strategy.config.apiKey,
        authToken: strategy.config.authToken,
      },
      input,
      strategy.kind
    );
  }

  throw new Error(`Provider strategy nao suportada: ${strategy.kind}`);
}

async function invokePrimaryApiStrategy(strategy, input) {
  const baseUrl = strategy.config.baseUrl.replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    ...(strategy.config.sharedSecret ? { "x-shared-secret": strategy.config.sharedSecret } : {}),
  };
  const body = { query: input.query, context: input.context };
  const candidates = [`${baseUrl}/execute`, `${baseUrl}/v1/execute`];
  const errors = [];

  for (const candidate of candidates) {
    try {
      return await invokeDotobotEndpoint(candidate, headers, body, "primary_api");
    } catch (error) {
      const message = error?.message || `Falha ao consultar ${candidate}.`;
      errors.push(`[${candidate}] ${message}`);
      if (!/not_found|404|requested function was not found/i.test(message)) {
        throw error;
      }
    }
  }

  throw new Error(errors.join(" | "));
}

async function invokeWorkersAiDirect(env, query, systemPrompt, ragContext, explicitModel = null) {
  const model =
    explicitModel ||
    (typeof env.CLOUDFLARE_WORKERS_AI_MODEL === "string" && env.CLOUDFLARE_WORKERS_AI_MODEL.trim()) ||
    "@cf/meta/llama-3.1-8b-instruct";

  const ragSnippet =
    ragContext?.matches?.length
      ? "\n\nContexto relevante recuperado:\n" +
        ragContext.matches
          .slice(0, 4)
          .map((item, i) => `[${i + 1}] ${item.text}`)
          .join("\n\n")
      : "";

  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query + ragSnippet },
    ],
  });

  const responseText =
    typeof result?.response === "string"
      ? result.response
      : typeof result?.result === "string"
        ? result.result
        : JSON.stringify(result);

  return {
    result: {
      message: responseText,
      provider: "workers_ai_direct",
      model,
    },
    resultText: responseText,
    steps: [],
    logs: [],
    status: "ok",
    sessionId: null,
    _metadata: {
      source: "workers_ai_direct",
      model,
      requestedModel: model,
      resolvedModel: model,
    },
  };
}

function buildRagSnippet(ragContext) {
  return ragContext?.matches?.length
    ? "\n\nContexto relevante recuperado:\n" +
        ragContext.matches
          .slice(0, 4)
          .map((item, i) => `[${i + 1}] ${item.text}`)
          .join("\n\n")
    : "";
}

function summarizeHtmlProviderError(rawText, source, status) {
  const text = String(rawText || "");
  const isCloudflareWorkerError = /Worker threw exception/i.test(text) || /cf-error-code\">1101</i.test(text);
  if (!isCloudflareWorkerError) {
    return null;
  }

  const rayMatch = text.match(/Ray ID:\s*<\/strong>\s*([^<\s]+)/i) || text.match(/heading-ray-id[^>]*>\s*Ray ID:\s*([^<\s]+)/i);
  const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
  const rayId = rayMatch?.[1] || null;
  const title = titleMatch?.[1] || "Worker threw exception";
  return `Cloudflare worker exception (${status || 500}) em ${source}: ${title}${rayId ? ` | Ray ID ${rayId}` : ""}`;
}

function extractCompatibleLlmResponse(data) {
  const contentBlocks = Array.isArray(data?.content) ? data.content : [];
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const text = contentBlocks
    .filter((item) => item?.type === "text" && typeof item?.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();

  if (text) {
    return {
      text,
      model: data?.model || null,
      resolvedModel: metadata?.resolved_model || null,
      requestedModel: metadata?.requested_model || data?.model || null,
    };
  }

  if (typeof data?.result === "string") {
    return {
      text: data.result,
      model: data?.model || null,
      resolvedModel: metadata?.resolved_model || null,
      requestedModel: metadata?.requested_model || data?.model || null,
    };
  }

  if (typeof data?.message === "string") {
    return {
      text: data.message,
      model: data?.model || null,
      resolvedModel: metadata?.resolved_model || null,
      requestedModel: metadata?.requested_model || data?.model || null,
    };
  }

  return {
    text: JSON.stringify(data),
    model: data?.model || null,
    resolvedModel: metadata?.resolved_model || null,
    requestedModel: metadata?.requested_model || data?.model || null,
  };
}

async function invokeCompatibleLlmApi(baseUrl, authConfig, input, source) {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
  const ragSnippet = buildRagSnippet(input.ragContext);
  const startedAt = Date.now();
  const headers = {
    "Content-Type": "application/json",
    "x-llm-version": "2023-06-01",
    ...(authConfig.apiKey ? { "x-api-key": authConfig.apiKey } : {}),
    ...(authConfig.authToken ? { Authorization: `Bearer ${authConfig.authToken}` } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: authConfig.model,
      max_tokens: authConfig.maxTokens || 1400,
      system: input.systemPrompt,
      stream: false,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${input.query}${ragSnippet}` }],
        },
      ],
    }),
  });

  const rawText = await response.text().catch(() => "");
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        summarizeHtmlProviderError(rawText, source, response.status) ||
        `Falha no provider ${source} (${response.status}).`
    );
  }

  const compatible = extractCompatibleLlmResponse(data);
  return {
    result: {
      message: compatible.text,
      provider: source,
      model: compatible.requestedModel || compatible.model || authConfig.model,
    },
    resultText: compatible.text,
    steps: [],
    logs: [],
    status: "ok",
    sessionId: null,
    _metadata: {
      source,
      model: compatible.requestedModel || compatible.model || authConfig.model,
      requestedModel: compatible.requestedModel || compatible.model || authConfig.model,
      resolvedModel: compatible.resolvedModel || compatible.model || authConfig.model,
      durationMs: Date.now() - startedAt,
      retriesUsed: 0,
    },
  };
}

async function invokeDotobotEndpoint(
  url,
  headers,
  requestBody,
  source = "http_backend",
  maxRetries = DOTOBOT_MAX_RETRIES,
  timeoutMs = DOTOBOT_TIMEOUT_MS
) {
  let lastError = null;
  const startedAt = Date.now();
  let retriesUsed = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        const rawText = await response.text().catch(() => "");
        let data = {};
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = { raw: rawText };
          }
        }

        if (!response.ok) {
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = new Error(`HTTP ${response.status}: ${data?.error || data?.message || "Erro servidor"}`);
            retriesUsed = attempt + 1;
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
          throw new Error(data?.error || data?.message || `Falha da IA Dotobot (${response.status}).`);
        }

        return {
          result: data?.result ?? data,
          resultText: normalizeResultText(data),
          steps: Array.isArray(data?.steps) ? data.steps : [],
          logs: Array.isArray(data?.logs) ? data.logs : [],
          status: data?.status || "ok",
          sessionId: data?.session_id || null,
          _metadata: {
            source,
            retriesUsed,
            durationMs: Date.now() - startedAt,
            requestedModel: data?.model || null,
            resolvedModel: data?.resolved_model || data?.model || null,
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error;
      if ((error?.name === "AbortError" || error?.message?.includes("fetch")) && attempt < maxRetries) {
        retriesUsed = attempt + 1;
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Falha ao executar Dotobot após retries.");
}
