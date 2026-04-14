import { adminFetch } from "../../lib/admin/api";

export default function useDotobotAgentLabActions({ loadAgentLabSnapshot, setAgentLabActionState }) {
  async function runAgentLabSync(action, scopeLabel) {
    setAgentLabActionState({ loading: true, scope: action, message: null, tone: "idle" });
    try {
      const payload = await adminFetch("/api/admin-agentlab-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const message = payload?.result?.message || (payload?.result?.unavailable ? payload.result.message : `${scopeLabel} executado com sucesso.`);
      setAgentLabActionState({ loading: false, scope: action, message, tone: payload?.result?.unavailable ? "warning" : "success" });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({ loading: false, scope: action, message: error?.message || `Falha ao executar ${scopeLabel}.`, tone: "error" });
    }
  }

  async function runAgentLabTrainingScenario(scenarioId) {
    if (!scenarioId) return;
    setAgentLabActionState({ loading: true, scope: scenarioId, message: null, tone: "idle" });
    try {
      const payload = await adminFetch("/api/admin-agentlab-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });
      const score = payload?.result?.run?.scores?.overall;
      setAgentLabActionState({
        loading: false,
        scope: scenarioId,
        message: `Treino executado. Score geral ${score != null ? `${Math.round(Number(score) * 100)}%` : "indisponível"}.`,
        tone: "success",
      });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({ loading: false, scope: scenarioId, message: error?.message || "Falha ao executar treinamento.", tone: "error" });
    }
  }

  async function updateAgentLabQueueItemStatus(item, status) {
    if (!item?.id) return;
    setAgentLabActionState({ loading: true, scope: item.id, message: null, tone: "idle" });
    try {
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_queue_item", id: item.id, status, priority: item.priority || "media" }),
      });
      setAgentLabActionState({ loading: false, scope: item.id, message: `Fila atualizada para ${status}.`, tone: "success" });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({ loading: false, scope: item.id, message: error?.message || "Falha ao atualizar fila.", tone: "error" });
    }
  }

  async function updateAgentLabIncidentItemStatus(item, status) {
    if (!item?.id) return;
    setAgentLabActionState({ loading: true, scope: item.id, message: null, tone: "idle" });
    try {
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_incident_item", id: item.id, status, severity: item.severity || "media", description: item.title || null }),
      });
      setAgentLabActionState({ loading: false, scope: item.id, message: `Incidente atualizado para ${status}.`, tone: "success" });
      await loadAgentLabSnapshot({ silent: true });
    } catch (error) {
      setAgentLabActionState({ loading: false, scope: item.id, message: error?.message || "Falha ao atualizar incidente.", tone: "error" });
    }
  }

  return {
    runAgentLabSync,
    runAgentLabTrainingScenario,
    updateAgentLabIncidentItemStatus,
    updateAgentLabQueueItemStatus,
  };
}
