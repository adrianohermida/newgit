import { BRIDGE_URL, state } from "./state.js";
import { fetchJson } from "./bridge.js";

export async function injectPageText(el) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ title: document.title, text: (document.body?.innerText || "").slice(0, 5000) }),
  });
  el.msgInput.value = `[Pagina: ${result?.result?.title || tab.title}]\n${String(result?.result?.text || "").slice(0, 1200)}\n\nPergunta sobre esta pagina:`;
  el.msgInput.focus();
}

export async function injectSelection(el, addSystemMessage) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString() || "" });
  const selected = String(result?.result || "").trim();
  if (!selected) return addSystemMessage(el, "Nenhum texto selecionado.");
  el.msgInput.value = `"${selected.slice(0, 1000)}"\n\nExplique o trecho selecionado:`;
  el.msgInput.focus();
}

export async function takeScreenshot(el, addSystemMessage) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  await fetchJson("/screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, sessionId: state.sessionId, tabUrl: tab?.url, tabTitle: tab?.title }) }, 10000);
  el.msgInput.value = `[Screenshot capturado de: ${tab?.title || tab?.url}]\n\nDescreva o que esta visivel na tela:`;
  el.msgInput.focus();
  addSystemMessage(el, "Screenshot salvo no bridge.");
}

export function bindUpload(el, addSystemMessage) {
  el.btnUpload.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      const data = await fetchJson("/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: loadEvent.target.result, fileName: file.name, mimeType: file.type, sessionId: state.sessionId }) }, 15000);
      el.msgInput.value = data.textContent ? `[Arquivo: ${file.name}]\n${String(data.textContent).slice(0, 1500)}\n\nAnalise o conteudo acima:` : `[Arquivo enviado: ${file.name}]\n\nAnalise este arquivo:`;
      el.msgInput.focus();
      addSystemMessage(el, `Arquivo "${file.name}" enviado.`);
    };
    reader.readAsDataURL(file);
  });
}

export function bindRecorder(el, addSystemMessage) {
  el.btnRecord.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return addSystemMessage(el, "Nenhuma aba ativa para gravacao.");
    if (!state.isRecording) {
      state.isRecording = true;
      state.currentAutomation = `auto_${Date.now()}`;
      el.btnRecord.textContent = "Parar";
      el.btnRecord.classList.add("recording");
      el.recorderStatus.textContent = "Gravando...";
      chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING", automationId: state.currentAutomation }).catch(() => {});
      return addSystemMessage(el, `Gravacao iniciada: ${state.currentAutomation}`);
    }
    state.isRecording = false;
    el.btnRecord.textContent = "Gravar";
    el.btnRecord.classList.remove("recording");
    el.recorderStatus.textContent = "Parado";
    chrome.tabs.sendMessage(tab.id, { type: "STOP_RECORDING" }).catch(() => {});
    addSystemMessage(el, `Gravacao salva: ${state.currentAutomation}`);
    state.currentAutomation = null;
  });
}
