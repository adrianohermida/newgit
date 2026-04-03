import { createHash } from "node:crypto";

import { buildObsidianHealthConfig, canUseObsidian, queryObsidianMemory, writeObsidianMemory } from "./obsidian.js";

function getClean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getCloudflareAccountId(env) {
  return getClean(env.CLOUDFLARE_WORKER_ACCOUNT_ID) || null;
}

function getCloudflareApiToken(env) {
  return getClean(env.CLOUDFLARE_WORKER_API_TOKEN) || null;
}

function getVectorizeIndex(env) {
  return (
    getClean(env.DOTOBOT_VECTORIZE_INDEX) ||
    getClean(env.CLOUDFLARE_VECTORIZE_INDEX) ||
    getClean(env.LAWDESK_VECTORIZE_INDEX) ||
    null
  );
}

function getEmbeddingModel(env) {
  return (
    getClean(env.DOTOBOT_EMBEDDING_MODEL) ||
    getClean(env.CLOUDFLARE_WORKERS_AI_MODEL) ||
    "@cf/baai/bge-base-en-v1.5"
  );
}

function getSupabaseEmbeddingModel(env) {
  return getClean(env.DOTOBOT_SUPABASE_EMBEDDING_MODEL) || "supabase/gte-small";
}

function getSupabaseBaseUrl(env) {
  return getClean(env.SUPABASE_URL) || getClean(env.NEXT_PUBLIC_SUPABASE_URL) || null;
}

function getSupabaseServiceKey(env) {
  return getClean(env.SUPABASE_SERVICE_ROLE_KEY) || null;
}

function getSupabaseMemoryTable(env) {
  return getClean(env.DOTOBOT_SUPABASE_MEMORY_TABLE) || "dotobot_memory_embeddings";
}

function getSupabaseEmbeddingFunction(env) {
  return getClean(env.DOTOBOT_SUPABASE_EMBED_FUNCTION) || "dotobot-embed";
}

function canUseRag(env) {
  return Boolean(getCloudflareAccountId(env) && getCloudflareApiToken(env) && getVectorizeIndex(env));
}

function canUseSupabaseRag(env) {
  return Boolean(getSupabaseBaseUrl(env) && getSupabaseServiceKey(env));
}

function buildHealthConfig(env) {
  return {
    enabled: canUseRag(env),
    accountIdConfigured: Boolean(getCloudflareAccountId(env)),
    apiTokenConfigured: Boolean(getCloudflareApiToken(env)),
    vectorizeIndex: getVectorizeIndex(env),
    embeddingModel: getEmbeddingModel(env),
  };
}

function buildSupabaseHealthConfig(env) {
  return {
    enabled: canUseSupabaseRag(env),
    baseUrlConfigured: Boolean(getSupabaseBaseUrl(env)),
    serviceKeyConfigured: Boolean(getSupabaseServiceKey(env)),
    memoryTable: getSupabaseMemoryTable(env),
    embeddingFunction: getSupabaseEmbeddingFunction(env),
    embeddingModel: getSupabaseEmbeddingModel(env),
  };
}

function buildObsidianFallbackConfig(env) {
  return buildObsidianHealthConfig(env);
}

async function runCloudflareEmbedding(env, text) {
  const accountId = getCloudflareAccountId(env);
  const apiToken = getCloudflareApiToken(env);
  const model = getEmbeddingModel(env);
  if (!accountId || !apiToken) {
    throw new Error("Workers AI embedding nao configurado.");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || `Falha no embedding Workers AI (${response.status}).`);
  }

  const embedding =
    payload?.result?.data?.[0] ||
    payload?.result?.[0] ||
    payload?.result?.embedding ||
    payload?.result;

  if (!Array.isArray(embedding)) {
    throw new Error("Workers AI nao retornou embedding vetorial valido.");
  }
  return embedding;
}

async function runSupabaseEmbedding(env, text) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServiceKey(env);
  const functionName = getSupabaseEmbeddingFunction(env);
  if (!baseUrl || !apiKey) {
    throw new Error("Supabase embedding nao configurado.");
  }

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: text, model: getSupabaseEmbeddingModel(env) }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Falha no embedding Supabase (${response.status}).`);
  }

  const embedding =
    payload?.embedding ||
    payload?.result?.embedding ||
    payload?.result?.data?.[0] ||
    payload?.result?.[0] ||
    payload?.result;

  if (!Array.isArray(embedding)) {
    throw new Error("Supabase nao retornou embedding vetorial valido.");
  }

  return embedding;
}

async function queryVectorize(env, vector, topK = 5) {
  const accountId = getCloudflareAccountId(env);
  const apiToken = getCloudflareApiToken(env);
  const indexName = getVectorizeIndex(env);
  if (!accountId || !apiToken || !indexName) {
    throw new Error("Vectorize nao configurado.");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector,
        topK,
        returnMetadata: "all",
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message || `Falha na consulta Vectorize (${response.status}).`);
  }

  const matches = payload?.result?.matches || payload?.matches || [];
  return Array.isArray(matches) ? matches : [];
}

async function upsertVectorize(env, vectorDocument) {
  const accountId = getCloudflareAccountId(env);
  const apiToken = getCloudflareApiToken(env);
  const indexName = getVectorizeIndex(env);
  if (!accountId || !apiToken || !indexName) {
    throw new Error("Vectorize nao configurado.");
  }

  const endpoints = [
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}/upsert`,
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}/insert`,
  ];

  let lastError = "Falha ao persistir vetor.";
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vectors: [vectorDocument],
      }),
    });
    if (response.ok) return;
    const payload = await response.json().catch(() => ({}));
    lastError = payload?.errors?.[0]?.message || `Falha no endpoint ${endpoint}`;
  }
  throw new Error(lastError);
}

async function supabaseRpc(env, fn, payload) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServiceKey(env);
  if (!baseUrl || !apiKey) {
    throw new Error("Supabase RAG nao configurado.");
  }

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const raw = await response.text().catch(() => "");
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      raw ||
      `Falha na RPC ${fn} (${response.status}).`;
    throw new Error(message);
  }

  return data;
}

function createMemorySourceKey({ sessionId, query, responseText, status }) {
  return createHash("sha256")
    .update([sessionId || "anonymous", query || "", responseText || "", status || "ok"].join("\u241f"))
    .digest("hex");
}

function normalizeSupabaseMatch(row) {
  return {
    id: String(row?.id || ""),
    score: typeof row?.similarity === "number" ? row.similarity : 0,
    text: String(row?.response_text || row?.summary || row?.query || ""),
    metadata: {
      ...(row?.metadata || {}),
      source: "supabase",
      source_key: row?.source_key || null,
    },
  };
}

async function querySupabaseMemory(env, vector, topK = 5) {
  if (!canUseSupabaseRag(env)) {
    return [];
  }

  const rows = await supabaseRpc(env, "match_dotobot_memory_embeddings", {
    query_embedding: vector,
    match_count: topK,
    match_threshold: null,
  });
  return Array.isArray(rows) ? rows.map(normalizeSupabaseMatch) : [];
}

async function persistSupabaseMemory(env, payload) {
  if (!canUseSupabaseRag(env)) {
    return { stored: false, skipped: true };
  }

  const row = await supabaseRpc(env, "upsert_dotobot_memory_embedding", {
    payload,
  });

  return {
    stored: Boolean(row?.id),
    row,
  };
}

export async function runDotobotRagHealth(
  env,
  {
    query = "healthcheck dotobot memory retrieval",
    includeUpsert = true,
    topK = 3,
  } = {}
) {
  const config = buildHealthConfig(env);
  const supabaseConfig = buildSupabaseHealthConfig(env);
  const obsidianConfig = buildObsidianFallbackConfig(env);
  const report = {
    timestamp: new Date().toISOString(),
    config,
    supabase: supabaseConfig,
    obsidian: {
      ...obsidianConfig,
      ok: obsidianConfig.enabled,
    },
    embedding: { ok: false },
    query: { ok: false },
    supabaseQuery: { ok: false },
    supabaseEmbedding: { ok: false },
    upsert: { ok: false, skipped: !includeUpsert },
    supabaseUpsert: { ok: false, skipped: !includeUpsert },
  };

  if (!config.enabled && !supabaseConfig.enabled && !obsidianConfig.enabled) {
    return {
      ok: false,
      report,
      error:
        "RAG Dotobot nao habilitado. Configure CLOUDFLARE_WORKER_ACCOUNT_ID, CLOUDFLARE_WORKER_API_TOKEN e DOTOBOT_VECTORIZE_INDEX/CLOUDFLARE_VECTORIZE_INDEX, ou SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY com o embed function dotobot-embed, ou DOTOBOT_OBSIDIAN_VAULT_PATH como fallback local.",
    };
  }

  try {
    if (config.enabled) {
      try {
        const embedding = await runCloudflareEmbedding(env, query);
        report.embedding = {
          ok: true,
          dimensions: embedding.length,
        };

        const matches = await queryVectorize(env, embedding, topK);
        report.query = {
          ok: true,
          requestedTopK: topK,
          matches: Array.isArray(matches) ? matches.length : 0,
        };

        if (includeUpsert) {
          await upsertVectorize(env, {
            id: `dotobot_health_${Date.now()}`,
            values: embedding,
            metadata: {
              type: "dotobot_rag_healthcheck",
              query: String(query).slice(0, 200),
              created_at: new Date().toISOString(),
            },
          });
          report.upsert = { ok: true, skipped: false };
        }
      } catch (error) {
        const message = error?.message || "Falha no healthcheck do Cloudflare RAG Dotobot.";
        if (!report.embedding.ok) {
          report.embedding.error = message;
        } else if (!report.query.ok) {
          report.query.error = message;
        } else if (includeUpsert && !report.upsert.ok) {
          report.upsert.error = message;
        }
      }
    }

    if (supabaseConfig.enabled) {
      try {
        const embedding = await runSupabaseEmbedding(env, query);
        report.supabaseEmbedding = {
          ok: true,
          dimensions: embedding.length,
        };

        const matches = await querySupabaseMemory(env, embedding, topK);
        report.supabaseQuery = {
          ok: true,
          requestedTopK: topK,
          matches: Array.isArray(matches) ? matches.length : 0,
        };

        if (includeUpsert) {
          await persistSupabaseMemory(env, {
            source_key: `dotobot_health_${Date.now()}`,
            session_id: "healthcheck",
            route: "/interno/agentlab/environment",
            role: "system",
            query: String(query).slice(0, 1200),
            response_text: "Dotobot RAG healthcheck.",
            status: "ok",
            steps_count: 0,
            embedding_model: getSupabaseEmbeddingModel(env),
            embedding_dimensions: embedding.length,
            metadata: {
              type: "dotobot_rag_healthcheck",
              provider: "supabase",
              created_at: new Date().toISOString(),
            },
            embedding,
          });
          report.supabaseUpsert = { ok: true, skipped: false };
        }
      } catch (error) {
        const message = error?.message || "Falha no healthcheck do Supabase RAG Dotobot.";
        if (!report.supabaseEmbedding.ok) {
          report.supabaseEmbedding.error = message;
        } else if (!report.supabaseQuery.ok) {
          report.supabaseQuery.error = message;
        } else if (includeUpsert && !report.supabaseUpsert.ok) {
          report.supabaseUpsert.error = message;
        }
      }
    }

    const cloudflareOk = report.embedding.ok && report.query.ok && (!includeUpsert || report.upsert.ok || report.upsert.skipped);
    const supabaseOk = report.supabaseEmbedding.ok && report.supabaseQuery.ok && (!includeUpsert || report.supabaseUpsert.ok || report.supabaseUpsert.skipped);
    const obsidianOk = report.obsidian.ok;

    if (cloudflareOk || supabaseOk || obsidianOk) {
      return { ok: true, report };
    }

    const firstError =
      report.embedding.error ||
      report.query.error ||
      report.supabaseEmbedding.error ||
      report.supabaseQuery.error ||
      report.upsert.error ||
      report.supabaseUpsert.error ||
      "Falha no healthcheck de RAG Dotobot.";
    return { ok: false, report, error: firstError };
  } catch (error) {
    const message = error?.message || "Falha no healthcheck de RAG Dotobot.";
    return { ok: false, report, error: message };
  }
}

function normalizeMatch(match) {
  const metadata = match?.metadata || {};
  const text =
    metadata.response_text ||
    metadata.summary ||
    metadata.query ||
    metadata.content ||
    "";
  return {
    id: String(match?.id || ""),
    score: typeof match?.score === "number" ? match.score : 0,
    text: String(text),
    metadata: {
      ...metadata,
      source: metadata.source || "cloudflare",
    },
  };
}

export async function retrieveDotobotRagContext(env, { query, topK = 5 } = {}) {
  if (!query || (!canUseRag(env) && !canUseSupabaseRag(env))) {
    return { enabled: false, matches: [] };
  }

  try {
    const matches = [];
    const errors = [];
    let queryUsed = false;

    if (canUseSupabaseRag(env)) {
      try {
        const supabaseEmbedding = await runSupabaseEmbedding(env, query);
        matches.push(...(await querySupabaseMemory(env, supabaseEmbedding, topK)));
        queryUsed = true;
      } catch (error) {
        errors.push(error?.message || "Falha ao recuperar memoria RAG no Supabase.");
      }
    }

    if (matches.length < topK && canUseObsidian(env)) {
      try {
        matches.push(...(await queryObsidianMemory(env, { query, topK })));
        queryUsed = true;
      } catch (error) {
        errors.push(error?.message || "Falha ao recuperar memoria RAG no Obsidian.");
      }
    }

    if (matches.length < topK && canUseRag(env)) {
      try {
        const cloudflareEmbedding = await runCloudflareEmbedding(env, query);
        matches.push(...(await queryVectorize(env, cloudflareEmbedding, topK)).map((item) => normalizeMatch(item)));
        queryUsed = true;
      } catch (error) {
        errors.push(error?.message || "Falha ao recuperar memoria RAG no Cloudflare.");
      }
    }

    const uniqueMatches = Array.from(
      new Map(
        matches.map((item) => [item.metadata?.source_key || item.id || item.text, item])
      ).values()
    ).slice(0, topK);
    return {
      enabled: queryUsed,
      matches: uniqueMatches.filter((item) => item.text),
      error: errors.length ? errors.join(" | ") : undefined,
    };
  } catch (error) {
    return {
      enabled: true,
      matches: [],
      error: error?.message || "Falha ao recuperar memoria RAG.",
    };
  }
}

export async function persistDotobotMemory(
  env,
  { sessionId, query, responseText, context = {}, status = "ok", steps = [] } = {}
) {
  if (!query || !responseText || (!canUseRag(env) && !canUseSupabaseRag(env) && !canUseObsidian(env))) {
    return { stored: false };
  }

  try {
    const content = `Pergunta: ${query}\nResposta: ${responseText}`;
    const sourceKey = createMemorySourceKey({ sessionId, query, responseText, status });
    const metadata = {
      session_id: String(sessionId || "anonymous"),
      route: String(context?.route || "/interno"),
      role: String(context?.profile?.role || ""),
      query: String(query).slice(0, 1200),
      response_text: String(responseText).slice(0, 2000),
      status: String(status),
      steps_count: Array.isArray(steps) ? steps.length : 0,
      created_at: new Date().toISOString(),
      summary: String(responseText).slice(0, 280),
    };

    const result = {
      supabase: { stored: false, skipped: !canUseSupabaseRag(env) },
      cloudflare: { stored: false, skipped: !canUseRag(env) },
      obsidian: { stored: false, skipped: !canUseObsidian(env) },
    };
    const errors = [];

    if (canUseSupabaseRag(env)) {
      try {
        const supabaseEmbedding = await runSupabaseEmbedding(env, content);
        const supabaseWrite = await persistSupabaseMemory(env, {
          source_key: sourceKey,
          session_id: String(sessionId || "anonymous"),
          route: String(context?.route || "/interno"),
          role: String(context?.profile?.role || ""),
          query: String(query).slice(0, 1200),
          response_text: String(responseText).slice(0, 2000),
          status: String(status),
          steps_count: Array.isArray(steps) ? steps.length : 0,
          embedding_model: getSupabaseEmbeddingModel(env),
          embedding_dimensions: supabaseEmbedding.length,
          metadata: {
            ...metadata,
            source: "supabase",
            source_key: sourceKey,
          },
          embedding: supabaseEmbedding,
        });

        if (supabaseWrite.stored) {
          result.supabase = { stored: true, skipped: false };
        } else if (supabaseWrite.error) {
          errors.push(supabaseWrite.error);
        }
      } catch (error) {
        errors.push(error?.message || "Falha ao persistir memoria no Supabase.");
      }
    }

    if (result.supabase.stored && canUseRag(env)) {
      try {
        const cloudflareEmbedding = await runCloudflareEmbedding(env, content);
        await upsertVectorize(env, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          values: cloudflareEmbedding,
          metadata: {
            ...metadata,
            source: "cloudflare",
            source_key: sourceKey,
          },
        });
        result.cloudflare = { stored: true, skipped: false };
      } catch (error) {
        errors.push(error?.message || "Falha ao persistir memoria no Cloudflare.");
      }
    }

    if (!result.supabase.stored && canUseObsidian(env)) {
      try {
        const obsidianWrite = await writeObsidianMemory(env, {
          ...metadata,
          source_key: sourceKey,
          fallback_reason: errors[0] || "Supabase indisponivel",
          note_type: "dotobot-memory",
          tags: ["dotobot", "rag", "fallback"],
          embedding_model: "obsidian/local",
          embedding_dimensions: 0,
        });
        if (obsidianWrite.stored) {
          result.obsidian = { stored: true, skipped: false, path: obsidianWrite.path };
        } else if (obsidianWrite.error) {
          errors.push(obsidianWrite.error);
        }
      } catch (error) {
        errors.push(error?.message || "Falha ao persistir memoria no Obsidian.");
      }
    }

    if (!result.supabase.stored && !result.obsidian.stored && canUseRag(env)) {
      try {
        const cloudflareEmbedding = await runCloudflareEmbedding(env, content);
        await upsertVectorize(env, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          values: cloudflareEmbedding,
          metadata: {
            ...metadata,
            source: "cloudflare",
            source_key: sourceKey,
          },
        });
        result.cloudflare = { stored: true, skipped: false };
      } catch (error) {
        errors.push(error?.message || "Falha ao persistir memoria no Cloudflare.");
      }
    }

    if (result.supabase.stored || result.cloudflare.stored || result.obsidian.stored) {
      return {
        stored: true,
        result,
      };
    }

    return {
      stored: false,
      result,
      error: errors.length ? errors.join(" | ") : "Falha ao persistir memoria RAG.",
    };
  } catch (error) {
    return {
      stored: false,
      error: error?.message || "Falha ao persistir memoria RAG.",
    };
  }
}
