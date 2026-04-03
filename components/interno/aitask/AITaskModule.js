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

function detectModules(mission) {
  const value = mission.toLowerCase();
  const modules = [];
  if (/(lead|leads|crm|cliente|contact|contato)/i.test(value)) modules.push("CRM");
  if (/(process|processo|peti|aÃ§Ã£o|acao|jurid)/i.test(value)) modules.push("Processos");
  if (/(document|pdf|docx|arquivo|file|anexo)/i.test(value)) modules.push("Documentos");
  if (/(finance|pagamento|divida|dÃ­vida|acordo|parcel|cobranca|cobranÃ§a)/i.test(value)) modules.push("Financeiro");
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
      title: "Receber missÃ£o",
      description: "Interpretar o pedido, identificar urgencia e classificar a natureza da tarefa.",
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
      title: "Leitura da missÃ£o",
      timestamp: nowIso(),
      summary: `Interpretando solicitaÃ§Ã£o como tarefa ${critical ? "critica" : "operacional"} no modo ${mode}.`,
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
  const abortRef = useRef(null);
  const pauseRef = useRef(false);
  const logViewportRef = useRef(null);
  const chatViewportRef = useRef(null);
  const missionInputRef = useRef(null);
  const runEventIdsRef = useRef(new Set());
  const pollingInFlightRef = useRef(false);

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
    if (cached.contextSnapshot) setContextSnapshot(cached.contextSnapshot);
    if (Array.isArray(cached.attachments)) setAttachments(cached.attachments);
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
        contextSnapshot,
        attachments,
      })
    );
  }, [storageKey, mission, mode, provider, approved, tasks, thinking, logs, missionHistory, latestResult, contextSnapshot, attachments]);

  useEffect(() => {
    if (!logViewportRef.current) return;
    logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
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
    const runId = activeRun?.id;
    if (!runId) return undefined;

    const terminalStates = new Set(["done", "failed", "stopped"]);
    if (terminalStates.has(automation)) return undefined;

    let disposed = false;
    const poll = async () => {
      if (disposed || pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const payload = await adminFetch("/api/admin-dotobot-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "task_run_get", runId }),
        });

        const run = payload?.data?.run || null;
        const events = Array.isArray(payload?.data?.events) ? payload.data.events : [];
        for (const event of events.slice(-20)) {
          const eventId = event?.id;
          if (!eventId || runEventIdsRef.current.has(eventId)) continue;
          runEventIdsRef.current.add(eventId);
          pushLog({
            type: "backend",
            action: event?.type || "task_run_event",
            result: event?.message || "Evento sem mensagem.",
          });
        }

        const runStatus = run?.status;
        if (run?.result?.resultText) {
          setLatestResult(run.result.resultText);
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
        }
      } catch (pollError) {
        if (!disposed) {
          pushLog({
            type: "warning",
            action: "Polling TaskRun",
            result: pollError?.message || "Falha ao consultar status da execucao.",
          });
        }
      } finally {
        pollingInFlightRef.current = false;
      }
    };

    const intervalId = setInterval(poll, 2500);
    poll();

    return () => {
      disposed = true;
      clearInterval(intervalId);
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
    setAutomation("running");
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
        pushLog({
          type: "backend",
          action: event?.type || "task_run_event",
          result: event?.message || "Evento sem mensagem.",
        });
      });

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

      const resultText = payload?.data?.resultText || payload?.data?.result || run?.result?.resultText || "Sem resposta do executor.";
      setLatestResult(resultText);
      pushLog({
        type: "reporter",
        action: "Resposta recebida",
        result: typeof resultText === "string" ? resultText.slice(0, 180) : "Resultado estruturado entregue.",
      });

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

  return (
    <div className="space-y-4">
      <header className="rounded-[30px] border border-[#22342F] bg-[rgba(10,12,11,0.98)] px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">AI TASK</p>
              <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#D8DEDA]">{stateLabel}</span>
              <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#D8DEDA]">{provider}</span>
              <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#D8DEDA]">{activeMode.label}</span>
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#F5F1E8] md:text-[40px]">Copilot juridico operacional</h2>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[#9BAEA8]">Conversa central dominante, contexto recolhivel e tarefas laterais. O operador ve o que a IA pensa, faz e valida.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleStart} className="rounded-full border border-[#C5A059] px-4 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]">Send</button>
            <button type="button" onClick={handlePause} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{paused ? "Resume" : "Pause"}</button>
            <button type="button" onClick={handleStop} className="rounded-full border border-[#4f2525] px-4 py-2 text-xs text-[#f2b2b2] transition hover:border-[#f2b2b2]">Stop</button>
            <button type="button" onClick={handleApprove} className="rounded-full border border-[#234034] px-4 py-2 text-xs text-[#8FCFA9] transition hover:border-[#8FCFA9]">Approve</button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px_220px]">
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Mission</span>
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
              placeholder="Digite uma instrução juridica ou operacional..."
              className="w-full resize-none rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)} className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
              {MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} - {item.helper}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">LLM</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
              {PROVIDER_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#9BAEA8]">
          <span className="rounded-full border border-[#22342F] px-3 py-2">Mission: {missionHistory[0]?.mission || "sem missao ativa"}</span>
          <span className="rounded-full border border-[#22342F] px-3 py-2">Contexto: {approved ? "aprovado" : "aguardando"}</span>
          <span className="rounded-full border border-[#22342F] px-3 py-2">Rota: {routePath || "/interno/ai-task"}</span>
          {error ? <span className="rounded-full border border-[#5b2d2d] px-3 py-2 text-[#f2b2b2]">{error}</span> : null}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Conversation</p>
              <p className="mt-1 text-sm text-[#9BAEA8]">Chat central com feedback visual do planejamento e da resposta.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowContext((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{showContext ? "Hide context" : "Show context"}</button>
              <button type="button" onClick={() => setShowTasks((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{showTasks ? "Hide tasks" : "Show tasks"}</button>
            </div>
          </div>

          <div ref={chatViewportRef} className="mt-4 max-h-[56vh] space-y-3 overflow-y-auto pr-1">
            {mission ? <Bubble role="user" title="Mission" body={mission} time={activeRun?.startedAt ? new Date(activeRun.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "now"} /> : null}
            {thinking.length ? thinking.map((block) => <ThinkingBlock key={block.id} block={block} />) : <div className="rounded-[26px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[#9BAEA8]">Envie uma instrucao para iniciar o fluxo.</div>}
            {latestResult ? <Bubble role="assistant" title="Dotobot" body={typeof latestResult === "string" ? latestResult : "Resultado estruturado entregue."} details={Array.isArray(thinking) && thinking[0]?.details ? thinking[0].details : []} time={nowIso()} /> : null}
            {activeRun ? <Bubble role="system" title="Execution" body="Execucao em andamento com trilha de auditoria ativa." details={[`Run: ${activeRun.id}`, `Mission: ${activeRun.mission}`]} time={nowIso()} /> : null}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Context drawer</p>
                <p className="mt-1 text-sm text-[#9BAEA8]">Módulo atual, memória e documentos.</p>
              </div>
              <button type="button" onClick={() => setShowContext((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{showContext ? "Collapse" : "Expand"}</button>
            </div>
            {showContext ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Current module</p>
                  <p className="mt-2 text-sm text-[#F5F1E8]">{contextSnapshot?.module || detectModules(mission || "").join(", ")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#9BAEA8]">Route: {contextSnapshot?.route || routePath || "/interno/ai-task"}</p>
                </div>
                <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Memory / RAG</p>
                  <div className="mt-3 space-y-2">
                    {contextSnapshot?.memory?.length ? contextSnapshot.memory.slice(0, 4).map((item, index) => (
                      <div key={item.id || `${index}`} className="rounded-2xl border border-[#22342F] bg-[rgba(4,7,6,0.7)] px-3 py-2 text-sm leading-6 text-[#C6D1CC]">
                        {item.query || item.summary || item.title || JSON.stringify(item).slice(0, 140)}
                      </div>
                    )) : <p className="text-sm text-[#9BAEA8]">Nenhuma memória recuperada ainda.</p>}
                  </div>
                </div>
                <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Documents</p>
                  <div className="mt-3 space-y-2">
                    {contextSnapshot?.documents?.length ? contextSnapshot.documents.slice(0, 4).map((doc, index) => (
                      <div key={doc.id || `${index}`} className="rounded-2xl border border-[#22342F] bg-[rgba(4,7,6,0.7)] px-3 py-2 text-sm leading-6 text-[#C6D1CC]">
                        {doc.title || doc.name || doc.file_name || doc.path || JSON.stringify(doc).slice(0, 140)}
                      </div>
                    )) : <p className="text-sm text-[#9BAEA8]">Sem documentos vinculados nesta execução.</p>}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Tasks drawer</p>
                <p className="mt-1 text-sm text-[#9BAEA8]">Fila secundaria com estado e replay.</p>
              </div>
              <button type="button" onClick={() => setShowTasks((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{showTasks ? "Collapse" : "Expand"}</button>
            </div>
            {showTasks ? (
              <div className="mt-4 space-y-3">
                {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} onSelect={setSelectedTaskId} />) : <div className="rounded-[20px] border border-dashed border-[#22342F] p-3 text-sm text-[#9BAEA8]">Sem tarefas.</div>}
              </div>
            ) : null}
            {selectedTask ? (
              <div className="mt-4 rounded-[26px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Task detail</p>
                    <h3 className="mt-2 text-lg font-semibold text-[#F5F1E8]">{selectedTask.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#9BAEA8]">{selectedTask.goal}</p>
                  </div>
                  <button type="button" onClick={() => handleReplay(selectedTask)} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">Replay</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
                  <span className="rounded-full border border-[#22342F] px-2.5 py-1">Agent: {selectedTask.assignedAgent}</span>
                  <span className="rounded-full border border-[#22342F] px-2.5 py-1">Status: {selectedTask.status}</span>
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Execution tape</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Fila continua de eventos, validacoes e retries.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs"
              className="h-10 w-56 rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
            />
            <span className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#9BAEA8]">{compactLogs.length} events</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {compactLogs.length ? compactLogs.map((log) => (
            <div key={log.id} className="min-w-[220px] rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{log.type}</p>
              <p className="mt-1 text-sm text-[#F5F1E8]">{log.action}</p>
              <p className="mt-1 text-xs leading-5 text-[#9BAEA8]">{log.result}</p>
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-[#22342F] p-4 text-sm text-[#9BAEA8]">Nenhum log para o filtro atual.</div>
          )}
        </div>
      </section>

      <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Composer</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Enter envia, Shift+Enter quebra linha.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_MISSIONS.slice(0, 4).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleQuickMission(value)}
                className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                {value.split(" ").slice(0, 2).join(" ")}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
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
            rows={4}
            placeholder="Digite uma instrução juridica ou operacional..."
            className="w-full resize-none bg-transparent text-sm leading-7 text-[#F5F1E8] outline-none placeholder:text-[#60706A]"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
              Upload
              <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
            </label>
            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                  setError("Voice input not supported in this browser.");
                  return;
                }
                const recognition = new SpeechRecognition();
                recognition.lang = "pt-BR";
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;
                recognition.onresult = (event) => {
                  const transcript = event.results?.[0]?.[0]?.transcript || "";
                  if (transcript) setMission((current) => `${current}${current ? " " : ""}${transcript}`);
                };
                recognition.start();
              }}
              className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Voice
            </button>
            <button type="button" onClick={() => setMission("")} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
              Clear
            </button>
            <button type="button" onClick={handleStart} className="rounded-full border border-[#C5A059] px-4 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]">
              Send
            </button>
          </div>
          {attachments.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {attachments.map((file) => (
                <span key={`${file.name}_${file.size}`} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">
                  {file.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
