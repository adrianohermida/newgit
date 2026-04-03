import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { runLawdeskChat } from "../../lib/lawdesk/chat.js";
import { buildDotobotRepositoryContext } from "../../lib/lawdesk/capabilities.js";
import { detectSkillFromQuery, enrichContextWithSkill } from "../../lib/lawdesk/skill_registry.js";
import { buildFeatureFlags } from "../../lib/lawdesk/feature-flags.js";
import { cancelTaskRun, getTaskRun, startTaskRun } from "../../lib/lawdesk/task_runs.js";

export default async function handler(req, res) {
  const features = buildFeatureFlags(process.env);
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const action = typeof req.body?.action === "string" ? req.body.action.trim() : "chat";

  if (action === "task_run_get") {
    const result = await getTaskRun(process.env, req.body);
    return res.status(result.status).json(result);
  }

  if (action === "task_run_cancel") {
    const result = await cancelTaskRun(process.env, req.body);
    return res.status(result.status).json(result);
  }

  if (action === "task_run_start") {
    const result = await startTaskRun(process.env, req.body, features);
    return res.status(result.status).json(result);
  }

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    return res.status(400).json({ ok: false, error: "Campo query obrigatorio." });
  }

  if (!features.chat.enabled) {
    return res.status(503).json({
      ok: false,
      error: "Chat Dotobot desabilitado por feature flag.",
      errorType: "feature_disabled",
    });
  }

  try {
    const repositoryContext = buildDotobotRepositoryContext(req.body?.context || {});
    let enhancedContext = repositoryContext;

    if (features.chat.skillsDetection) {
      try {
        const detectedSkill = detectSkillFromQuery(query);
        if (detectedSkill) {
          enhancedContext = enrichContextWithSkill(repositoryContext, detectedSkill);
        }
      } catch (skillError) {
        console.warn("Skill detection failed, continuing without:", skillError?.message);
      }
    }

    const startTime = Date.now();
    const data = await runLawdeskChat(process.env, {
      query,
      context: {
        ...(req.body?.context || {}),
        repositoryContext: enhancedContext,
        features,
      },
    });
    const duration = Date.now() - startTime;
    return res.status(200).json({ ok: true, data, metadata: { duration_ms: duration } });
  } catch (error) {
    const isTimeout = error?.message?.includes("Timeout") || error?.name === "AbortError";
    const isNetworkError = error?.message?.includes("fetch") || error?.message?.includes("connection");
    const statusCode = isTimeout || isNetworkError ? 504 : 500;
    const errorType = isTimeout ? "timeout" : isNetworkError ? "network" : "internal";
    return res.status(statusCode).json({
      ok: false,
      error: error?.message || "Falha ao executar chat administrativo Dotobot.",
      errorType,
      timestamp: new Date().toISOString(),
    });
  }
}
