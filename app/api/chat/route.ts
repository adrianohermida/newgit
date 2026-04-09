const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_SYSTEM_PROMPT = "Voce e um assistente juridico especializado.";

function getCleanEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getProcessAiBase(): string | null {
  return getCleanEnv("PROCESS_AI_BASE");
}

function getSharedSecret(): string | null {
  return getCleanEnv("HMDAV_AI_SHARED_SECRET");
}

function getCloudflareAccountId(): string | null {
  return getCleanEnv("CLOUDFLARE_WORKER_ACCOUNT_ID") || getCleanEnv("CLOUDFLARE_ACCOUNT_ID");
}

function getCloudflareApiToken(): string | null {
  return getCleanEnv("CLOUDFLARE_WORKER_API_TOKEN") || getCleanEnv("CLOUDFLARE_API_TOKEN");
}

function getWorkersAiModel(): string {
  return getCleanEnv("CLOUDFLARE_WORKERS_AI_MODEL") || DEFAULT_MODEL;
}

function extractTextFromResult(payload: any): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.output === "string") return payload.output;
  if (typeof payload.response === "string") return payload.response;
  if (typeof payload.result === "string") return payload.result;
  if (typeof payload.result?.message === "string") return payload.result.message;
  if (typeof payload.result?.output === "string") return payload.result.output;
  if (typeof payload.result?.final_output === "string") return payload.result.final_output;
  if (typeof payload.result?.response === "string") return payload.result.response;
  if (Array.isArray(payload.response)) {
    const joined = payload.response
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    if (joined) return joined;
  }
  return "";
}

async function parseJsonResponse(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function callProcessAiBase(message: string) {
  const baseUrl = getProcessAiBase();
  if (!baseUrl) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const sharedSecret = getSharedSecret();
  if (sharedSecret) {
    headers["x-shared-secret"] = sharedSecret;
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: message,
      context: {
        route: "app/api/chat",
        locale: "pt-BR",
        assistant: {
          role: "assistente_juridico",
          system_prompt: DEFAULT_SYSTEM_PROMPT,
        },
      },
    }),
    cache: "no-store",
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Falha no backend AI (${response.status}).`);
  }

  const content = extractTextFromResult(payload);
  if (!content) {
    throw new Error("O backend AI nao retornou texto util.");
  }

  return {
    role: "assistant",
    content,
    provider: "process_ai_base",
    raw: payload,
  };
}

async function callWorkersAiDirect(message: string) {
  const accountId = getCloudflareAccountId();
  const apiToken = getCloudflareApiToken();
  if (!accountId || !apiToken) {
    throw new Error("Workers AI nao configurado. Defina CLOUDFLARE_WORKER_ACCOUNT_ID e CLOUDFLARE_WORKER_API_TOKEN.");
  }

  const model = getWorkersAiModel();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: DEFAULT_SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
      cache: "no-store",
    }
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || payload?.error || `Falha no Workers AI (${response.status}).`);
  }

  const content = extractTextFromResult(payload?.result ?? payload);
  if (!content) {
    throw new Error("Workers AI nao retornou texto util.");
  }

  return {
    role: "assistant",
    content,
    provider: "cloudflare_workers_ai",
    raw: payload,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "Mensagem obrigatoria." }, { status: 400 });
  }

  const errors: string[] = [];

  try {
    const result = await callProcessAiBase(message);
    if (result) {
      return Response.json(result);
    }
  } catch (error: any) {
    errors.push(error?.message || "Falha no PROCESS_AI_BASE.");
  }

  try {
    const result = await callWorkersAiDirect(message);
    return Response.json(result);
  } catch (error: any) {
    errors.push(error?.message || "Falha no Workers AI.");
  }

  return Response.json(
    {
      error: "Nenhum backend de IA respondeu com sucesso.",
      details: errors,
    },
    { status: 502 }
  );
}
