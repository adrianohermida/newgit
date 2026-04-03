import { persistDotobotMemory, retrieveDotobotRagContext } from "./rag.js";

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

function getAiBaseUrl(env) {
  return getClean(env.PROCESS_AI_BASE) || getClean(env.LAWDESK_AI_BASE_URL) || null;
}

function getPythonRagBaseUrl(env) {
  return (
    getClean(env.DOTOBOT_PYTHON_API_BASE) ||
    getClean(env.LAWDESK_PYTHON_API_BASE) ||
    getClean(env.AICORE_API_BASE_URL) ||
    null
  );
}

function getSharedSecret(env) {
  return getClean(env.HMDAV_AI_SHARED_SECRET) || getClean(env.LAWDESK_AI_SHARED_SECRET) || null;
}

function getSupabaseEdgeBaseUrl(env) {
  const explicit = getClean(env.DOTOBOT_SUPABASE_EDGE_URL) || getClean(env.LAWDESK_SUPABASE_EDGE_URL);
  if (explicit) return explicit;
  const supabaseUrl = getClean(env.SUPABASE_URL);
  if (!supabaseUrl) return null;
  const functionName = getClean(env.DOTOBOT_SUPABASE_EDGE_FUNCTION) || getClean(env.LAWDESK_SUPABASE_EDGE_FUNCTION) || "dotobot-execute";
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

function getSupabaseEdgeKey(env) {
  return (
    getClean(env.DOTOBOT_SUPABASE_EDGE_KEY) ||
    getClean(env.SUPABASE_SERVICE_ROLE_KEY) ||
    getClean(env.SUPABASE_ANON_KEY) ||
    null
  );
}

function normalizeResultText(responseBody) {
  if (!responseBody) return "";
  if (typeof responseBody.result === "string") return responseBody.result;
  if (typeof responseBody.result?.message === "string") return responseBody.result.message;
  if (typeof responseBody.result?.output === "string") return responseBody.result.output;
  if (typeof responseBody.result?.final_output === "string") return responseBody.result.final_output;
  if (responseBody.result != null) return JSON.stringify(responseBody.result);
  return "";
}

function buildDotobotSystemPrompt(context = {}) {
  const assistant = context.assistant || {};
  const lines = [
    "Voce e o Dotobot, assistente interno da Hermida Maia Advocacia.",
    "Fale sempre em PT-BR, com tom profissional, calmo, objetivo e acolhedor.",
    "Ajude membros internos do escritorio com triagem, resumo de contexto, proximo passo operacional e orientacao geral.",
    "Nunca invente status processual, prazos, documentos ou resultados.",
    "Nunca prometa ganho de causa ou resultado juridico.",
    "Quando faltar informacao, faca perguntas curtas e especificas antes de concluir.",
    "Quando o tema for processual, estrategico ou sensivel, explique de forma geral e recomende validacao humana com o time responsavel.",
    "Nao use ingles nem linguagem excessivamente tecnica; prefira frases curtas e claras.",
    "Se o usuario pedir um resumo, entregue em bullets objetivos.",
    "Se houver contexto relevante do RAG ou do CRM, use-o explicitamente e deixe claro o que veio de memoria/contexto e o que e inferencia.",
  ];

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
  const primaryBaseUrl = getAiBaseUrl(env);
  const primarySecret = getSharedSecret(env);
  const edgeBaseUrl = getSupabaseEdgeBaseUrl(env);
  const edgeKey = getSupabaseEdgeKey(env);
  const pythonRagBaseUrl = getPythonRagBaseUrl(env);
  const query = payload?.query || "";
  const baseContext = payload?.context || {};
  const ragSources = [];
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
  const context = {
    ...baseContext,
    locale: baseContext.locale || "pt-BR",
    system_prompt: buildDotobotSystemPrompt(baseContext),
    assistant: {
      ...(baseContext.assistant || {}),
      system_prompt: buildDotobotSystemPrompt(baseContext),
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

  if (primaryBaseUrl) {
    try {
      const response = await invokeDotobotEndpoint(
        `${primaryBaseUrl.replace(/\/+$/, "")}/execute`,
        {
          "Content-Type": "application/json",
          ...(primarySecret ? { "x-shared-secret": primarySecret } : {}),
        },
        { query, context }
      );
      const memory = await persistDotobotMemory(env, {
        sessionId: response.sessionId,
        query,
        responseText: response.resultText,
        context: baseContext,
        status: response.status,
        steps: response.steps,
      });
      return { ...response, rag: { retrieval: ragContext, memory } };
    } catch (error) {
      errors.push(error?.message || "Falha no endpoint primario.");
    }
  }

  if (edgeBaseUrl) {
    try {
      const response = await invokeDotobotEndpoint(
        edgeBaseUrl,
        {
          "Content-Type": "application/json",
          ...(edgeKey ? { Authorization: `Bearer ${edgeKey}`, apikey: edgeKey } : {}),
        },
        { query, context }
      );
      const memory = await persistDotobotMemory(env, {
        sessionId: response.sessionId,
        query,
        responseText: response.resultText,
        context: baseContext,
        status: response.status,
        steps: response.steps,
      });
      return { ...response, rag: { retrieval: ragContext, memory } };
    } catch (error) {
      errors.push(error?.message || "Falha no fallback Supabase Edge Function.");
    }
  }

  if (!primaryBaseUrl && !edgeBaseUrl) {
    throw new Error("Nenhum backend Dotobot configurado. Defina PROCESS_AI_BASE ou DOTOBOT_SUPABASE_EDGE_URL.");
  }
  throw new Error(`Nao foi possivel executar o Dotobot. ${errors.join(" | ")}`);
}

async function invokeDotobotEndpoint(url, headers, requestBody) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
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
      throw new Error(data?.error || data?.message || `Falha da IA Dotobot (${response.status}).`);
    }

    return {
      result: data?.result ?? data,
      resultText: normalizeResultText(data),
      steps: Array.isArray(data?.steps) ? data.steps : [],
      logs: Array.isArray(data?.logs) ? data.logs : [],
      status: data?.status || "ok",
      sessionId: data?.session_id || null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
