(function attachReplay(content) {
  content.startReplayPolling = (tabId) => {
    content.stopReplayPolling();
    const id = tabId || "default";
    content.replayPollTimer = setInterval(async () => {
      try {
        const response = await fetch(`${content.bridgeUrl}/commands?tabId=${encodeURIComponent(id)}`);
        const data = await response.json();
        for (const command of data.commands || []) await content.handleCommand(command);
      } catch {}
    }, content.pollInterval);
  };

  content.stopReplayPolling = () => {
    if (!content.replayPollTimer) return;
    clearInterval(content.replayPollTimer);
    content.replayPollTimer = null;
  };

  content.handleCommand = async (command) => {
    if (command.type === "REPLAY_STEP") return content.executeStep(command.payload);
    if (command.type === "TASK_STEP") return content.executeTaskStep(command.payload);
  };

  content.executeTaskStep = async (payload) => {
    const action = payload?.action || {};
    try {
      if (action.type === "extract") {
        return await content.reportTaskResult(payload, "ok", { title: document.title, url: location.href, text: (document.body?.innerText || "").slice(0, 5000) });
      }
      if (action.type === "navigate" && action.url) {
        await content.reportTaskResult(payload, "ok", { url: action.url, dispatched: true }, true);
        location.href = action.url;
        return;
      }
      await content.executeStep({ type: action.type, selector: action.selector, value: action.value, url: action.url });
      await content.reportTaskResult(payload, "ok", { action: action.type, selector: action.selector || null });
    } catch (error) {
      await content.reportTaskResult(payload, "error", null, false, error);
    }
  };

  content.reportTaskResult = async (payload, status, output, keepalive = false, error = null) => {
    await fetch(`${content.bridgeUrl}/tasks/result`, {
      method: "POST",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: payload.sessionId,
        taskId: payload.taskId,
        stepId: payload.stepId,
        status,
        output,
        error: error ? String(error.message || error) : null,
      }),
    });
  };

  content.executeStep = async (step) => {
    await content.sleep(300);
    if (step.type === "navigate" && step.url && step.url !== location.href) return void (location.href = step.url);
    if (step.type === "scroll") return void window.scrollTo({ top: step.y || 0, left: step.x || 0, behavior: "smooth" });
    const element = step.selector ? document.querySelector(step.selector) : document.activeElement;
    if (!element && step.type !== "navigate") throw new Error("Elemento alvo nao encontrado.");
    if (step.type === "click") { element.scrollIntoView({ behavior: "smooth", block: "center" }); await content.sleep(200); element.click(); }
    if (step.type === "input") { element.focus(); element.value = step.value || ""; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }
    if (step.type === "submit") element.submit();
    if (step.type === "key") element.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, bubbles: true }));
  };
})(window.LLMAssistantContent);
