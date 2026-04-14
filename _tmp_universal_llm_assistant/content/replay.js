(function attachReplay(content) {
  content.startReplayPolling = (tabId) => {
    content.stopReplayPolling();
    const id = tabId || "default";
    content.replayPollTimer = setInterval(async () => {
      try {
        const response = await fetch(`${content.bridgeUrl}/commands?tabId=${encodeURIComponent(id)}`);
        const data = await response.json();
        for (const command of data.commands || []) if (command.type === "REPLAY_STEP") await content.executeStep(command.payload);
      } catch {}
    }, content.pollInterval);
  };

  content.stopReplayPolling = () => {
    if (!content.replayPollTimer) return;
    clearInterval(content.replayPollTimer);
    content.replayPollTimer = null;
  };

  content.executeStep = async (step) => {
    await content.sleep(300);
    if (step.type === "navigate" && step.url && step.url !== location.href) return void (location.href = step.url);
    if (step.type === "scroll") return void window.scrollTo({ top: step.y || 0, left: step.x || 0, behavior: "smooth" });
    const element = step.selector ? document.querySelector(step.selector) : document.activeElement;
    if (step.type === "click" && element) { element.scrollIntoView({ behavior: "smooth", block: "center" }); await content.sleep(200); element.click(); }
    if (step.type === "input" && element) { element.focus(); element.value = step.value || ""; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }
    if (step.type === "submit" && element) element.submit();
    if (step.type === "key" && element) element.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, bubbles: true }));
  };
})(window.LLMAssistantContent);
