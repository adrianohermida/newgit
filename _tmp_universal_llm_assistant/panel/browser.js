import { state } from "./state.js";
import { fetchJson } from "./bridge.js";
import { pushErrorLog } from "./error-log.js";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Nenhuma aba ativa disponivel.");
  return tab;
}

async function runInTab(func) {
  const tab = await getActiveTab();
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func });
  return { tab, result: result?.result };
}

async function askContentScript(type) {
  const tab = await getActiveTab();
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type });
    if (result?.ok) return { tab, result };
  } catch {}
  return { tab, result: null };
}

export async function injectPageText(el) {
  try {
    const { tab, result } = await askContentScript("GET_PAGE_SCAN");
    const page = result?.scan || (await runInTab(() => {
      const headings = Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 10).map((item) => item.textContent?.trim()).filter(Boolean);
      const buttons = Array.from(document.querySelectorAll("button,[role='button'],input[type='submit']")).slice(0, 10).map((item) => (item.innerText || item.value || item.getAttribute("aria-label") || "").trim()).filter(Boolean);
      return {
        title: document.title,
        url: location.href,
        text: (document.body?.innerText || "").slice(0, 6000),
        headings,
        buttons,
      };
    })).result || {};
    el.msgInput.value = [
      `[Pagina: ${page.title || tab.title || "sem titulo"}]`,
      `URL: ${page.url || tab.url || ""}`,
      page.headings?.length ? `Titulos: ${page.headings.join(" | ")}` : "",
      page.buttons?.length ? `Acoes visiveis: ${page.buttons.map((item) => typeof item === "string" ? item : item?.text || item?.ariaLabel || item?.selector).filter(Boolean).slice(0, 10).join(" | ")}` : "",
      page.fields?.length ? `Campos: ${page.fields.map((item) => item.placeholder || item.name || item.selector).filter(Boolean).slice(0, 8).join(" | ")}` : "",
      "",
      String(page.text || "").slice(0, 2200),
      "",
      "Analise a pagina acima e proponha os proximos passos.",
    ].filter(Boolean).join("\n");
    el.msgInput.focus();
  } catch (error) {
    pushErrorLog({
      scope: "browser.read_page",
      title: "Falha ao ler a pagina ativa",
      expected: "Extrair titulo, URL e texto da aba atual.",
      actual: error?.message || "Erro ao acessar DOM da aba.",
      trace: "panel/browser.js -> injectPageText()",
      recommendation: "Confirme se a extensao tem permissao nesta origem e recarregue a aba apos atualizar.",
    });
    throw new Error(`Falha ao ler a pagina ativa: ${error.message}`);
  }
}

export async function injectSelection(el, addSystemMessage) {
  try {
    const fromContent = await askContentScript("GET_SELECTED_TEXT");
    const selected = String(fromContent.result?.text || "").trim() || String((await runInTab(() => window.getSelection()?.toString() || "")).result || "").trim();
    if (!selected) return addSystemMessage(el, "Nenhum texto selecionado.");
    el.msgInput.value = `"${selected.slice(0, 1400)}"\n\nExplique, resuma ou use este trecho como contexto operacional.`;
    el.msgInput.focus();
  } catch (error) {
    pushErrorLog({
      scope: "browser.selection",
      title: "Falha ao capturar selecao",
      expected: "Ler o texto selecionado na aba atual.",
      actual: error?.message || "Erro ao acessar a selecao atual.",
      trace: "panel/browser.js -> injectSelection()",
      recommendation: "Selecione um trecho da pagina e confirme se o content script esta ativo nesta origem.",
    });
    addSystemMessage(el, `Falha ao capturar a selecao: ${error.message}`);
  }
}

export async function takeScreenshot(el, addSystemMessage) {
  try {
    const tab = await getActiveTab();
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
    await fetchJson("/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, sessionId: state.sessionId, tabUrl: tab.url, tabTitle: tab.title }),
    }, 15000);
    el.msgInput.value = `[Screenshot capturado de: ${tab.title || tab.url}]\n\nDescreva a interface, os elementos relevantes e as proximas acoes recomendadas.`;
    el.msgInput.focus();
    addSystemMessage(el, "Screenshot salvo no bridge.");
  } catch (error) {
    pushErrorLog({
      scope: "browser.screenshot",
      title: "Falha ao capturar screenshot",
      expected: "Capturar a area visivel e salvar no bridge /screenshot.",
      actual: error?.message || "Falha ao capturar screenshot.",
      trace: "panel/browser.js -> takeScreenshot()",
      recommendation: "Verifique permissao da extensao, disponibilidade do bridge e se a aba atual permite captura.",
    });
    addSystemMessage(el, `Falha ao capturar screenshot: ${error.message}`);
  }
}

export function bindUpload(el, addSystemMessage) {
  el.btnUpload.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const data = await fetchJson("/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: loadEvent.target.result, fileName: file.name, mimeType: file.type, sessionId: state.sessionId }),
        }, 15000);
        el.msgInput.value = data.textContent
          ? `[Arquivo: ${file.name}]\n${String(data.textContent).slice(0, 1800)}\n\nAnalise o conteudo acima.`
          : `[Arquivo enviado: ${file.name}]\n\nAnalise este arquivo.`;
        el.msgInput.focus();
        addSystemMessage(el, `Arquivo "${file.name}" enviado.`);
      } catch (error) {
        pushErrorLog({
          scope: "browser.upload",
          title: "Falha ao enviar arquivo",
          expected: "Enviar arquivo ao bridge e receber contexto processado.",
          actual: error?.message || "Falha no upload do arquivo.",
          trace: "panel/browser.js -> bindUpload()",
          recommendation: "Confirme se o bridge local esta online e se o arquivo pode ser lido pelo navegador.",
          details: { fileName: file.name, mimeType: file.type, sessionId: state.sessionId },
        });
        addSystemMessage(el, `Falha ao enviar arquivo: ${error.message}`);
      }
    };
    reader.readAsDataURL(file);
  });
}

export function bindRecorder(el, addSystemMessage) {
  el.btnRecord.addEventListener("click", async () => {
    try {
      const tab = await getActiveTab();
      if (!state.isRecording) {
        state.isRecording = true;
        state.currentAutomation = `auto_${Date.now()}`;
        el.btnRecord.textContent = "Parar";
        el.btnRecord.classList.add("recording");
        el.recorderStatus.textContent = "Gravando com contexto DOM";
        await chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING", automationId: state.currentAutomation });
        addSystemMessage(el, `Gravacao iniciada: ${state.currentAutomation}`);
        return;
      }
      state.isRecording = false;
      el.btnRecord.textContent = "Gravar";
      el.btnRecord.classList.remove("recording");
      el.recorderStatus.textContent = "Parado";
      await chrome.tabs.sendMessage(tab.id, { type: "STOP_RECORDING" });
      addSystemMessage(el, `Gravacao salva: ${state.currentAutomation}`);
      state.currentAutomation = null;
    } catch (error) {
      pushErrorLog({
        scope: "browser.recording",
        title: "Falha ao controlar gravacao",
        expected: "Enviar START_RECORDING/STOP_RECORDING ao content script da aba ativa.",
        actual: error?.message || "Falha ao controlar gravacao.",
        trace: "panel/browser.js -> bindRecorder()",
        recommendation: "Recarregue a aba, confirme a permissao da extensao nesta origem e teste o handshake do content script.",
        details: { automationId: state.currentAutomation, isRecording: state.isRecording },
      });
      state.isRecording = false;
      el.btnRecord.textContent = "Gravar";
      el.btnRecord.classList.remove("recording");
      el.recorderStatus.textContent = "Falha ao gravar";
      addSystemMessage(el, `Nao foi possivel controlar a gravacao nesta aba: ${error.message}`);
    }
  });
}
