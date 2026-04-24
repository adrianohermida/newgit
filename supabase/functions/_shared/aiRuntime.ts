import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { createSecureInsert, resolveSecureWorkspaceId } from "./secureInsert.ts";

type ServiceClient = ReturnType<typeof createClient>;

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type AiExecutionInput = {
  workspaceId: string;
  processoId?: string | null;
  prompt: string;
  systemPrompt?: string | null;
  activityType?: string | null;
  responseJsonSchema?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  model?: string | null;
  agentId?: string | null;
  conversationId?: string | null;
  fileUrls?: string[];
  provider?: string | null;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractTextFromOpenAIResponse(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => item?.text ?? item?.content ?? "")
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function extractTextFromCloudflareResponse(data: any): string {
  const directText = data?.result?.response;
  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }

  const outputText = data?.result?.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const responseText = data?.response;
  if (typeof responseText === "string" && responseText.trim()) {
    return responseText.trim();
  }

  return "";
}

function buildSchemaFallback(schema: any, prompt: string): any {
  if (!schema || typeof schema !== "object") {
    return { text: `Resposta gerada localmente para: ${prompt}` };
  }

  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      output[key] = buildSchemaFallback(value, prompt);
    }
    return output;
  }

  if (schema.type === "array") {
    return [];
  }

  if (schema.type === "number" || schema.type === "integer") {
    return 0;
  }

  if (schema.type === "boolean") {
    return false;
  }

  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  return `Resposta gerada localmente para: ${prompt.slice(0, 120)}`;
}

function normalizeJsonResponse(rawText: string, schema?: Record<string, unknown> | null) {
  if (!schema) {
    return rawText;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return buildSchemaFallback(schema, rawText);
  }
}

export async function authenticateRequest(
  serviceClient: ServiceClient,
  req: Request,
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return null;
  }

  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data.user?.id) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

export async function resolveAiWorkspace(
  serviceClient: ServiceClient,
  user: AuthenticatedUser,
  body: Record<string, unknown>,
) {
  const explicitWorkspaceId = String(body.workspace_id ?? body.workspaceId ?? "").trim() || null;
  const tenantId = String(body.tenant_id ?? body.tenantId ?? "").trim() || null;

  const conversationId = String(body.conversation_id ?? body.conversationId ?? "").trim() || null;
  if (conversationId) {
    const { data: conversation } = await serviceClient
      .from("conversas")
      .select("workspace_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversation?.workspace_id) {
      return String(conversation.workspace_id);
    }
  }

  return await resolveSecureWorkspaceId(serviceClient, {
    userId: user.id,
    userEmail: user.email,
    workspaceId: explicitWorkspaceId,
    tenantId,
  });
}

export async function ensureProcessAccess(
  serviceClient: ServiceClient,
  workspaceId: string,
  processoId?: string | null,
) {
  if (!processoId) return null;

  const { data: processo, error } = await serviceClient
    .from("processos")
    .select("id, workspace_id")
    .eq("id", processoId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!processo?.id) {
    throw new Error("processo_id does not belong to the active workspace");
  }

  return processo;
}

async function callOpenAI(input: AiExecutionInput) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = input.model || Deno.env.get("OPENAI_DEFAULT_MODEL") || "gpt-4o-mini";

  if (!apiKey) {
    const fallback = normalizeJsonResponse(
      `Resposta local indisponivel para prompt: ${input.prompt}`,
      input.responseJsonSchema,
    );

    return {
      provider: "local-fallback",
      model: "local-fallback",
      text: typeof fallback === "string" ? fallback : JSON.stringify(fallback),
      parsed: fallback,
    };
  }

  const wantsJson = Boolean(input.responseJsonSchema);
  const messages = [
    {
      role: "system",
      content: input.systemPrompt || "Voce e um assistente juridico do Lawdesk. Responda com objetividade e preserve contexto de workspace.",
    },
    {
      role: "user",
      content: wantsJson
        ? `${input.prompt}\n\nResponda em JSON valido.`
        : input.prompt,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: wantsJson ? { type: "json_object" } : undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const text = extractTextFromOpenAIResponse(data);
  const parsed = normalizeJsonResponse(text, input.responseJsonSchema);

  return {
    provider: "openai",
    model,
    text,
    parsed,
  };
}

async function callCloudflareWorkersAI(input: AiExecutionInput) {
  const apiToken = Deno.env.get("CLOUDFLARE_WORKER_API_TOKEN")
    || Deno.env.get("CLOUDFLARE_API_TOKEN");
  const accountId = Deno.env.get("CLOUDFLARE_WORKER_ACCOUNT_ID")
    || Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const model = input.model
    || Deno.env.get("CLOUDFLARE_WORKERS_AI_MODEL")
    || Deno.env.get("CLOUDFLARE_DEFAULT_MODEL")
    || "@cf/meta/llama-3.1-8b-instruct";

  if (!apiToken || !accountId) {
    throw new Error("Cloudflare Workers AI is not configured");
  }

  const wantsJson = Boolean(input.responseJsonSchema);
  const messages = [
    {
      role: "system",
      content: input.systemPrompt || "Voce e um assistente juridico do Lawdesk. Responda com objetividade e preserve contexto de workspace.",
    },
    {
      role: "user",
      content: wantsJson
        ? `${input.prompt}\n\nResponda em JSON valido.`
        : input.prompt,
    },
  ];

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens: 2048,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudflare Workers AI request failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const text = extractTextFromCloudflareResponse(data);
  const parsed = normalizeJsonResponse(text, input.responseJsonSchema);

  return {
    provider: "cloudflare",
    model,
    text,
    parsed,
  };
}

function normalizeProvider(provider: string | null | undefined) {
  const value = String(provider ?? "").trim().toLowerCase();

  if (!value) return "cloudflare";
  if (value === "cloudflare-workers-ai" || value === "workers-ai") return "cloudflare";
  return value;
}

async function executeWithDefaultProvider(input: AiExecutionInput) {
  const provider = normalizeProvider(input.provider);

  try {
    if (provider === "openai") {
      return await callOpenAI(input);
    }

    return await callCloudflareWorkersAI(input);
  } catch (primaryError) {
    if (provider !== "openai") {
      try {
        return await callOpenAI(input);
      } catch (fallbackError) {
        const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `Cloudflare Workers AI failed (${primaryMessage}); OpenAI fallback failed (${fallbackMessage})`,
        );
      }
    }

    throw primaryError;
  }
}

export async function executeAiAndPersist(
  serviceClient: ServiceClient,
  user: AuthenticatedUser,
  body: Record<string, unknown>,
  overrides: Partial<AiExecutionInput> = {},
) {
  const workspaceId = overrides.workspaceId || await resolveAiWorkspace(serviceClient, user, body);
  const secureInsert = await createSecureInsert({
    serviceClient,
    userId: user.id,
    userEmail: user.email,
    workspaceId,
    tenantId: null,
  });

  const processoId = String(
    overrides.processoId
      ?? body.processo_id
      ?? body.processoId
      ?? "",
  ).trim() || null;

  await ensureProcessAccess(serviceClient, workspaceId, processoId);

  const prompt = String(
    overrides.prompt
      ?? body.prompt
      ?? body.message
      ?? "",
  ).trim();

  if (!prompt) {
    throw new Error("prompt or message is required");
  }

  const startedAt = Date.now();
  const responseJsonSchema = overrides.responseJsonSchema
    ?? (body.response_json_schema as Record<string, unknown> | undefined)
    ?? null;

  try {
    const result = await executeWithDefaultProvider({
      workspaceId,
      processoId,
      prompt,
      systemPrompt: String(overrides.systemPrompt ?? body.system_prompt ?? "").trim() || null,
      activityType: String(overrides.activityType ?? body.activity_type ?? "llm_invoke"),
      responseJsonSchema,
      metadata: (overrides.metadata ?? body.metadata ?? {}) as Record<string, unknown>,
      model: String(overrides.model ?? body.model ?? "").trim() || null,
      agentId: String(overrides.agentId ?? body.agent_id ?? "").trim() || null,
      conversationId: String(overrides.conversationId ?? body.conversation_id ?? body.conversationId ?? "").trim() || null,
      fileUrls: Array.isArray(body.file_urls) ? body.file_urls.map(String) : [],
      provider: String(overrides.metadata?.provider ?? body.provider ?? "").trim() || null,
    });

    const latencyMs = Date.now() - startedAt;

    const log = await secureInsert("ai_activity_logs", {
      user_id: user.id,
      workspace_id: workspaceId,
      processo_id: processoId,
      prompt,
      response: result.text,
      activity_type: String(overrides.activityType ?? body.activity_type ?? "llm_invoke"),
      success: true,
      credits_used: 1,
      latency_ms: latencyMs,
      modelo: result.model,
      agent_id: String(overrides.agentId ?? body.agent_id ?? "").trim() || null,
      conversation_id: String(overrides.conversationId ?? body.conversation_id ?? body.conversationId ?? "").trim() || null,
      dados: {
        provider: result.provider,
        file_urls: Array.isArray(body.file_urls) ? body.file_urls : [],
        metadata: overrides.metadata ?? body.metadata ?? {},
      },
      actions_executed: [],
    });

    return {
      workspaceId,
      processoId,
      log,
      result,
      secureInsert,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    await secureInsert("ai_activity_logs", {
      user_id: user.id,
      workspace_id: workspaceId,
      processo_id: processoId,
      prompt,
      response: null,
      activity_type: String(overrides.activityType ?? body.activity_type ?? "llm_invoke"),
      success: false,
      error_message: (error as Error).message,
      credits_used: 0,
      latency_ms: latencyMs,
      agent_id: String(overrides.agentId ?? body.agent_id ?? "").trim() || null,
      conversation_id: String(overrides.conversationId ?? body.conversation_id ?? body.conversationId ?? "").trim() || null,
      dados: {
        metadata: overrides.metadata ?? body.metadata ?? {},
      },
      actions_executed: [],
    });

    throw error;
  }
}

export { jsonResponse };