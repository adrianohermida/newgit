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

export function ThinkingBlock({ block }) {
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

export function LogRow({ log }) {
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

export function RunHistoryCard({ item, formatHistoryStatus, formatExecutionSourceLabel, nowIso }) {
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

export function AgentLane({ lane, selectedTaskId, onSelectTask }) {
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

export function MissionControlPanel({
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
  modeOptions,
  providerOptions,
  formatExecutionSourceLabel,
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
            {modeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Provider</span>
          <select value={providerValue} onChange={(event) => setProvider(event.target.value)} className="h-[calc(100%-1.8rem)] w-full rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
            {providerOptions.map((item) => (
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

export function RunsPane({ recentHistory, missionHistory, activeRunId, formatHistoryStatus, formatExecutionSourceLabel, nowIso }) {
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
              <RunHistoryCard item={item} formatHistoryStatus={formatHistoryStatus} formatExecutionSourceLabel={formatExecutionSourceLabel} nowIso={nowIso} />
            </div>
          )) : <p className="text-sm text-[#9BAEA8]">Nenhuma execução registrada.</p>}
        </div>
      </section>
    </aside>
  );
}

export function ContextRail({
  showContext,
  setShowContext,
  contextSnapshot,
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
