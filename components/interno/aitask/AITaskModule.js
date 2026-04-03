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

