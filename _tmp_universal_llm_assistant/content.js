chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const content = window.LLMAssistantContent;
  if (request.type === "GET_PAGE_TEXT") return void sendResponse({ ok: true, text: (document.body?.innerText || "").substring(0, 8000) });
  if (request.type === "GET_PAGE_META") return void sendResponse({ ok: true, title: document.title || "", url: location.href || "", description: document.querySelector('meta[name="description"]')?.content || "", headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 10).map((el) => el.innerText.trim()).filter(Boolean) });
  if (request.type === "GET_SELECTED_TEXT") return void sendResponse({ ok: true, text: window.getSelection()?.toString() || "" });
  if (request.type === "START_RECORDING") return void (content.startRecording(request.automationId), sendResponse({ ok: true }));
  if (request.type === "STOP_RECORDING") return void (content.stopRecording(), sendResponse({ ok: true }));
  if (request.type === "START_REPLAY") return void (content.startReplayPolling(request.tabId), sendResponse({ ok: true }));
  if (request.type === "STOP_REPLAY") return void (content.stopReplayPolling(), sendResponse({ ok: true }));
  if (request.type === "PING") return void sendResponse({ ok: true, recording: content.recordingState.active });
  return true;
});
