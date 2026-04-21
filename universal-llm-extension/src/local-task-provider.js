function buildLocalExecutionRequest(query, sessionId, workspace = {}) {
  return {
    query,
    context: {
      session_id: sessionId,
      route: "extension/task-runner",
      active_tab_id: workspace.tabId || null,
      browser_tabs: Array.isArray(workspace.tabs) ? workspace.tabs : [],
      multi_tab_enabled: Array.isArray(workspace.tabs) && workspace.tabs.length > 1,
    },
  };
}

function buildLocalExecutionFallback(query, error) {
  return {
    kind: "structured",
    message: "O planner local nao respondeu a tempo, entao a extensao montou uma task operacional de navegador com base na sua intencao.",
    data: {
      status: "degraded_intent_fallback",
      tool: null,
      payload: {
        query,
        error: error?.message || "Falha ao planejar no provider local.",
      },
    },
  };
}

module.exports = {
  buildLocalExecutionRequest,
  buildLocalExecutionFallback,
};
