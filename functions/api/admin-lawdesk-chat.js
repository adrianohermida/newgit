import { requireAdminAccess } from "../lib/admin-auth.js";
import { runLawdeskChat } from "../../lib/lawdesk/chat.js";
import { buildDotobotRepositoryContext } from "../../lib/lawdesk/capabilities.js";
import { detectSkillFromQuery, enrichContextWithSkill } from "../../lib/lawdesk/skill_registry.js";
import { buildFeatureFlags } from "../../lib/lawdesk/feature-flags.js";
import { cancelTaskRun, getTaskRun, startTaskRun } from "../../lib/lawdesk/task_runs.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestPost(context) {
  const { request, env } = context;
  const features = buildFeatureFlags(env);
  const auth = await requireAdminAccess(request, env);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Body JSON invalido." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const action = typeof body?.action === "string" ? body.action.trim() : "chat";

  if (action === "task_run_get") {
    const result = getTaskRun(body);
    return new Response(JSON.stringify(result), {
      status: result.status,
      headers: JSON_HEADERS,
    });
  }

  if (action === "task_run_cancel") {
    const result = cancelTaskRun(body);
    return new Response(JSON.stringify(result), {
      status: result.status,
      headers: JSON_HEADERS,
    });
  }

  if (action === "task_run_start") {
    const result = await startTaskRun(env, body, features);
    return new Response(JSON.stringify(result), {
      status: result.status,
      headers: JSON_HEADERS,
    });
  }

  if (!query) {
    return new Response(JSON.stringify({ ok: false, error: "Campo query obrigatorio." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!features.chat.enabled) {
    return new Response(
      JSON.stringify({ ok: false, error: "Chat Dotobot desabilitado por feature flag.", errorType: "feature_disabled" }),
      { status: 503, headers: JSON_HEADERS }
    );
  }

  try {
    const repositoryContext = buildDotobotRepositoryContext(body?.context || {});
    let enhancedContext = repositoryContext;

    // Detecção opcional de skill (Fase 2)
    if (features.chat.skillsDetection) {
      try {
        const query = typeof body?.query === "string" ? body.query.trim() : "";
        const detectedSkill = detectSkillFromQuery(query);
        if (detectedSkill) {
          enhancedContext = enrichContextWithSkill(repositoryContext, detectedSkill);
        }
      } catch (skillError) {
        console.warn("Skill detection failed, continuing without:", skillError?.message);
        // Continue sem skill, não quebra o fluxo
      }
    }

    const startTime = Date.now();
    const data = await runLawdeskChat(env, {
      query,
      context: {
        ...(body?.context || {}),
        repositoryContext: enhancedContext,
        features,
      },
    });
    const duration = Date.now() - startTime;
    return new Response(JSON.stringify({ ok: true, data, metadata: { duration_ms: duration } }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    const isTimeout = error?.message?.includes("Timeout") || error?.name === "AbortError";
    const isNetworkError = error?.message?.includes("fetch") || error?.message?.includes("connection");
    const statusCode = isTimeout || isNetworkError ? 504 : 500;
    const errorType = isTimeout ? "timeout" : isNetworkError ? "network" : "internal";
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao executar chat administrativo Dotobot.",
        errorType,
        timestamp: new Date().toISOString(),
      }),
      {
        status: statusCode,
        headers: JSON_HEADERS,
      }
    );
  }
}
