import { getCleanEnvValue } from "./env.js";
import { fetchSupabaseAdmin } from "./supabase-rest.js";
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

function getWorkersAiConfig(env) {
  const accountId = getCleanEnvValue(env.CLOUDFLARE_WORKER_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID);
  const apiToken = getCleanEnvValue(env.CLOUDFLARE_WORKER_API_TOKEN || env.CLOUDFLARE_API_TOKEN);
  const model = getCleanEnvValue(env.CLOUDFLARE_WORKERS_AI_MODEL) || DEFAULT_WORKERS_AI_MODEL;

  return { accountId, apiToken, model };
}

async function fetchSingleSupabaseRow(env, table, query) {
  const rows = await fetchSupabaseAdmin(env, `${table}?${query}`);
  return asArray(rows)[0] || null;
}

async function callWorkersAi(env, prompt) {
  const { accountId, apiToken, model } = getWorkersAiConfig(env);
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
    body: JSON.stringify({
      prompt,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.errors?.[0]?.message || payload?.result?.error || "Falha ao executar avaliacao no Workers AI.");
  }

  const rawText = payload?.result?.response;
  if (!rawText) {
    throw new Error("Workers AI retornou payload sem campo result.response.");
  }

  return {
    model,
    rawText,
    payload,
  };
}

export async function getAgentLabTrainingCenter(env) {
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
    fetchSupabaseAdmin(env, `agentlab_training_scenarios?${scenarioParams.toString()}`),
    fetchSupabaseAdmin(env, `agentlab_training_runs?${runParams.toString()}`),
    fetchSupabaseAdmin(env, `agentlab_agent_profiles?${profileParams.toString()}`),
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

export async function runAgentLabTrainingScenario(env, { scenarioId, agentRef }) {
  if (!scenarioId) {
    throw new Error("scenarioId e obrigatorio para rodar o treino.");
  }

  const scenario = await fetchSingleSupabaseRow(
    env,
    "agentlab_training_scenarios",
    `select=id,agent_ref,scenario_name,category,user_message,expected_intent,expected_outcome,expected_workflow,expected_knowledge_pack,expected_handoff,difficulty,score_threshold,tags,metadata,status,created_at,updated_at&id=eq.${encodeURIComponent(
      scenarioId
    )}&limit=1`
  );

  if (!scenario) {
    throw new Error("Cenario de treino nao encontrado.");
  }

  const resolvedAgentRef = agentRef || scenario.agent_ref;
  const profile = await fetchSingleSupabaseRow(
    env,
    "agentlab_agent_profiles",
    `select=id,agent_ref,agent_name,owner_name,business_goal,persona_prompt,response_policy,knowledge_strategy,workflow_strategy,handoff_rules,settings,metrics,status,updated_at&agent_ref=eq.${encodeURIComponent(
      resolvedAgentRef
    )}&limit=1`
  );

  const prompt = buildTrainingPrompt({ scenario, profile });
  const inference = await callWorkersAi(env, prompt);
  const evaluation = parseTrainingResult(inference.rawText);
  const payload = buildTrainingRunPayload({
    scenario,
    profile,
    evaluation,
    rawResult: inference.payload,
    model: inference.model,
  });

  const inserted = await fetchSupabaseAdmin(env, "agentlab_training_runs", {
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
    await fetchSupabaseAdmin(env, "agentlab_improvement_queue", {
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
