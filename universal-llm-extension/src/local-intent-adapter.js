const { compactText } = require("./local-plan-adapter");

function deriveIntentTasks(query, workspace = {}) {
  const text = String(query || "").trim();
  if (!text) return [];

  const activeTab = resolveActiveTab(workspace);
  const steps = buildIntentSteps(text, activeTab);
  if (!steps.length) return [];

  return [buildIntentTask(inferIntentTitle(steps, activeTab), text, steps, { source: "system", activeTab })];
}

function resolveActiveTab(workspace = {}) {
  return (Array.isArray(workspace.tabs) ? workspace.tabs : []).find((tab) => String(tab?.id || "") === String(workspace.tabId || ""))
    || (Array.isArray(workspace.tabs) ? workspace.tabs.find((tab) => tab?.active) : null)
    || null;
}

function buildIntentSteps(text, activeTab) {
  const parts = splitIntentQuery(text);
  const steps = parts.map((part) => deriveIntentStep(part, activeTab)).filter(Boolean);
  if (steps.length) return steps;
  const single = deriveIntentStep(text, activeTab);
  return single ? [single] : [];
}

function splitIntentQuery(text) {
  return String(text || "")
    .split(/\s+(?:e depois|depois|entao|então|e)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function deriveIntentStep(text, activeTab) {
  const source = String(text || "").trim();
  const normalized = source.toLowerCase();
  if (!normalized) return null;

  const urlMatch = source.match(/https?:\/\/[^\s)"'<>]+/i);
  const quotedTarget = firstQuotedValue(source);
  const inputMatch = source.match(/(?:preencher|digitar|inserir)(?:\s+(?:o|a|no|na|em))?\s+(.+?)\s+(?:com|para)\s+["'`]?(.+?)["'`]?$/i);

  if (inputMatch) {
    const target = compactText(inputMatch[1], 120);
    const value = compactText(inputMatch[2], 240);
    return {
      description: `Preencher ${target} com ${value}`,
      action: { type: "input", label: target, targetText: target, value },
    };
  }

  if (normalized.includes("clicar") || normalized.includes("clique")) {
    const target = compactText(quotedTarget || source.replace(/.*?(clicar|clique)\s+(?:em\s+)?/i, ""), 120) || "elemento solicitado";
    return {
      description: `Clicar em ${target}`,
      action: { type: "click", targetText: target, label: target },
    };
  }

  if (urlMatch && ["abrir", "navegar", "acesse", "acessar", "ir para", "visitar"].some((token) => normalized.includes(token))) {
    return {
      description: `Abrir ${urlMatch[0]}`,
      action: { type: "navigate", url: urlMatch[0] },
    };
  }

  if (urlMatch && !normalized.includes("extrair") && !normalized.includes("analisar")) {
    return {
      description: `Navegar para ${urlMatch[0]}`,
      action: { type: "navigate", url: urlMatch[0] },
    };
  }

  if (["ler pagina", "leia a pagina", "analisar a pagina", "analise a pagina", "extrair pagina", "resumir pagina", "varrer pagina"].some((token) => normalized.includes(token))) {
    return {
      description: activeTab?.title ? `Ler ${activeTab.title}` : "Ler pagina ativa",
      action: { type: "extract" },
    };
  }

  if (["analisar", "extrair", "mapear", "inspecionar"].some((token) => normalized.includes(token)) && activeTab) {
    return {
      description: activeTab?.title ? `Extrair contexto de ${activeTab.title}` : "Extrair contexto da guia ativa",
      action: { type: "extract" },
    };
  }

  if (activeTab) {
    return {
      description: activeTab?.title ? `Analisar pagina: ${activeTab.title}` : "Analisar contexto atual",
      action: { type: "extract" },
    };
  }

  return null;
}

function inferIntentTitle(steps, activeTab) {
  const types = steps.map((step) => String(step?.action?.type || "").trim()).filter(Boolean);
  if (!types.length) return "Task operacional";
  if (types.length === 1) {
    if (types[0] === "extract") return activeTab?.title ? `Ler ${activeTab.title}` : "Ler pagina ativa";
    if (types[0] === "navigate") return "Abrir pagina";
    if (types[0] === "click") return "Clicar elemento";
    if (types[0] === "input") return "Preencher campo";
  }
  return `Fluxo operacional (${types.join(" + ")})`;
}

function buildIntentTask(title, goal, steps, options = {}) {
  const activeTab = options.activeTab || null;
  return {
    title,
    goal,
    source: options.source || "system",
    status: "pending",
    steps: steps.map((step, index) => ({
      id: step.id || `intent_step_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
      description: compactText(step.description || `Passo ${index + 1}`, 180),
      status: "pending",
      action: {
        ...(step.action || {}),
        tabId: step.action?.tabId || String(activeTab?.id || ""),
        tabTitle: step.action?.tabTitle || String(activeTab?.title || ""),
        tabUrl: step.action?.tabUrl || String(activeTab?.url || ""),
        origin: step.action?.origin || String(activeTab?.origin || ""),
      },
      output: null,
      error: null,
    })),
    logs: [`intent:${title.toLowerCase().replace(/\s+/g, "_")}`],
    orchestration: {
      agentId: "extension-intent",
      agentRole: "IntentAdapter",
      stage: "intent_inference",
      tool: null,
      moduleKeys: ["browser"],
      dependsOn: [],
      parallelGroup: null,
    },
  };
}

function firstQuotedValue(text) {
  const match = String(text || "").match(/["'`](.+?)["'`]/);
  return match ? match[1].trim() : "";
}

module.exports = {
  deriveIntentTasks,
};
