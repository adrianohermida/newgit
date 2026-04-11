export function TaskCard({ task, isSelected, onSelect }) {
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
      <p className="mt-2 text-sm leading-6 text-[#9BAEA8]">{task.description}</p>
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
  executionSource,
  executionModel,
  eventsTotal,
  handlePause,
  handleStop,
  handleContinueLastRun,
  handleApprove,
  paused,
  formatExecutionSourceLabel,
}) {
  return (
    <section className="rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))] px-5 py-4 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia Advocacia</p>
          <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#F5F1E8]">AI Task Hermida Maia</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#9BAEA8]">
            Histórico na esquerda, conversa no centro e contexto operacional na direita para conduzir tarefas jurídicas com clareza.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[520px] xl:grid-cols-4">
          <MetricPill label="Status" value={stateLabel} tone={stateLabel === "Falhou" ? "danger" : stateLabel === "Concluído" ? "success" : "accent"} />
          <MetricPill label="Modo" value={activeModeLabel} />
          <MetricPill label="Modelo" value={provider} />
          <MetricPill label="Eventos" value={eventsTotal} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#1A2622] pt-4">
        <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA]">
          Execução: {`${formatExecutionSourceLabel(executionSource)}${executionModel ? ` / ${executionModel}` : ""}`}
        </span>
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
      </div>
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
  recentHistory,
  activeRunId,
  formatHistoryStatus,
  formatExecutionSourceLabel,
  nowIso,
  onSelectRun,
}) {
  return (
    <aside className="min-h-0 rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.025)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Histórico</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Conversas, runs e retomadas mais recentes.</p>
        </div>
        <span className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#9BAEA8]">{recentHistory.length}</span>
      </div>
      <div className="mt-4 space-y-3 overflow-y-auto pr-1">
        {recentHistory.length ? recentHistory.map((item) => (
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
    </aside>
  );
}

export function TaskInspector({ tasks, selectedTaskId, onSelectTask, selectedTask, showTasks, setShowTasks }) {
  return (
    <section className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Cards operacionais</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Etapas, dependências e foco atual da execução.</p>
        </div>
        <button type="button" onClick={() => setShowTasks((value) => !value)} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">
          {showTasks ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {selectedTask ? (
        <div className="mt-4 rounded-[20px] border border-[#C5A059] bg-[rgba(197,160,89,0.07)] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#D9B46A]">Em foco</p>
          <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{selectedTask.title}</p>
          <p className="mt-2 text-sm leading-6 text-[#C6D1CC]">{selectedTask.goal}</p>
        </div>
      ) : null}
      {showTasks ? (
        <div className="mt-4 space-y-3 max-h-[46vh] overflow-y-auto pr-1">
          {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} onSelect={onSelectTask} />) : <p className="text-sm text-[#9BAEA8]">Nenhuma tarefa ainda.</p>}
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
  handleQuickMission,
  selectedTask,
  handleReplay,
  detectModules,
}) {
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
