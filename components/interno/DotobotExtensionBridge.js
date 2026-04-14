import { useCallback, useEffect, useRef, useState } from "react";
import { buildCommandMessage, buildHandshakeMessages, createDebugEvent, extractBridgePayload, FRONTEND_SOURCE, isExtensionSource, normalizeEventType } from "./dotobotExtensionBridgeUtils";

export default function useDotobotExtensionBridge() {
  const [extensionReady, setExtensionReady] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [debugEvents, setDebugEvents] = useState([]);
  const pendingRequests = useRef({});
  const requestId = useRef(0);

  const pushDebugEvent = useCallback((event) => {
    setDebugEvents((current) => {
      const next = [createDebugEvent(event), ...current];
      return next.slice(0, 12);
    });
  }, []);

  const postHandshake = useCallback(() => {
    if (typeof window === "undefined") return;
    const [pingMessage, healthCheckMessage] = buildHandshakeMessages();
    pushDebugEvent({ direction: "out", type: pingMessage.type, source: FRONTEND_SOURCE });
    window.postMessage(pingMessage, "*");
    pushDebugEvent({ direction: "out", type: healthCheckMessage.type, source: FRONTEND_SOURCE, command: healthCheckMessage.command });
    window.postMessage(healthCheckMessage, "*");
  }, [pushDebugEvent]);

  useEffect(() => {
    function consumePayload(payload) {
      if (!payload) return;
      if (isExtensionSource(payload.source)) {
        const normalizedType = normalizeEventType(payload.type, payload.command);
        pushDebugEvent({
          direction: "in",
          type: normalizedType || event.data.type || "unknown",
          source: payload.source,
          requestId: payload.requestId || payload.request_id || payload.id || "",
          command: payload.command || "",
        });
      }
      if (!isExtensionSource(payload.source)) return;
      const normalizedType = normalizeEventType(payload.type, payload.command);
      if (normalizedType === "EXTENSION_READY") {
        setExtensionReady(true);
        setLastResponse({ ...payload, type: normalizedType });
      }
      if (normalizedType === "EXTENSION_RESPONSE") {
        const normalizedRequestId = payload.requestId ?? payload.request_id ?? payload.id ?? "";
        setExtensionReady(true);
        setLastResponse({ ...payload, type: normalizedType, requestId: normalizedRequestId });
        if (normalizedRequestId && pendingRequests.current[normalizedRequestId]) {
          pendingRequests.current[normalizedRequestId]({ ...payload, type: normalizedType, requestId: normalizedRequestId });
          delete pendingRequests.current[normalizedRequestId];
        }
      }
    }

    function handleMessage(event) {
      consumePayload(event?.data || null);
    }

    function handleCustomEvent(event) {
      consumePayload(extractBridgePayload(event));
    }

    function handleVisibilityOrFocus() {
      postHandshake();
    }

    window.addEventListener("message", handleMessage);
    window.addEventListener("DOTOBOT_EXTENSION_EVENT", handleCustomEvent);
    document.addEventListener("DOTOBOT_EXTENSION_EVENT", handleCustomEvent);
    window.addEventListener("UNIVERSAL_LLM_EXTENSION_EVENT", handleCustomEvent);
    document.addEventListener("UNIVERSAL_LLM_EXTENSION_EVENT", handleCustomEvent);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    postHandshake();
    const timer = window.setTimeout(() => {
      postHandshake();
    }, 1200);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("DOTOBOT_EXTENSION_EVENT", handleCustomEvent);
      document.removeEventListener("DOTOBOT_EXTENSION_EVENT", handleCustomEvent);
      window.removeEventListener("UNIVERSAL_LLM_EXTENSION_EVENT", handleCustomEvent);
      document.removeEventListener("UNIVERSAL_LLM_EXTENSION_EVENT", handleCustomEvent);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [postHandshake, pushDebugEvent]);

  function sendCommand(command, payload = {}) {
    return new Promise((resolve) => {
      const id = ++requestId.current;
      pendingRequests.current[id] = resolve;
      pushDebugEvent({ direction: "out", type: "DOTOBOT_COMMAND", source: FRONTEND_SOURCE, command, requestId: id });
      window.postMessage(buildCommandMessage(command, payload, id), "*");
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

      pushDebugEvent({ direction: "out", type: "DOTOBOT_COMMAND", source: FRONTEND_SOURCE, command: "health_check", requestId: probeId });
      window.postMessage(buildCommandMessage("health_check", { origin: "manual_probe" }, probeId), "*");
    });
  }

  return {
    extensionReady,
    lastResponse,
    debugEvents,
    probeExtension,
    sendCommand,
  };
}
