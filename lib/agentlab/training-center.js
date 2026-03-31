export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const TRAINING_PROMPT_VERSION = "agentlab-v1";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(toNumber(value, 0))));
}

function normalizeScoreMap(scores = {}) {
  const normalized = {
    clarity: clampScore(scores.clarity),
    legal_safety: clampScore(scores.legal_safety),
    qualification: clampScore(scores.qualification),
    workflow_fit: clampScore(scores.workflow_fit),
    empathy: clampScore(scores.empathy),
  };

  const average =
    Math.round(
      (normalized.clarity +
        normalized.legal_safety +
        normalized.qualification +
        normalized.workflow_fit +
        normalized.empathy) /
        5
    ) || 0;

  return {
    ...normalized,
    overall: clampScore(scores.overall ?? average),
  };
}

export function normalizeTrainingScenario(row = {}) {
  return {
    id: row.id,
    agent_ref: row.agent_ref || "dotobot-ai",
    scenario_name: row.scenario_name || "Cenario sem nome",
    category: row.category || "geral",
    user_message: row.user_message || "",
    expected_intent: row.expected_intent || "desconhecida",
    expected_outcome: row.expected_outcome || "",
    expected_workflow: row.expected_workflow || null,
    expected_knowledge_pack: row.expected_knowledge_pack || null,
    expected_handoff: Boolean(row.expected_handoff),
    difficulty: row.difficulty || "media",
    score_threshold: Math.round(toNumber(row.score_threshold, 0.8) * 100),
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    status: row.status || "active",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function normalizeTrainingRun(row = {}) {
  const scores = normalizeScoreMap(row.scores || {});
  const threshold = clampScore(
    toNumber(row.threshold_score ?? row.raw_result?.scenario?.score_threshold, 80)
  );
  return {
    id: row.id,
    scenario_id: row.scenario_id || null,
    agent_ref: row.agent_ref || "dotobot-ai",
    provider: row.provider || "cloudflare-workers-ai",
    model: row.model || DEFAULT_WORKERS_AI_MODEL,
    prompt_version: row.prompt_version || TRAINING_PROMPT_VERSION,
    generated_response: row.generated_response || "",
    evaluator_summary: row.evaluator_summary || "",
    intent_detected: row.intent_detected || "desconhecida",
    handoff_recommended: Boolean(row.handoff_recommended),
    scores,
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : [],
    raw_result: row.raw_result || {},
    status: row.status || "completed",
    created_at: row.created_at || null,
    passed: scores.overall >= threshold,
    threshold_score: threshold,
  };
}

export function summarizeTrainingCenter(scenarios = [], runs = []) {
  const normalizedScenarios = scenarios.map(normalizeTrainingScenario);
  const normalizedRuns = runs.map(normalizeTrainingRun);

  const byCategory = new Map();
  let latestRunAt = null;
  let passes = 0;
  let totalScore = 0;

  for (const run of normalizedRuns) {
    const category = run.raw_result?.scenario?.category || run.raw_result?.category || "geral";
    const current = byCategory.get(category) || { category, total: 0, average_score: 0, passes: 0 };
    current.total += 1;
    current.average_score += run.scores.overall;
    current.passes += run.passed ? 1 : 0;
    byCategory.set(category, current);

    totalScore += run.scores.overall;
    passes += run.passed ? 1 : 0;

    if (!latestRunAt || (run.created_at && new Date(run.created_at) > new Date(latestRunAt))) {
      latestRunAt = run.created_at || latestRunAt;
    }
  }

  const categorySummary = Array.from(byCategory.values())
    .map((item) => ({
      ...item,
      average_score: item.total ? Math.round(item.average_score / item.total) : 0,
    }))
    .sort((left, right) => right.total - left.total);

  return {
    total_scenarios: normalizedScenarios.length,
    active_scenarios: normalizedScenarios.filter((item) => item.status === "active").length,
    total_runs: normalizedRuns.length,
    pass_rate: normalizedRuns.length ? Math.round((passes / normalizedRuns.length) * 100) : 0,
    average_score: normalizedRuns.length ? Math.round(totalScore / normalizedRuns.length) : 0,
    latest_run_at: latestRunAt,
    by_category: categorySummary,
  };
}

function serializeValue(value) {
  if (value == null) return "nao definido";
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "nao definido";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function buildTrainingPrompt({ scenario, profile }) {
  const normalizedScenario = normalizeTrainingScenario(scenario);
  const persona = profile?.persona_prompt || "Especialista juridico-comercial em superendividamento, atendimento claro e seguro.";
  const responsePolicy =
    profile?.response_policy ||
    "Nao inventar fatos processuais, nao prometer resultado juridico e sempre orientar proximo passo util.";
  const knowledgeStrategy = serializeValue(profile?.knowledge_strategy);
  const workflowStrategy = serializeValue(profile?.workflow_strategy);
  const handoffRules = serializeValue(profile?.handoff_rules);
  const settings = serializeValue(profile?.settings);
  const businessGoal =
    profile?.business_goal ||
    "Qualificar leads, orientar clientes, reduzir handoffs desnecessarios e proteger a seguranca juridica da resposta.";

  return `
Voce e o motor de treinamento do AgentLab de um escritorio juridico.

Objetivo do agente:
${businessGoal}

Persona do agente:
${persona}

Politica de resposta:
${responsePolicy}

Estrategia de conhecimento:
${knowledgeStrategy}

Estrategia de workflow:
${workflowStrategy}

Regras de handoff:
${handoffRules}

Settings operacionais:
${settings}

Cenario de treino:
- Nome: ${normalizedScenario.scenario_name}
- Categoria: ${normalizedScenario.category}
- Dificuldade: ${normalizedScenario.difficulty}
- Mensagem do usuario: ${normalizedScenario.user_message}
- Intencao esperada: ${normalizedScenario.expected_intent}
- Resultado esperado: ${normalizedScenario.expected_outcome}
- Workflow esperado: ${normalizedScenario.expected_workflow || "nenhum"}
- Knowledge pack esperado: ${normalizedScenario.expected_knowledge_pack || "nenhum"}
- Handoff esperado: ${normalizedScenario.expected_handoff ? "sim" : "nao"}
- Tags: ${normalizedScenario.tags.join(", ") || "nenhuma"}

Tarefa:
1. Gere a melhor resposta possivel para o agente nesse contexto.
2. Avalie a propria resposta com foco em clareza, seguranca juridica, qualificacao comercial, aderencia ao fluxo e empatia.
3. Recomende ajustes praticos no agente para melhorar performance.

Responda APENAS com JSON valido neste formato:
{
  "generated_response": "string",
  "intent_detected": "string",
  "handoff_recommended": true,
  "scores": {
    "clarity": 0,
    "legal_safety": 0,
    "qualification": 0,
    "workflow_fit": 0,
    "empathy": 0,
    "overall": 0
  },
  "evaluator_summary": "string curta com diagnostico",
  "recommendations": [
    {
      "type": "persona|knowledge|workflow|handoff|response",
      "title": "string curta",
      "action": "acao pratica de melhoria"
    }
  ]
}
`.trim();
}

export function extractJsonObject(text) {
  if (!text) return null;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

export function parseTrainingResult(rawText) {
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    throw new Error("Workers AI nao retornou JSON valido para o treino.");
  }

  const parsed = JSON.parse(jsonText);
  return {
    generated_response: parsed.generated_response || "",
    intent_detected: parsed.intent_detected || "desconhecida",
    handoff_recommended: Boolean(parsed.handoff_recommended),
    scores: normalizeScoreMap(parsed.scores || {}),
    evaluator_summary: parsed.evaluator_summary || "Sem resumo do avaliador.",
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 6) : [],
  };
}

export function buildTrainingRunPayload({ scenario, profile, evaluation, rawResult, model }) {
  const normalizedScenario = normalizeTrainingScenario(scenario);

  return {
    scenario_id: normalizedScenario.id,
    agent_ref: normalizedScenario.agent_ref,
    provider: "cloudflare-workers-ai",
    model: model || DEFAULT_WORKERS_AI_MODEL,
    prompt_version: TRAINING_PROMPT_VERSION,
    generated_response: evaluation.generated_response,
    evaluator_summary: evaluation.evaluator_summary,
    intent_detected: evaluation.intent_detected,
    handoff_recommended: evaluation.handoff_recommended,
    scores: evaluation.scores,
    recommendations: evaluation.recommendations,
    raw_result: {
      scenario: normalizedScenario,
      profile: profile || null,
      provider_response: rawResult || null,
    },
    status: "completed",
  };
}

export function buildImprovementQueueItemFromTraining({ scenario, run }) {
  const normalizedScenario = normalizeTrainingScenario(scenario);
  const normalizedRun = normalizeTrainingRun(run);

  if (normalizedRun.passed) {
    return null;
  }

  const primaryRecommendation = normalizedRun.recommendations?.[0];
  return {
    agent_ref: normalizedRun.agent_ref || normalizedScenario.agent_ref,
    category: "evaluation",
    title: `Treino abaixo do alvo: ${normalizedScenario.scenario_name}`,
    description:
      primaryRecommendation?.action ||
      normalizedRun.evaluator_summary ||
      "O laboratorio detectou que este cenario ainda precisa de ajustes no agente.",
    priority: normalizedRun.scores.overall < 70 ? "alta" : "media",
    status: "backlog",
    source_channel: "training_center",
    sprint_bucket: "Sprint atual",
    metadata: {
      scenario_id: normalizedScenario.id,
      scenario_name: normalizedScenario.scenario_name,
      training_run_id: normalizedRun.id || null,
      score: normalizedRun.scores.overall,
      threshold: normalizedRun.threshold_score,
      recommendations: normalizedRun.recommendations || [],
    },
  };
}
