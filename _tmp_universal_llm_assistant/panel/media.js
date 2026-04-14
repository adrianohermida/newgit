import { state } from "./state.js";
import { fetchJson } from "./bridge.js";

let recognition = null;
let cameraStream = null;

export function bindMediaControls(el, addSystemMessage, sendMessage) {
  el.btnVoice?.addEventListener("click", () => {
    state.speakResponses = !state.speakResponses;
    el.btnVoice.textContent = state.speakResponses ? "Audio on" : "Audio off";
    addSystemMessage(el, state.speakResponses ? "Respostas em audio ativadas (pt-BR)." : "Respostas em audio desativadas.");
  });

  el.btnMic?.addEventListener("click", async () => {
    if (state.isListening) return stopListening(el);
    await startListening(el, addSystemMessage, sendMessage);
  });

  el.btnCamera?.addEventListener("click", async () => {
    await startCamera(el, addSystemMessage);
  });

  el.btnCloseCamera?.addEventListener("click", () => stopCamera(el));
  el.paneCamera?.addEventListener("click", (event) => { if (event.target === el.paneCamera) stopCamera(el); });
  el.btnCaptureCamera?.addEventListener("click", async () => {
    try {
      const dataUrl = captureCameraFrame(el);
      const data = await fetchJson("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, fileName: `camera-${Date.now()}.png`, mimeType: "image/png", sessionId: state.sessionId }),
      }, 15000);
      el.msgInput.value = `[Frame da camera capturado]\n\nAnalise a imagem capturada e descreva elementos visuais relevantes para a tarefa atual.`;
      if (data?.path) addSystemMessage(el, "Frame da camera enviado ao bridge.");
      el.msgInput.focus();
    } catch (error) {
      addSystemMessage(el, `Falha ao capturar frame da camera: ${error.message}`);
    }
  });
}

export function maybeSpeakAssistantReply(text) {
  if (!state.speakResponses || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(String(text || "").slice(0, 1200));
  utterance.lang = "pt-BR";
  const voices = window.speechSynthesis.getVoices?.() || [];
  const voice = voices.find((item) => String(item.lang || "").toLowerCase().startsWith("pt-br"));
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
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.continuous = false;
  state.isListening = true;
  el.btnMic.textContent = "Ouvindo...";
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
  addSystemMessage(el, "Escuta de voz iniciada em pt-BR.");
}

function stopListening(el) {
  state.isListening = false;
  el.btnMic.textContent = "Falar";
  try { recognition?.stop(); } catch {}
  recognition = null;
}

async function startCamera(el, addSystemMessage) {
  if (!navigator.mediaDevices?.getUserMedia) {
    addSystemMessage(el, "Camera nao suportada neste navegador.");
    return;
  }
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  el.cameraPreview.srcObject = cameraStream;
  el.paneCamera.style.display = "flex";
  addSystemMessage(el, "Camera local ativa para preview e captura.");
}

function stopCamera(el) {
  cameraStream?.getTracks?.().forEach((track) => track.stop());
  cameraStream = null;
  if (el.cameraPreview) el.cameraPreview.srcObject = null;
  if (el.paneCamera) el.paneCamera.style.display = "none";
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
