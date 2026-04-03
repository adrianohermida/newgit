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

function canUseRag(env) {
  return Boolean(getCloudflareAccountId(env) && getCloudflareApiToken(env) && getVectorizeIndex(env));
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

async function runWorkersAiEmbedding(env, text) {
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

export async function runDotobotRagHealth(
  env,
  {
    query = "healthcheck dotobot memory retrieval",
    includeUpsert = true,
    topK = 3,
  } = {}
) {
  const config = buildHealthConfig(env);
  const report = {
    timestamp: new Date().toISOString(),
    config,
    embedding: { ok: false },
    query: { ok: false },
    upsert: { ok: false, skipped: !includeUpsert },
  };

  if (!config.enabled) {
    return {
      ok: false,
      report,
      error:
        "RAG Dotobot nao habilitado. Configure CLOUDFLARE_WORKER_ACCOUNT_ID, CLOUDFLARE_WORKER_API_TOKEN e DOTOBOT_VECTORIZE_INDEX/CLOUDFLARE_VECTORIZE_INDEX.",
    };
  }

  try {
    const embedding = await runWorkersAiEmbedding(env, query);
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

    return { ok: true, report };
  } catch (error) {
    const message = error?.message || "Falha no healthcheck de RAG Dotobot.";
    if (!report.embedding.ok) {
      report.embedding.error = message;
    } else if (!report.query.ok) {
      report.query.error = message;
    } else if (includeUpsert && !report.upsert.ok) {
      report.upsert.error = message;
    }
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
    metadata,
  };
}

export async function retrieveDotobotRagContext(env, { query, topK = 5 } = {}) {
  if (!canUseRag(env) || !query) {
    return { enabled: false, matches: [] };
  }

  try {
    const embedding = await runWorkersAiEmbedding(env, query);
    const matches = await queryVectorize(env, embedding, topK);
    return {
      enabled: true,
      matches: matches.map(normalizeMatch).filter((item) => item.text).slice(0, topK),
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
  if (!canUseRag(env) || !query || !responseText) {
    return { stored: false };
  }

  try {
    const content = `Pergunta: ${query}\nResposta: ${responseText}`;
    const embedding = await runWorkersAiEmbedding(env, content);
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

    await upsertVectorize(env, {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      values: embedding,
      metadata,
    });
    return { stored: true };
  } catch (error) {
    return {
      stored: false,
      error: error?.message || "Falha ao persistir memoria RAG.",
    };
  }
}
