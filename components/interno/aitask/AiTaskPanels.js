export function TaskCard({ task, isSelected, onSelect, compact = false, draggable = false, onDragStart = null }) {
  const statusTone = {
    pending: "text-[#9BAEA8] border-[#22342F]",
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
      className={`w-full rounded-[20px] border p-4 text-left transition ${
        isSelected ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.18em] ${statusTone[task.status] || "text-[#9BAEA8]"}`}>
            {task.status}
          </p>
          <h4 className="mt-2 text-sm font-semibold text-[#F5F1E8]">{task.title}</h4>
        </div>
        <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#9BAEA8]">
          {task.priority}
        </span>
      </div>
      <p className={`mt-2 text-sm leading-6 text-[#9BAEA8] ${compact ? "line-clamp-3" : ""}`}>{task.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9BAEA8]">
        <span className="rounded-full border border-[#22342F] px-2.5 py-1">Agente: {task.assignedAgent}</span>
        {task.dependencies?.length ? <span className="rounded-full border border-[#22342F] px-2.5 py-1">Depende: {task.dependencies.join(", ")}</span> : null}
      </div>
    </button>
  );
}

export function ThinkingBlock({ block }) {
  return (
    <details open={Boolean(block.expanded)} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">{block.title}</p>
            <p className="mt-2 text-sm leading-6 text-[#F5F1E8]">{block.summary}</p>
          </div>
          <span className="text-[10px] text-[#9BAEA8]">
            {new Date(block.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
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

export function LogRow({ log }) {
  return (
    <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{log.type}</p>
        <span className="text-[10px] text-[#9BAEA8]">
          {new Date(log.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <p className="mt-2 text-sm text-[#F5F1E8]">{log.action}</p>
      <p className="mt-1 text-sm leading-6 text-[#9BAEA8]">{log.result}</p>
    </div>
  );
}

export function Bubble({ role = "assistant", title, body, details = [], time }) {
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
      <article className={`max-w-[min(46rem,92%)] rounded-[24px] border px-4 py-3 text-sm ${bubbleClass}`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.2em] opacity-60">
          <span>{title || (isUser ? "Equipe" : isSystem ? "Sistema" : "Hermida Maia IA")}</span>
          <span>{time ? new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora"}</span>
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

export function MetricPill({ label, value, tone = "default" }) {
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

export function RunHistoryCard({ item, isActive, onSelect, formatHistoryStatus, formatExecutionSourceLabel, nowIso }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`w-full rounded-[20px] border p-4 text-left transition ${
        isActive ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{formatHistoryStatus(item.status)}</p>
        <p className="text-[10px] text-[#9BAEA8]">
          {new Date(item.updated_at || item.created_at || nowIso()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#F5F1E8]">{String(item.mission || "Sem conversa registrada")}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#9BAEA8]">
        <span className="rounded-full border border-[#22342F] px-2 py-1">{formatExecutionSourceLabel(item.source)}</span>
        <span className="rounded-full border border-[#22342F] px-2 py-1">{item.model || "n/a"}</span>
      </div>
    </button>
  );
}

export function WorkspaceHeader({
  stateLabel,
  activeModeLabel,
  provider,
  selectedSkillId = "",
  skillOptions = [],
  providerOptions = [],
  localStackSummary = null,
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
  return (
    <section className="rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))] px-5 py-4 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia Advocacia</p>
          <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#F5F1E8]">AI Task Hermida Maia</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#9BAEA8]">
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

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#1A2622] pt-4">
        <label className="flex items-center gap-2 rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA]">
          <span className="uppercase tracking-[0.16em] text-[#7F928C]">Provider</span>
          <select
            value={provider}
            onChange={(event) => onProviderChange?.(event.target.value)}
            className="min-w-[180px] bg-transparent text-[11px] text-[#F5F1E8] outline-none"
          >
            {providerOptions.map((item) => (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA]">
          <span className="uppercase tracking-[0.16em] text-[#7F928C]">Skill</span>
          <select
            value={selectedSkillId}
            onChange={(event) => onSkillChange?.(event.target.value)}
            className="min-w-[180px] bg-transparent text-[11px] text-[#F5F1E8] outline-none"
          >
            <option value="">Auto</option>
            {skillOptions.map((item) => (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA]">
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
          <span key={item} className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#9BAEA8]">
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
          <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#9BAEA8]">
            Skills {capabilitiesSkills.total}
          </span>
        ) : null}
        {capabilitiesCommands?.executable ? (
          <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#9BAEA8]">
            Comandos {capabilitiesCommands.executable}/{capabilitiesCommands.total}
          </span>
        ) : null}
        {activeBrowserProfile?.label ? (
          <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
            Extensao {activeBrowserProfile.label}
          </span>
        ) : null}
        {activeProvider?.endpoint ? (
          <span className="rounded-full border border-[#35554B] px-3 py-1.5 text-[11px] text-[#B7D5CB]">
            {activeProvider.endpoint}
          </span>
        ) : null}
        <button type="button" onClick={handlePause} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
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
        <button type="button" onClick={handleOpenLlmTest} className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
          Testar provider
        </button>
        <button type="button" onClick={handleOpenDotobot} className="rounded-full border border-[#35554B] px-4 py-2 text-xs text-[#B7D5CB] transition hover:border-[#7FC4AF] hover:text-[#7FC4AF]">
          Abrir Dotobot
        </button>
        <button
          type="button"
          onClick={handleRefreshLocalStack}
          disabled={refreshingLocalStack}
          className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:cursor-wait disabled:opacity-60"
        >
          {refreshingLocalStack ? "Atualizando stack..." : "Atualizar stack local"}
        </button>
      </div>
      {localStackSummary ? (
        <p className="mt-3 text-[11px] leading-6 text-[#7F928C]">
          {localStackReady
            ? `ai-core local ativo${localStackSummary.offlineMode ? " em modo offline" : ""} com ${localStackSummary.localProvider?.model || "modelo local"} via ${localRuntimeLabel}.`
            : "O runtime local ainda nao respondeu nesta sessao. Suba o ai-core local, configure o vault e ligue a extensao para o modo da maquina."}
        </p>
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

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(3,5,4,0.74)] px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Hermida Maia Advocacia</p>
        <h3 className="mt-3 text-xl font-semibold text-[#F5F1E8]">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-[#9BAEA8]">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#22342F] px-4 py-2 text-sm text-[#D8DEDA] transition hover:border-[#35554B]"
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
  return (
    <aside className={`min-h-0 rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)] ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Histórico</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Conversas, runs e retomadas mais recentes.</p>
        </div>
        <span className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">{recentHistory.length}</span>
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
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#1B2925] pt-4">
          <button type="button" onClick={onPrevPage} disabled={historyPage <= 1} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition disabled:opacity-40">
            Anterior
          </button>
          <span className="text-[11px] text-[#7F928C]">Página {historyPage} de {historyTotalPages}</span>
          <button type="button" onClick={onNextPage} disabled={historyPage >= historyTotalPages} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition disabled:opacity-40">
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
  return (
    <section className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Orquestração</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Kanban com drag and drop, lista paginada e foco atual da execução.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-[#22342F] p-1">
            <button type="button" onClick={() => onTaskViewModeChange?.("kanban")} className={`rounded-full px-3 py-1 text-[11px] transition ${taskViewMode === "kanban" ? "bg-[#C5A059] text-[#07110E]" : "text-[#D8DEDA]"}`}>
              Kanban
            </button>
            <button type="button" onClick={() => onTaskViewModeChange?.("list")} className={`rounded-full px-3 py-1 text-[11px] transition ${taskViewMode === "list" ? "bg-[#C5A059] text-[#07110E]" : "text-[#D8DEDA]"}`}>
              Lista
            </button>
          </div>
          <button type="button" onClick={() => setShowTasks((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">
            {showTasks ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      {selectedTask ? (
        <div className="mt-4 rounded-[20px] border border-[#C5A059] bg-[rgba(197,160,89,0.07)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#D9B46A]">Em foco</p>
          <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{selectedTask.title}</p>
          <p className="mt-2 text-sm leading-6 text-[#C6D1CC]">{selectedTask.goal}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#3C3320] px-2.5 py-1 text-[10px] text-[#E7C987]">{selectedTask.assignedAgent}</span>
            <span className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] text-[#D8DEDA]">{selectedTask.priority}</span>
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
                  className="flex min-h-[320px] flex-col rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3"
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
                      <div className="rounded-[18px] border border-dashed border-[#22342F] px-3 py-6 text-center text-sm text-[#7F928C]">
                        Solte uma tarefa aqui.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-[20px] border border-[#22342F]">
                <div className="grid min-w-[640px] grid-cols-[minmax(0,1.5fr)_120px_120px_140px] gap-3 border-b border-[#1B2925] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">
                  <span>Tarefa</span>
                  <span>Status</span>
                  <span>Prioridade</span>
                  <span>Agente</span>
                </div>
                <div className="divide-y divide-[#1B2925]">
                  {visibleTasks.length ? visibleTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onSelectTask(task.id)}
                      className={`grid min-w-[640px] w-full grid-cols-[minmax(0,1.5fr)_120px_120px_140px] gap-3 px-4 py-3 text-left transition ${
                        selectedTaskId === task.id ? "bg-[rgba(197,160,89,0.08)]" : "bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F5F1E8]">{task.title}</p>
                        <p className="mt-1 truncate text-xs text-[#8FA39C]">{task.description}</p>
                      </div>
                      <span className={`text-xs ${task.status === "running" ? "text-[#D9B46A]" : task.status === "done" ? "text-[#8FCFA9]" : task.status === "failed" ? "text-[#f2b2b2]" : "text-[#9BAEA8]"}`}>{task.status}</span>
                      <span className="text-xs text-[#D8DEDA]">{task.priority}</span>
                      <span className="text-xs text-[#D8DEDA]">{task.assignedAgent}</span>
                    </button>
                  )) : <p className="px-4 py-6 text-sm text-[#9BAEA8]">Nenhuma tarefa ainda.</p>}
                </div>
              </div>
              {hasMoreTasks ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#7F928C]">Mostrando {visibleTasks.length} de {tasks.length} tarefas.</span>
                  <button type="button" onClick={onLoadMoreTasks} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
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
  return (
    <aside className="space-y-4">
      <section className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Contexto</p>
            <p className="mt-1 text-sm text-[#9BAEA8]">Memória, documentos, replay e atalhos operacionais.</p>
          </div>
          <button type="button" onClick={() => setShowContext((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">
            {showContext ? "Ocultar" : "Mostrar"}
          </button>
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

            <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Contexto 360</p>
                  <p className="mt-1 text-xs leading-5 text-[#8FA39C]">Busque email ou identificador do cliente para enriquecer a missão.</p>
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
                className="mt-3 h-10 w-full rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-3 text-sm text-[#F5F1E8] outline-none placeholder:text-[#60706A]"
              />
              {summary ? (
                <div className="mt-3 rounded-[16px] border border-[#3C3320] bg-[rgba(40,32,19,0.18)] p-3">
                  <p className="text-sm font-semibold text-[#F5F1E8]">{contactName || "Contato identificado"}</p>
                  <p className="mt-2 text-xs leading-6 text-[#D9D4C7]">{summary}</p>
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
              <div className="rounded-[18px] border border-[#3C3320] bg-[rgba(40,32,19,0.18)] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#D9B46A]">Playbook armado</p>
                <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{contextSnapshot.selectedAction.label}</p>
                <p className="mt-1 text-xs leading-6 text-[#C6D1CC]">{contextSnapshot.selectedAction.moduleLabel || contextSnapshot.moduleLabel || "Modulo atual"}</p>
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
              <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Capacidades por módulo</p>
                <div className="mt-3 space-y-3">
                  {contextModuleEntries.slice(0, 4).map((entry) => (
                    <div key={entry.key} className="rounded-[16px] border border-[#22342F] bg-[rgba(7,9,8,0.75)] p-3">
                      <p className="text-sm font-semibold text-[#F5F1E8]">{entry.label}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">{entry.routePath || "sem rota"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(entry.capabilities || []).slice(0, 5).map((capability) => (
                          <span key={`${entry.key}_${capability}`} className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] text-[#9BAEA8]">
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
                          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Playbooks do console</p>
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
              <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">Reexecutar foco</p>
                <p className="mt-2 text-sm text-[#F5F1E8]">{selectedTask.title}</p>
                <p className="mt-2 text-xs leading-6 text-[#9BAEA8]">{selectedTask.goal}</p>
                <button type="button" onClick={() => handleReplay(selectedTask)} className="mt-3 rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">
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
