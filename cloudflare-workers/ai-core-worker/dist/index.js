// src/providers.ts
async function callOpenAI(env, req) {
  const baseUrl = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = req.model || "gpt-4.1-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      max_tokens: req.max_tokens || 2048,
      temperature: req.temperature ?? 0.7
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    model: data.model || model,
    provider: "openai",
    usage: data.usage
  };
}
var HF_MODELS = [
  "Qwen/Qwen2.5-72B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
  "meta-llama/Llama-3.1-8B-Instruct"
];
async function callHuggingFace(env, req, modelIndex = 0) {
  const model = HF_MODELS[modelIndex] || HF_MODELS[0];
  const url = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.HUGGINGFACE_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      max_tokens: req.max_tokens || 1024,
      temperature: req.temperature ?? 0.7,
      stream: false
    })
  });
  if (!response.ok) {
    const err = await response.text();
    if (modelIndex + 1 < HF_MODELS.length) {
      console.warn(`HuggingFace model ${model} failed (${response.status}), trying next...`);
      return callHuggingFace(env, req, modelIndex + 1);
    }
    throw new Error(`HuggingFace error ${response.status}: ${err.slice(0, 200)}`);
  }
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    model,
    provider: "huggingface",
    usage: data.usage
  };
}
async function callCloudflareAI(env, req) {
  const model = "@cf/meta/llama-3.1-8b-instruct";
  const result = await env.AI.run(model, {
    messages: req.messages,
    max_tokens: req.max_tokens || 1024
  });
  const content = result?.response || result?.choices?.[0]?.message?.content || "";
  return {
    content,
    model,
    provider: "cloudflare"
  };
}
async function routeCompletion(env, req) {
  const errors = [];
  if (env.OPENAI_API_KEY) {
    try {
      return await callOpenAI(env, req);
    } catch (e) {
      errors.push(`OpenAI: ${e.message}`);
      console.warn("OpenAI failed, trying HuggingFace...", e.message);
    }
  }
  if (env.HUGGINGFACE_API_KEY) {
    try {
      return await callHuggingFace(env, req);
    } catch (e) {
      errors.push(`HuggingFace: ${e.message}`);
      console.warn("HuggingFace failed, trying Cloudflare AI...", e.message);
    }
  }
  try {
    return await callCloudflareAI(env, req);
  } catch (e) {
    errors.push(`Cloudflare AI: ${e.message}`);
  }
  throw new Error(`All providers failed: ${errors.join(" | ")}`);
}

// src/rag.ts
async function generateEmbedding(env, text) {
  try {
    const result = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
      text: [text]
    });
    if (result?.data?.[0]) return result.data[0];
  } catch (e) {
    console.warn("Cloudflare embedding failed, trying HuggingFace...");
  }
  if (env.HUGGINGFACE_API_KEY) {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: text })
      }
    );
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) return data;
    }
  }
  return new Array(384).fill(0);
}
async function searchMemory(env, query, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const { limit = 5, threshold = 0.7, contactId } = options;
  try {
    const embedding = await generateEmbedding(env, query);
    const filter = contactId ? `AND metadata->>'contact_id' = '${contactId}'` : "";
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_dotobot_memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit,
        filter_contact_id: contactId || null
      })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data || []).map((row) => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata || {},
      similarity: row.similarity
    }));
  } catch (e) {
    console.error("RAG search error:", e);
    return [];
  }
}
async function saveMemory(env, content, metadata = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const embedding = await generateEmbedding(env, content);
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/dotobot_memory_embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        content,
        embedding,
        metadata: { ...metadata, saved_at: (/* @__PURE__ */ new Date()).toISOString() }
      })
    });
    return response.ok;
  } catch (e) {
    console.error("RAG save error:", e);
    return false;
  }
}
function buildRagContext(memories) {
  if (!memories.length) return "";
  const items = memories.map((m, i) => `[${i + 1}] ${m.content.slice(0, 300)}`).join("\n");
  return `

## Mem\xF3ria Relevante do Sistema
${items}
`;
}

// src/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-HMADV-Secret"
};
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
function errorResponse(message, status = 500) {
  return jsonResponse({ error: message, status }, status);
}
function authenticate(request, env) {
  if (!env.HMADV_GATEWAY_SECRET) return true;
  const authHeader = request.headers.get("Authorization") || "";
  const secretHeader = request.headers.get("X-HMADV-Secret") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  return token === env.HMADV_GATEWAY_SECRET || secretHeader === env.HMADV_GATEWAY_SECRET;
}
var HMADV_SYSTEM_PROMPT = `Voc\xEA \xE9 o assistente de IA do escrit\xF3rio Hermida Maia Advocacia, coordenado pelo Dr. Adriano Menezes Hermida Maia (OAB 8894AM | 476963SP | 107048RS | 75394DF).

Suas responsabilidades incluem:
- Suporte jur\xEDdico: andamento processual, prazos, publica\xE7\xF5es, audi\xEAncias
- Gest\xE3o de clientes: agendamentos, consultas, comunica\xE7\xE3o
- Financeiro: d\xE9bitos, honor\xE1rios, faturas
- Operacional: tarefas, CRM, documentos

Sempre responda em portugu\xEAs brasileiro, de forma profissional e objetiva.
Quando n\xE3o tiver certeza sobre dados espec\xEDficos, indique claramente e sugira como obter a informa\xE7\xE3o correta.`;
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/v1/health" || path === "/health") {
      return jsonResponse({
        status: "ok",
        version: "1.0.0",
        providers: {
          openai: !!env.OPENAI_API_KEY,
          huggingface: !!env.HUGGINGFACE_API_KEY,
          cloudflare_ai: true
        },
        rag: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (path === "/v1/models") {
      return jsonResponse({
        object: "list",
        data: [
          { id: "gpt-4.1-mini", object: "model", provider: "openai" },
          { id: "Qwen/Qwen2.5-72B-Instruct", object: "model", provider: "huggingface" },
          { id: "mistralai/Mistral-7B-Instruct-v0.3", object: "model", provider: "huggingface" },
          { id: "meta-llama/Llama-3.1-8B-Instruct", object: "model", provider: "huggingface" },
          { id: "@cf/meta/llama-3.1-8b-instruct", object: "model", provider: "cloudflare" }
        ]
      });
    }
    if (request.method !== "GET" && !authenticate(request, env)) {
      return errorResponse("Unauthorized", 401);
    }
    if (request.method === "POST" && (path === "/v1/messages" || path === "/v1/chat/completions")) {
      try {
        const body = await request.json();
        const messages = body.messages || [];
        const useRag = body.use_rag !== false;
        const contactId = body.contact_id || body.metadata?.contact_id;
        const hasSystem = messages.some((m) => m.role === "system");
        if (!hasSystem) {
          messages.unshift({ role: "system", content: HMADV_SYSTEM_PROMPT });
        }
        let ragContext = "";
        if (useRag && messages.length > 0) {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          if (lastUserMsg) {
            const memories = await searchMemory(env, lastUserMsg.content, {
              limit: 5,
              threshold: 0.65,
              contactId
            });
            ragContext = buildRagContext(memories);
          }
        }
        if (ragContext) {
          const sysIdx = messages.findIndex((m) => m.role === "system");
          if (sysIdx >= 0) {
            messages[sysIdx] = {
              ...messages[sysIdx],
              content: messages[sysIdx].content + ragContext
            };
          }
        }
        const result = await routeCompletion(env, {
          messages,
          model: body.model,
          max_tokens: body.max_tokens,
          temperature: body.temperature
        });
        if (useRag && result.content) {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            await saveMemory(
              env,
              `Q: ${lastUser.content.slice(0, 200)}
A: ${result.content.slice(0, 400)}`,
              { contact_id: contactId, provider: result.provider, model: result.model }
            );
          }
        }
        return jsonResponse({
          id: `hmadv-${Date.now()}`,
          object: "chat.completion",
          model: result.model,
          provider: result.provider,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: result.content },
              finish_reason: "stop"
            }
          ],
          usage: result.usage || {}
        });
      } catch (e) {
        return errorResponse(e.message || "Completion failed");
      }
    }
    if (request.method === "POST" && path === "/v1/rag/search") {
      try {
        const body = await request.json();
        const memories = await searchMemory(env, body.query || "", {
          limit: body.limit || 10,
          threshold: body.threshold || 0.65,
          contactId: body.contact_id
        });
        return jsonResponse({ results: memories, count: memories.length });
      } catch (e) {
        return errorResponse(e.message);
      }
    }
    if (request.method === "POST" && path === "/v1/rag/save") {
      try {
        const body = await request.json();
        const ok = await saveMemory(env, body.content || "", body.metadata || {});
        return jsonResponse({ saved: ok });
      } catch (e) {
        return errorResponse(e.message);
      }
    }
    if (request.method === "POST" && path === "/v1/embeddings") {
      try {
        const body = await request.json();
        const input = Array.isArray(body.input) ? body.input : [body.input];
        const result = await env.AI.run("@cf/baai/bge-small-en-v1.5", {
          text: input
        });
        return jsonResponse({
          object: "list",
          data: (result?.data || []).map((emb, i) => ({
            object: "embedding",
            index: i,
            embedding: emb
          })),
          model: "@cf/baai/bge-small-en-v1.5"
        });
      } catch (e) {
        return errorResponse(e.message);
      }
    }
    return errorResponse("Not found", 404);
  }
};
export {
  index_default as default
};
