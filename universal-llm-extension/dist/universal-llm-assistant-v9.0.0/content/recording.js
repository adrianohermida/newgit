(function attachRecording(content) {
  function postStep(step) {
    if (!content.recordingState.active || !content.recordingState.automationId) return;
    fetch(`${content.bridgeUrl}/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automationId: content.recordingState.automationId,
        tabUrl: location.href,
        tabTitle: document.title,
        step,
      }),
    }).catch(() => {});
  }

  function onRecordClick(event) {
    const element = event.target;
    if (!element || element.tagName === "HTML") return;
    postStep({ type: "click", selector: content.buildSelector(element), text: (element.innerText || element.value || "").substring(0, 80), tagName: element.tagName, href: element.href || null });
  }

  function onRecordInput(event) {
    const element = event.target;
    if (!element || !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.type === "password") return;
    postStep({ type: "input", selector: content.buildSelector(element), value: String(element.value || "").substring(0, 200), inputType: element.type || "text" });
  }

  function onRecordSubmit(event) {
    const form = event.target;
    postStep({ type: "submit", selector: content.buildSelector(form), action: form.action || location.href });
  }

  function onRecordKey(event) {
    if (!["Enter", "Tab", "Escape"].includes(event.key)) return;
    postStep({ type: "key", key: event.key, selector: content.buildSelector(event.target) });
  }

  function onRecordNav() {
    postStep({ type: "navigate", url: location.href, title: document.title });
  }

  content.startRecording = (automationId) => {
    content.recordingState = { active: true, automationId };
    document.addEventListener("click", onRecordClick, { capture: true });
    document.addEventListener("input", onRecordInput, { capture: true });
    document.addEventListener("submit", onRecordSubmit, { capture: true });
    document.addEventListener("keydown", onRecordKey, { capture: true });
    window.addEventListener("beforeunload", onRecordNav, { capture: true });
    onRecordNav();
  };

  content.stopRecording = () => {
    content.recordingState = { active: false, automationId: null };
    document.removeEventListener("click", onRecordClick, { capture: true });
    document.removeEventListener("input", onRecordInput, { capture: true });
    document.removeEventListener("submit", onRecordSubmit, { capture: true });
    document.removeEventListener("keydown", onRecordKey, { capture: true });
    window.removeEventListener("beforeunload", onRecordNav, { capture: true });
  };
})(window.LLMAssistantContent);
