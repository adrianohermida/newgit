import { useMemo, useRef } from "react";
import {
  AgentLane,
  Bubble,
  ContextRail,
  LogRow,
  MetricPill,
  MissionControlPanel,
  RunsPane,
  TaskCard,
  ThinkingBlock,
} from "./AiTaskPanels";
import {
  buildAgentLanes,
  buildTaskColumns,
  filterLogsBySearch,
  filterLogsByType,
  findSelectedTask,
  normalizeAttachmentsFromEvent,
  resolveAutomationLabel,
  trimRecentHistory,
} from "./aiTaskState";
import {
  detectModules,
  extractTaskRunMemoryMatches,
  formatExecutionSourceLabel,
  normalizeMission,
  normalizeTaskRunPayload,
  requiresApproval,
} from "./aiTaskAdapters";
import { useAiTaskRun } from "./useAiTaskRun";
import { useAiTaskWorkspace } from "./useAiTaskWorkspace";

function formatHistoryStatus(status) {
  const labels = { running: "Executando", done: "Concluído", failed: "Falhou", stopped: "Parado", idle: "Pronto" };
  return labels[status] || String(status || "Indefinido");
}

function nowIso() {
  return new Date().toISOString();
}

const MAX_THINKING = 20;
const MAX_LOGS = 200;

const QUICK_MISSIONS = [
  "Analise este processo e identifique os próximos passos",
  "Redija contestação com base nas alegações do cliente",
  "Crie plano de execução para audiência agendada",
  "Resuma documentos e identifique riscos",
];

const MODE_OPTIONS = [
  { value: "assisted", label: "Assistido" },
  { value: "auto", label: "Automático" },
  { value: "manual", label: "Manual" },
];

const PROVIDER_OPTIONS = [
  { value: "gpt", label: "GPT-4o" },
  { value: "local", label: "Modelo local" },
  { value: "custom", label: "Custom" },
];


function buildBlueprint(normalizedMission, profile, mode, provider) {
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

export default function AITaskModule({ profile, routePath }) {
  const missionInputRef = useRef(null);
  const chatViewportRef = useRef(null);
  const {
    activeRun,
    approved,
    attachments,
    automation,
    contextSnapshot,
    error,
    eventsTotal,
    executionModel,
    executionSource,
    latestResult,
    logs,
    mission,
    missionHistory,
    mode,
    paused,
    provider,
    recentHistory,
    search,
    selectedLogFilter,
    selectedTaskId,
    showContext,
    showTasks,
    tasks,
    thinking,
    handleAttachmentChange,
    handleMissionChange,
    handleQuickMission,
    handleReplay,
    patchThinking,
    pushLog,
    setActiveRun,
    setApproved,
    setAutomation,
    setContextSnapshot,
    setError,
    setEventsTotal,
    setExecutionModel,
    setExecutionSource,
    setLatestResult,
    setMission,
    setMissionHistory,
    setMode,
    setPaused,
    setProvider,
    setSearch,
    setSelectedLogFilter,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
    setTasks,
    setThinking,
  } = useAiTaskWorkspace({
    missionInputRef,
    normalizeAttachmentsFromEvent,
    trimRecentHistory,
    nowIso,
    maxThinking: MAX_THINKING,
    maxLogs: MAX_LOGS,
  });

  const { executeMission, handleContinueLastRun, handlePause, handleStart, handleStop } = useAiTaskRun({
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
  });

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

  const taskColumns = useMemo(() => buildTaskColumns(tasks), [tasks]);
  const agentLanes = useMemo(() => buildAgentLanes(tasks), [tasks]);

  const visibleLogs = useMemo(() => filterLogsByType(logs, selectedLogFilter), [logs, selectedLogFilter]);
  const selectedTask = useMemo(() => findSelectedTask(tasks, selectedTaskId), [tasks, selectedTaskId]);
  const activeMode = MODE_OPTIONS.find((item) => item.value === mode) || MODE_OPTIONS[1];
  const stateLabel = resolveAutomationLabel(automation);

  const compactLogs = useMemo(() => filterLogsBySearch(visibleLogs, search), [visibleLogs, search]);

  return (
    <div className="space-y-4">
      <MissionControlPanel
        stateLabel={stateLabel}
        provider={provider}
        activeModeLabel={activeMode.label}
        executionSource={executionSource}
        executionModel={executionModel}
        eventsTotal={eventsTotal}
        mission={mission}
        missionInputRef={missionInputRef}
        handleMissionChange={handleMissionChange}
        handleStart={handleStart}
        mode={mode}
        setMode={setMode}
        providerValue={provider}
        setProvider={setProvider}
        paused={paused}
        handlePause={handlePause}
        handleStop={handleStop}
        handleContinueLastRun={handleContinueLastRun}
        handleApprove={handleApprove}
        setMission={setMission}
        handleAttachmentChange={handleAttachmentChange}
        attachments={attachments}
        error={error}
        modeOptions={MODE_OPTIONS}
        providerOptions={PROVIDER_OPTIONS}
        formatExecutionSourceLabel={formatExecutionSourceLabel}
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <RunsPane
          recentHistory={recentHistory}
          missionHistory={missionHistory}
          activeRunId={activeRun?.id || null}
          formatHistoryStatus={formatHistoryStatus}
          formatExecutionSourceLabel={formatExecutionSourceLabel}
          nowIso={nowIso}
        />

        <section className="space-y-4 rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Execution Board</p>
              <p className="mt-1 text-sm text-[#9BAEA8]">Linha do tempo, agentes ativos e auditoria operacional em um único plano.</p>
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

          <div className="grid gap-3 md:grid-cols-4">
            <MetricPill label="Running" value={taskColumns.running.length} tone="accent" />
            <MetricPill label="Pending" value={taskColumns.pending.length} />
            <MetricPill label="Done" value={taskColumns.done.length} tone="success" />
            <MetricPill label="Failed" value={taskColumns.failed.length} tone="danger" />
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {agentLanes.length ? agentLanes.map((lane) => <AgentLane key={lane.agent} lane={lane} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} />) : <p className="text-sm text-[#9BAEA8]">Nenhum agente ativo ainda.</p>}
              </div>

              <section className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Timeline</p>
                    <p className="mt-1 text-sm text-[#9BAEA8]">Missão, raciocínio operacional, resposta final e logs auditáveis.</p>
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
            </div>

            <div className="space-y-4">
              <section className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Task board</p>
                  <button type="button" onClick={() => setShowTasks((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">{showTasks ? "Ocultar" : "Mostrar"}</button>
                </div>
                {showTasks ? (
                  <div className="mt-3 space-y-3 max-h-[64vh] overflow-y-auto pr-1">
                    {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} onSelect={setSelectedTaskId} />) : <p className="text-sm text-[#9BAEA8]">Nenhuma tarefa ainda.</p>}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </section>

        <ContextRail
          showContext={showContext}
          setShowContext={setShowContext}
          contextSnapshot={contextSnapshot}
          mission={mission}
          routePath={routePath}
          approved={approved}
          quickMissions={QUICK_MISSIONS}
          handleQuickMission={handleQuickMission}
          selectedTask={selectedTask}
          handleReplay={handleReplay}
          detectModules={detectModules}
        />
      </div>
    </div>
  );
}
