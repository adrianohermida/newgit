const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const nodeCrypto = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL, fileURLToPath } = require("node:url");

const moduleCache = new Map();
const tests = [];

function registerTest(name, fn) {
  tests.push({ name, fn });
}

async function loadEsmModule(entryPath) {
  const absolutePath = path.resolve(entryPath);
  const identifier = pathToFileURL(absolutePath).href;
  if (moduleCache.has(identifier)) {
    return moduleCache.get(identifier);
  }

  const source = await fs.readFile(absolutePath, "utf8");
  const module = new vm.SourceTextModule(source, {
    identifier,
    initializeImportMeta(meta) {
      meta.url = identifier;
    },
    importModuleDynamically: async (specifier, referencingModule) => {
      const child = await loadResolvedModule(specifier, referencingModule.identifier);
      await evaluateModule(child);
      return child;
    },
  });

  moduleCache.set(identifier, module);
  await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier));
  return module;
}

async function loadResolvedModule(specifier, parentIdentifier) {
  if (specifier.startsWith("node:")) {
    return createBuiltinModule(specifier);
  }
  if (!specifier.startsWith(".")) {
    throw new Error(`Unsupported external import in test loader: ${specifier}`);
  }
  const parentPath = fileURLToPath(parentIdentifier);
  const resolvedPath = path.resolve(path.dirname(parentPath), specifier);
  return loadEsmModule(resolvedPath);
}

function createBuiltinModule(specifier) {
  if (moduleCache.has(specifier)) {
    return moduleCache.get(specifier);
  }

  const requiredModule =
    specifier === "node:fs/promises"
      ? fs
      : specifier === "node:path"
        ? path
        : specifier === "node:crypto"
          ? nodeCrypto
          : null;

  if (!requiredModule) {
    throw new Error(`Unsupported built-in import in test loader: ${specifier}`);
  }

  const exportNames = Object.keys(requiredModule);
  const synthetic = new vm.SyntheticModule([...exportNames, "default"], function () {
    for (const key of exportNames) {
      this.setExport(key, requiredModule[key]);
    }
    this.setExport("default", requiredModule);
  }, { identifier: specifier });

  moduleCache.set(specifier, synthetic);
  return synthetic;
}

async function evaluateModule(module) {
  if (module.status === "unlinked") {
    await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier));
  }
  if (module.status !== "evaluated") {
    await module.evaluate();
  }
  return module;
}

async function loadLawdeskModules() {
  const chatModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/chat.js"));
  const ragModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/rag.js"));
  const obsidianModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/obsidian.js"));
  const providersModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/providers.js"));
  return {
    runLawdeskChat: chatModule.namespace.runLawdeskChat,
    runLawdeskProvidersHealth: providersModule.namespace.runLawdeskProvidersHealth,
    persistDotobotMemory: ragModule.namespace.persistDotobotMemory,
    retrieveDotobotRagContext: ragModule.namespace.retrieveDotobotRagContext,
    runDotobotRagHealth: ragModule.namespace.runDotobotRagHealth,
    queryObsidianMemory: obsidianModule.namespace.queryObsidianMemory,
    writeObsidianMemory: obsidianModule.namespace.writeObsidianMemory,
  };
}

registerTest("retrieveDotobotRagContext returns disabled when no providers are configured", async () => {
  const { retrieveDotobotRagContext } = await loadLawdeskModules();
  const result = await retrieveDotobotRagContext({}, { query: "teste", topK: 3 });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.trace, []);
  assert.deepEqual(result.providers, {});
});

registerTest("persistDotobotMemory skips persistence when no providers are configured", async () => {
  const { persistDotobotMemory } = await loadLawdeskModules();
  const result = await persistDotobotMemory({}, {
    sessionId: "session-1",
    query: "Qual o status?",
    responseText: "Ainda sem contexto persistente.",
  });
  assert.equal(result.stored, false);
});

registerTest("runDotobotRagHealth reports disabled providers when no backend is configured", async () => {
  const { runDotobotRagHealth } = await loadLawdeskModules();
  const result = await runDotobotRagHealth({}, { includeUpsert: false });
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.match(result.error, /RAG Dotobot nao habilitado/i);
  assert.ok(Array.isArray(result.recommendations));
  assert.ok(result.recommendations.length >= 1);
});

registerTest("runDotobotRagHealth reports degraded when only Obsidian fallback is configured", async () => {
  const { runDotobotRagHealth, writeObsidianMemory } = await loadLawdeskModules();
  const tempDir = path.join("D:/Github/newgit", ".tmp-dotobot-health-obsidian");

  await fs.rm(tempDir, { recursive: true, force: true });

  try {
    const env = { DOTOBOT_OBSIDIAN_VAULT_PATH: tempDir };
    await writeObsidianMemory(env, {
      source_key: "health-note",
      query: "Saude do fallback",
      responseText: "Nota local para validar o fallback.",
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
    });

    const result = await runDotobotRagHealth(env, { includeUpsert: false, query: "fallback local" });
    assert.equal(result.ok, false);
    assert.equal(result.available, true);
    assert.equal(result.status, "degraded");
    assert.equal(result.report.obsidian.ok, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

registerTest("retrieveDotobotRagContext offline ignores remote backends and uses Obsidian local only", async () => {
  const { retrieveDotobotRagContext, writeObsidianMemory } = await loadLawdeskModules();
  const tempDir = path.join("D:/Github/newgit", ".tmp-dotobot-offline-rag");
  const originalFetch = globalThis.fetch;

  await fs.rm(tempDir, { recursive: true, force: true });
  globalThis.fetch = async (url) => {
    throw new Error(`Offline mode should not call remote fetch: ${url}`);
  };

  try {
    const env = {
      AICORE_OFFLINE_MODE: "true",
      DOTOBOT_OBSIDIAN_VAULT_PATH: tempDir,
      CLOUDFLARE_WORKER_ACCOUNT_ID: "acct",
      CLOUDFLARE_WORKER_API_TOKEN: "token",
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    };

    await writeObsidianMemory(env, {
      source_key: "offline-note",
      query: "rotina offline",
      responseText: "Memória local do vault para operação sem internet.",
      created_at: "2026-04-12T00:00:00.000Z",
      updated_at: "2026-04-12T00:00:00.000Z",
    });

    const result = await retrieveDotobotRagContext(env, { query: "operação sem internet", topK: 3 });
    assert.equal(result.enabled, true);
    assert.ok(result.matches.length >= 1);
    assert.equal(result.providers.obsidian, "ok");
    assert.equal(result.providers.cloudflare, undefined);
    assert.equal(result.providers.supabase, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

registerTest("persistDotobotMemory offline stores in Obsidian without remote fetch", async () => {
  const { persistDotobotMemory } = await loadLawdeskModules();
  const tempDir = path.join("D:/Github/newgit", ".tmp-dotobot-offline-persist");
  const originalFetch = globalThis.fetch;

  await fs.rm(tempDir, { recursive: true, force: true });
  globalThis.fetch = async (url) => {
    throw new Error(`Offline mode should not call remote fetch: ${url}`);
  };

  try {
    const env = {
      AICORE_OFFLINE_MODE: "true",
      DOTOBOT_OBSIDIAN_VAULT_PATH: tempDir,
      CLOUDFLARE_WORKER_ACCOUNT_ID: "acct",
      CLOUDFLARE_WORKER_API_TOKEN: "token",
      SUPABASE_URL: "https://supabase.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    };

    const result = await persistDotobotMemory(env, {
      sessionId: "offline-session",
      query: "Executar missão local",
      responseText: "Missão persistida apenas no vault local.",
      context: { route: "/interno/ai-task" },
      status: "ok",
      steps: [],
    });

    assert.equal(result.stored, true);
    assert.equal(result.result.obsidian.stored, true);
    assert.equal(result.result.supabase.stored, false);
    assert.equal(result.result.cloudflare.stored, false);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

registerTest("runDotobotRagHealth offline with Obsidian skips Supabase embed and still reports local fallback", async () => {
  const { runDotobotRagHealth, writeObsidianMemory } = await loadLawdeskModules();
  const tempDir = path.join("D:/Github/newgit", ".tmp-dotobot-offline-health-primary");
  const originalFetch = globalThis.fetch;

  await fs.rm(tempDir, { recursive: true, force: true });
  globalThis.fetch = async (url) => {
    if (String(url).includes("/rest/v1/rpc/search_dotobot_memory_embeddings")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Offline Obsidian primary should not call remote embedding: ${url}`);
  };

  try {
    const env = {
      AICORE_OFFLINE_MODE: "true",
      DOTOBOT_OBSIDIAN_VAULT_PATH: tempDir,
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    };

    await writeObsidianMemory(env, {
      source_key: "offline-health-note",
      query: "saude local",
      responseText: "Fallback local do Obsidian ativo.",
      created_at: "2026-04-13T00:00:00.000Z",
      updated_at: "2026-04-13T00:00:00.000Z",
    });

    const result = await runDotobotRagHealth(env, { includeUpsert: true, query: "fallback local", topK: 2 });
    assert.equal(result.available, true);
    assert.equal(result.status, "degraded");
    assert.equal(result.report.obsidian.ok, true);
    assert.equal(result.report.supabaseEmbedding.skipped, true);
    assert.equal(result.report.supabaseEmbedding.reason, "offline_obsidian_primary");
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

registerTest("runDotobotRagHealth exposes Supabase auth mismatch signals and recommendations", async () => {
  const { runDotobotRagHealth } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;
  const env = {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  };

  globalThis.fetch = async (url) => {
    if (String(url).includes("/functions/v1/")) {
      return new Response(JSON.stringify({ error: "Authentication error" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call during auth mismatch test: ${url}`);
  };

  try {
    const result = await runDotobotRagHealth(env, { includeUpsert: true, query: "validar auth" });
    assert.equal(result.status, "failed");
    assert.equal(result.signals.appEmbedSecretMissing, true);
    assert.equal(result.signals.supabaseAuthMismatch, true);
    assert.match(result.report.supabaseEmbedding.error, /DOTOBOT_SUPABASE_EMBED_SECRET/i);
    assert.ok(result.recommendations.some((item) => /DOTOBOT_SUPABASE_EMBED_SECRET/i.test(item)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runDotobotRagHealth accepts HMADV_AI_SHARED_SECRET as embed secret alias", async () => {
  const { runDotobotRagHealth } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;
  const env = {
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    HMADV_AI_SHARED_SECRET: "shared-secret-ok",
  };

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/functions/v1/")) {
      assert.equal(options.headers["x-dotobot-embed-secret"], "shared-secret-ok");
      return new Response(JSON.stringify({ embedding: [0.12, 0.34, 0.56] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (String(url).includes("/rest/v1/rpc/")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call during HMADV alias test: ${url}`);
  };

  try {
    const result = await runDotobotRagHealth(env, { includeUpsert: false, query: "alias HMADV" });
    assert.equal(result.report.supabaseEmbedding.ok, true);
    assert.equal(result.signals.appEmbedSecretMissing, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskChat falls back to Workers AI direct execution", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const env = {
    AI: {
      async run(model, payload) {
        assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
        assert.equal(payload.messages[1].role, "user");
        return { response: "Resposta do fallback local." };
      },
    },
  };

  const result = await runLawdeskChat(env, {
    query: "Resuma o caso",
    context: { route: "/interno/processos" },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.result.kind, "structured");
  assert.equal(result.result.message, "Resposta do fallback local.");
  assert.equal(result.resultText, "Resposta do fallback local.");
  assert.equal(result._metadata.source, "workers_ai_direct");
  assert.equal(result.rag.retrieval.enabled, false);
  assert.ok(Array.isArray(result.telemetry));
  assert.equal(result.telemetry.at(-1).event, "chat_complete");
});

registerTest("runLawdeskChat retries transient primary backend failures", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: "temporary failure" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        status: "ok",
        result: { message: "Resposta do backend primario." },
        session_id: "session-primary",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    const result = await runLawdeskChat(
      { PROCESS_AI_BASE: "https://ai.example.test" },
      { query: "Gerar resumo", context: { route: "/interno" } }
    );

    assert.equal(calls.length, 2);
    assert.equal(result.status, "ok");
    assert.equal(result.result.kind, "structured");
    assert.equal(result.result.message, "Resposta do backend primario.");
    assert.equal(result.resultText, "Resposta do backend primario.");
    assert.equal(result._metadata.source, "primary_api");
    assert.equal(result._metadata.retriesUsed, 1);
    assert.ok(result.telemetry.some((item) => item.event === "backend_execute" && item.provider === "primary_api"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskChat uses local provider when LLM_BASE_URL is configured", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({
        id: "msg_local_1",
        type: "message",
        role: "assistant",
        model: "hermida-local-14b",
        content: [{ type: "text", text: "Resposta da LLM local." }],
        usage: { input_tokens: 12, output_tokens: 18 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    const result = await runLawdeskChat(
      {
        LLM_BASE_URL: "http://127.0.0.1:8000",
        LLM_API_KEY: "local-secret",
        LLM_MODEL: "hermida-local-14b",
      },
      {
        query: "Resuma a estratégia",
        provider: "local",
        context: { route: "/interno/ai-task" },
      }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8000/v1/messages");
    assert.equal(result.status, "ok");
    assert.equal(result.result.message, "Resposta da LLM local.");
    assert.equal(result._metadata.source, "local_llm_api");
    assert.equal(result._metadata.model, "hermida-local-14b");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskChat allows custom provider to reuse primary worker with shared secret bearer", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({
        id: "msg_custom_1",
        type: "message",
        role: "assistant",
        model: "aetherlab-legal-v1",
        metadata: {
          requested_model: "aetherlab-legal-v1",
          resolved_model: "@cf/meta/llama-3.1-8b-instruct",
        },
        content: [{ type: "text", text: "Resposta do endpoint custom." }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    const result = await runLawdeskChat(
      {
        PROCESS_AI_BASE: "https://ai.hermidamaia.adv.br",
        HMDAV_AI_SHARED_SECRET: "shared-secret",
        CUSTOM_LLM_MODEL: "aetherlab-legal-v1",
      },
      {
        query: "Use o modelo custom",
        provider: "custom",
        context: { route: "/llm-test" },
      }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ai.hermidamaia.adv.br/v1/messages");
    assert.equal(calls[0].options.headers.Authorization, "Bearer shared-secret");
    assert.equal(result.status, "ok");
    assert.equal(result.result.message, "Resposta do endpoint custom.");
    assert.equal(result._metadata.source, "custom_llm_api");
    assert.equal(result._metadata.model, "aetherlab-legal-v1");
    assert.equal(result._metadata.resolvedModel, "@cf/meta/llama-3.1-8b-instruct");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskChat prefixes failures with provider strategy for clearer diagnostics", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url) === "https://ai.example.test/execute" || String(url) === "https://ai.example.test/v1/execute") {
      return new Response(JSON.stringify({ error: "Requested function was not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (String(url).includes("/functions/v1/dotobot-execute")) {
      return new Response(JSON.stringify({ error: "Function not deployed" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unexpected" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () => runLawdeskChat(
        {
          PROCESS_AI_BASE: "https://ai.example.test",
          SUPABASE_URL: "https://supabase.example.test",
          SUPABASE_SERVICE_ROLE_KEY: "service-role",
        },
        { query: "Diagnostique", context: { route: "/llm-test" } }
      ),
      /\[primary_api\].*Requested function was not found.*\[supabase_edge\].*Function not deployed/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskChat honors explicit cloudflare provider", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  let calls = 0;
  const env = {
    AI: {
      async run(model, payload) {
        calls += 1;
        assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
        assert.equal(payload.messages[0].role, "system");
        return { response: "Resposta Cloudflare explícita." };
      },
    },
  };

  const result = await runLawdeskChat(env, {
    query: "Liste os próximos passos",
    provider: "cloudflare",
    context: { route: "/interno/dotobot" },
  });

  assert.equal(calls, 1);
  assert.equal(result.result.message, "Resposta Cloudflare explícita.");
  assert.equal(result._metadata.source, "workers_ai_direct");
});

registerTest("runLawdeskChat answers current date through direct dispatcher before provider execution", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  let aiCalls = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error("Date intent should not call fetch in runLawdeskChat");
  };

  try {
    const result = await runLawdeskChat(
      {
        AI: {
          async run() {
            aiCalls += 1;
            return { response: "Isto nao deveria ser usado." };
          },
        },
      },
      {
        query: "que dia é hoje?",
        provider: "cloudflare",
        context: { route: "/interno/dotobot", channel: "slack" },
      }
    );

    assert.equal(aiCalls, 0);
    assert.equal(result.status, "ok");
    assert.equal(result._metadata.source, "direct_tool_router");
    assert.equal(result._metadata.provider, "direct_tool_router");
    assert.match(result.result.message, /Hoje e /);
    assert.equal(result.steps[0].output.title, "current_date");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskChat dispatches DataJud intent before provider execution", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  let aiCalls = 0;
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options });

    if (href.includes("/functions/v1/datajud-search")) {
      return new Response(
        JSON.stringify({
          processo_id: "proc-123",
          numero_cnj: "1234567-89.2024.8.26.0100",
          movimentos_persistidos: 9,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await runLawdeskChat(
      {
        SUPABASE_URL: "https://sspvizogbcyigquqycsz.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_value",
        AI: {
          async run() {
            aiCalls += 1;
            return { response: "Isto nao deveria ser usado." };
          },
        },
      },
      {
        query: "buscar processo no datajud 1234567-89.2024.8.26.0100",
        provider: "cloudflare",
        context: { route: "/interno/dotobot" },
      }
    );

    assert.equal(aiCalls, 0);
    assert.equal(result.status, "ok");
    assert.equal(result._metadata.source, "direct_tool_router");
    assert.equal(result.steps[0].output.title, "datajud_search");
    assert.match(result.result.message, /Consulta DataJud concluida/i);
    assert.ok(calls.some((item) => item.url.includes("/functions/v1/datajud-search")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskProvidersHealth reports local provider operational when compatible endpoint responds", async () => {
  const { runLawdeskProvidersHealth } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url) === "http://127.0.0.1:8000/v1/messages") {
      return new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "hermida-local-14b",
          content: [{ type: "text", text: "pong" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true, model: "gpt-4.1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await runLawdeskProvidersHealth({
      LLM_BASE_URL: "http://127.0.0.1:8000",
      LLM_MODEL: "hermida-local-14b",
    });
    const local = result.providers.find((item) => item.id === "local");
    assert.equal(local.status, "operational");
    assert.equal(local.available, true);
    assert.equal(local.model, "hermida-local-14b");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskProvidersHealth reports cloudflare operational when AI binding exists", async () => {
  const { runLawdeskProvidersHealth } = await loadLawdeskModules();
  const result = await runLawdeskProvidersHealth({
    AI: {
      async run() {
        return { response: "ok" };
      },
    },
  });
  const cloudflare = result.providers.find((item) => item.id === "cloudflare");
  assert.equal(cloudflare.status, "operational");
  assert.equal(cloudflare.available, true);
});

registerTest("queryObsidianMemory respects configured index limit", async () => {
  const { queryObsidianMemory, writeObsidianMemory } = await loadLawdeskModules();
  const tempDir = path.join("D:/Github/newgit", ".tmp-dotobot-obsidian-test");
  const originalLimit = process.env.DOTOBOT_OBSIDIAN_RAG_MAX_FILES;

  await fs.rm(tempDir, { recursive: true, force: true });
  process.env.DOTOBOT_OBSIDIAN_RAG_MAX_FILES = "1";

  try {
    const env = { DOTOBOT_OBSIDIAN_VAULT_PATH: tempDir, DOTOBOT_OBSIDIAN_RAG_MAX_FILES: "1" };
    await writeObsidianMemory(env, {
      source_key: "older-note",
      query: "Caso antigo",
      responseText: "Discussao sobre acordo antigo.",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    await writeObsidianMemory(env, {
      source_key: "recent-note",
      query: "Caso recente",
      responseText: "Resumo sobre estrategia recente e urgente.",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    });

    const results = await queryObsidianMemory(env, { query: "estrategia recente", topK: 5 });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "recent-note");
  } finally {
    if (originalLimit == null) {
      delete process.env.DOTOBOT_OBSIDIAN_RAG_MAX_FILES;
    } else {
      process.env.DOTOBOT_OBSIDIAN_RAG_MAX_FILES = originalLimit;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

async function run() {
  let failures = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`PASS ${tests.length} tests`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
