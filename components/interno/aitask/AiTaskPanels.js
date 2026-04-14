import { buildOfflineHealthSnapshot } from "../../../lib/lawdesk/offline-health.js";
import { buildLocalBootstrapPlan } from "../../../lib/lawdesk/local-bootstrap.js";
import { buildSupabaseLocalBootstrap } from "../../../lib/lawdesk/supabase-local-bootstrap.js";
import { useInternalTheme } from "../InternalThemeProvider";
import Bubble from "./Bubble";
import ConfirmModal from "./ConfirmModal";
import ContextRail from "./ContextRail";
import ConversationComposer from "./ConversationComposer";
import LogRow from "./LogRow";
import MetricPill from "./MetricPill";
import RunHistoryCard from "./RunHistoryCard";
import RunsPane from "./RunsPane";
import TaskInspector from "./TaskInspector";
import TaskCard from "./TaskCard";
import ThinkingBlock from "./ThinkingBlock";
import { summarizeOrchestration } from "./aiTaskPanelUtils";

export { TaskCard };

export { Bubble, LogRow, MetricPill, RunHistoryCard, ThinkingBlock };
export { ConfirmModal, ContextRail, ConversationComposer, RunsPane };
export { TaskInspector };

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
