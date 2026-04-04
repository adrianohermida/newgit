import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";

const STORAGE_PREFIX = "ai_task_workspace_v1";
const MAX_LOGS = 200;
const MAX_THINKING = 60;
const MAX_TASKS = 24;

const MODE_OPTIONS = [
  { value: "autonomous", label: "Autonomo", tone: "executa tudo automaticamente" },
  { value: "assisted", label: "Assistido", tone: "sugere e aguarda aprovacao" },
  { value: "manual", label: "Manual", tone: "explica sem executar" },
];

const PROVIDER_OPTIONS = [
  { value: "gpt", label: "GPT" },
  { value: "local", label: "Modelo local" },
  { value: "custom", label: "Custom provider" },
];

const QUICK_MISSIONS = [
  "Review all new leads and classify them.",
  "Analyze the latest processes and identify urgent actions.",
  "Generate a legal strategy summary for the active client.",
  "Create a plan for document review and follow-up.",
];

function buildStorageKey(profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${STORAGE_PREFIX}:${profileId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeMission(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatExecutionSourceLabel(source) {
  const value = String(source || "").trim();
  if (!value) return "n/a";
  if (value === "primary_api") return "Primary API";
  if (value === "supabase_edge") return "Supabase Edge";
  if (value === "workers_ai_direct") return "Workers AI Direct";
  return value;
}

function formatHistoryStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "done" || value === "completed") return "Concluida";
  if (value === "failed") return "Falhou";
  if (value === "running") return "Executando";
  if (value === "stopped" || value === "canceled") return "Parada";
  return "Pendente";
}

function detectModules(mission) {
  const value = mission.toLowerCase();
  const modules = [];
  if (/(lead|leads|crm|cliente|contact|contato)/i.test(value)) modules.push("CRM");
  if (/(process|processo|peti|ação|acao|jurid)/i.test(value)) modules.push("Processos");
  if (/(document|pdf|docx|arquivo|file|anexo)/i.test(value)) modules.push("Documentos");
  if (/(finance|pagamento|divida|dívida|acordo|parcel|cobranca|cobrança)/i.test(value)) modules.push("Financeiro");
  if (/(agenda|agend|calend|reuni)/i.test(value)) modules.push("Agenda");
  if (!modules.length) modules.push("Geral");
  return modules;
}

function requiresApproval(mission) {
  return /(delete|remove|cancel|apagar|excluir|encerrar|publicar|enviar|update|alterar|editar|create|criar|crie|grave|salvar|confirmar)/i.test(
    mission
  );
}

function buildBlueprint(mission, profile, mode, provider) {
  const normalizedMission = normalizeMission(mission);
  const modules = detectModules(normalizedMission);
  const critical = requiresApproval(normalizedMission);
  const steps = [
    {
      id: "intake",
      title: "Receber missão",
      description: "Interpretar o pedido, identificar urgência e classificar a natureza da tarefa.",
      status: "pending",
      dependsOn: [],
      agent: "Dotobot",
      priority: "high",
    },
    {
      id: "context",
      title: "Recuperar contexto",
      description: "Buscar memoria, documentos e sinais do modulo relevante antes de decidir o proximo passo.",
      status: "pending",
      dependsOn: ["intake"],
      agent: "Dotobot",
      priority: critical ? "high" : "medium",
    },
    {
      id: "plan",
      title: "Montar plano",
      description: "Quebrar a missao em tarefas executaveis com ordem, dependencia e risco visivel.",
      status: "pending",
      dependsOn: ["context"],
      agent: "Planner",
      priority: "high",
    },
    {
      id: "execute",
      title: "Executar tarefa principal",
      description: "Acionar o backend e executar a primeira acao relevante com transparencia total.",
      status: "pending",
      dependsOn: ["plan"],
      agent: provider === "local" ? "Modelo local" : "Dotobot",
      priority: "high",
    },
    {
      id: "critic",
      title: "Validar resposta",
      description: "Checar consistencia, risco juridico, lacunas e necessidade de aprovacao humana.",
      status: "pending",
      dependsOn: ["execute"],
      agent: "Critic",
      priority: "medium",
    },
  ];

  const thinking = [
    {
      id: "thought-intake",
      title: "Leitura da missão",
      timestamp: nowIso(),
      summary: `Interpretando solicitação como tarefa ${critical ? "crítica" : "operacional"} no modo ${mode}.`,
      details: [
        `Pedido normalizado: ${normalizedMission || "missao vazia"}`,
        `Modulos candidatos: ${modules.join(", ")}`,
        `Responsavel visivel: ${profile?.full_name || profile?.email || "Hermida Maia"}`,
      ],
      expanded: true,
    },
    {
      id: "thought-context",
      title: "Contexto e memoria",
      timestamp: nowIso(),
      summary: "Selecionando memoria relevante e sinais do modulo atual.",
      details: [
        "Fontes candidatas: Supabase embeddings, Obsidian fallback, contexto de rota e perfil.",
        "Caso o contexto esteja insuficiente, a execucao segue em modo conservador.",
      ],
      expanded: false,
    },
    {
      id: "thought-tools",
      title: "Selecao de ferramentas",
      timestamp: nowIso(),
      summary: `Ferramentas provaveis: ${modules.join(" + ")}.`,
      details: [
        "O orquestrador prioriza leitura, classificacao, consolidacao e validacao antes de acionar acao sensivel.",
        critical ? "Aprovacao manual sera exigida para etapas destrutivas ou sensiveis." : "Execucao pode seguir sem bloqueio se o modo permitir.",
      ],
      expanded: false,
    },
  ];

  const tasks = steps.map((step, index) => ({
    id: `${Date.now()}_${index}`,
    title: step.title,
    goal: step.description,
    description: step.description,
    step,
    steps: [step.description],
    status: index === 0 ? "running" : "pending",
    priority: step.priority,
    assignedAgent: step.agent,
    created_at: nowIso(),
    updated_at: nowIso(),
    logs: [],
    dependencies: step.dependsOn,
  }));

  return {
    mission: normalizedMission,
    critical,
    modules,
    steps,
    tasks,
    thinking,
  };
}

function addLogEntry(appendLog, entry) {
  appendLog({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: nowIso(),
    ...entry,
  });
}

function TaskCard({ task, isSelected, onSelect }) {
  const statusTone = {
    pending: "text-[#9BAEA8] border-[#22342F]",
    running: "text-[#D9B46A] border-[#8b6f33]",
    done: "text-[#8FCFA9] border-[#234034]",
    failed: "text-[#f2b2b2] border-[#5b2d2d]",
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={`w-full rounded-[22px] border p-4 text-left transition ${
        isSelected ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${statusTone[task.status] || "text-[#9BAEA8]"}`}>
            {task.status}
          </p>
          <h4 className="mt-2 text-sm font-semibold text-[#F5F1E8]">{task.title}</h4>
        </div>
        <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#9BAEA8]">
          {task.priority}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#9BAEA8]">{task.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
        <span className="rounded-full border border-[#22342F] px-2.5 py-1">Agent: {task.assignedAgent}</span>
        <span className="rounded-full border border-[#22342F] px-2.5 py-1">Steps: {task.steps.length}</span>
        {task.dependencies?.length ? <span className="rounded-full border border-[#22342F] px-2.5 py-1">Depends: {task.dependencies.join(", ")}</span> : null}
      </div>
    </button>
  );
}

function ThinkingBlock({ block }) {
  return (
    <details open={Boolean(block.expanded)} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">{block.title}</p>
            <p className="mt-2 text-sm leading-6 text-[#F5F1E8]">{block.summary}</p>
          </div>
          <span className="text-[10px] text-[#9BAEA8]">{new Date(block.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </summary>
      <div className="mt-3 space-y-2 text-sm text-[#C6D1CC]">
        {block.details.map((line) => (
          <p key={line} className="rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.75)] px-3 py-2 leading-6">
            {line}
          </p>
        ))}
      </div>
    </details>
  );
}

function LogRow({ log }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{log.type}</p>
        <p className="mt-1 text-sm text-[#F5F1E8]">{log.action}</p>
        <p className="mt-1 text-sm leading-6 text-[#9BAEA8]">{log.result}</p>
      </div>
      <span className="text-[10px] text-[#9BAEA8]">
        {new Date(log.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}

function Bubble({ role = "assistant", title, body, details = [], time }) {
  const isUser = role === "user";
  const isSystem = role === "system";
  const alignClass = isUser ? "justify-end" : "justify-start";
  const bubbleClass = isUser
    ? "border-[#3C3320] bg-[rgba(40,32,19,0.28)] text-[#F7F1E6]"
    : isSystem
      ? "border-[#2E3A36] bg-[rgba(255,255,255,0.02)] text-[#9FB1AA]"
      : "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#F4F1EA]";

  return (
    <div className={`flex ${alignClass}`}>
      <article className={`max-w-[min(48rem,92%)] rounded-[24px] border px-4 py-3 text-sm ${bubbleClass}`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.2em] opacity-60">
          <span>{title || (isUser ? "Mission" : isSystem ? "Execution" : "Dotobot")}</span>
          <span>{time ? new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "now"}</span>
        </div>
        <p className="whitespace-pre-wrap leading-7">{String(body || "")}</p>
        {Array.isArray(details) && details.length ? (
          <div className="mt-3 space-y-2">
            {details.slice(0, 6).map((line, index) => (
              <p key={`${index}_${line}`} className="rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.75)] px-3 py-2 text-xs leading-6 text-[#C6D1CC]">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </article>
    </div>
  );
}

export default function AITaskModule({ profile, routePath }) {
  const storageKey = useMemo(() => buildStorageKey(profile), [profile]);
  const [mission, setMission] = useState("");
  const [mode, setMode] = useState("assisted");
  const [provider, setProvider] = useState("gpt");
  const [automation, setAutomation] = useState("idle");
  const [approved, setApproved] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [thinking, setThinking] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedLogFilter, setSelectedLogFilter] = useState("all");
  const [error, setError] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [paused, setPaused] = useState(false);
  const [missionHistory, setMissionHistory] = useState([]);
  const [showContext, setShowContext] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [contextSnapshot, setContextSnapshot] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [executionSource, setExecutionSource] = useState(null);
  const [executionModel, setExecutionModel] = useState(null);
  const abortRef = useRef(null);
  const pauseRef = useRef(false);
  const logViewportRef = useRef(null);
  const chatViewportRef = useRef(null);
  const missionInputRef = useRef(null);
  const runEventIdsRef = useRef(new Set());
  const pollingInFlightRef = useRef(false);
  const lastEventCursorRef = useRef(null);
  const lastEventSequenceRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = safeParse(window.localStorage.getItem(storageKey), null);
    if (!cached) return;
    if (cached.mission) setMission(cached.mission);
    if (cached.mode) setMode(cached.mode);
    if (cached.provider) setProvider(cached.provider);
    if (typeof cached.approved === "boolean") setApproved(cached.approved);
    if (Array.isArray(cached.tasks)) setTasks(cached.tasks);
    if (Array.isArray(cached.thinking)) setThinking(cached.thinking);
    if (Array.isArray(cached.logs)) setLogs(cached.logs);
    if (Array.isArray(cached.missionHistory)) setMissionHistory(cached.missionHistory);
    if (cached.latestResult) setLatestResult(cached.latestResult);
    if (cached.executionSource) setExecutionSource(cached.executionSource);
    if (cached.executionModel) setExecutionModel(cached.executionModel);
    if (cached.contextSnapshot) setContextSnapshot(cached.contextSnapshot);
    if (Array.isArray(cached.attachments)) setAttachments(cached.attachments);
    if (cached.activeRun?.id) {
      setActiveRun(cached.activeRun);
      setAutomation("running");
      addLogEntry((entry) => {
        setLogs((current) => [...current, entry].slice(-MAX_LOGS));
      }, {
        type: "control",
        action: "Execucao retomada",
        result: `Run ${cached.activeRun.id} restaurado do cache local.`,
      });
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        mission,
        mode,
        provider,
        approved,
        tasks,
        thinking,
        logs,
        missionHistory,
        latestResult,
        executionSource,
        executionModel,
        activeRun,
        contextSnapshot,
        attachments,
      })
    );
  }, [storageKey, mission, mode, provider, approved, tasks, thinking, logs, missionHistory, latestResult, executionSource, executionModel, activeRun, contextSnapshot, attachments]);

  useEffect(() => {
    if (!chatViewportRef.current) return;
    chatViewportRef.current.scrollTop = chatViewportRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        missionInputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setPaused(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function patchTask(taskId, updater) {
    setTasks((current) => current.map((task) => (task.id === taskId ? updater(task) : task)));
  }

  function patchThinking(updater) {
    setThinking((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return next.slice(0, MAX_THINKING);
    });
  }

  function pushLog(entry) {
    addLogEntry((logEntry) => {
      setLogs((current) => [...current, logEntry].slice(-MAX_LOGS));
    }, entry);
  }

  useEffect(() => {
    let runId = activeRun?.id;
    // Se não houver runId, cria um novo automaticamente
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
        const payload = await adminFetch("/api/admin-dotobot-chat", {
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

        const run = payload?.data?.run || null;
        const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];
        if (payload?.data?.eventsCursor) {
          lastEventCursorRef.current = payload.data.eventsCursor;
        }
        if (Number.isFinite(Number(payload?.data?.eventsCursorSequence))) {
          lastEventSequenceRef.current = Number(payload.data.eventsCursorSequence);
        }
        if (Number.isFinite(Number(payload?.data?.pollIntervalMs))) {
          nextDelayMs = Number(payload.data.pollIntervalMs);
        } else {
          nextDelayMs = 2500;
        }
        if (Number.isFinite(Number(payload?.data?.eventsTotal))) {
          setEventsTotal(Number(payload.data.eventsTotal));
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
            result: `${event?.message || "Evento sem mensagem."}${
              eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""
            }`,
          });
        }

        const runStatus = run?.status;
        if (run?.result?.source) {
          setExecutionSource(run.result.source);
        }
        if (run?.result?.model) {
          setExecutionModel(run.result.model);
        }
        if (run?.result?.resultText) {
          setLatestResult(run.result.resultText);
        }

        if (Array.isArray(run?.result?.steps) && run.result.steps.length) {
          const mappedTasks = run.result.steps.map((step, index) => ({
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

        if (run?.result?.rag) {
          setContextSnapshot({
            module: detectModules(run?.mission || mission).join(", "),
            memory: run.result.rag?.retrieval?.matches || run.result.rag?.retrieved_context || [],
            documents: run.result.rag?.documents || [],
            ragEnabled: Boolean(run.result.rag?.retrieval?.enabled || run.result.rag?.documents?.length),
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
  }, [activeRun?.id, automation]);

  async function executeMission(overrideMission = mission) {
    const normalizedMission = normalizeMission(overrideMission);
    if (!normalizedMission) return;

    if (automation === "running") return;

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
    ].slice(0, MAX_TASKS));
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
        result: "POST /api/admin-dotobot-chat (action=task_run_start)",
      });

      const payload = await adminFetch("/api/admin-dotobot-chat", {
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
            assistant: {
              surface: "ai-task",
              orchestration: "planner-executor-critic",
            },
            profile: {
              id: profile?.id || null,
              email: profile?.email || null,
              role: profile?.role || null,
            },
          },
        }),
      });

      const run = payload?.data?.run || null;
      if (run?.id) {
        setActiveRun({ id: run.id, startedAt: run.created_at || nowIso(), mission: normalizedMission });
      }

      const backendEvents = Array.isArray(payload?.data?.events) ? payload.data.events : [];
      backendEvents.slice(-12).forEach((event) => {
        if (event?.id) runEventIdsRef.current.add(event.id);
        const eventSource = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
        const eventModel = event?.data?.model || null;
        pushLog({
          type: "backend",
          action: event?.type || "task_run_event",
          result: `${event?.message || "Evento sem mensagem."}${
            eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""
          }`,
        });
      });
      if (payload?.data?.eventsCursor) {
        lastEventCursorRef.current = payload.data.eventsCursor;
      } else if (backendEvents.length) {
        lastEventCursorRef.current = backendEvents[backendEvents.length - 1]?.id || null;
      }
      if (Number.isFinite(Number(payload?.data?.eventsCursorSequence))) {
        lastEventSequenceRef.current = Number(payload.data.eventsCursorSequence);
      } else if (backendEvents.length) {
        const seq = Number(backendEvents[backendEvents.length - 1]?.seq);
        lastEventSequenceRef.current = Number.isFinite(seq) ? seq : null;
      }
      if (Number.isFinite(Number(payload?.data?.eventsTotal))) {
        setEventsTotal(Number(payload.data.eventsTotal));
      } else if (backendEvents.length) {
        setEventsTotal(backendEvents.length);
      }

      const backendSteps = Array.isArray(payload?.data?.steps) ? payload.data.steps : [];
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

      const resultText = payload?.data?.resultText || payload?.data?.result || run?.result?.resultText || "";
      const responseSource = payload?.data?.source || run?.result?.source || null;
      const responseModel = payload?.data?.model || run?.result?.model || null;
      if (responseSource) {
        setExecutionSource(responseSource);
      }
      if (responseModel) {
        setExecutionModel(responseModel);
      }
      if (resultText) {
        setLatestResult(resultText);
        pushLog({
          type: "reporter",
          action: "Resposta recebida",
          result:
            typeof resultText === "string"
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

      if (payload?.data?.rag) {
        setContextSnapshot({
          module: detectModules(normalizedMission).join(", "),
          memory: payload.data.rag?.retrieval?.matches || payload.data.retrieved_context || [],
          documents: payload.data.rag?.documents || [],
          ragEnabled: Boolean(payload.data.rag?.retrieval?.enabled || payload.data.rag?.documents?.length),
          route: routePath || "/interno/ai-task",
        });
      }

      const runStatus = run?.status || (payload?.ok ? "completed" : "failed");
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
                result: payload?.data?.status || runStatus,
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
            ? {
                ...task,
                status: "failed",
                updated_at: nowIso(),
                logs: [...(task.logs || []), message],
              }
            : task
        )
      );
      pushLog({
        type: "error",
        action: "Execucao interrompida",
        result: message,
      });
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
        const payload = await adminFetch("/api/admin-dotobot-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "task_run_cancel", runId }),
        });
        const canceledStatus = payload?.data?.run?.status;
        if (canceledStatus === "canceled") {
          pushLog({
            type: "backend",
            action: "run.canceled",
            result: "Cancelamento confirmado pelo backend.",
          });
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
    pushLog({
      type: "control",
      action: "Execucao parada",
      result: "Operador interrompeu a orquestracao.",
    });
  }

  async function handleContinueLastRun() {
    const lastRecoverable = missionHistory.find((item) => item.status === "failed" || item.status === "stopped");
    if (!lastRecoverable?.id) {
      pushLog({
        type: "warning",
        action: "Retomada",
        result: "Nao ha run falhado/parado para retomar.",
      });
      return;
    }

    try {
      setError(null);
      setAutomation("running");
      runEventIdsRef.current.clear();
      lastEventCursorRef.current = null;
      lastEventSequenceRef.current = null;
      setEventsTotal(0);
      const payload = await adminFetch("/api/admin-dotobot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "task_run_continue",
          runId: lastRecoverable.id,
          waitForCompletion: false,
        }),
      });

      const continuedRun = payload?.data?.run || null;
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
        ].slice(0, MAX_TASKS));
      }
        if (Number.isFinite(Number(payload?.data?.eventsTotal))) {
          setEventsTotal(Number(payload.data.eventsTotal));
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
      pushLog({
        type: "error",
        action: "Retomada falhou",
        result: message,
      });
    }
  }

  function handleApprove() {
    setApproved(true);
    pushLog({
      type: "control",
      action: "Aprovacao concedida",
      result: "A missao recebeu permissao para seguir.",
    });
    if (automation === "waiting_approval") {
      executeMission(mission);
    }
  }

  const taskColumns = useMemo(() => {
    const base = {
      pending: [],
      running: [],
      done: [],
      failed: [],
    };
    tasks.forEach((task) => {
      const key = task.status === "done" ? "done" : task.status === "failed" ? "failed" : task.status === "running" ? "running" : "pending";
      base[key].push(task);
    });
    return base;
  }, [tasks]);

  const visibleLogs = logs.filter((log) => selectedLogFilter === "all" || log.type === selectedLogFilter);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;
  const activeMode = MODE_OPTIONS.find((item) => item.value === mode) || MODE_OPTIONS[1];
  const stateLabel =
    automation === "running"
      ? "Executando"
      : automation === "paused"
        ? "Pausado"
        : automation === "waiting_approval"
          ? "Aguardando aprovacao"
          : automation === "done"
            ? "Concluido"
            : automation === "failed"
              ? "Falhou"
              : automation === "stopped"
                ? "Parado"
                : "Pronto";

  function handleMissionChange(value) {
    setMission(value);
    setError(null);
  }

  function handleQuickMission(value) {
    setMission(value);
    setError(null);
    missionInputRef.current?.focus();
  }

  function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || []).slice(0, 6).map((file) => ({
      name: file.name,
      type: file.type || "file",
      size: file.size,
    }));
    setAttachments(files);
  }

  function handleReplay(task) {
    if (!task?.goal) return;
    setMission(task.goal);
    setSelectedTaskId(task.id);
    setMode("assisted");
    setAutomation("idle");
    pushLog({
      type: "control",
      action: "Replay selecionado",
      result: `A missao "${task.title}" foi carregada novamente para execucao.`,
    });
    missionInputRef.current?.focus();
  }

  const compactLogs = visibleLogs.filter((log) => {
    if (!search.trim()) return true;
    const value = `${log.type} ${log.action} ${log.result}`.toLowerCase();
    return value.includes(search.toLowerCase());
  });
  const recentHistory = missionHistory.slice(0, 6);

  return (
    <div className="space-y-4">
      <section className="rounded-[30px] border border-[#22342F] bg-[rgba(10,12,11,0.98)] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">AI TASK LEGAL COPILOT</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#F5F1E8] md:text-3xl">Execução jurídica multiagente com controle humano</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[#D8DEDA]">
            <span className="rounded-full border border-[#22342F] px-3 py-1.5">Status: {stateLabel}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5">Modelo: {provider}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5">Modo: {activeMode.label}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5">Execução: {formatExecutionSourceLabel(executionSource)}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5">Modelo efetivo: {executionModel || "n/a"}</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5">Eventos: {eventsTotal}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Missão</span>
            <textarea
              ref={missionInputRef}
              value={mission}
              onChange={(event) => handleMissionChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleStart();
                }
              }}
              rows={3}
              placeholder="Descreva a tarefa jurídica com contexto, objetivo e restrições..."
              className="w-full resize-none rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Modo</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
              {MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
              {PROVIDER_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleStart} className="rounded-full border border-[#C5A059] px-4 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]">Executar</button>
          <button type="button" onClick={handlePause} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{paused ? "Retomar" : "Pausar"}</button>
          <button type="button" onClick={handleStop} className="rounded-full border border-[#4f2525] px-4 py-2 text-xs text-[#f2b2b2] transition hover:border-[#f2b2b2]">Parar</button>
          <button type="button" onClick={handleContinueLastRun} className="rounded-full border border-[#35554B] px-4 py-2 text-xs text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]">Retomar falha</button>
          <button type="button" onClick={handleApprove} className="rounded-full border border-[#234034] px-4 py-2 text-xs text-[#8FCFA9] transition hover:border-[#8FCFA9]">Aprovar ação</button>
          <button type="button" onClick={() => setMission("")} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">Limpar</button>
          <label className="cursor-pointer rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
            Anexar
            <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
          </label>
        </div>

        {attachments.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <span key={`${file.name}_${file.size}`} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">
                {file.name}
              </span>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs text-[#f2b2b2]">{error}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Session Thread</p>
              <p className="mt-1 text-sm text-[#9BAEA8]">Missão, raciocínio operacional, resposta final e execução em tempo real.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filtrar eventos"
                className="h-10 w-40 rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
              />
              {["all", "api", "backend", "planner", "reporter", "control", "error", "warning"].map((filterType) => (
                <button
                  key={filterType}
                  type="button"
                  onClick={() => setSelectedLogFilter(filterType)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition ${
                    selectedLogFilter === filterType
                      ? "border-[#C5A059] text-[#C5A059]"
                      : "border-[#22342F] text-[#7F928C] hover:border-[#35554B] hover:text-[#9BAEA8]"
                  }`}
                >
                  {filterType === "all" ? "Todos" : filterType}
                </button>
              ))}
              <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] text-[#9BAEA8]">{compactLogs.length} logs</span>
            </div>
          </div>

          <div ref={chatViewportRef} className="mt-4 max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {mission ? <Bubble role="user" title="Missão" body={mission} time={activeRun?.startedAt || nowIso()} /> : null}
            {thinking.length ? thinking.map((block) => <ThinkingBlock key={block.id} block={block} />) : null}
            {latestResult ? <Bubble role="assistant" title="Lawdesk mLLM" body={typeof latestResult === "string" ? latestResult : "Resultado estruturado entregue."} time={nowIso()} /> : null}
            {activeRun ? <Bubble role="system" title="Execução" body="Run em andamento com auditoria incremental." details={[`Run: ${activeRun.id}`, `Rota: ${routePath || "/interno/ai-task"}`]} time={nowIso()} /> : null}

            <div className="space-y-2">
              {compactLogs.slice(-80).map((log) => <LogRow key={log.id} log={log} />)}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Plano de execução</p>
              <button type="button" onClick={() => setShowTasks((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">{showTasks ? "Ocultar" : "Mostrar"}</button>
            </div>

            {showTasks ? (
              <div className="mt-3 space-y-3 max-h-[38vh] overflow-y-auto pr-1">
                {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} onSelect={setSelectedTaskId} />) : <p className="text-sm text-[#9BAEA8]">Nenhuma tarefa ainda.</p>}
              </div>
            ) : null}

            {selectedTask ? (
              <div className="mt-3 rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Selecionada</p>
                <p className="mt-2 text-sm text-[#F5F1E8]">{selectedTask.title}</p>
                <p className="mt-2 text-xs text-[#9BAEA8]">{selectedTask.goal}</p>
                <button type="button" onClick={() => handleReplay(selectedTask)} className="mt-3 rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">Reexecutar missão</button>
              </div>
            ) : null}
          </section>

          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Contexto jurídico</p>
              <button type="button" onClick={() => setShowContext((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">{showContext ? "Ocultar" : "Mostrar"}</button>
            </div>

            {showContext ? (
              <div className="mt-3 space-y-3 text-sm text-[#9BAEA8]">
                <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Módulo ativo</p>
                  <p className="mt-2 text-[#F5F1E8]">{contextSnapshot?.module || detectModules(mission || "").join(", ")}</p>
                  <p className="mt-1 text-xs">Rota: {contextSnapshot?.route || routePath || "/interno/ai-task"}</p>
                </div>

                <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Memória e documentos</p>
                  <p className="mt-2 text-xs">Memórias: {contextSnapshot?.memory?.length || 0}</p>
                  <p className="text-xs">Documentos: {contextSnapshot?.documents?.length || 0}</p>
                  <p className="text-xs">Aprovação: {approved ? "concedida" : "pendente"}</p>
                </div>

                <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Missões rápidas</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {QUICK_MISSIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleQuickMission(value)}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        {value.split(" ").slice(0, 3).join(" ")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Histórico recente</p>
              <span className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">{missionHistory.length} runs</span>
            </div>

            <div className="mt-3 space-y-2">
              {recentHistory.length ? recentHistory.map((item) => (
                <article key={`${item.id}_${item.updated_at || item.created_at || ""}`} className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{formatHistoryStatus(item.status)}</p>
                    <p className="text-[10px] text-[#9BAEA8]">{new Date(item.updated_at || item.created_at || nowIso()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <p className="mt-2 text-xs text-[#F5F1E8]">{String(item.mission || "Sem missão registrada").slice(0, 90)}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#9BAEA8]">
                    <span className="rounded-full border border-[#22342F] px-2 py-1">{formatExecutionSourceLabel(item.source)}</span>
                    <span className="rounded-full border border-[#22342F] px-2 py-1">{item.model || "n/a"}</span>
                  </div>
                </article>
              )) : <p className="text-sm text-[#9BAEA8]">Nenhuma execução registrada.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
