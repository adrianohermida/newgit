(function attachReplay(content) {
  content.startReplayPolling = (tabId) => {
    content.stopReplayPolling();
    const id = tabId || "default";
    content.replayPollTimer = setInterval(async () => {
      try {
        const response = await fetch(`${content.bridgeUrl}/commands?tabId=${encodeURIComponent(id)}`);
        if (!response.ok) return;
        const data = await response.json();
        for (const command of data.commands || []) {
          await content.handleCommand(command).catch((err) => {
            console.warn("[LLMAssistant] falha ao executar comando de replay:", err?.message || err);
          });
        }
      } catch (err) {
        // Falha de rede esperada em pages que bloqueiarm o content script — ignorar silenciosamente
      }
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
        return await content.reportTaskResult(payload, "ok", {
          page: content.collectPageScan(),
        });
      }
      if (action.type === "navigate" && action.url) {
        await content.reportTaskResult(payload, "ok", { url: action.url, dispatched: true }, true);
        location.href = action.url;
        return;
      }
      await content.executeStep({ type: action.type, selector: action.selector, value: action.value, url: action.url });
      await content.reportTaskResult(payload, "ok", { action: action.type, selector: action.selector || null });
    } catch (error) {
      console.warn("[LLMAssistant] executeTaskStep falhou:", error?.message || error);
      await content.reportTaskResult(payload, "error", null, false, error).catch(() => {});
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
        tabId: payload.tabId || null,
        status,
        output,
        error: error ? String(error.message || error) : null,
      }),
    });
  };

  content.executeStep = async (step) => {
    await content.sleep(300);
    if (step.type === "navigate" && step.url && step.url !== location.href) {
      location.href = step.url;
      return;
    }
    if (step.type === "scroll") {
      window.scrollTo({ top: step.y || 0, left: step.x || 0, behavior: "smooth" });
      return;
    }
    const element = step.selector ? document.querySelector(step.selector) : document.activeElement;
    if (!element && step.type !== "navigate") {
      throw new Error(`Elemento nao encontrado para selector: ${step.selector || "(nenhum)"}`);
    }
    if (step.type === "click") {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      await content.sleep(180);
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      element.click();
    }
    if (step.type === "input") {
      element.focus();
      const nextValue = String(step.value || "");
      if ("value" in element) element.value = "";
      element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: nextValue, inputType: "insertText" }));
      if ("value" in element) element.value = nextValue;
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Process", bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: "Process", bubbles: true }));
    }
    if (step.type === "submit") element.submit();
    if (step.type === "key") {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, code: step.code || "", bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: step.key, code: step.code || "", bubbles: true }));
    }
  };
})(window.LLMAssistantContent);
