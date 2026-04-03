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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      title: "Leitura da missão",
      timestamp: nowIso(),
      summary: `Interpretando solicitação como tarefa ${critical ? "critica" : "operacional"} no modo ${mode}.`,
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
  const abortRef = useRef(null);
  const pauseRef = useRef(false);
  const logViewportRef = useRef(null);
  const missionInputRef = useRef(null);

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
      })
    );
  }, [storageKey, mission, mode, provider, approved, tasks, thinking, logs, missionHistory, latestResult]);

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

  async function executeMission(overrideMission = mission) {
    const normalizedMission = normalizeMission(overrideMission);
    if (!normalizedMission) return;

    if (automation === "running") return;

    const blueprint = buildBlueprint(normalizedMission, profile, mode, provider);
    const runId = `${Date.now()}_run`;
    setError(null);
    setAutomation("running");
    setPaused(false);
    pauseRef.current = false;
    setActiveRun({ id: runId, startedAt: nowIso(), mission: normalizedMission });
    setMissionHistory((current) => [
      {
        id: runId,
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
      let responsePayload = null;
      for (let index = 0; index < blueprint.tasks.length; index += 1) {
        const task = blueprint.tasks[index];
        if (abortRef.current?.signal?.aborted) {
          throw new Error("Execucao interrompida pelo operador.");
        }

        while (pauseRef.current) {
          // Mantem a UI transparente enquanto a execucao fica em pausa.
          await sleep(250);
        }

        patchTask(task.id, (current) => ({
          ...current,
          status: "running",
          updated_at: nowIso(),
          logs: [...(current.logs || []), "Iniciada pelo executor."],
        }));

        pushLog({
          type: "executor",
          action: `Executando etapa ${index + 1}/${blueprint.tasks.length}`,
          result: task.title,
        });

        patchThinking((current) => [
          {
            id: `${Date.now()}_thinking_${index}`,
            title: `Etapa ${index + 1}`,
            timestamp: nowIso(),
            summary: task.description,
            details: [
              `Agent: ${task.assignedAgent}`,
              `Dependencies: ${task.dependencies?.length ? task.dependencies.join(", ") : "none"}`,
              `Priority: ${task.priority}`,
            ],
            expanded: index === 0,
          },
          ...current,
        ]);

        if (task.id === "execute") {
          const controller = new AbortController();
          abortRef.current = controller;
          pushLog({
            type: "api",
            action: "Chamando backend Dotobot",
            result: "POST /api/admin-dotobot-chat",
          });

          const payload = await adminFetch("/api/admin-dotobot-chat", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: normalizedMission,
              mode,
              provider,
              context: {
                route: routePath || "/interno/ai-task",
                mission: normalizedMission,
                mode,
                provider,
                approved,
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
          responsePayload = payload;
          const resultText = payload?.data?.resultText || payload?.data?.result || "Sem resposta do executor.";
          setLatestResult(resultText);
          patchTask(task.id, (current) => ({
            ...current,
            status: "done",
            updated_at: nowIso(),
            logs: [...(current.logs || []), "Resposta consolidada recebida."],
            resultText,
          }));
          pushLog({
            type: "reporter",
            action: "Resposta recebida",
            result: typeof resultText === "string" ? resultText.slice(0, 180) : "Resultado estruturado entregue.",
          });
          if (payload?.data?.steps?.length) {
            patchThinking((current) => [
              {
                id: `${Date.now()}_response`,
                title: "Resposta operacional",
                timestamp: nowIso(),
                summary: "Backend retornou passos e logs para auditoria.",
                details: payload.data.steps.slice(0, 6).map((step) =>
                  typeof step === "string" ? step : step?.title || JSON.stringify(step)
                ),
                expanded: true,
              },
              ...current,
            ]);
          }
          if (payload?.data?.rag) {
            patchThinking((current) => [
              {
                id: `${Date.now()}_rag`,
                title: "Memoria e documentos usados",
                timestamp: nowIso(),
                summary: "Contexto recuperado para a execucao.",
                details: [
                  `RAG habilitado: ${payload.data.rag?.retrieval?.enabled ? "sim" : "nao"}`,
                  `Matches: ${payload.data.rag?.retrieval?.matches?.length || 0}`,
                  `Documentos: ${(payload.data.rag?.documents || []).length || 0}`,
                ],
                expanded: false,
              },
              ...current,
            ]);
          }
        } else {
          await sleep(300);
          patchTask(task.id, (current) => ({
            ...current,
            status: "done",
            updated_at: nowIso(),
            logs: [...(current.logs || []), "Etapa concluida localmente."],
          }));
        }
      }

      setMissionHistory((current) =>
        current.map((run) =>
          run.id === runId ? { ...run, status: "done", updated_at: nowIso(), result: responsePayload?.data?.status || "done" } : run
        )
      );
      setAutomation("done");
      pushLog({
        type: "critic",
        action: "Validação",
        result: "Execucao concluida com trilha de auditoria disponivel.",
      });
    } catch (missionError) {
      const message = missionError?.message || "Falha ao executar a missao.";
      setError(message);
      setAutomation("failed");
      setMissionHistory((current) =>
        current.map((run) => (run.id === runId ? { ...run, status: "failed", updated_at: nowIso(), error: message } : run))
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
      setActiveRun(null);
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

  function handleStop() {
    if (typeof window !== "undefined" && !window.confirm("Parar a execucao do AI TASK?")) return;
    abortRef.current?.abort();
    pauseRef.current = false;
    setPaused(false);
    setAutomation("stopped");
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

  return (
    <div className="space-y-4">
      <header className="rounded-[30px] border border-[#22342F] bg-[rgba(10,12,11,0.98)] px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">AI TASK</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#F5F1E8] md:text-[40px]">
              Core Orchestration Panel
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[#9BAEA8]">
              Supervisione um operador digital: o AI planeja, executa, valida e reporta cada movimento com trilha de auditoria e controle humano.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA]">
              Estado: <strong className="text-[#F5F1E8]">{stateLabel}</strong>
            </span>
            <span className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA]">
              Modelo: <strong className="text-[#F5F1E8]">{provider}</strong>
            </span>
            <span className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA]">
              Modo: <strong className="text-[#F5F1E8]">{activeMode.label}</strong>
            </span>
            <button
              type="button"
              onClick={handleStart}
              className="rounded-full border border-[#C5A059] px-4 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
            >
              Start AI
            </button>
            <button
              type="button"
              onClick={handlePause}
              className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="rounded-full border border-[#4f2525] px-4 py-2 text-xs text-[#f2b2b2] transition hover:border-[#f2b2b2]"
            >
              Stop
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className="rounded-full border border-[#234034] px-4 py-2 text-xs text-[#8FCFA9] transition hover:border-[#8FCFA9]"
            >
              Approve actions
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_220px]">
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Mission</span>
            <textarea
              ref={missionInputRef}
              value={mission}
              onChange={(event) => handleMissionChange(event.target.value)}
              rows={3}
              placeholder="Ex: Review all new leads and classify them."
              className="w-full resize-none rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
            >
              {MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} - {item.tone}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">LLM</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
            >
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

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1.2fr)_320px]">
        <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Thinking</p>
              <p className="mt-1 text-sm text-[#9BAEA8]">Leitura da missão, contexto recuperado e escolha de ferramentas.</p>
            </div>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#9BAEA8]">
              {thinking.length} blocks
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {thinking.length ? (
              thinking.map((block) => <ThinkingBlock key={block.id} block={block} />)
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#9BAEA8]">
                O AI ainda nao recebeu uma missao para planejar.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Task board</p>
              <p className="mt-1 text-sm text-[#9BAEA8]">Pending, in progress, completed and failed tasks.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedLogFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                  selectedLogFilter === "all"
                    ? "border-[#C5A059] text-[#C5A059]"
                    : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedLogFilter("planner")}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                  selectedLogFilter === "planner"
                    ? "border-[#C5A059] text-[#C5A059]"
                    : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
                }`}
              >
                Planner
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {Object.entries(taskColumns).map(([column, columnTasks]) => (
              <div key={column} className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">{column}</p>
                  <span className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] text-[#9BAEA8]">{columnTasks.length}</span>
                </div>
                <div className="space-y-3">
                  {columnTasks.length ? (
                    columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} onSelect={setSelectedTaskId} />
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-[#22342F] p-3 text-sm text-[#9BAEA8]">
                      Sem tarefas
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedTask ? (
            <div className="mt-4 rounded-[26px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Task detail</p>
                  <h3 className="mt-2 text-lg font-semibold text-[#F5F1E8]">{selectedTask.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#9BAEA8]">{selectedTask.goal}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleReplay(selectedTask)}
                  className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                >
                  Replay
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
                <span className="rounded-full border border-[#22342F] px-2.5 py-1">Agent: {selectedTask.assignedAgent}</span>
                <span className="rounded-full border border-[#22342F] px-2.5 py-1">Priority: {selectedTask.priority}</span>
                <span className="rounded-full border border-[#22342F] px-2.5 py-1">Status: {selectedTask.status}</span>
              </div>
              {selectedTask.logs?.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[#9BAEA8]">Task logs</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-[22px] border border-[#22342F] bg-[rgba(4,7,6,0.95)] p-3 text-[11px] leading-6 text-[#C6D1CC]">
                    {selectedTask.logs.join("\n")}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Control panel</p>
              <p className="mt-1 text-sm text-[#9BAEA8]">Start, pause, stop e aprovacoes.</p>
            </div>
            <div className="mt-4 grid gap-2">
              {QUICK_MISSIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleQuickMission(value)}
                  className="rounded-[20px] border border-[#22342F] px-3 py-2 text-left text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleStart}
                className="rounded-2xl border border-[#C5A059] px-4 py-3 text-sm font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
              >
                Start AI
              </button>
              <button
                type="button"
                onClick={handlePause}
                className="rounded-2xl border border-[#22342F] px-4 py-3 text-sm text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="rounded-2xl border border-[#4f2525] px-4 py-3 text-sm text-[#f2b2b2] transition hover:border-[#f2b2b2]"
              >
                Stop execution
              </button>
              <button
                type="button"
                onClick={handleApprove}
                className="rounded-2xl border border-[#234034] px-4 py-3 text-sm text-[#8FCFA9] transition hover:border-[#8FCFA9]"
              >
                Approve actions
              </button>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Safety & control</p>
            <div className="mt-3 space-y-2 text-sm text-[#9BAEA8]">
              <p>Approval required for sensitive operations.</p>
              <p>Rollback hooks and logs remain visible in the execution stream.</p>
              <p>Manual mode disables direct execution and keeps the AI as a strategist.</p>
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Execution log</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Real time trace of tool calls, validations and retries.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs"
              className="h-10 w-56 rounded-full border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
            />
          </div>
        </div>

        <div ref={logViewportRef} className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {visibleLogs
            .filter((log) => {
              if (!search.trim()) return true;
              const value = `${log.type} ${log.action} ${log.result}`.toLowerCase();
              return value.includes(search.toLowerCase());
            })
            .map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          {!visibleLogs.length ? (
            <div className="rounded-[24px] border border-dashed border-[#22342F] p-4 text-sm text-[#9BAEA8]">
              Nenhum log para o filtro atual.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
