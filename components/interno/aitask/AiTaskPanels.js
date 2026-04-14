import { buildOfflineHealthSnapshot } from "../../../lib/lawdesk/offline-health.js";
import { buildLocalBootstrapPlan } from "../../../lib/lawdesk/local-bootstrap.js";
import { buildSupabaseLocalBootstrap } from "../../../lib/lawdesk/supabase-local-bootstrap.js";
import { useInternalTheme } from "../InternalThemeProvider";
import Bubble from "./Bubble";
import LogRow from "./LogRow";
import MetricPill from "./MetricPill";
import RunHistoryCard from "./RunHistoryCard";
import ThinkingBlock from "./ThinkingBlock";
import { summarizeOrchestration } from "./aiTaskPanelUtils";

export function TaskCard({ task, isSelected, onSelect, compact = false, draggable = false, onDragStart = null }) {
  const { isLightTheme } = useInternalTheme();
  const statusTone = {
    pending: isLightTheme ? "text-[#6B7C88] border-[#D7DEE8]" : "text-[#9BAEA8] border-[#22342F]",
    running: "text-[#D9B46A] border-[#8b6f33]",
    done: "text-[#8FCFA9] border-[#234034]",
    failed: "text-[#f2b2b2] border-[#5b2d2d]",
  };

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => onSelect(task.id)}
      className={`w-full rounded-[22px] border p-4 text-left transition ${
        isSelected
          ? isLightTheme
            ? "border-[#C79B2C] bg-[#FFF8EA] shadow-[0_10px_26px_rgba(197,160,89,0.12)]"
            : "border-[#C5A059] bg-[linear-gradient(180deg,rgba(197,160,89,0.12),rgba(197,160,89,0.06))] shadow-[0_10px_26px_rgba(197,160,89,0.12)]"
          : isLightTheme
            ? "border-[#D7DEE8] bg-white hover:border-[#BAC8D6]"
            : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] hover:border-[#35554B]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.18em] ${statusTone[task.status] || "text-[#9BAEA8]"}`}>
            {task.status}
          </p>
          <h4 className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.title}</h4>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
          {task.priority}
        </span>
      </div>
      <p className={`mt-2 text-sm leading-6 ${compact ? "line-clamp-3" : ""} ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{task.description}</p>
      <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
        <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>Agente: {task.assignedAgent}</span>
        {task.dependencies?.length ? <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>Depende: {task.dependencies.join(", ")}</span> : null}
      </div>
    </button>
  );
}

export { Bubble, LogRow, MetricPill, RunHistoryCard, ThinkingBlock };

export function WorkspaceHeader({
  stateLabel,
  activeModeLabel,
  provider,
  contextSnapshot = null,
  selectedSkillId = "",
  skillOptions = [],
  providerOptions = [],
  localStackSummary = null,
  ragHealth = null,
  ragAlert = null,
  onProviderChange,
  onSkillChange,
  executionSource,
  executionModel,
  eventsTotal,
  handlePause,
  handleStop,
  handleContinueLastRun,
  handleApprove,
  handleOpenLlmTest,
  handleOpenDiagnostics,
  handleOpenDotobot,
  handleRefreshLocalStack,
  handleLocalStackAction,
  localRuntimeConfigOpen = false,
  onToggleLocalRuntimeConfig,
  localRuntimeDraft = null,
  onLocalRuntimeDraftChange,
  onSaveLocalRuntimeConfig,
  refreshingLocalStack = false,
  paused,
  formatExecutionSourceLabel,
}) {
  const activeProvider = providerOptions.find((item) => item.value === provider) || null;
  const providerLabel = activeProvider?.label || provider;
  const providerSegments = String(providerLabel).split("·").map((item) => item.trim()).filter(Boolean);
  const providerName = providerSegments[0] || providerLabel;
  const providerMeta = providerSegments.slice(1);
  const providerStatus = providerMeta.find((item) => ["operational", "degraded", "failed"].includes(String(item).toLowerCase())) || null;
  const providerTone =
    String(providerStatus || "").toLowerCase() === "operational"
      ? "success"
      : String(providerStatus || "").toLowerCase() === "failed"
        ? "danger"
        : "accent";
  const resolvedProviderName = activeProvider?.displayLabel || providerName;
  const resolvedProviderMeta = [
    activeProvider?.model,
    activeProvider?.status,
    activeProvider?.transport,
    activeProvider?.runtimeMode,
    activeProvider?.host ? `host:${activeProvider.host}` : null,
  ].filter(Boolean);
  const localStackReady = Boolean(localStackSummary?.ok && localStackSummary?.localProvider?.available);
  const localRuntimeLabel = localStackSummary?.localProvider?.runtimeLabel || "Runtime local";
  const capabilitiesSkills = localStackSummary?.capabilities?.skills || null;
  const capabilitiesCommands = localStackSummary?.capabilities?.commands || null;
  const browserExtensionProfiles = localStackSummary?.capabilities?.browserExtensionProfiles || null;
  const activeBrowserProfile =
    browserExtensionProfiles?.profiles?.[browserExtensionProfiles?.active_profile] || null;
  const persistenceSummary = localStackSummary?.persistence || localStackSummary?.capabilities?.persistence || null;
  const offlineHealthSnapshot = buildOfflineHealthSnapshot({ localStackSummary, ragHealth });
  const localBootstrapPlan = buildLocalBootstrapPlan({ localStackSummary, ragHealth });
  const supabaseBootstrap = buildSupabaseLocalBootstrap({ localStackSummary, ragHealth });
  const orchestrationSummary = summarizeOrchestration(contextSnapshot?.orchestration);
  const activeModuleLabel = contextSnapshot?.moduleLabel || contextSnapshot?.module || "Workspace geral";
  const activeRouteLabel = contextSnapshot?.routePath || contextSnapshot?.route || "/interno/ai-task";
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`rounded-[30px] border px-5 py-4 shadow-[0_18px_54px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FDFEFD,#F3F7FA)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))]"}`}>
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia Advocacia</p>
          <h2 className={`mt-2 text-[30px] font-semibold tracking-[-0.04em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>AI Task Hermida Maia</h2>
          <p className={`mt-2 max-w-2xl text-sm leading-7 ${isLightTheme ? "text-[#5E707C]" : "text-[#9BAEA8]"}`}>
            Histórico na esquerda, conversa no centro e contexto operacional na direita para conduzir tarefas jurídicas com clareza.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 2xl:min-w-[520px] 2xl:grid-cols-4">
          <MetricPill label="Status" value={stateLabel} tone={stateLabel === "Falhou" ? "danger" : stateLabel === "Concluído" ? "success" : "accent"} />
          <MetricPill label="Modo" value={activeModeLabel} />
          <MetricPill label="Provider" value={resolvedProviderName} tone={providerTone} />
          <MetricPill label="Eventos" value={eventsTotal} />
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap items-center gap-2 border-t pt-4 ${isLightTheme ? "border-[#E3EAF2]" : "border-[#1A2622]"}`}>
        <label className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
          <span className={`uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Provider</span>
          <select
            value={provider}
            onChange={(event) => onProviderChange?.(event.target.value)}
            className={`min-w-[180px] bg-transparent text-[11px] outline-none ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}
          >
            {providerOptions.map((item) => (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
          <span className={`uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Skill</span>
          <select
            value={selectedSkillId}
            onChange={(event) => onSkillChange?.(event.target.value)}
            className={`min-w-[180px] bg-transparent text-[11px] outline-none ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}
          >
            <option value="">Auto</option>
            {skillOptions.map((item) => (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
          Execução: {`${formatExecutionSourceLabel(executionSource)}${executionModel ? ` / ${executionModel}` : ""}`}
        </span>
        <span
          className={`rounded-full border px-3 py-1.5 text-[11px] ${
            localStackReady ? "border-[#234034] text-[#8FCFA9]" : "border-[#5b2d2d] text-[#f2b2b2]"
          }`}
        >
          {localStackReady ? "Stack local pronto" : "Stack local pendente"}
        </span>
        {resolvedProviderMeta.map((item) => (
          <span key={item} className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
            {item}
          </span>
        ))}
        {localStackSummary?.runtimeBaseUrl ? (
          <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
            runtime {localStackSummary.runtimeBaseUrl}
          </span>
        ) : null}
        {localStackSummary?.localProvider?.transport ? (
          <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
            {localRuntimeLabel}
          </span>
        ) : null}
        {capabilitiesSkills?.total ? (
          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
            Skills {capabilitiesSkills.total}
          </span>
        ) : null}
        {capabilitiesCommands?.executable ? (
          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
            Comandos {capabilitiesCommands.executable}/{capabilitiesCommands.total}
          </span>
        ) : null}
        {activeBrowserProfile?.label ? (
          <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
            Extensao {activeBrowserProfile.label}
          </span>
        ) : null}
        {persistenceSummary?.label ? (
          <span
            className={`rounded-full border px-3 py-1.5 text-[11px] ${
              persistenceSummary.localReady
                ? "border-[#234034] text-[#8FCFA9]"
                : persistenceSummary.remoteBlocked
                  ? "border-[#5b2d2d] text-[#f2b2b2]"
                  : "border-[#3B3523] text-[#D9C38A]"
            }`}
          >
            Storage {persistenceSummary.label}
          </span>
        ) : null}
        {activeProvider?.endpoint ? (
          <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
            {activeProvider.endpoint}
          </span>
        ) : null}
        <button type="button" onClick={handlePause} className={`rounded-full border px-4 py-2 text-xs transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
          {paused ? "Retomar fluxo" : "Pausar fluxo"}
        </button>
        <button type="button" onClick={handleStop} className="rounded-full border border-[#4f2525] px-4 py-2 text-xs text-[#f2b2b2] transition hover:border-[#f2b2b2]">
          Parar execução
        </button>
        <button type="button" onClick={handleContinueLastRun} className="rounded-full border border-[#35554B] px-4 py-2 text-xs text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]">
          Retomar última falha
        </button>
        <button type="button" onClick={handleApprove} className="rounded-full border border-[#234034] px-4 py-2 text-xs text-[#8FCFA9] transition hover:border-[#8FCFA9]">
          Aprovar ação
        </button>
        <button type="button" onClick={handleOpenLlmTest} className={`rounded-full border px-4 py-2 text-xs transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
          Testar provider
        </button>
        <button type="button" onClick={handleOpenDotobot} className="rounded-full border border-[#35554B] px-4 py-2 text-xs text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]">
          Abrir Dotobot
        </button>
        <button
          type="button"
          onClick={handleRefreshLocalStack}
          disabled={refreshingLocalStack}
          className={`rounded-full border px-4 py-2 text-xs transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:cursor-wait disabled:opacity-60 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}
        >
          {refreshingLocalStack ? "Atualizando stack..." : "Atualizar stack local"}
        </button>
        <button
          type="button"
          onClick={onToggleLocalRuntimeConfig}
          className={`rounded-full border px-4 py-2 text-xs transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}
        >
          {localRuntimeConfigOpen ? "Fechar runtime local" : "Editar runtime local"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#E6D29A] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_55%),#FFFDF8]" : "border-[#3C3320] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.16),transparent_55%),rgba(255,255,255,0.02)]"}`}>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#D9B46A]">Faixa da missão</p>
          <p className={`mt-2 text-lg font-semibold tracking-[-0.03em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeModuleLabel}</p>
          <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#5B6670]" : "text-[#C6D1CC]"}`}>
            O cockpit mantém provider, contexto e runtime alinhados na mesma trilha operacional.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#4B3F22] px-3 py-1.5 text-[11px] text-[#F1D39A]">
              rota {activeRouteLabel}
            </span>
            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
              skill {selectedSkillId || "auto"}
            </span>
            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
              execução {formatExecutionSourceLabel(executionSource)}
            </span>
          </div>
        </div>

        <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F5F8FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(15,19,18,0.92),rgba(7,10,9,0.92))]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Orquestração</p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#F5F1E8]">
                {orchestrationSummary.enabled
                  ? orchestrationSummary.multiAgent
                    ? "Multiagente ativo"
                    : "Fluxo guiado"
                  : "Plano compacto"}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${
              orchestrationSummary.enabled ? "border-[#234034] text-[#8FCFA9]" : "border-[#22342F] text-[#9BAEA8]"
            }`}>
              {orchestrationSummary.subagents.length || 1} agentes
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MetricPill label="Subagentes" value={orchestrationSummary.subagents.length || 1} tone={orchestrationSummary.multiAgent ? "accent" : "default"} />
            <MetricPill label="Tarefas" value={orchestrationSummary.tasks.length || 0} />
            <MetricPill label="Paralelo" value={orchestrationSummary.parallelGroups.size || 0} tone={orchestrationSummary.parallelGroups.size ? "success" : "default"} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(orchestrationSummary.subagents.length
              ? orchestrationSummary.subagents.map((agent) => agent?.role || agent?.label).filter(Boolean)
              : ["coordinator"]).slice(0, 5).map((label) => (
              <span key={label} className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]"}`}>
                {label}
              </span>
            ))}
            {orchestrationSummary.stages.slice(0, 4).map((stage) => (
              <span key={stage} className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
                etapa {stage}
              </span>
            ))}
          </div>
        </div>

        <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Cobertura do stack</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#F5F1E8]">
            {localStackReady ? "Pronto para operar" : "Setup em progresso"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#9BAEA8]">
            Provider, runtime local, RAG e extensão ficam visíveis no topo para reduzir troca de contexto.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(orchestrationSummary.availableModules.length
              ? orchestrationSummary.availableModules
              : contextSnapshot?.module
                ? [contextSnapshot.module]
                : []
            ).slice(0, 6).map((moduleKey) => (
              <span key={moduleKey} className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                {moduleKey}
              </span>
            ))}
            {persistenceSummary?.label ? (
              <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
                {persistenceSummary.label}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {localStackSummary ? (
        <p className="mt-3 text-[11px] leading-6 text-[#7F928C]">
          {localStackReady
            ? `ai-core local ativo${localStackSummary.offlineMode ? " em modo offline" : ""} com ${localStackSummary.localProvider?.model || "modelo local"} via ${localRuntimeLabel}${persistenceSummary?.label ? ` e ${persistenceSummary.label.toLowerCase()}` : ""}.`
            : "O runtime local ainda nao respondeu nesta sessao. Suba o ai-core local, configure o vault e ligue a extensao para o modo da maquina."}
        </p>
      ) : null}
      {offlineHealthSnapshot.items.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {offlineHealthSnapshot.items.map((item) => (
            <span
              key={item.id}
              title={item.detail || item.value}
              className={`rounded-full border px-3 py-1.5 text-[11px] ${
                item.tone === "success"
                  ? "border-[#234034] text-[#8FCFA9]"
                  : item.tone === "danger"
                    ? "border-[#5b2d2d] text-[#f2b2b2]"
                    : "border-[#3B3523] text-[#D9C38A]"
              }`}
            >
              {item.label}: {formatInlineValue(item.value)}
            </span>
          ))}
        </div>
      ) : null}
      {localBootstrapPlan.steps.length ? (
        <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Bootstrap local</p>
              <p className="mt-1 text-sm text-[#F5F1E8]">
                {localBootstrapPlan.requiredCompleted}/{localBootstrapPlan.requiredTotal} etapas essenciais concluídas
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${
              localBootstrapPlan.readyForOfflineCore
                ? "border-[#234034] text-[#8FCFA9]"
                : "border-[#3B3523] text-[#D9C38A]"
            }`}>
              {localBootstrapPlan.readyForOfflineCore ? "Offline core pronto" : "Setup em andamento"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            {localBootstrapPlan.steps.map((step) => (
              <div key={step.id} className="rounded-[18px] border border-[#22342F] bg-[rgba(7,9,8,0.65)] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-[#F5F1E8]">{step.title}</p>
                    <p className="mt-1 text-[11px] leading-6 text-[#9BAEA8]">{step.detail}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
                    step.done
                      ? "border-[#234034] text-[#8FCFA9]"
                      : step.optional
                        ? "border-[#3B3523] text-[#D9C38A]"
                        : "border-[#5b2d2d] text-[#f2b2b2]"
                  }`}>
                    {step.done ? "OK" : step.optional ? "Opcional" : "Pendente"}
                  </span>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => handleLocalStackAction?.(step.action)}
                    className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                  >
                    {step.action === "testar_llm_local" ? "Testar runtime" : "Abrir diagnóstico"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(7,9,8,0.7)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Persistência local</p>
            <p className="mt-1 text-sm text-[#F5F1E8]">{supabaseBootstrap.label}</p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${
            supabaseBootstrap.tone === "success"
              ? "border-[#234034] text-[#8FCFA9]"
              : supabaseBootstrap.tone === "danger"
                ? "border-[#5b2d2d] text-[#f2b2b2]"
                : "border-[#3B3523] text-[#D9C38A]"
          }`}>
            {supabaseBootstrap.baseUrlKind === "local"
              ? "Local"
              : supabaseBootstrap.baseUrlKind === "remote"
                ? "Remoto"
                : "Não verificado"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-6 text-[#9BAEA8]">
          {supabaseBootstrap.detail}
          {supabaseBootstrap.baseUrlPreview ? ` Endpoint atual: ${supabaseBootstrap.baseUrlPreview}.` : ""}
        </p>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Envs sugeridas</p>
            <div className="mt-2 space-y-2">
              {supabaseBootstrap.envs.map((line) => (
                <p key={line} className="rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.75)] px-3 py-2 text-[11px] text-[#C6D1CC]">
                  {line}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Bootstrap Supabase local</p>
            <div className="mt-2 space-y-2">
              {supabaseBootstrap.commands.map((line) => (
                <p key={line} className="rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.75)] px-3 py-2 text-[11px] text-[#C6D1CC]">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
        {supabaseBootstrap.readiness?.checks?.length ? (
          <div className="mt-3 rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Readiness offline</p>
              <span className={`rounded-full border px-3 py-1 text-[11px] ${
                supabaseBootstrap.readiness.readyForStructuredOffline
                  ? "border-[#234034] text-[#8FCFA9]"
                  : "border-[#3B3523] text-[#D9C38A]"
              }`}>
                {supabaseBootstrap.readiness.score}
              </span>
            </div>
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {supabaseBootstrap.readiness.checks.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.75)] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-semibold text-[#F5F1E8]">{item.label}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
                      item.ready
                        ? "border-[#234034] text-[#8FCFA9]"
                        : "border-[#5b2d2d] text-[#f2b2b2]"
                    }`}>
                      {item.ready ? "OK" : "Pendente"}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-6 text-[#9BAEA8]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-3 rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Schema offline</p>
          <div className="mt-2 grid gap-2 xl:grid-cols-2">
            {supabaseBootstrap.schema.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.75)] px-3 py-3">
                <p className="text-[11px] font-semibold text-[#F5F1E8]">{item.label}</p>
                <p className="mt-1 text-[11px] leading-6 text-[#9BAEA8]">{item.detail}</p>
                <p className="mt-2 text-[10px] text-[#7F928C]">{item.migration}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {supabaseBootstrap.actions.map((actionId) => (
            <button
              key={actionId}
              type="button"
              onClick={() => handleLocalStackAction?.(actionId)}
              className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
            >
              {actionId === "open_runtime_config"
                ? "Editar runtime local"
                : actionId === "copiar_envs_supabase_local"
                  ? "Copiar envs local"
                : actionId === "testar_llm_local"
                  ? "Testar runtime"
                  : "Abrir diagnóstico"}
            </button>
          ))}
        </div>
      </div>
      {localRuntimeConfigOpen ? (
        <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(7,9,8,0.7)] p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Configuração persistente do runtime local</p>
          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <label className="text-[11px] text-[#D8DEDA]">
              <span className="mb-2 block text-[#7F928C]">Runtime base URL</span>
              <input
                value={localRuntimeDraft?.runtimeBaseUrl || ""}
                onChange={(event) => onLocalRuntimeDraftChange?.((current) => ({ ...current, runtimeBaseUrl: event.target.value }))}
                className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
              />
            </label>
            <label className="text-[11px] text-[#D8DEDA]">
              <span className="mb-2 block text-[#7F928C]">Modelo local</span>
              <input
                value={localRuntimeDraft?.localModel || ""}
                onChange={(event) => onLocalRuntimeDraftChange?.((current) => ({ ...current, localModel: event.target.value }))}
                className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
              />
            </label>
            <label className="text-[11px] text-[#D8DEDA]">
              <span className="mb-2 block text-[#7F928C]">Extensão local URL</span>
              <input
                value={localRuntimeDraft?.extensionBaseUrl || ""}
                onChange={(event) => onLocalRuntimeDraftChange?.((current) => ({ ...current, extensionBaseUrl: event.target.value }))}
                className="h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSaveLocalRuntimeConfig}
              className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
            >
              Salvar e recarregar
            </button>
          </div>
        </div>
      ) : null}
      {capabilitiesSkills?.total || capabilitiesCommands?.total ? (
        <p className="mt-2 text-[11px] leading-6 text-[#7F928C]">
          {[
            capabilitiesSkills?.total ? `${capabilitiesSkills.total} skills catalogadas` : null,
            capabilitiesSkills?.offline_ready ? `${capabilitiesSkills.offline_ready} prontas para offline` : null,
            capabilitiesCommands?.total ? `${capabilitiesCommands.total} comandos no catalogo local` : null,
            activeBrowserProfile?.web_search_enabled === false ? "extensao em perfil offline sem web search" : null,
          ].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {localStackSummary?.recommendations?.length ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {localStackSummary.recommendations.slice(0, 3).map((item) => (
            <span key={item} className="rounded-full border border-[#3B3523] bg-[rgba(197,160,89,0.08)] px-3 py-1.5 text-[#D9C38A]">
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {localStackSummary?.actions?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {localStackSummary.actions.slice(0, 3).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleLocalStackAction?.(action.id)}
              className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {activeProvider?.reason ? (
        <p className="mt-3 text-[11px] leading-6 text-[#7F928C]">{activeProvider.reason}</p>
      ) : null}
      {ragAlert ? (
        <div className={`mt-4 rounded-[20px] border px-4 py-3 text-sm ${
          ragAlert.tone === "danger"
            ? "border-[#5b2d2d] bg-[rgba(91,45,45,0.22)] text-[#f2d0d0]"
            : "border-[#6f5a2d] bg-[rgba(98,79,34,0.2)] text-[#f1dfb5]"
        }`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">Diagnóstico RAG</p>
          <p className="mt-2 font-medium text-[#F5F1E8]">{ragAlert.title}</p>
          <p className="mt-1 leading-6">{ragAlert.body}</p>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleOpenDiagnostics}
              className="rounded-full border border-current px-3 py-1.5 text-[11px] font-semibold transition hover:bg-[rgba(255,255,255,0.06)]"
            >
              Abrir diagnóstico
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const { isLightTheme } = useInternalTheme();

  return (
    <div className={`fixed inset-0 z-[80] flex items-center justify-center px-4 backdrop-blur-sm ${isLightTheme ? "bg-[rgba(225,233,240,0.7)]" : "bg-[rgba(3,5,4,0.74)]"}`}>
      <div className={`w-full max-w-md rounded-[28px] border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F5F8FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))]"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Hermida Maia Advocacia</p>
        <h3 className={`mt-3 text-xl font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{title}</h3>
        <p className={`mt-3 text-sm leading-7 ${isLightTheme ? "text-[#5E707C]" : "text-[#9BAEA8]"}`}>{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-full border px-4 py-2 text-sm transition hover:border-[#35554B] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-[#4f2525] bg-[rgba(91,45,45,0.24)] px-4 py-2 text-sm text-[#f2b2b2] transition hover:border-[#f2b2b2]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RunsPane({
  className = "",
  recentHistory,
  visibleHistory = recentHistory,
  activeRunId,
  formatHistoryStatus,
  formatExecutionSourceLabel,
  nowIso,
  onSelectRun,
  historyPage = 1,
  historyTotalPages = 1,
  onPrevPage,
  onNextPage,
}) {
  const { isLightTheme } = useInternalTheme();
  return (
    <aside className={`min-h-0 rounded-[28px] border p-4 shadow-[0_16px_48px_rgba(0,0,0,0.12)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.025)]"} ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Histórico</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Conversas, runs e retomadas mais recentes.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>{recentHistory.length}</span>
      </div>
      <div className="mt-4 max-h-[34vh] space-y-3 overflow-y-auto pr-1 2xl:max-h-none">
        {visibleHistory.length ? visibleHistory.map((item) => (
          <RunHistoryCard
            key={`${item.id}_${item.updated_at || item.created_at || ""}`}
            item={item}
            isActive={activeRunId === item.id}
            onSelect={onSelectRun}
            formatHistoryStatus={formatHistoryStatus}
            formatExecutionSourceLabel={formatExecutionSourceLabel}
            nowIso={nowIso}
          />
        )) : <p className="text-sm text-[#9BAEA8]">Nenhuma conversa registrada.</p>}
      </div>
      {historyTotalPages > 1 ? (
        <div className={`mt-4 flex items-center justify-between gap-2 border-t pt-4 ${isLightTheme ? "border-[#E3EAF2]" : "border-[#1B2925]"}`}>
          <button type="button" onClick={onPrevPage} disabled={historyPage <= 1} className={`rounded-full border px-3 py-1 text-[11px] transition disabled:opacity-40 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
            Anterior
          </button>
          <span className="text-[11px] text-[#7F928C]">Página {historyPage} de {historyTotalPages}</span>
          <button type="button" onClick={onNextPage} disabled={historyPage >= historyTotalPages} className={`rounded-full border px-3 py-1 text-[11px] transition disabled:opacity-40 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
            Próxima
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export function TaskInspector({
  tasks,
  visibleTasks = tasks,
  agentLanes = [],
  selectedTaskId,
  onSelectTask,
  selectedTask,
  showTasks,
  setShowTasks,
  taskViewMode = "kanban",
  onTaskViewModeChange,
  onTaskMove,
  onDragTaskStart,
  draggedTaskId,
  hasMoreTasks = false,
  onLoadMoreTasks,
}) {
  const taskColumns = {
    pending: tasks.filter((task) => task.status !== "running" && task.status !== "done" && task.status !== "failed"),
    running: tasks.filter((task) => task.status === "running"),
    done: tasks.filter((task) => task.status === "done"),
    failed: tasks.filter((task) => task.status === "failed"),
  };
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Orquestração</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Kanban com drag and drop, lista paginada e foco atual da execução.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`rounded-full border p-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>
            <button type="button" onClick={() => onTaskViewModeChange?.("kanban")} className={`rounded-full px-3 py-1 text-[11px] transition ${taskViewMode === "kanban" ? "bg-[#C5A059] text-[#07110E]" : isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>
              Kanban
            </button>
            <button type="button" onClick={() => onTaskViewModeChange?.("list")} className={`rounded-full px-3 py-1 text-[11px] transition ${taskViewMode === "list" ? "bg-[#C5A059] text-[#07110E]" : isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>
              Lista
            </button>
          </div>
          <button type="button" onClick={() => setShowTasks((value) => !value)} className={`rounded-full border px-3 py-1 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
            {showTasks ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      {agentLanes.length ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {agentLanes.slice(0, 3).map((lane) => (
            <div key={lane.agent} className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Agente</p>
              <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{lane.agent}</p>
              <p className={`mt-1 text-xs leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                {lane.tasks.length} tarefa(s) roteadas nesta faixa operacional.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <MetricPill label="Ativas" value={lane.runningCount} tone={lane.runningCount ? "accent" : "default"} />
                <MetricPill label="Paralelo" value={lane.parallelGroups.length} tone={lane.parallelGroups.length ? "success" : "default"} />
                <MetricPill label="Depend." value={lane.dependencyCount} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {lane.tasks.slice(0, 3).map((task) => (
                  <span key={task.id} className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                    {task.title}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {lane.stages.slice(0, 3).map((stage) => (
                  <span key={`${lane.agent}_${stage}`} className="rounded-full border border-[#35554B] px-2.5 py-1 text-[10px] text-[#B7D5CB]">
                    {stage}
                  </span>
                ))}
                {lane.moduleKeys.slice(0, 2).map((moduleKey) => (
                  <span key={`${lane.agent}_${moduleKey}`} className="rounded-full border border-[#3C3320] px-2.5 py-1 text-[10px] text-[#E7C987]">
                    {moduleKey}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {selectedTask ? (
        <div className={`mt-4 rounded-[20px] border p-4 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA]" : "border-[#C5A059] bg-[rgba(197,160,89,0.07)]"}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#D9B46A]">Em foco</p>
          <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{selectedTask.title}</p>
          <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#5B6670]" : "text-[#C6D1CC]"}`}>{selectedTask.goal}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#3C3320] px-2.5 py-1 text-[10px] text-[#E7C987]">{selectedTask.assignedAgent}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{selectedTask.priority}</span>
            {selectedTask.stage ? <span className="rounded-full border border-[#35554B] px-2.5 py-1 text-[10px] text-[#B7D5CB]">{selectedTask.stage}</span> : null}
            {selectedTask.parallelGroup ? <span className="rounded-full border border-[#234034] px-2.5 py-1 text-[10px] text-[#8FCFA9]">{selectedTask.parallelGroup}</span> : null}
            {Array.isArray(selectedTask.moduleKeys) ? selectedTask.moduleKeys.slice(0, 3).map((moduleKey) => (
              <span key={`${selectedTask.id}_${moduleKey}`} className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                {moduleKey}
              </span>
            )) : null}
          </div>
        </div>
      ) : null}
      {showTasks ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricPill label="Running" value={taskColumns.running.length} tone="accent" />
            <MetricPill label="Pending" value={taskColumns.pending.length} />
            <MetricPill label="Done" value={taskColumns.done.length} tone="success" />
            <MetricPill label="Failed" value={taskColumns.failed.length} tone="danger" />
          </div>
          {taskViewMode === "kanban" ? (
            <div className="grid gap-3 2xl:grid-cols-4">
              {["pending", "running", "done", "failed"].map((status) => (
                <div
                  key={status}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/task-id") || draggedTaskId;
                    if (taskId) onTaskMove?.(taskId, status);
                  }}
                  className={`flex min-h-[320px] flex-col rounded-[22px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.18em] ${status === "running" ? "text-[#D9B46A]" : status === "done" ? "text-[#8FCFA9]" : status === "failed" ? "text-[#f2b2b2]" : "text-[#9BAEA8]"}`}>
                        {status === "running" ? "Em execução" : status === "done" ? "Concluídas" : status === "failed" ? "Falhas" : "Pendentes"}
                      </p>
                      <p className="mt-1 text-xs text-[#7F928C]">{taskColumns[status].length} item(ns)</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {taskColumns[status].length ? taskColumns[status].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        compact
                        draggable
                        isSelected={selectedTaskId === task.id}
                        onSelect={onSelectTask}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/task-id", task.id);
                          onDragTaskStart?.(task.id);
                        }}
                      />
                    )) : (
                      <div className={`rounded-[18px] border border-dashed px-3 py-6 text-center text-sm ${isLightTheme ? "border-[#D7DEE8] text-[#7B8B98]" : "border-[#22342F] text-[#7F928C]"}`}>
                        Solte uma tarefa aqui.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className={`overflow-x-auto rounded-[20px] border ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F]"}`}>
                <div className={`grid min-w-[640px] grid-cols-[minmax(0,1.5fr)_120px_120px_140px] gap-3 border-b px-4 py-3 text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "border-[#E3EAF2] bg-[#F7F9FC] text-[#7B8B98]" : "border-[#1B2925] bg-[rgba(255,255,255,0.02)] text-[#7F928C]"}`}>
                  <span>Tarefa</span>
                  <span>Status</span>
                  <span>Prioridade</span>
                  <span>Agente</span>
                </div>
                <div className={`divide-y ${isLightTheme ? "divide-[#E3EAF2]" : "divide-[#1B2925]"}`}>
                  {visibleTasks.length ? visibleTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onSelectTask(task.id)}
                      className={`grid min-w-[640px] w-full grid-cols-[minmax(0,1.5fr)_120px_120px_140px] gap-3 px-4 py-3 text-left transition ${
                        selectedTaskId === task.id ? "bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "bg-white hover:bg-[#F7F9FC]" : "bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.title}</p>
                        <p className={`mt-1 truncate text-xs ${isLightTheme ? "text-[#7B8B98]" : "text-[#8FA39C]"}`}>{task.description}</p>
                      </div>
                      <span className={`text-xs ${task.status === "running" ? "text-[#D9B46A]" : task.status === "done" ? "text-[#8FCFA9]" : task.status === "failed" ? "text-[#f2b2b2]" : "text-[#9BAEA8]"}`}>{task.status}</span>
                      <span className={`text-xs ${isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>{task.priority}</span>
                      <span className={`text-xs ${isLightTheme ? "text-[#51606B]" : "text-[#D8DEDA]"}`}>{task.assignedAgent}</span>
                    </button>
                  )) : <p className={`px-4 py-6 text-sm ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Nenhuma tarefa ainda.</p>}
                </div>
              </div>
              {hasMoreTasks ? (
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Mostrando {visibleTasks.length} de {tasks.length} tarefas.</span>
                  <button type="button" onClick={onLoadMoreTasks} className={`rounded-full border px-3 py-1 text-[11px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                    Carregar mais
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ContextRail({
  showContext,
  setShowContext,
  contextSnapshot,
  contextModuleEntries,
  mission,
  routePath,
  approved,
  quickMissions,
  handleModuleAction,
  handleQuickMission,
  selectedTask,
  handleSendToDotobot,
  handleReplay,
  detectModules,
  contact360Query,
  onContact360QueryChange,
  onLoadContact360,
  contact360Loading,
  contact360,
}) {
  const summary = contact360?.data?.summary || null;
  const contactName = contact360?.data?.contact?.name || contact360?.data?.contact?.display_name || null;
  const dealsCount = Array.isArray(contact360?.data?.deals) ? contact360.data.deals.length : 0;
  const tasksCount = Array.isArray(contact360?.data?.tasks) ? contact360.data.tasks.length : 0;
  const memoryMatches = Array.isArray(contact360?.data?.memory_matches) ? contact360.data.memory_matches.length : 0;
  const orchestrationSummary = summarizeOrchestration(contextSnapshot?.orchestration);
  const { isLightTheme } = useInternalTheme();
  return (
    <aside className="space-y-4">
      <section className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Contexto</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Memória, documentos, replay e atalhos operacionais.</p>
          </div>
          <button type="button" onClick={() => setShowContext((value) => !value)} className={`rounded-full border px-3 py-1 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
            {showContext ? "Ocultar" : "Mostrar"}
          </button>
        </div>

        {showContext ? (
          <div className={`mt-4 space-y-3 text-sm ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
            <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Módulo ativo</p>
              <p className={`mt-2 ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{contextSnapshot?.module || detectModules(mission || "").join(", ")}</p>
              <p className="mt-1 text-xs">Rota: {contextSnapshot?.route || routePath || "/interno/ai-task"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricPill label="Memórias" value={contextSnapshot?.memory?.length || 0} />
              <MetricPill label="Documentos" value={contextSnapshot?.documents?.length || 0} />
              <MetricPill label="Aprovação" value={approved ? "concedida" : "pendente"} tone={approved ? "success" : "accent"} />
            </div>

            {orchestrationSummary.enabled ? (
              <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F5F8FB)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,17,16,0.96),rgba(7,9,8,0.78))]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Orquestração ativa</p>
                    <p className={`mt-1 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                      {orchestrationSummary.multiAgent ? "Subagentes coordenados" : "Execução encadeada"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#35554B] px-2.5 py-1 text-[10px] text-[#B7D5CB]">
                    {orchestrationSummary.tasks.length} tarefas
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MetricPill label="Agentes" value={orchestrationSummary.subagents.length || 1} tone="accent" />
                  <MetricPill label="Etapas" value={orchestrationSummary.stages.length || 1} />
                  <MetricPill label="Módulos" value={orchestrationSummary.availableModules.length || 0} tone="success" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {orchestrationSummary.subagents.slice(0, 5).map((agent, index) => (
                    <span key={`${agent?.role || agent?.label || "agent"}_${index}`} className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                      {agent?.role || agent?.label || `agent-${index + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Contexto 360</p>
                  <p className={`mt-1 text-xs leading-5 ${isLightTheme ? "text-[#7B8B98]" : "text-[#8FA39C]"}`}>Busque email ou identificador do cliente para enriquecer a missão.</p>
                </div>
                <button
                  type="button"
                  onClick={onLoadContact360}
                  className="rounded-full border border-[#35554B] px-3 py-1 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                >
                  {contact360Loading ? "Buscando..." : "Buscar 360"}
                </button>
              </div>
              <input
                value={contact360Query}
                onChange={(event) => onContact360QueryChange?.(event.target.value)}
                placeholder="email@cliente.com"
                className={`mt-3 h-10 w-full rounded-2xl border px-3 text-sm outline-none ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#152421] placeholder:text-[#93A1AD]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)] text-[#F5F1E8] placeholder:text-[#60706A]"}`}
              />
              {summary ? (
                <div className={`mt-3 rounded-[16px] border p-3 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA]" : "border-[#3C3320] bg-[rgba(40,32,19,0.18)]"}`}>
                  <p className={`text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{contactName || "Contato identificado"}</p>
                  <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#5B6670]" : "text-[#D9D4C7]"}`}>{summary}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MetricPill label="Deals" value={dealsCount} />
                    <MetricPill label="Tasks" value={tasksCount} />
                    <MetricPill label="Memória" value={memoryMatches} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSendToDotobot({
                        mission: `Usando o contexto 360 de ${contactName || contact360Query}, avance na missão: ${mission || selectedTask?.goal || ""}`.trim(),
                        label: "Handoff com contexto 360",
                        moduleKey: "contacts",
                        moduleLabel: "Contato 360",
                        tags: ["contacts", "crm", "dotobot", "ai-task"],
                      }, routePath)}
                      className="rounded-full border border-[#35554B] px-3 py-1 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                    >
                      Enviar 360 ao Dotobot
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickMission(`Analise o contexto 360 de ${contactName || contact360Query} e proponha um plano operacional.`)}
                      className="rounded-full border border-[#C5A059] px-3 py-1 text-[11px] text-[#F1D39A] transition hover:bg-[rgba(197,160,89,0.1)]"
                    >
                      Transformar em missão
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {contextSnapshot?.selectedAction ? (
              <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA]" : "border-[#3C3320] bg-[rgba(40,32,19,0.18)]"}`}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#D9B46A]">Playbook armado</p>
                <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{contextSnapshot.selectedAction.label}</p>
                <p className={`mt-1 text-xs leading-6 ${isLightTheme ? "text-[#5B6670]" : "text-[#C6D1CC]"}`}>{contextSnapshot.selectedAction.moduleLabel || contextSnapshot.moduleLabel || "Modulo atual"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendToDotobot(contextSnapshot.selectedAction, routePath)}
                    className="rounded-full border border-[#35554B] px-3 py-1 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                  >
                    Enviar ao Dotobot
                  </button>
                </div>
              </div>
            ) : null}

            {contextModuleEntries?.length ? (
              <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Capacidades por módulo</p>
                <div className="mt-3 space-y-3">
                  {contextModuleEntries.slice(0, 4).map((entry) => (
                    <div key={entry.key} className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.75)]"}`}>
                      <p className={`text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{entry.label}</p>
                      <p className={`mt-1 text-[11px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{entry.routePath || "sem rota"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(entry.capabilities || []).slice(0, 5).map((capability) => (
                          <span key={`${entry.key}_${capability}`} className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                            {capability}
                          </span>
                        ))}
                      </div>
                      {(entry.consoleTags || []).length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.consoleTags.slice(0, 4).map((tag) => (
                            <span key={`${entry.key}_${tag}`} className="rounded-full border border-[#3C3320] px-2.5 py-1 text-[10px] text-[#E7C987]">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(entry.quickMissions || []).length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.quickMissions.slice(0, 2).map((value) => (
                            <button
                              key={`${entry.key}_${value}`}
                              type="button"
                              onClick={() => handleQuickMission(value)}
                              className="rounded-full border border-[#35554B] px-3 py-1 text-[11px] text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]"
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {(entry.quickActions || []).length ? (
                        <div className="mt-3">
                          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Playbooks do console</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {entry.quickActions.slice(0, 3).map((action) => (
                              <button
                                key={action.id}
                                type="button"
                                onClick={() => handleModuleAction(action, entry, routePath)}
                                className="rounded-full border border-[#C5A059] px-3 py-1 text-[11px] text-[#F1D39A] transition hover:bg-[rgba(197,160,89,0.1)]"
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedTask ? (
              <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Reexecutar foco</p>
                <p className={`mt-2 text-sm ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{selectedTask.title}</p>
                <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{selectedTask.goal}</p>
                <button type="button" onClick={() => handleReplay(selectedTask)} className={`mt-3 rounded-full border px-3 py-1 text-[11px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
                  Reexecutar missão
                </button>
              </div>
            ) : null}

            <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Atalhos rápidos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {quickMissions.map((value) => (
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

export function ConversationComposer({
  mission,
  missionInputRef,
  handleMissionChange,
  handleStart,
  handleAttachmentChange,
  handleAttachmentDrop,
  attachments,
  error,
  quickMissions,
  handleQuickMission,
}) {
  return (
    <section className="border-t border-[#1B2925] bg-[linear-gradient(180deg,rgba(8,11,10,0.94),rgba(6,8,7,0.98))] p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {quickMissions.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => handleQuickMission(value)}
            className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#C6D1CC] transition hover:border-[#C5A059] hover:text-[#F5F1E8]"
          >
            {value}
          </button>
        ))}
      </div>
      <div
        className="rounded-[28px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleAttachmentDrop?.(event.dataTransfer?.files || []);
        }}
      >
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
          placeholder="Descreva a tarefa jurídica, o objetivo e os arquivos de apoio..."
          className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-7 text-[#F5F1E8] outline-none placeholder:text-[#60706A]"
        />
        {attachments.length ? (
          <div className="mt-2 flex flex-wrap gap-2 px-2">
            {attachments.map((file) => (
              <span key={`${file.name}_${file.size}`} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#1B2925] px-2 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
              Anexar arquivos
              <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
            </label>
            <span className="text-[11px] text-[#7F928C]">Arraste múltiplos arquivos para esta área ou use Enter para enviar.</span>
          </div>
          <button type="button" onClick={handleStart} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-2 text-xs font-semibold text-[#07110E] transition hover:bg-[#D7B570]">
            Enviar
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs text-[#f2b2b2]">{error}</p> : null}
    </section>
  );
}
