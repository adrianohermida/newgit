import { state } from "./state.js";
import { fetchJson } from "./bridge.js";
import { pushErrorLog } from "./error-log.js";
import { addMediaPreview, addProgressMessage, finishProgressMessage, updateActiveAssetGroup, updateProgressMessage } from "./dom.js";
import { syncSession } from "./lists.js";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Nenhuma aba ativa disponivel.");
  return tab;
}

async function ensureTabPermission(actionLabel) {
  const tab = await getActiveTab();
  guardSupportedTab(tab, actionLabel);
  const origin = safeOrigin(tab.url);
  const trusted = Array.isArray(state.settings.trustedTabOrigins) ? state.settings.trustedTabOrigins : [];
  const allowed = state.settings.alwaysAllowTabAccess || (origin && trusted.includes(origin));
  if (!allowed) {
    const grant = window.confirm(`O LLM Assistente quer acessar a guia ativa para: ${actionLabel}.\n\nOrigem: ${origin || tab.url || "desconhecida"}\n\nDeseja permitir agora?`);
    if (!grant) throw new Error("Acesso a guia negado pelo usuario.");
    const remember = window.confirm("Deseja confiar nesta origem para proximos acessos do assistente?");
    if (remember && origin) {
      state.settings.trustedTabOrigins = [...trusted, origin].filter((item, index, list) => item && list.indexOf(item) === index);
      chrome.storage.local.set({ llm_settings: state.settings });
    }
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "MARK_AGENT_TAB", reason: actionLabel });
  } catch {}
  return tab;
}

function guardSupportedTab(tab, actionLabel = "usar a guia atual") {
  const url = String(tab?.url || "");
  if (isRestrictedUrl(url)) {
    throw new Error(`A extensao nao pode ${actionLabel} em URLs internas do navegador (${url}). Abra uma pagina comum, como https://www.google.com, e tente novamente.`);
  }
}

function safeOrigin(url) {
  try {
    return new URL(String(url || "")).origin;
  } catch {
    return "";
  }
}

function isRestrictedUrl(url) {
  return /^(edge|chrome|about|devtools):/i.test(String(url || ""));
}

async function runInTab(func) {
  const tab = await ensureTabPermission("executar leitura na guia ativa");
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func });
  return { tab, result: result?.result };
}

async function askContentScript(type) {
  const tab = await ensureTabPermission("interagir com o content script da guia ativa");
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type });
    if (result?.ok) return { tab, result };
  } catch {}
  return { tab, result: null };
}

export async function openAgentTab(el, addSystemMessage) {
  const current = await getActiveTab();
  const currentUrl = String(current?.url || "");
  const targetUrl = isRestrictedUrl(currentUrl) ? "https://www.google.com/" : currentUrl || "https://www.google.com/";
  const tab = await chrome.tabs.create({ url: targetUrl, active: true });
  window.setTimeout(() => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "MARK_AGENT_TAB", reason: "Guia dedicada ao agente" }).catch(() => {});
  }, 1200);
  addSystemMessage(el, `Nova guia aberta para uso do agente: ${targetUrl}`);
}

export async function injectPageText(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks) {
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
    const prompt = [
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
    activateContextBundle(el, {
      title: page.title || tab.title || "Pagina ativa",
      type: "page_scan",
      item: {
        id: `page_${Date.now()}`,
        kind: "page_scan",
        fileName: page.title || tab.title || "Pagina ativa",
        mimeType: "text/plain",
        tabTitle: page.title || tab.title || "",
      },
    });
    enqueueOutgoingMessage(
      el,
      { text: prompt, visibleText: "Leia a pagina atual e me explique o que encontrou.", skipAssetGroup: true },
      addMessage,
      addSystemMessage,
      renderTasks,
    );
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

export async function injectSelection(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks) {
  try {
    const fromContent = await askContentScript("GET_SELECTED_TEXT");
    const selected = String(fromContent.result?.text || "").trim() || String((await runInTab(() => window.getSelection()?.toString() || "")).result || "").trim();
    if (!selected) return addSystemMessage(el, "Nenhum texto selecionado.");
    const clipped = selected.slice(0, 1800);
    enqueueOutgoingMessage(
      el,
      {
        text: `[Selecao da pagina]\n\n"${clipped}"\n\nUse este trecho como contexto e explique o que ele significa no fluxo atual.`,
        visibleText: `Use a selecao atual como contexto: "${clipped.slice(0, 160)}${clipped.length > 160 ? "..." : ""}"`,
      },
      addMessage,
      addSystemMessage,
      renderTasks,
    );
  } catch (error) {
    pushErrorLog({
      scope: "browser.selection",
      title: "Falha ao capturar selecao",
      expected: "Ler o texto selecionado na aba atual.",
      actual: error?.message || "Erro ao acessar a selecao atual.",
      trace: "panel/browser.js -> injectSelection()",
      recommendation: "Use uma pagina web comum, selecione um trecho e confirme se o content script esta ativo nesta origem.",
    });
    addSystemMessage(el, `Falha ao capturar a selecao: ${error.message}`);
  }
}

export async function takeScreenshot(el, addSystemMessage) {
  try {
    const tab = await ensureTabPermission("capturar a guia ativa");
    if (isRestrictedUrl(tab.url)) {
      throw new Error("Captura indisponivel em paginas internas do navegador. Abra um site comum e tente novamente.");
    }
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const data = await fetchJson("/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, sessionId: state.sessionId, tabUrl: tab.url, tabTitle: tab.title }),
    }, 15000);
    activateContextBundle(el, {
      title: tab.title || "Captura da guia",
      type: "screenshot",
      item: {
        id: data.id || `shot_${Date.now()}`,
        kind: "screenshot",
        fileName: `${data.id || "screenshot"}.png`,
        mimeType: "image/png",
        tabTitle: tab.title || "",
      },
    });
    addSystemMessage(el, "Screenshot salvo no bridge.");
    return { tab, dataUrl };
  } catch (error) {
    pushErrorLog({
      scope: "browser.screenshot",
      title: "Falha ao capturar screenshot",
      expected: "Capturar a area visivel e salvar no bridge /screenshot.",
      actual: error?.message || "Falha ao capturar screenshot.",
      trace: "panel/browser.js -> takeScreenshot()",
      recommendation: "Use uma aba web comum, recarregue a pagina apos atualizar a extensao e tente novamente.",
    });
    addSystemMessage(el, `Falha ao capturar screenshot: ${error.message}`);
    return null;
  }
}

export function bindUpload(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks) {
  el.btnUpload.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    event.target.value = "";
    for (const currentFile of files) {
      const progressId = addProgressMessage(el, `Anexando ${currentFile.name}`, "Preparando arquivo...");
      const reader = new FileReader();
      reader.onprogress = (loadEvent) => {
        if (!loadEvent.lengthComputable) return;
        const pct = Math.round((loadEvent.loaded / loadEvent.total) * 35);
        updateProgressMessage(el, progressId, pct, "Lendo arquivo no navegador...");
      };
      reader.onload = async (loadEvent) => {
        try {
          updateProgressMessage(el, progressId, 55, "Enviando ao bridge local...");
          const data = await fetchJson("/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl: loadEvent.target.result, fileName: currentFile.name, mimeType: currentFile.type, sessionId: state.sessionId }),
          }, 15000);
          updateProgressMessage(el, progressId, 82, "Processando contexto do arquivo...");
          const extracted = data.textContent ? String(data.textContent).slice(0, 2200) : "";
          const isImage = /^image\//i.test(String(currentFile.type || ""));
          activateContextBundle(el, {
            title: currentFile.name,
            type: "upload",
            item: {
              id: data.id || `upload_${Date.now()}`,
              kind: "upload",
              fileName: data.fileName || currentFile.name,
              mimeType: currentFile.type || "",
              tabTitle: "",
            },
          });
          if (isImage && typeof loadEvent.target.result === "string") {
            addMediaPreview(el, `Imagem anexada: ${currentFile.name}`, loadEvent.target.result, currentFile.type || "image");
          }
          finishProgressMessage(el, progressId, "Arquivo indexado no contexto da conversa.");
          enqueueOutgoingMessage(
            el,
            {
              text: extracted
                ? `[Arquivo: ${currentFile.name}]\n\nConteudo extraido:\n${extracted}\n\nAnalise o arquivo, identifique do que se trata e diga como ele pode ajudar na tarefa atual.`
                : `[Arquivo enviado: ${currentFile.name}]\n\nO arquivo foi anexado ao contexto. Diga do que provavelmente se trata e como devemos usa-lo.`,
              visibleText: `Analise o arquivo anexado: ${currentFile.name}`,
              skipAssetGroup: true,
            },
            addMessage,
            addSystemMessage,
            renderTasks,
          );
          addSystemMessage(el, `Arquivo "${currentFile.name}" enviado.`);
        } catch (error) {
          updateProgressMessage(el, progressId, 100, `Falha: ${error.message}`);
          pushErrorLog({
            scope: "browser.upload",
            title: "Falha ao enviar arquivo",
            expected: "Enviar arquivo ao bridge e receber contexto processado.",
            actual: error?.message || "Falha no upload do arquivo.",
            trace: "panel/browser.js -> bindUpload()",
            recommendation: "Confirme se o bridge local esta online e se o arquivo pode ser lido pelo navegador.",
            details: { fileName: currentFile.name, mimeType: currentFile.type, sessionId: state.sessionId },
          });
          addSystemMessage(el, `Falha ao enviar arquivo: ${error.message}`);
        }
      };
      reader.readAsDataURL(currentFile);
    }
  });
}

function activateContextBundle(el, { title, type, item }) {
  const current = state.activeAssetGroup;
  const now = new Date().toISOString();
  const nextAssets = mergeContextItems(current?.assets || [], item);
  state.activeAssetGroup = {
    id: current?.id || `ctx_${Date.now()}`,
    title: current?.title || "Contexto ativo",
    sessionId: state.sessionId,
    sourceType: type || current?.sourceType || "mixed",
    updatedAt: now,
    assetRefs: nextAssets.map((entry) => ({ id: entry.id, kind: entry.kind })),
    assets: nextAssets,
    summaryTitle: title || current?.summaryTitle || "Contexto ativo",
  };
  updateActiveAssetGroup(el, {
    ...state.activeAssetGroup,
    title: state.activeAssetGroup.title || title || "Contexto ativo",
  });
  syncSession().catch(() => {});
}

function mergeContextItems(existing, nextItem) {
  const items = Array.isArray(existing) ? [...existing] : [];
  const normalized = {
    id: nextItem?.id || `ctx_item_${Date.now()}`,
    kind: nextItem?.kind || "context",
    fileName: nextItem?.fileName || nextItem?.tabTitle || "Item de contexto",
    mimeType: nextItem?.mimeType || "",
    tabTitle: nextItem?.tabTitle || "",
  };
  const index = items.findIndex((entry) => entry.id === normalized.id && entry.kind === normalized.kind);
  if (index >= 0) items[index] = normalized;
  else items.unshift(normalized);
  return items.slice(0, 12);
}

export function bindRecorder(el, addSystemMessage) {
  el.btnRecord.addEventListener("click", async () => {
    try {
      const tab = await ensureTabPermission("gravar interacoes na guia ativa");
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
