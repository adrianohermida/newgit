// DotobotExtensionBridge.js
// Permite comunicação segura entre Dotobot (frontend) e a extensão Universal LLM Assistant
// Usa window.postMessage para enviar comandos e receber respostas
import { useEffect, useRef, useState } from "react";

export default function useDotobotExtensionBridge() {
  const [extensionReady, setExtensionReady] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const pendingRequests = useRef({});
  const requestId = useRef(0);

  // Ouve respostas da extensão
  useEffect(() => {
    function handleMessage(event) {
      if (!event.data || event.data.source !== "universal-llm-assistant-extension") return;
      if (event.data.type === "EXTENSION_READY") {
        setExtensionReady(true);
      }
      if (event.data.type === "EXTENSION_RESPONSE" && event.data.requestId) {
        setLastResponse(event.data);
        if (pendingRequests.current[event.data.requestId]) {
          pendingRequests.current[event.data.requestId](event.data);
          delete pendingRequests.current[event.data.requestId];
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Envia comando para a extensão
  function sendCommand(command, payload = {}) {
    return new Promise((resolve) => {
      const id = ++requestId.current;
      pendingRequests.current[id] = resolve;
      window.postMessage({
        source: "dotobot-frontend",
        type: "DOTOBOT_COMMAND",
        command,
        payload,
        requestId: id,
      }, "*");
    });
  }

  return {
    extensionReady,
    lastResponse,
    sendCommand,
  };
}
