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
  const baseUrl = getAiBaseUrl(env);
  if (!baseUrl) {
    throw new Error("PROCESS_AI_BASE nao configurado para o painel conversacional.");
  }

  const secret = getSharedSecret(env);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-shared-secret": secret } : {}),
      },
      body: JSON.stringify({
        query: payload?.query || "",
        context: payload?.context || {},
      }),
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
      throw new Error(data?.error || data?.message || `Falha da IA Lawdesk (${response.status}).`);
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

