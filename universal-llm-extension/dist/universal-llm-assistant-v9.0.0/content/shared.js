window.LLMAssistantContent = {
  bridgeUrl: "http://127.0.0.1:32123",
  pollInterval: 2000,
  recordingState: { active: false, automationId: null },
  replayPollTimer: null,
  sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); },
  buildSelector(element) {
    if (!element || element === document.body) return "body";
    if (element.id) return `#${CSS.escape(element.id)}`;
    const tag = element.tagName.toLowerCase();
    const className = element.className && typeof element.className === "string"
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).map((token) => CSS.escape(token)).join(".")}`
      : "";
    const label = element.getAttribute("aria-label") || element.getAttribute("name") || element.getAttribute("placeholder");
    if (label) return `${tag}[aria-label="${label}"], ${tag}[name="${label}"], ${tag}[placeholder="${label}"]`;
    return `${tag}${className}`;
  },
};
