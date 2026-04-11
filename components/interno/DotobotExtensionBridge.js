import { useCallback, useEffect, useRef, useState } from "react";

const EXTENSION_SOURCE = "universal-llm-assistant-extension";
const FRONTEND_SOURCE = "dotobot-frontend";

export default function useDotobotExtensionBridge() {
  const [extensionReady, setExtensionReady] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const pendingRequests = useRef({});
  const requestId = useRef(0);

  const postHandshake = useCallback(() => {
    if (typeof window === "undefined") return;
    window.postMessage(
      {
        source: FRONTEND_SOURCE,
        type: "DOTOBOT_EXTENSION_PING",
        timestamp: Date.now(),
      },
      "*",
    );
    window.postMessage(
      {
        source: FRONTEND_SOURCE,
        type: "DOTOBOT_COMMAND",
        command: "health_check",
        payload: { origin: "dotobot" },
        requestId: `health_${Date.now()}`,
      },
      "*",
    );
  }, []);

  useEffect(() => {
    function handleMessage(event) {
      if (!event.data || event.data.source !== EXTENSION_SOURCE) return;
      if (event.data.type === "EXTENSION_READY") {
        setExtensionReady(true);
        setLastResponse(event.data);
      }
      if (event.data.type === "EXTENSION_RESPONSE" && event.data.requestId) {
        setExtensionReady(true);
        setLastResponse(event.data);
        if (pendingRequests.current[event.data.requestId]) {
          pendingRequests.current[event.data.requestId](event.data);
          delete pendingRequests.current[event.data.requestId];
        }
      }
    }

    window.addEventListener("message", handleMessage);
    postHandshake();
    const timer = window.setTimeout(() => {
      postHandshake();
    }, 1200);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
    };
  }, [postHandshake]);

  function sendCommand(command, payload = {}) {
    return new Promise((resolve) => {
      const id = ++requestId.current;
      pendingRequests.current[id] = resolve;
      window.postMessage(
        {
          source: FRONTEND_SOURCE,
          type: "DOTOBOT_COMMAND",
          command,
          payload,
          requestId: id,
        },
        "*",
      );
    });
  }

  function probeExtension(timeoutMs = 2400) {
    return new Promise((resolve) => {
      const probeId = `probe_${Date.now()}_${++requestId.current}`;
      const timeout = window.setTimeout(() => {
        delete pendingRequests.current[probeId];
        resolve(null);
      }, timeoutMs);

      pendingRequests.current[probeId] = (data) => {
        window.clearTimeout(timeout);
        resolve(data);
      };

      window.postMessage(
        {
          source: FRONTEND_SOURCE,
          type: "DOTOBOT_COMMAND",
          command: "health_check",
          payload: { origin: "manual_probe" },
          requestId: probeId,
        },
        "*",
      );
    });
  }

  return {
    extensionReady,
    lastResponse,
    probeExtension,
    sendCommand,
  };
}
