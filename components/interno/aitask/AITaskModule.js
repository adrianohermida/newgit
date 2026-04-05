import { useMemo, useRef, useState } from "react";
import {
  Bubble,
  ConfirmModal,
  ConversationComposer,
  ContextRail,
  LogRow,
  MetricPill,
  RunsPane,
  TaskInspector,
  ThinkingBlock,
  WorkspaceHeader,
} from "./AiTaskPanels";
import {
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
  const labels = {
    running: "Executando",
    done: "Concluído",
    failed: "Falhou",
    stopped: "Parado",
    idle: "Pronto",
  };
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
      description: "Buscar memória, documentos e sinais do módulo relevante antes de decidir o próximo passo.",
      status: "pending",
      dependsOn: ["intake"],
      agent: "Dotobot",
      priority: critical ? "high" : "medium",
    },
    {
      id: "plan",
      title: "Montar plano",
      description: "Quebrar a missão em tarefas executáveis com ordem, dependência e risco visível.",
      status: "pending",
      dependsOn: ["context"],
      agent: "Planner",
      priority: "high",
    },
    {
      id: "execute",
      title: "Executar tarefa principal",
      description: "Acionar o backend e executar a primeira ação relevante com transparência total.",
      status: "pending",
      dependsOn: ["plan"],
      agent: provider === "local" ? "Modelo local" : "Dotobot",
      priority: "high",
    },
    {
      id: "critic",
      title: "Validar resposta",
      description: "Checar consistência, risco jurídico, lacunas e necessidade de aprovação humana.",
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
        `Pedido normalizado: ${normalizedMission || "missão vazia"}`,
        `Módulos candidatos: ${modules.join(", ")}`,
        `Responsável visível: ${profile?.full_name || profile?.email || "Hermida Maia Advocacia"}`,
      ],
      expanded: true,
    },
    {
      id: "thought-context",
      title: "Contexto e memória",
      timestamp: nowIso(),
      summary: "Selecionando memória relevante e sinais do módulo atual.",
      details: [
        "Fontes candidatas: Supabase embeddings, Obsidian fallback, contexto de rota e perfil.",
        "Caso o contexto esteja insuficiente, a execução segue em modo conservador.",
      ],
      expanded: false,
    },
    {
      id: "thought-tools",
      title: "Seleção de ferramentas",
      timestamp: nowIso(),
      summary: `Ferramentas prováveis: ${modules.join(" + ")}.`,
      details: [
        "O orquestrador prioriza leitura, classificação, consolidação e validação antes de acionar ação sensível.",
        critical ? "Aprovação manual será exigida para etapas destrutivas ou sensíveis." : "Execução pode seguir sem bloqueio se o modo permitir.",
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
    tasks,
    thinking,
  };
}

export default function AITaskModule({ profile, routePath }) {
  const missionInputRef = useRef(null);
  const chatViewportRef = useRef(null);
  const [stopModalOpen, setStopModalOpen] = useState(false);
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
    handleAttachmentDrop,
    handleMissionChange,
    handleQuickMission,
    handleReplay,
    handleSelectRun,
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
    profile,
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
      action: "Aprovação concedida",
      result: "A missão recebeu permissão para seguir.",
    });
    if (automation === "waiting_approval") {
      executeMission(mission);
    }
  }

  const taskColumns = useMemo(() => buildTaskColumns(tasks), [tasks]);
  const visibleLogs = useMemo(() => filterLogsByType(logs, selectedLogFilter), [logs, selectedLogFilter]);
  const compactLogs = useMemo(() => filterLogsBySearch(visibleLogs, search), [visibleLogs, search]);
  const selectedTask = useMemo(() => findSelectedTask(tasks, selectedTaskId), [tasks, selectedTaskId]);
  const activeMode = MODE_OPTIONS.find((item) => item.value === mode) || MODE_OPTIONS[1];
  const stateLabel = resolveAutomationLabel(automation);

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        stateLabel={stateLabel}
        provider={provider}
        activeModeLabel={activeMode.label}
        executionSource={executionSource}
        executionModel={executionModel}
        eventsTotal={eventsTotal}
        paused={paused}
        handlePause={handlePause}
        handleStop={() => setStopModalOpen(true)}
        handleContinueLastRun={handleContinueLastRun}
        handleApprove={handleApprove}
        formatExecutionSourceLabel={formatExecutionSourceLabel}
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <RunsPane
          recentHistory={recentHistory}
          activeRunId={activeRun?.id || null}
          formatHistoryStatus={formatHistoryStatus}
          formatExecutionSourceLabel={formatExecutionSourceLabel}
          nowIso={nowIso}
          onSelectRun={handleSelectRun}
        />

        <section className="min-h-0 overflow-hidden rounded-[30px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
          <div className="border-b border-[#1B2925] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Conversa ativa</p>
                <p className="mt-1 text-sm text-[#9BAEA8]">Missão, resposta, raciocínio e telemetria em uma trilha única.</p>
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
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MetricPill label="Executando" value={taskColumns.running.length} tone="accent" />
              <MetricPill label="Pendentes" value={taskColumns.pending.length} />
              <MetricPill label="Concluídas" value={taskColumns.done.length} tone="success" />
              <MetricPill label="Falhas" value={taskColumns.failed.length} tone="danger" />
            </div>
          </div>

          <div ref={chatViewportRef} className="max-h-[62vh] space-y-3 overflow-y-auto px-4 py-4">
            {mission ? <Bubble role="user" title="Missão" body={mission} time={activeRun?.startedAt || nowIso()} /> : null}
            {thinking.length ? thinking.map((block) => <ThinkingBlock key={block.id} block={block} />) : null}
            {latestResult ? <Bubble role="assistant" title="Hermida Maia IA" body={typeof latestResult === "string" ? latestResult : "Resultado estruturado entregue."} time={nowIso()} /> : null}
            {activeRun ? <Bubble role="system" title="Execução" body="Run em andamento com auditoria incremental." details={[`Run: ${activeRun.id}`, `Rota: ${routePath || "/interno/ai-task"}`]} time={nowIso()} /> : null}
            <div className="space-y-2">
              {compactLogs.slice(-80).map((log) => <LogRow key={log.id} log={log} />)}
            </div>
          </div>

          <ConversationComposer
            mission={mission}
            missionInputRef={missionInputRef}
            handleMissionChange={handleMissionChange}
            handleStart={handleStart}
            handleAttachmentChange={handleAttachmentChange}
            handleAttachmentDrop={handleAttachmentDrop}
            attachments={attachments}
            error={error}
            quickMissions={QUICK_MISSIONS}
            handleQuickMission={handleQuickMission}
          />
        </section>

        <div className="space-y-4">
          <TaskInspector
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            selectedTask={selectedTask}
            showTasks={showTasks}
            setShowTasks={setShowTasks}
          />

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

      <ConfirmModal
        open={stopModalOpen}
        title="Parar execução atual"
        body="Esta ação interrompe a run ativa, marca as tarefas em andamento como interrompidas e encerra o acompanhamento atual."
        confirmLabel="Parar execução"
        cancelLabel="Voltar"
        onCancel={() => setStopModalOpen(false)}
        onConfirm={async () => {
          setStopModalOpen(false);
          await handleStop();
        }}
      />
    </div>
  );
}
