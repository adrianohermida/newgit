import { useEffect, useRef } from "react";
import { adminFetch } from "../../../lib/admin/api";

export function useAiTaskRun({
  mission,
  mode,
  provider,
  approved,
  attachments,
  profile,
  routePath,
  automation,
  activeRun,
  missionHistory,
  detectModules,
  normalizeMission,
  buildBlueprint,
  nowIso,
  normalizeTaskRunPayload,
  extractTaskRunMemoryMatches,
  formatExecutionSourceLabel,
  pushLog,
  patchThinking,
  setMission,
  setAutomation,
  setError,
  setEventsTotal,
  setExecutionSource,
  setExecutionModel,
  setPaused,
  setActiveRun,
  setMissionHistory,
  setThinking,
  setTasks,
  setSelectedTaskId,
  setContextSnapshot,
  setLatestResult,
}) {
  const pollingInFlightRef = useRef(false);
  const lastEventCursorRef = useRef(null);
  const lastEventSequenceRef = useRef(null);
  const runEventIdsRef = useRef(new Set());
  const abortRef = useRef(null);
  const pauseRef = useRef(false);

  useEffect(() => {
    let runId = activeRun?.id;
    if (!runId) {
      const localRunId = `${Date.now()}_run`;
      setActiveRun({ id: localRunId, startedAt: nowIso(), mission });
      runId = localRunId;
    }

    const terminalStates = new Set(["done", "failed", "stopped"]);
    if (terminalStates.has(automation)) return undefined;

    let disposed = false;
    let timerId = null;
    let nextDelayMs = 150;

    const scheduleNextPoll = (delayMs) => {
      if (disposed) return;
      timerId = setTimeout(poll, Math.max(250, Number(delayMs) || 2500));
    };

    const poll = async () => {
      if (disposed || pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const payload = await adminFetch("/functions/api/admin-lawdesk-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "task_run_get",
            runId,
            sinceEventId: lastEventCursorRef.current || undefined,
            sinceSequence: lastEventSequenceRef.current || undefined,
            waitForChangeMs: Math.min(Math.max(nextDelayMs * 3, 1500), 10000),
          }),
        });

        const normalized = normalizeTaskRunPayload(payload);
        const run = normalized.run;
        const events = normalized.events;
        if (normalized.eventsCursor) {
          lastEventCursorRef.current = normalized.eventsCursor;
        }
        if (normalized.eventsCursorSequence != null) {
          lastEventSequenceRef.current = normalized.eventsCursorSequence;
        }
        nextDelayMs = normalized.pollIntervalMs != null ? normalized.pollIntervalMs : 2500;
        if (normalized.eventsTotal != null) {
          setEventsTotal(normalized.eventsTotal);
        }
        for (const event of events.slice(-20)) {
          const eventId = event?.id;
          if (!eventId || runEventIdsRef.current.has(eventId)) continue;
          runEventIdsRef.current.add(eventId);
          const eventSource = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
          const eventModel = event?.data?.model || null;
          pushLog({
            type: "backend",
            action: event?.type || "task_run_event",
            result: `${event?.message || "Evento sem mensagem."}${eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""}`,
          });
        }

        const runStatus = run?.status;
        if (normalized.source) setExecutionSource(normalized.source);
        if (normalized.model) setExecutionModel(normalized.model);
        if (normalized.resultText) setLatestResult(normalized.resultText);

        if (normalized.steps.length) {
          const mappedTasks = normalized.steps.map((step, index) => ({
            id: `${run?.id || runId}_step_${index + 1}`,
            title: step?.action || step?.title || `Etapa ${index + 1}`,
            goal: step?.action || step?.title || `Etapa ${index + 1}`,
            description: step?.action || step?.title || "Execucao backend",
            step,
            steps: [step?.action || step?.title || "Execucao backend"],
            status: step?.status === "ok" ? "done" : step?.status === "fail" ? "failed" : "running",
            priority: "high",
            assignedAgent: step?.tool || "Dotobot",
            created_at: nowIso(),
            updated_at: nowIso(),
            logs: step?.error ? [step.error] : [],
            dependencies: [],
          }));
          setTasks(mappedTasks);
          setSelectedTaskId(mappedTasks[0]?.id || null);
        }

        if (normalized.rag) {
          setContextSnapshot({
            module: detectModules(run?.mission || mission).join(", "),
            memory: extractTaskRunMemoryMatches(normalized.rag),
            documents: normalized.rag?.documents || [],
            ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
            route: routePath || "/interno/ai-task",
          });
        }

        if (runStatus === "completed" || runStatus === "failed" || runStatus === "canceled") {
          setAutomation(runStatus === "completed" ? "done" : runStatus === "canceled" ? "stopped" : "failed");
          setActiveRun(null);
          setMissionHistory((current) =>
            current.map((item) =>
              item.id === runId
                ? {
                    ...item,
                    status: runStatus === "completed" ? "done" : "failed",
                    updated_at: nowIso(),
                    result: run?.result?.status || runStatus,
                    error: run?.error || item.error,
                  }
                : item
            )
          );

          if (runStatus === "completed") {
            setTasks((current) =>
              current.map((task) =>
                task.status === "pending" || task.status === "running"
                  ? { ...task, status: "done", updated_at: nowIso() }
                  : task
              )
            );
          }

          if (runStatus === "failed" || runStatus === "canceled") {
            setTasks((current) =>
              current.map((task) =>
                task.status === "pending" || task.status === "running"
                  ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), run?.error || "Execucao interrompida."] }
                  : task
              )
            );
          }
          nextDelayMs = 0;
        }
      } catch (pollError) {
        if (!disposed) {
          pushLog({
            type: "warning",
            action: "Polling TaskRun",
            result: pollError?.message || "Falha ao consultar status da execucao.",
          });
        }
        nextDelayMs = 4000;
      } finally {
        pollingInFlightRef.current = false;
        if (!disposed && activeRun?.id) {
          scheduleNextPoll(nextDelayMs);
        }
      }
    };

    scheduleNextPoll(nextDelayMs);

    return () => {
      disposed = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [
    activeRun?.id,
    automation,
    detectModules,
    extractTaskRunMemoryMatches,
    formatExecutionSourceLabel,
    mission,
    normalizeTaskRunPayload,
    nowIso,
    pushLog,
    routePath,
    setActiveRun,
    setAutomation,
    setContextSnapshot,
    setEventsTotal,
    setExecutionModel,
    setExecutionSource,
    setLatestResult,
    setMissionHistory,
    setSelectedTaskId,
    setTasks,
  ]);

  async function executeMission(overrideMission = mission) {
    const normalizedMission = normalizeMission(overrideMission);
    if (!normalizedMission || automation === "running") return;

    const blueprint = buildBlueprint(normalizedMission, profile, mode, provider);
    const localRunId = `${Date.now()}_run`;
    setError(null);
    runEventIdsRef.current.clear();
    lastEventCursorRef.current = null;
    lastEventSequenceRef.current = null;
    setAutomation("running");
    setEventsTotal(0);
    setExecutionSource(null);
    setExecutionModel(null);
    setPaused(false);
    pauseRef.current = false;
    setActiveRun({ id: localRunId, startedAt: nowIso(), mission: normalizedMission });
    setMissionHistory((current) => [
      {
        id: localRunId,
        mission: normalizedMission,
        mode,
        provider,
        status: "running",
        source: null,
        model: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      ...current,
    ].slice(0, 80));
    setThinking(blueprint.thinking);
    setTasks(blueprint.tasks);
    setSelectedTaskId(blueprint.tasks[0]?.id || null);

    pushLog({
      type: "planner",
      action: "Missao recebida",
      result: `Classificada como ${blueprint.critical ? "critica" : "operacional"} no modo ${mode}.`,
    });
    pushLog({
      type: "planner",
      action: "Mapa de contexto",
      result: `Modulos prioritarios: ${blueprint.modules.join(", ")}.`,
    });

    if (mode === "manual" || (mode === "assisted" && blueprint.critical && !approved)) {
      setAutomation("waiting_approval");
      pushLog({
        type: "control",
        action: "Aguardando aprovacao",
        result: blueprint.critical
          ? "A missao aciona criterio sensivel e requer confirmacao humana."
          : "Modo assistido aguardando liberacao para seguir com a execucao.",
      });
      return;
    }

    try {
      pushLog({
        type: "api",
        action: "Iniciando TaskRun",
        result: "POST /functions/api/admin-lawdesk-chat (action=task_run_start)",
      });

      const payload = await adminFetch("/functions/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "task_run_start",
          query: normalizedMission,
          mode,
          provider,
          context: {
            route: routePath || "/interno/ai-task",
            mission: normalizedMission,
            mode,
            provider,
            approved,
            attachments,
            assistant: { surface: "ai-task", orchestration: "planner-executor-critic" },
            profile: {
              id: profile?.id || null,
              email: profile?.email || null,
              role: profile?.role || null,
            },
          },
        }),
      });

      const normalized = normalizeTaskRunPayload(payload);
      const run = normalized.run;
      if (run?.id) {
        setActiveRun({ id: run.id, startedAt: run.created_at || nowIso(), mission: normalizedMission });
      }

      const backendEvents = normalized.events;
      backendEvents.slice(-12).forEach((event) => {
        if (event?.id) runEventIdsRef.current.add(event.id);
        const eventSource = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
        const eventModel = event?.data?.model || null;
        pushLog({
          type: "backend",
          action: event?.type || "task_run_event",
          result: `${event?.message || "Evento sem mensagem."}${eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""}`,
        });
      });
      if (normalized.eventsCursor) {
        lastEventCursorRef.current = normalized.eventsCursor;
      } else if (backendEvents.length) {
        lastEventCursorRef.current = backendEvents[backendEvents.length - 1]?.id || null;
      }
      if (normalized.eventsCursorSequence != null) {
        lastEventSequenceRef.current = normalized.eventsCursorSequence;
      } else if (backendEvents.length) {
        const seq = Number(backendEvents[backendEvents.length - 1]?.seq);
        lastEventSequenceRef.current = Number.isFinite(seq) ? seq : null;
      }
      if (normalized.eventsTotal != null) {
        setEventsTotal(normalized.eventsTotal);
      } else if (backendEvents.length) {
        setEventsTotal(backendEvents.length);
      }

      const backendSteps = normalized.steps;
      if (backendSteps.length) {
        const mappedTasks = backendSteps.map((step, index) => ({
          id: `${run?.id || localRunId}_step_${index + 1}`,
          title: step?.action || step?.title || `Etapa ${index + 1}`,
          goal: step?.action || step?.title || `Etapa ${index + 1}`,
          description: step?.action || step?.title || "Execucao backend",
          step,
          steps: [step?.action || step?.title || "Execucao backend"],
          status: step?.status === "ok" ? "done" : step?.status === "fail" ? "failed" : "running",
          priority: "high",
          assignedAgent: step?.tool || "Dotobot",
          created_at: nowIso(),
          updated_at: nowIso(),
          logs: step?.error ? [step.error] : [],
          dependencies: [],
        }));
        setTasks(mappedTasks);
        setSelectedTaskId(mappedTasks[0]?.id || null);
      } else {
        setTasks((current) =>
          current.map((task) => ({
            ...task,
            status: run?.status === "failed" ? "failed" : run?.status === "completed" ? "done" : task.status,
            updated_at: nowIso(),
          }))
        );
      }

      const resultText = normalized.resultText;
      const responseSource = normalized.source;
      const responseModel = normalized.model;
      if (responseSource) setExecutionSource(responseSource);
      if (responseModel) setExecutionModel(responseModel);
      if (resultText) {
        setLatestResult(resultText);
        pushLog({
          type: "reporter",
          action: "Resposta recebida",
          result: typeof resultText === "string"
            ? `${resultText.slice(0, 160)}${responseSource ? ` [${responseSource}${responseModel ? ` / ${responseModel}` : ""}]` : ""}`
            : "Resultado estruturado entregue.",
        });
      } else {
        pushLog({
          type: "reporter",
          action: "Resposta pendente",
          result: "TaskRun iniciado. O resultado final sera carregado automaticamente.",
        });
      }

      if (backendSteps.length) {
        patchThinking((current) => [
          {
            id: `${Date.now()}_response`,
            title: "Resposta operacional",
            timestamp: nowIso(),
            summary: "Backend retornou passos reais para auditoria.",
            details: backendSteps.slice(0, 6).map((step) => step?.action || step?.title || JSON.stringify(step)),
            expanded: true,
          },
          ...current,
        ]);
      }

      if (normalized.rag) {
        setContextSnapshot({
          module: detectModules(normalizedMission).join(", "),
          memory: extractTaskRunMemoryMatches(normalized.rag),
          documents: normalized.rag?.documents || [],
          ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
          route: routePath || "/interno/ai-task",
        });
      }

      const runStatus = normalized.status;
      if (runStatus === "completed" || runStatus === "failed" || runStatus === "canceled") {
        setActiveRun(null);
      }
      setMissionHistory((current) =>
        current.map((item) =>
          item.id === localRunId
            ? {
                ...item,
                id: run?.id || item.id,
                status: runStatus === "completed" ? "done" : runStatus === "failed" ? "failed" : "running",
                updated_at: nowIso(),
                result: run?.result?.status || runStatus,
                source: responseSource || item.source || null,
                model: responseModel || item.model || null,
              }
            : item
        )
      );

      setAutomation(runStatus === "completed" ? "done" : runStatus === "failed" ? "failed" : "running");
      pushLog({
        type: "critic",
        action: "Validacao",
        result:
          runStatus === "completed"
            ? "Execucao concluida com trilha de eventos do backend."
            : runStatus === "failed"
              ? "Execucao falhou no backend com status rastreavel."
              : "Execucao iniciada no backend e aguardando conclusao.",
      });
    } catch (missionError) {
      const message = missionError?.message || "Falha ao executar a missao.";
      setError(message);
      setAutomation("failed");
      setMissionHistory((current) =>
        current.map((item) => (item.id === localRunId ? { ...item, status: "failed", updated_at: nowIso(), error: message } : item))
      );
      setTasks((current) =>
        current.map((task) =>
          task.status === "running"
            ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), message] }
            : task
        )
      );
      pushLog({ type: "error", action: "Execucao interrompida", result: message });
    } finally {
      abortRef.current = null;
    }
  }

  function handleStart() {
    executeMission(mission);
  }

  function handlePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
    setAutomation(pauseRef.current ? "paused" : "running");
    pushLog({
      type: "control",
      action: pauseRef.current ? "Pausa acionada" : "Execucao retomada",
      result: pauseRef.current ? "A orquestracao foi pausada pelo operador." : "A orquestracao retomou o fluxo.",
    });
  }

  async function handleStop() {
    if (typeof window !== "undefined" && !window.confirm("Parar a execucao do AI TASK?")) return;
    abortRef.current?.abort();
    const runId = activeRun?.id;
    if (runId) {
      try {
        const payload = await adminFetch("/functions/api/admin-lawdesk-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "task_run_cancel", runId }),
        });
        const canceledStatus = payload?.data?.run?.status;
        if (canceledStatus === "canceled") {
          pushLog({ type: "backend", action: "run.canceled", result: "Cancelamento confirmado pelo backend." });
        }
      } catch (cancelError) {
        pushLog({
          type: "warning",
          action: "Cancelamento parcial",
          result: cancelError?.message || "Falha ao confirmar cancelamento no backend.",
        });
      }
    }
    pauseRef.current = false;
    setPaused(false);
    setAutomation("stopped");
    runEventIdsRef.current.clear();
    lastEventCursorRef.current = null;
    lastEventSequenceRef.current = null;
    setEventsTotal(0);
    setActiveRun(null);
    setTasks((current) =>
      current.map((task) => (task.status === "running" ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), "Interrompido pelo operador."] } : task))
    );
    pushLog({ type: "control", action: "Execucao parada", result: "Operador interrompeu a orquestracao." });
  }

  async function handleContinueLastRun() {
    const lastRecoverable = missionHistory.find((item) => item.status === "failed" || item.status === "stopped");
    if (!lastRecoverable?.id) {
      pushLog({ type: "warning", action: "Retomada", result: "Nao ha run falhado/parado para retomar." });
      return;
    }

    try {
      setError(null);
      setAutomation("running");
      runEventIdsRef.current.clear();
      lastEventCursorRef.current = null;
      lastEventSequenceRef.current = null;
      setEventsTotal(0);
      const payload = await adminFetch("/functions/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "task_run_continue",
          runId: lastRecoverable.id,
          waitForCompletion: false,
        }),
      });

      const normalized = normalizeTaskRunPayload(payload);
      const continuedRun = normalized.run;
      if (continuedRun?.id) {
        setActiveRun({
          id: continuedRun.id,
          startedAt: continuedRun.created_at || nowIso(),
          mission: continuedRun.mission || lastRecoverable.mission || mission,
        });
        setMission(continuedRun.mission || lastRecoverable.mission || mission);
        setMissionHistory((current) => [
          {
            id: continuedRun.id,
            mission: continuedRun.mission || lastRecoverable.mission || mission,
            mode: continuedRun.mode || mode,
            provider: continuedRun.provider || provider,
            status: "running",
            source: null,
            model: null,
            created_at: continuedRun.created_at || nowIso(),
            updated_at: continuedRun.updated_at || nowIso(),
          },
          ...current,
        ].slice(0, 80));
      }
      if (normalized.eventsTotal != null) {
        setEventsTotal(normalized.eventsTotal);
      }

      pushLog({
        type: "control",
        action: "Retomada iniciada",
        result: continuedRun?.id
          ? `Run retomado com novo id ${continuedRun.id}.`
          : "Run anterior ainda estava em execucao; acompanhamento mantido.",
      });
    } catch (continueError) {
      const message = continueError?.message || "Falha ao retomar run.";
      setError(message);
      setAutomation("failed");
      pushLog({ type: "error", action: "Retomada falhou", result: message });
    }
  }

  return { handleStart, handlePause, handleStop, handleContinueLastRun, executeMission };
}
