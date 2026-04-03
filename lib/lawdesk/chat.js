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

export async function runLawdeskChat(env, payload) {
  const primaryBaseUrl = getAiBaseUrl(env);
  const primarySecret = getSharedSecret(env);
  const edgeBaseUrl = getSupabaseEdgeBaseUrl(env);
  const edgeKey = getSupabaseEdgeKey(env);
  const query = payload?.query || "";
  const baseContext = payload?.context || {};
  const ragContext = await retrieveDotobotRagContext(env, { query, topK: 6 });
  const context = {
    ...baseContext,
    rag: {
      enabled: ragContext.enabled,
      retrievalStatus: ragContext.error ? "degraded" : "ok",
      matches: ragContext.matches.map((item) => ({
        id: item.id,
        score: item.score,
        text: item.text,
      })),
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
