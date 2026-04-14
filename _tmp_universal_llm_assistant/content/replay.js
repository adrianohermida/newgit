(function attachReplay(content) {
  async function resolveReplayElement(step) {
    const direct = content.resolveElement(step);
    if (direct) return direct;
    const pointer = step?.pointer || step?.element?.rect || null;
    if (pointer && Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
      const byPoint = document.elementFromPoint(pointer.clientX, pointer.clientY);
      if (byPoint) return byPoint;
    }
    if (step?.element?.rect) {
      const rect = step.element.rect;
      const byRect = document.elementFromPoint(
        Math.max(0, Math.round(rect.x + rect.width / 2)),
        Math.max(0, Math.round(rect.y + rect.height / 2)),
      );
      if (byRect) return byRect;
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await content.sleep(250 * (attempt + 1));
      const delayed = content.resolveElement(step);
      if (delayed) return delayed;
    }
    return null;
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    if (descriptor?.set) descriptor.set.call(element, value);
    else if ("value" in element) element.value = value;
  }

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
    if (command.type === "REPLAY_STEP") {
      const step = command.payload || {};
      const meta = step.__meta || {};
      await reportReplayStatus(meta, "started");
      try {
        await content.executeStep(step);
        await reportReplayStatus(meta, "completed");
        return;
      } catch (error) {
        await reportReplayStatus(meta, "failed", error);
        throw error;
      }
    }
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
      await content.executeStep({
        type: action.type,
        selector: action.selector,
        value: action.value,
        url: action.url,
        element: action.element || payload?.element || null,
        pointer: payload?.pointer || null,
      });
      await content.reportTaskResult(payload, "ok", { action: action.type, selector: action.selector || null });
    } catch (error) {
      console.warn("[LLMAssistant] executeTaskStep falhou:", error?.message || error);
      const normalizedError = normalizeStepError(error, action);
      await content.reportTaskResult(payload, "error", null, false, normalizedError).catch(() => {});
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
    const element = await resolveReplayElement(step) || document.activeElement;
    if (!element && step.type !== "navigate") {
      throw new Error(`Elemento nao encontrado para selector: ${step.selector || "(nenhum)"}`);
    }
    if (step.type === "click") {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      await content.sleep(180);
      const pointer = step?.pointer || {};
      const mouseInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Number(pointer.clientX || 0),
        clientY: Number(pointer.clientY || 0),
        button: Number(pointer.button || 0),
      };
      element.dispatchEvent(new MouseEvent("mouseover", mouseInit));
      element.dispatchEvent(new MouseEvent("mousedown", mouseInit));
      element.dispatchEvent(new MouseEvent("mouseup", mouseInit));
      element.click();
    }
    if (step.type === "input") {
      element.focus();
      const nextValue = String(step.value || "");
      setNativeValue(element, "");
      element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: nextValue, inputType: "insertText" }));
      setNativeValue(element, nextValue);
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Process", bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: "Process", bubbles: true }));
    }
    if (step.type === "change") {
      element.focus();
      if (typeof step.value !== "undefined") setNativeValue(element, String(step.value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    if (step.type === "submit") {
      if (typeof element.requestSubmit === "function") element.requestSubmit();
      else if (typeof element.submit === "function") element.submit();
      else element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    if (step.type === "key") {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, code: step.code || "", bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: step.key, code: step.code || "", bubbles: true }));
    }
  };

  function normalizeStepError(error, action) {
    const message = String(error?.message || error || "Falha ao executar etapa.");
    if (message.toLowerCase().includes("elemento nao encontrado")) {
      return new Error(`browser_target_missing: ${action?.selector || message}`);
    }
    if (message.toLowerCase().includes("cannot access")) {
      return new Error(`browser_error: ${message}`);
    }
    return new Error(message);
  }

  async function reportReplayStatus(meta, event, error = null) {
    if (!meta?.automationId) return;
    await fetch(`${content.bridgeUrl}/replay/status`, {
      method: "POST",
      keepalive: event !== "started",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automationId: meta.automationId,
        tabId: meta.tabId || null,
        stepIndex: meta.stepIndex,
        totalSteps: meta.totalSteps,
        stepLabel: meta.stepLabel || "",
        event,
        error: error ? String(error.message || error) : null,
      }),
    }).catch(() => {});
  }
})(window.LLMAssistantContent);
