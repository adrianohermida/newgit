function isStructuredTaskCandidate(item) {
  return Boolean(item && typeof item === "object" && (Array.isArray(item.steps) || item.goal || item.title));
}

function compactText(value, limit = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function firstNonEmpty(...values) {
  return values.map((item) => String(item || "").trim()).find(Boolean) || "";
}

function mapPlanStep(step, index) {
  if (!step || typeof step !== "object") return null;
  const action = inferBrowserAction(step);
  if (!action) return null;
  return {
    id: `step_${step.id || index + 1}_${Math.random().toString(36).slice(2, 6)}`,
    planStepId: Number(step.id || index + 1),
    description: compactText(step.description || step.action || `Passo ${index + 1}`, 180),
    status: "pending",
    action,
    output: null,
    error: null,
  };
}

function inferBrowserAction(step) {
  const rawAction = String(step?.action || step?.description || "").trim();
  const actionText = rawAction.toLowerCase();
  const input = step?.input && typeof step.input === "object" ? step.input : {};
  const payload = step?.output?.payload && typeof step.output.payload === "object" ? step.output.payload : {};
  const merged = { ...payload, ...input };
  const selector = firstNonEmpty(merged.selector, merged.cssSelector, merged.targetSelector);
  const url = firstNonEmpty(merged.url, merged.href, merged.targetUrl);
  const value = firstNonEmpty(merged.value, merged.text, merged.input, merged.query);
  const label = firstNonEmpty(merged.label, merged.fieldLabel, merged.targetLabel);
  const targetText = firstNonEmpty(merged.targetText, merged.text, merged.buttonText);

  if (url && (actionText.includes("navigate") || actionText.includes("abrir") || actionText.includes("open"))) {
    return { type: "navigate", url };
  }
  if (selector || targetText || label) {
    if (actionText.includes("click") || actionText.includes("clique")) {
      return { type: "click", selector, targetText, label };
    }
    if (actionText.includes("input") || actionText.includes("type") || actionText.includes("fill") || actionText.includes("preench")) {
      return { type: "input", selector, targetText, label, value: value || "" };
    }
    if (actionText.includes("extract") || actionText.includes("read") || actionText.includes("scan") || actionText.includes("ler")) {
      return { type: "extract", selector, targetText, label };
    }
  }
  if (actionText.includes("extract") || actionText.includes("read") || actionText.includes("scan") || actionText.includes("ler")) {
    return { type: "extract" };
  }
  if (url) return { type: "navigate", url };
  return null;
}

function buildTaskFromPlanSteps(steps, body) {
  const mappedSteps = steps.map((step, index) => mapPlanStep(step, index)).filter(Boolean);
  if (!mappedSteps.length) return null;
  const summary = compactText(
    body?.result?.message || body?.result?.content || body?.message || "Plano do assistente",
    240,
  );
  return {
    title: compactText(summary || "Plano do assistente", 90),
    goal: summary || "Executar plano derivado da orquestracao atual.",
    source: "planner",
    status: "pending",
    steps: mappedSteps,
    logs: [],
    orchestration: body?.orchestration || {},
  };
}

function extractAiTasks(body) {
  const structuredCandidates = [
    body?.orchestration?.ai_tasks,
    body?.orchestration?.tasks,
    body?.tasks,
  ];
  for (const candidate of structuredCandidates) {
    if (Array.isArray(candidate) && candidate.length && candidate.every(isStructuredTaskCandidate)) {
      return candidate;
    }
  }

  const planSteps = [body?.plan?.steps, body?.steps].find((candidate) => Array.isArray(candidate) && candidate.length);
  if (Array.isArray(planSteps) && planSteps.length) {
    const synthesized = buildTaskFromPlanSteps(planSteps, body);
    return synthesized ? [synthesized] : [];
  }
  return [];
}

module.exports = {
  compactText,
  firstNonEmpty,
  extractAiTasks,
};
