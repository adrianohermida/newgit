import { useState, useEffect, useMemo, useRef } from "react";
import { adminFetch } from "../../../lib/admin/api";
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

function detectModules(mission) {
  if (!mission) return ["geral"];
  if (/peticao|recurso|contestacao|acao|agravo/i.test(mission)) return ["documentos-juridicos"];
  if (/audiencia|processo|cnj/i.test(mission)) return ["processos"];
  if (/cliente|contato|cobranca/i.test(mission)) return ["clientes"];
  return ["geral"];
}

function requiresApproval(mission) {
  return /deletar|excluir|cancelar|remover|destruir/i.test(mission || "");
}

function normalizeMission(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatExecutionSourceLabel(source) {
  const labels = { openai: "OpenAI", cloudflare: "Cloudflare AI", local: "Modelo local", custom: "Custom" };
  return labels[source] || source || "n/a";
}

function formatHistoryStatus(status) {
  const labels = { running: "Executando", done: "Concluído", failed: "Falhou", stopped: "Parado", idle: "Pronto" };
  return labels[status] || String(status || "Indefinido");
}

function nowIso() {
  return new Date().toISOString();
}

const MAX_THINKING = 20;
const MAX_LOGS = 200;
const MAX_TASKS = 80;

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

const AI_TASK_ENDPOINT = "/functions/api/admin-lawdesk-chat";

function extractTaskRunResultText(...sources) {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source?.result?.message === "string" && source.result.message.trim()) {
      return source.result.message.trim();
    }
    if (typeof source?.resultText === "string" && source.resultText.trim()) {
      return source.resultText.trim();
    }
    if (typeof source?.result === "string" && source.result.trim()) {
      return source.result.trim();
    }
    if (source?.result != null && typeof source.result !== "string") {
      try {
        return JSON.stringify(source.result);
      } catch {
        return String(source.result);
      }
    }
  }
  return "";
}

function extractTaskRunMemoryMatches(rag) {
  if (!rag) return [];
  if (Array.isArray(rag?.retrieval?.matches)) return rag.retrieval.matches;
  if (Array.isArray(rag?.retrieved_context)) return rag.retrieved_context;
  return [];
}

function normalizeTaskRunPayload(payload) {
  const data = payload?.data || {};
  const run = data?.run || null;
  const runResult = run?.result || null;
  const steps = Array.isArray(data?.steps) ? data.steps : Array.isArray(runResult?.steps) ? runResult.steps : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const rag = data?.rag || runResult?.rag || null;
  return {
    run,
    steps,
    events,
    rag,
    resultText: extractTaskRunResultText(data, runResult),
    source: data?.source || runResult?.source || null,
    model: data?.model || runResult?.model || null,
    status: run?.status || (payload?.ok ? "completed" : "failed"),
    eventsCursor: data?.eventsCursor || null,
    eventsCursorSequence: Number.isFinite(Number(data?.eventsCursorSequence)) ? Number(data.eventsCursorSequence) : null,
    eventsTotal: Number.isFinite(Number(data?.eventsTotal)) ? Number(data.eventsTotal) : null,
    pollIntervalMs: Number.isFinite(Number(data?.pollIntervalMs)) ? Number(data.pollIntervalMs) : null,
  };
}

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

function MetricPill({ label, value, tone = "default" }) {
  const toneClass =
    tone === "accent"
      ? "border-[#C5A059] text-[#F1D39A]"
      : tone === "success"
        ? "border-[#234034] text-[#8FCFA9]"
        : tone === "danger"
          ? "border-[#5b2d2d] text-[#f2b2b2]"
          : "border-[#22342F] text-[#D8DEDA]";
  return (
    <div className={`rounded-[18px] border bg-[rgba(255,255,255,0.02)] px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function RunHistoryCard({ item }) {
  return (
    <article className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{formatHistoryStatus(item.status)}</p>
        <p className="text-[10px] text-[#9BAEA8]">{new Date(item.updated_at || item.created_at || nowIso()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <p className="mt-2 text-xs leading-6 text-[#F5F1E8]">{String(item.mission || "Sem missão registrada").slice(0, 100)}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#9BAEA8]">
        <span className="rounded-full border border-[#22342F] px-2 py-1">{formatExecutionSourceLabel(item.source)}</span>
        <span className="rounded-full border border-[#22342F] px-2 py-1">{item.model || "n/a"}</span>
      </div>
    </article>
  );
}

function AgentLane({ lane, selectedTaskId, onSelectTask }) {
  return (
    <section className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Agente</p>
          <h4 className="mt-1 text-sm font-semibold text-[#F5F1E8]">{lane.agent}</h4>
        </div>
        <div className="flex gap-2 text-[10px] text-[#9BAEA8]">
          <span className="rounded-full border border-[#22342F] px-2.5 py-1">{lane.tasks.length} tarefas</span>
          <span className="rounded-full border border-[#22342F] px-2.5 py-1">{lane.runningCount} ativas</span>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {lane.tasks.length ? lane.tasks.map((task) => <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} onSelect={onSelectTask} />) : <p className="text-sm text-[#9BAEA8]">Sem tarefas atribuídas.</p>}
      </div>
    </section>
  );
}

function MissionControlPanel({
  stateLabel,
  provider,
  activeModeLabel,
  executionSource,
  executionModel,
  eventsTotal,
  mission,
  missionInputRef,
  handleMissionChange,
  handleStart,
  mode,
  setMode,
  providerValue,
  setProvider,
  paused,
  handlePause,
  handleStop,
  handleContinueLastRun,
  handleApprove,
  setMission,
  handleAttachmentChange,
  attachments,
  error,
}) {
  return (
    <section className="rounded-[32px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(14,17,16,0.98),rgba(9,11,10,0.98))] p-5 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">AI TASK CONTROL ROOM</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#F5F1E8] md:text-3xl">Mesa operacional multiagente para fluxos jurídicos com supervisão humana</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#9BAEA8]">Organize a missão, acompanhe agentes em paralelo e intervenha quando houver bloqueio, retry ou necessidade de aprovação.</p>
        </div>
        <div className="grid min-w-[260px] flex-1 gap-2 sm:grid-cols-2 xl:max-w-[420px]">
          <MetricPill label="Status" value={stateLabel} tone={stateLabel === "Falhou" ? "danger" : stateLabel === "Concluido" ? "success" : "accent"} />
          <MetricPill label="Provider" value={provider} />
          <MetricPill label="Modo" value={activeModeLabel} />
          <MetricPill label="Execução" value={`${formatExecutionSourceLabel(executionSource)}${executionModel ? ` / ${executionModel}` : ""}`} />
          <MetricPill label="Eventos" value={eventsTotal} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_220px_220px]">
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
            rows={4}
            placeholder="Descreva a tarefa jurídica, contexto, restrições e resultado esperado..."
            className="w-full resize-none rounded-[26px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A] focus:border-[#C5A059]"
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
          <select value={providerValue} onChange={(event) => setProvider(event.target.value)} className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
            {PROVIDER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleStart} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-4 py-2 text-xs font-semibold text-[#07110E] transition hover:bg-[#D7B570]">Executar missão</button>
        <button type="button" onClick={handlePause} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{paused ? "Retomar fluxo" : "Pausar fluxo"}</button>
        <button type="button" onClick={handleStop} className="rounded-full border border-[#4f2525] px-4 py-2 text-xs text-[#f2b2b2] transition hover:border-[#f2b2b2]">Cancelar run</button>
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
  );
}

function RunsPane({ recentHistory, missionHistory, activeRunId }) {
  return (
    <aside className="space-y-4">
      <section className="rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Runs</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Fila recente de execuções, falhas e retomadas.</p>
          </div>
          <span className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">{missionHistory.length} total</span>
        </div>
        <div className="mt-4 space-y-3">
          {recentHistory.length ? recentHistory.map((item) => (
            <div key={`${item.id}_${item.updated_at || item.created_at || ""}`} className={activeRunId === item.id ? "rounded-[20px] border border-[#C5A059] p-[1px]" : ""}>
              <RunHistoryCard item={item} />
            </div>
          )) : <p className="text-sm text-[#9BAEA8]">Nenhuma execução registrada.</p>}
        </div>
      </section>
    </aside>
  );
}

function ContextRail({
  showContext,
  setShowContext,
  contextSnapshot,
  mission,
  routePath,
  approved,
  QUICK_MISSIONS,
  handleQuickMission,
  selectedTask,
  handleReplay,
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Contexto e ações</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Memória, documentos, replay e atalhos operacionais.</p>
          </div>
          <button type="button" onClick={() => setShowContext((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">{showContext ? "Ocultar" : "Mostrar"}</button>
        </div>

        {showContext ? (
          <div className="mt-4 space-y-3 text-sm text-[#9BAEA8]">
            <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Módulo ativo</p>
              <p className="mt-2 text-[#F5F1E8]">{contextSnapshot?.module || detectModules(mission || "").join(", ")}</p>
              <p className="mt-1 text-xs">Rota: {contextSnapshot?.route || routePath || "/interno/ai-task"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricPill label="Memórias" value={contextSnapshot?.memory?.length || 0} />
              <MetricPill label="Documentos" value={contextSnapshot?.documents?.length || 0} />
              <MetricPill label="Aprovação" value={approved ? "concedida" : "pendente"} tone={approved ? "success" : "accent"} />
            </div>

            {selectedTask ? (
              <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Tarefa selecionada</p>
                <p className="mt-2 text-sm text-[#F5F1E8]">{selectedTask.title}</p>
                <p className="mt-2 text-xs leading-6 text-[#9BAEA8]">{selectedTask.goal}</p>
                <button type="button" onClick={() => handleReplay(selectedTask)} className="mt-3 rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">Reexecutar missão</button>
              </div>
            ) : null}

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
    </aside>
  );
}

export default function AITaskModule({ profile, routePath }) {
  // Estado do input e histórico
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // Exemplo

  function handleInputChange(e) {
    setInput(e.target.value);
  }
  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    // Adiciona ao histórico (exemplo)
    setHistory((h) => [
      ...h,
      { id: Date.now(), role: 'user', title: 'Você', goal: input, timestamp: new Date().toISOString() },
      { id: Date.now() + 1, role: 'assistant', title: 'Dotobot', goal: `Processando: ${input}`, timestamp: new Date().toISOString() }
    ]);
    setInput("");
    setLoading(true);
    setTimeout(() => setLoading(false), 1200);
  }
  const storageKey = useMemo(() => buildStorageKey(profile), [profile]);
  const [mission, setMission] = useState("");
  const [mode, setMode] = useState("assisted");
  const [provider, setProvider] = useState("gpt");
  const [automation, setAutomation] = useState("idle");
  const [approved, setApproved] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [thinking, setThinking] = useState([]);
  const [logs, setLogs] = useState([]);
  const [missionHistory, setMissionHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [showTasks, setShowTasks] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [contextSnapshot, setContextSnapshot] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [executionSource, setExecutionSource] = useState(null);
  const [executionModel, setExecutionModel] = useState(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedLogFilter, setSelectedLogFilter] = useState("all");
  const [eventsTotal, setEventsTotal] = useState(0);
  const [activeRun, setActiveRun] = useState(null);
  const missionInputRef = useRef(null);
  const chatViewportRef = useRef(null);
  const pollingInFlightRef = useRef(false);
  const lastEventCursorRef = useRef(null);
  const lastEventSequenceRef = useRef(null);
  const runEventIdsRef = useRef(new Set());
  const abortRef = useRef(null);
  const pauseRef = useRef(false);

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
        const payload = await adminFetch(AI_TASK_ENDPOINT, {
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
        if (normalized.pollIntervalMs != null) {
          nextDelayMs = normalized.pollIntervalMs;
        } else {
          nextDelayMs = 2500;
        }
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
            result: `${event?.message || "Evento sem mensagem."}${
              eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""
            }`,
          });
        }

        const runStatus = run?.status;
        if (normalized.source) {
          setExecutionSource(normalized.source);
        }
        if (normalized.model) {
          setExecutionModel(normalized.model);
        }
        if (normalized.resultText) {
          setLatestResult(normalized.resultText);
        }

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
        result: `POST ${AI_TASK_ENDPOINT} (action=task_run_start)`,
      });

      const payload = await adminFetch(AI_TASK_ENDPOINT, {
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
          result: `${event?.message || "Evento sem mensagem."}${
            eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""
          }`,
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
        const payload = await adminFetch(AI_TASK_ENDPOINT, {
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
      const payload = await adminFetch(AI_TASK_ENDPOINT, {
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
        ].slice(0, MAX_TASKS));
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
  const agentLanes = useMemo(() => {
    const lanes = new Map();
    tasks.forEach((task) => {
      const key = task.assignedAgent || "Dotobot";
      if (!lanes.has(key)) {
        lanes.set(key, { agent: key, tasks: [], runningCount: 0 });
      }
      const lane = lanes.get(key);
      lane.tasks.push(task);
      if (task.status === "running" || task.status === "pending") {
        lane.runningCount += 1;
      }
    });
    return Array.from(lanes.values());
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
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <RunsPane recentHistory={recentHistory} missionHistory={missionHistory} activeRunId={activeRun?.id || null} />

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
          QUICK_MISSIONS={QUICK_MISSIONS}
          handleQuickMission={handleQuickMission}
          selectedTask={selectedTask}
          handleReplay={handleReplay}
        />
      </div>
    </div>
  );
}
