<<<<<<< HEAD
import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { getAgentLabDashboard, runTrainingScenario } from "../../lib/agentlab/server.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
=======
import { fetchSupabaseAdmin, requireAdminApiAccess } from "../../lib/admin/server.js";
import {
  buildImprovementQueueItemFromTraining,
  DEFAULT_WORKERS_AI_MODEL,
  buildTrainingPrompt,
  buildTrainingRunPayload,
  normalizeTrainingRun,
  normalizeTrainingScenario,
  parseTrainingResult,
  summarizeTrainingCenter,
} from "../../lib/agentlab/training-center.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getWorkersAiConfig() {
  return {
    accountId: cleanEnvValue(process.env.CLOUDFLARE_WORKER_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID),
    apiToken: cleanEnvValue(process.env.CLOUDFLARE_WORKER_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN),
    model: cleanEnvValue(process.env.CLOUDFLARE_WORKERS_AI_MODEL) || DEFAULT_WORKERS_AI_MODEL,
  };
}

async function fetchSingleRow(table, query) {
  const rows = await fetchSupabaseAdmin(`${table}?${query}`);
  return asArray(rows)[0] || null;
}

async function getTrainingCenter() {
  const scenarioParams = new URLSearchParams();
  scenarioParams.set(
    "select",
    "id,agent_ref,scenario_name,category,user_message,expected_intent,expected_outcome,expected_workflow,expected_knowledge_pack,expected_handoff,difficulty,score_threshold,tags,metadata,status,created_at,updated_at"
  );
  scenarioParams.set("order", "scenario_name.asc");

  const runParams = new URLSearchParams();
  runParams.set(
    "select",
    "id,scenario_id,agent_ref,provider,model,prompt_version,generated_response,evaluator_summary,intent_detected,handoff_recommended,scores,recommendations,raw_result,status,created_at"
  );
  runParams.set("order", "created_at.desc");
  runParams.set("limit", "30");

  const profileParams = new URLSearchParams();
  profileParams.set(
    "select",
    "id,agent_ref,agent_name,owner_name,business_goal,persona_prompt,response_policy,knowledge_strategy,workflow_strategy,handoff_rules,settings,metrics,status,updated_at"
  );
  profileParams.set("order", "updated_at.desc");

  const [scenariosRaw, runsRaw, profilesRaw] = await Promise.all([
    fetchSupabaseAdmin(`agentlab_training_scenarios?${scenarioParams.toString()}`),
    fetchSupabaseAdmin(`agentlab_training_runs?${runParams.toString()}`),
    fetchSupabaseAdmin(`agentlab_agent_profiles?${profileParams.toString()}`),
  ]);

  const scenarios = asArray(scenariosRaw).map(normalizeTrainingScenario);
  const runs = asArray(runsRaw).map(normalizeTrainingRun);
  const profiles = asArray(profilesRaw);

  return {
    summary: summarizeTrainingCenter(scenarios, runs),
    scenarios,
    recent_runs: runs,
    profiles,
  };
}

async function callWorkersAi(prompt) {
  const { accountId, apiToken, model } = getWorkersAiConfig();
  if (!accountId || !apiToken) {
    throw new Error("Configuracao do Workers AI incompleta no ambiente.");
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.errors?.[0]?.message || "Falha ao executar avaliacao no Workers AI.");
  }

  if (!payload?.result?.response) {
    throw new Error("Workers AI retornou payload sem campo result.response.");
  }

  return {
    model,
    payload,
    rawText: payload.result.response,
  };
}

async function runTrainingScenario({ scenarioId, agentRef }) {
  if (!scenarioId) {
    throw new Error("scenarioId e obrigatorio para rodar o treino.");
  }

  const scenario = await fetchSingleRow(
    "agentlab_training_scenarios",
    `select=id,agent_ref,scenario_name,category,user_message,expected_intent,expected_outcome,expected_workflow,expected_knowledge_pack,expected_handoff,difficulty,score_threshold,tags,metadata,status,created_at,updated_at&id=eq.${encodeURIComponent(
      scenarioId
    )}&limit=1`
  );

  if (!scenario) {
    throw new Error("Cenario de treino nao encontrado.");
  }

  const resolvedAgentRef = agentRef || scenario.agent_ref;
  const profile = await fetchSingleRow(
    "agentlab_agent_profiles",
    `select=id,agent_ref,agent_name,owner_name,business_goal,persona_prompt,response_policy,knowledge_strategy,workflow_strategy,handoff_rules,settings,metrics,status,updated_at&agent_ref=eq.${encodeURIComponent(
      resolvedAgentRef
    )}&limit=1`
  );

  const prompt = buildTrainingPrompt({ scenario, profile });
  const inference = await callWorkersAi(prompt);
  const evaluation = parseTrainingResult(inference.rawText);
  const payload = buildTrainingRunPayload({
    scenario,
    profile,
    evaluation,
    rawResult: inference.payload,
    model: inference.model,
  });

  const inserted = await fetchSupabaseAdmin("agentlab_training_runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  const savedRun = normalizeTrainingRun(asArray(inserted)[0] || payload);
  const improvementItem = buildImprovementQueueItemFromTraining({
    scenario,
    run: savedRun,
  });

  if (improvementItem) {
    await fetchSupabaseAdmin("agentlab_improvement_queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(improvementItem),
    });
  }

  return {
    scenario: normalizeTrainingScenario(scenario),
    profile: profile || null,
    run: savedRun,
    improvement_item_created: Boolean(improvementItem),
  };
}

export default async function handler(req, res) {
  const auth = await requireAdminApiAccess(req);
>>>>>>> codex/hmadv-tpu-fase53
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method === "GET") {
    try {
<<<<<<< HEAD
      const data = await getAgentLabDashboard(process.env);
      return res.status(200).json({ ok: true, training: data.training, governance: data.governance });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar training center." });
=======
      const training = await getTrainingCenter();
      return res.status(200).json({
        ok: true,
        generated_at: new Date().toISOString(),
        profile: {
          id: auth.profile.id,
          email: auth.profile.email,
          role: auth.profile.role,
        },
        training,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao carregar o Training Center.",
      });
>>>>>>> codex/hmadv-tpu-fase53
    }
  }

  if (req.method === "POST") {
    try {
<<<<<<< HEAD
      const result = await runTrainingScenario(process.env, req.body || {});
      return res.status(200).json({ ok: true, result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Falha ao executar treinamento." });
=======
      const result = await runTrainingScenario({
        scenarioId: req.body?.scenarioId,
        agentRef: req.body?.agentRef,
      });

      return res.status(200).json({
        ok: true,
        generated_at: new Date().toISOString(),
        result,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao executar treino.",
      });
>>>>>>> codex/hmadv-tpu-fase53
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
