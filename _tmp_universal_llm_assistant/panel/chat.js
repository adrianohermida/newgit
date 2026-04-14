import { state } from "./state.js";
import { callChat } from "./bridge.js";
import { syncSession } from "./lists.js";

export function bindChat(el, addMessage, addSystemMessage) {
  el.btnSend.addEventListener("click", () => sendMessage(el, addMessage, addSystemMessage));
  el.msgInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(el, addMessage, addSystemMessage);
    }
  });
  el.msgInput.addEventListener("input", () => {
    el.msgInput.style.height = "auto";
    el.msgInput.style.height = `${Math.min(el.msgInput.scrollHeight, 100)}px`;
  });
}

export async function sendMessage(el, addMessage, addSystemMessage) {
  const text = String(el.msgInput.value || "").trim();
  if (!text || state.isLoading) return;

  state.isLoading = true;
  setLoading(el, true);
  addMessage(el, "user", text);
  state.messages.push({ role: "user", content: text });
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";

  try {
    const result = await callChat(state.provider, state.messages);
    const reply = result.content || "(sem resposta)";
    state.messages.push({ role: "assistant", content: reply });
    addMessage(el, "assistant", reply);
    if (state.settings.autoSaveSessions) await syncSession();
  } catch (error) {
    addMessage(el, "error", `Erro (${state.provider}): ${error.message}`);
    addSystemMessage(el, "Use Testar conexao em Config para ver a causa exata.");
  } finally {
    state.isLoading = false;
    setLoading(el, false);
  }
}

function setLoading(el, value) {
  el.btnSend.disabled = value;
  el.btnSend.textContent = value ? "..." : "Enviar";
  document.getElementById("typing-indicator")?.remove();
  if (!value) return;
  const wrap = document.createElement("div");
  wrap.id = "typing-indicator";
  wrap.className = "message assistant";
  wrap.innerHTML = '<div class="message-bubble typing"><span></span><span></span><span></span></div>';
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}
