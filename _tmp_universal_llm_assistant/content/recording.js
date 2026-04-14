(function attachRecording(content) {
  function buildMeta(event, element) {
    return {
      timestamp: Date.now(),
      pageUrl: location.href,
      pageTitle: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      pointer: event ? {
        clientX: Math.round(event.clientX || 0),
        clientY: Math.round(event.clientY || 0),
        pageX: Math.round(event.pageX || 0),
        pageY: Math.round(event.pageY || 0),
        button: Number(event.button || 0),
      } : null,
      modifiers: event ? {
        altKey: !!event.altKey,
        ctrlKey: !!event.ctrlKey,
        metaKey: !!event.metaKey,
        shiftKey: !!event.shiftKey,
      } : null,
      element: content.buildElementSnapshot(element),
      selectedText: String(window.getSelection?.()?.toString?.() || "").trim().slice(0, 280),
    };
  }

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

  function onRecordPointer(event) {
    const element = event.target;
    if (!element || element.tagName === "HTML") return;
    postStep({
      type: "click",
      ...buildMeta(event, element),
      text: (element.innerText || element.value || "").replace(/\s+/g, " ").trim().slice(0, 120),
      href: element.href || null,
    });
  }

  function onRecordInput(event) {
    const element = event.target;
    if (!element || !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.type === "password") return;
    postStep({
      type: "input",
      ...buildMeta(event, element),
      value: String(element.value || "").slice(0, 400),
      inputType: element.type || "text",
    });
  }

  function onRecordChange(event) {
    const element = event.target;
    if (!element || !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.type === "password") return;
    postStep({
      type: "change",
      ...buildMeta(event, element),
      value: String(element.value || "").slice(0, 400),
      inputType: element.type || "text",
    });
  }

  function onRecordSubmit(event) {
    const form = event.target;
    postStep({
      type: "submit",
      ...buildMeta(event, form),
      action: form.action || location.href,
      method: form.method || "get",
    });
  }

  function onRecordKey(event) {
    const target = event.target;
    const printable = event.key && event.key.length === 1;
    if (!printable && !["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }
    postStep({
      type: "key",
      ...buildMeta(event, target),
      key: event.key,
      code: event.code || null,
      repeat: !!event.repeat,
    });
  }

  function onRecordScroll() {
    const now = Date.now();
    if (now - content.recordingState.lastScrollAt < 250) return;
    content.recordingState.lastScrollAt = now;
    postStep({
      type: "scroll",
      timestamp: now,
      pageUrl: location.href,
      pageTitle: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
    });
  }

  function onRecordNav() {
    postStep({
      type: "navigate",
      timestamp: Date.now(),
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
    });
  }

  content.startRecording = (automationId) => {
    content.recordingState = { active: true, automationId, lastScrollAt: 0 };
    document.addEventListener("click", onRecordPointer, { capture: true });
    document.addEventListener("input", onRecordInput, { capture: true });
    document.addEventListener("change", onRecordChange, { capture: true });
    document.addEventListener("submit", onRecordSubmit, { capture: true });
    document.addEventListener("keydown", onRecordKey, { capture: true });
    window.addEventListener("scroll", onRecordScroll, { capture: true, passive: true });
    window.addEventListener("beforeunload", onRecordNav, { capture: true });
    onRecordNav();
  };

  content.stopRecording = () => {
    content.recordingState = { active: false, automationId: null, lastScrollAt: 0 };
    document.removeEventListener("click", onRecordPointer, { capture: true });
    document.removeEventListener("input", onRecordInput, { capture: true });
    document.removeEventListener("change", onRecordChange, { capture: true });
    document.removeEventListener("submit", onRecordSubmit, { capture: true });
    document.removeEventListener("keydown", onRecordKey, { capture: true });
    window.removeEventListener("scroll", onRecordScroll, { capture: true });
    window.removeEventListener("beforeunload", onRecordNav, { capture: true });
  };
})(window.LLMAssistantContent);
