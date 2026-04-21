import { state } from "./state.js";
import { fetchJson } from "./bridge.js";
import { addMediaPreview } from "./dom.js";

let recognition = null;
let cameraStream = null;

// sendMessage: () => void (triggers btn-send click for voice STT)
// enqueueOutgoingMessage: function(el, opts, addMsg, addSys, renderTasks) — for camera frame context
export function bindMediaControls(el, addSystemMessage, sendMessage, enqueueOutgoingMessage, addMessage, renderTasks) {
  el.btnVoice?.addEventListener("click", () => {
    state.speakResponses = !state.speakResponses;
    syncMediaButtons(el);
    addSystemMessage(el, state.speakResponses ? `Respostas em audio ativadas (${state.speechLang}).` : "Respostas em audio desativadas.");
  });

  el.btnLang?.addEventListener("click", () => {
    state.speechLang = nextLanguage(state.speechLang);
    syncMediaButtons(el);
    addSystemMessage(el, `Idioma de voz alterado para ${state.speechLang}.`);
  });

  el.btnMic?.addEventListener("click", async () => {
    try {
      if (state.isListening) return stopListening(el);
      await startListening(el, addSystemMessage, sendMessage);
    } catch (error) {
      stopListening(el);
      addSystemMessage(el, `Falha ao iniciar a escuta: ${error?.message || "permissao negada"}`);
    }
  });

  el.btnCamera?.addEventListener("click", async () => {
    try {
      if (cameraStream) {
        stopCamera(el);
        addSystemMessage(el, "Camera desativada.");
        return;
      }
      await startCamera(el, addSystemMessage);
    } catch (error) {
      stopCamera(el);
      addSystemMessage(el, `Falha ao abrir a camera: ${error?.message || "permissao negada"}`);
    }
  });

  el.btnCloseCamera?.addEventListener("click", () => stopCamera(el));
  el.paneCamera?.addEventListener("click", (event) => { if (event.target === el.paneCamera) stopCamera(el); });
  el.btnCaptureCamera?.addEventListener("click", async () => {
    try {
      const dataUrl = captureCameraFrame(el);
      const ts = Date.now();
      const fileName = `camera-${ts}.png`;
      const data = await fetchJson("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, fileName, mimeType: "image/png", sessionId: state.sessionId }),
      }, 15000);
      addMediaPreview(el, "Frame da camera capturado", dataUrl, "image/png");
      addSystemMessage(el, "Frame da camera enviado ao bridge.");
      const promptText = [
        `[Frame da camera capturado]`,
        `Asset: ${data?.id || fileName}`,
        `Timestamp: ${new Date(ts).toLocaleTimeString("pt-BR")}`,
        "",
        "Analise esta imagem capturada pela camera. Descreva os elementos visuais relevantes e sugira as proximas acoes operacionais com base no que e visivel.",
      ].join("\n");
      if (enqueueOutgoingMessage) {
        // store the dataUrl so bridge context picks it up
        state.pendingCameraFrame = dataUrl;
        enqueueOutgoingMessage(
          el,
          {
            text: promptText,
            visibleText: "Analise o frame da camera que acabei de capturar.",
            context: { image: dataUrl, cameraFrameId: data?.id || fileName },
            skipAssetGroup: false,
          },
          addMessage,
          addSystemMessage,
          renderTasks,
        );
        state.pendingCameraFrame = null;
      } else {
        el.msgInput.value = promptText;
        el.msgInput.focus();
      }
    } catch (error) {
      addSystemMessage(el, `Falha ao capturar frame da camera: ${error.message}`);
    }
  });

  syncMediaButtons(el);
}

export function maybeSpeakAssistantReply(text) {
  if (!state.speakResponses || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(String(text || "").slice(0, 1200));
  utterance.lang = state.speechLang;
  const voices = window.speechSynthesis.getVoices?.() || [];
  const voice = voices.find((item) => String(item.lang || "").toLowerCase().startsWith(String(state.speechLang || "").toLowerCase()));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function startListening(el, addSystemMessage, sendMessage) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    addSystemMessage(el, "Reconhecimento de voz nao suportado neste navegador.");
    return;
  }
  recognition = new Recognition();
  recognition.lang = state.speechLang;
  recognition.interimResults = true;
  recognition.continuous = false;
  state.isListening = true;
  syncMediaButtons(el);
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || []).map((item) => item[0]?.transcript || "").join(" ").trim();
    el.msgInput.value = transcript;
    if (event.results?.[event.results.length - 1]?.isFinal && transcript) {
      sendMessage(el);
    }
  };
  recognition.onerror = () => stopListening(el);
  recognition.onend = () => stopListening(el);
  recognition.start();
  addSystemMessage(el, `Escuta de voz iniciada em ${state.speechLang}.`);
}

function stopListening(el) {
  state.isListening = false;
  try { recognition?.stop(); } catch {}
  recognition = null;
  syncMediaButtons(el);
}

async function startCamera(el, addSystemMessage) {
  if (!navigator.mediaDevices?.getUserMedia) {
    addSystemMessage(el, "Camera nao suportada neste navegador.");
    return;
  }
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  el.cameraPreview.srcObject = cameraStream;
  el.paneCamera.style.display = "flex";
  syncMediaButtons(el);
  addSystemMessage(el, "Camera local ativa para preview e captura.");
}

function stopCamera(el) {
  cameraStream?.getTracks?.().forEach((track) => track.stop());
  cameraStream = null;
  if (el.cameraPreview) el.cameraPreview.srcObject = null;
  if (el.paneCamera) el.paneCamera.style.display = "none";
  syncMediaButtons(el);
}

function captureCameraFrame(el) {
  const video = el.cameraPreview;
  const canvas = el.cameraCanvas;
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function nextLanguage(current) {
  const langs = ["pt-BR", "en-US", "es-ES"];
  const index = langs.indexOf(current);
  return langs[(index + 1 + langs.length) % langs.length];
}

function syncMediaButtons(el) {
  if (el.btnVoice) el.btnVoice.textContent = state.speakResponses ? "Som" : "Mudo";
  if (el.btnMic) el.btnMic.textContent = state.isListening ? "Parar" : "Mic";
  if (el.btnCamera) el.btnCamera.textContent = cameraStream ? "Cam on" : "Cam";
  if (el.btnLang) el.btnLang.textContent = languageLabel(state.speechLang);
}

function languageLabel(lang) {
  if (lang === "en-US") return "EN";
  if (lang === "es-ES") return "ES";
  return "PT";
}
