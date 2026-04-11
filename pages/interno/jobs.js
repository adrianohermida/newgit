import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

const STATUS_LABELS = {
  pending: "Pendente",
  running: "Executando",
  paused: "Pausado",
  completed: "Concluido",
  error: "Falhou",
  cancelled: "Cancelado",
  retry_wait: "Aguardando retry",
  scheduled: "Agendado",
};

const MODULE_LABELS = {
  contacts: "Contatos",
  processos: "Processos",
  publicacoes: "Publicacoes",
  financeiro: "Financeiro",
  portal: "Portal",
};

const SOURCE_LABELS = {
  interno: "Interno",
  portal: "Portal",
};

function Panel({ title, eyebrow, actions, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#C5A059]">{eyebrow}</p> : null}
          <h3 className="font-serif text-2xl">{title}</h3>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ActionButton({ children, tone = "subtle", ...props }) {
  const tones = {
    subtle: "border border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]",
    primary: "border border-[#C5A059] bg-[#C5A059] text-[#050706]",
    danger: "border border-[#5C2A2A] text-[#F4C1C1] hover:border-[#C96A6A]",
  };
  return (
    <button type="button" {...props} className={`px-4 py-3 text-sm disabled:opacity-50 ${tones[tone]}`}>
      {children}
    </button>
  );
}

function MetricCard({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</p>
      <p className="mb-2 font-serif text-3xl">{value}</p>
      {helper ? <p className="text-sm leading-relaxed opacity-65">{helper}</p> : null}
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || "").trim();
  const tone =
    normalized === "completed"
      ? "border-[#2E5744] text-[#C7F1D7]"
      : normalized === "running"
        ? "border-[#6F5826] text-[#F7E4A7]"
        : normalized === "paused" || normalized === "scheduled" || normalized === "retry_wait"
          ? "border-[#395160] text-[#B8D9F0]"
          : normalized === "error" || normalized === "cancelled"
            ? "border-[#5C2A2A] text-[#F4C1C1]"
            : "border-[#2D2E2E] text-[#D7DDD8]";
  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${tone}`}>{STATUS_LABELS[normalized] || normalized || "Sem status"}</span>;
}

function formatDateTime(value) {
  if (!value) return "sem data";
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return "sem data";
  return new Date(parsed).toLocaleString("pt-BR");
}

function getJobReferenceTime(job) {
  return job?.updated_at || job?.started_at || job?.created_at || null;
}

function getJobAgeHours(job) {
  const parsed = Date.parse(String(getJobReferenceTime(job) || ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60));
}

function getSlaState(job) {
  const status = deriveDisplayStatus(job);
  if (["completed", "cancelled"].includes(status)) {
    return { tone: "ok", label: "Resolvido", helper: "Nao exige acao operacional agora." };
  }
  const ageHours = getJobAgeHours(job);
  if (ageHours == null) {
    return { tone: "neutral", label: "Sem SLA", helper: "Job sem referencia temporal valida." };
  }
  if (ageHours >= 24) {
    return { tone: "critical", label: "Critico", helper: "Backlog acima de 24h sem conclusao." };
  }
  if (ageHours >= 2) {
    return { tone: "attention", label: "Atencao", helper: "Job em aberto ha mais de 2h." };
  }
  return { tone: "ok", label: "No prazo", helper: "Dentro da janela operacional prevista." };
}

function formatAgeLabel(job) {
  const ageHours = getJobAgeHours(job);
  if (ageHours == null) return "sem referencia";
  if (ageHours < 1) return `${Math.max(1, Math.round(ageHours * 60))} min`;
  if (ageHours < 24) return `${ageHours.toFixed(1)} h`;
  return `${Math.round(ageHours)} h`;
}

function getScheduledFor(job) {
  return String(job?.payload?.scheduledFor || "").trim() || null;
}

function getJobControl(job) {
  const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
  const control = payload?.jobControl && typeof payload.jobControl === "object" ? payload.jobControl : payload;
  return {
    source: String(control?.source || control?.origem || "interno").trim().toLowerCase() === "portal" ? "portal" : "interno",
    priority: Math.max(1, Math.min(Number(control?.priority || 3), 5)),
    rateLimitKey: String(control?.rateLimitKey || control?.rate_limit_key || "default").trim() || "default",
    visibleToPortal: Boolean(control?.visibleToPortal || control?.visible_to_portal || false),
  };
}

function getDispatchScore(job) {
  const status = deriveDisplayStatus(job);
  const control = getJobControl(job);
  const createdAt = Date.parse(String(job?.created_at || "")) || 0;
  return {
    statusWeight:
      status === "running"
        ? 0
        : status === "pending"
          ? 1
          : status === "retry_wait"
            ? 2
            : status === "scheduled"
              ? 3
              : status === "paused"
                ? 4
                : status === "error"
                  ? 5
                  : 6,
    priorityWeight: 6 - control.priority,
    createdAt,
  };
}

function deriveDisplayStatus(job) {
  const status = String(job?.status || "").trim();
  const scheduledFor = getScheduledFor(job);
  if ((status === "pending" || status === "paused") && scheduledFor) {
    const parsed = Date.parse(scheduledFor);
    if (Number.isFinite(parsed) && parsed > Date.now() && status !== "paused") return "scheduled";
  }
  return status || "pending";
}

function getProgress(job) {
  const requested = Math.max(0, Number(job?.requested_count || 0));
  const processed = Math.max(0, Number(job?.processed_count || 0));
  if (!requested) return 0;
  return Math.max(0, Math.min(100, Math.round((processed / requested) * 100)));
}

function summarizeJob(job) {
  const requested = Number(job?.requested_count || 0);
  const processed = Number(job?.processed_count || 0);
  const success = Number(job?.success_count || 0);
  const errors = Number(job?.error_count || 0);
  return `Processado ${processed}/${requested} • sucesso ${success} • erros ${errors}`;
}

function getPortalRouting(job) {
  const action = String(job?.acao || "").trim();
  const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
  const withQuery = (pathname, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") return;
      query.set(key, String(value));
    });
    const encoded = query.toString();
    return encoded ? `${pathname}?${encoded}` : pathname;
  };
  if (action === "review_profile_change_request") {
    return {
      href: withQuery("/interno/aprovacoes", { requestId: payload?.requestId, clientId: payload?.clientId }),
      label: "Abrir aprovacoes",
      helper: "Solicitacao cadastral do portal aguardando triagem interna.",
    };
  }
  if (action === "request_financeiro_review") {
    return {
      href: withQuery("/interno/financeiro", { dealId: payload?.dealId, processAccountId: payload?.processAccountId, clientId: payload?.clientId }),
      label: "Abrir financeiro",
      helper: "Cliente pediu conferencia financeira pelo portal.",
    };
  }
  if (action === "request_consulta_change" || action === "request_consulta_support") {
    return {
      href: withQuery("/interno/agendamentos", { id: payload?.consultaId, clientId: payload?.clientId }),
      label: "Abrir agendamentos",
      helper: "Pedido do portal ligado a consulta, remarcacao ou apoio operacional.",
    };
  }
  if (action === "request_document_review") {
    return {
      href: withQuery("/interno/aprovacoes", { documentId: payload?.documentId, clientId: payload?.clientId }),
      label: "Abrir aprovacoes",
      helper: "Pedido documental do portal aguardando validacao interna.",
    };
  }
  return { href: "/interno", label: "Abrir visao geral", helper: "Job do portal sem roteamento especifico ainda." };
}

function SlaBadge({ job }) {
  const state = getSlaState(job);
  const tones = {
    ok: "border-[#2E5744] text-[#C7F1D7]",
    attention: "border-[#6F5826] text-[#F7E4A7]",
    critical: "border-[#5C2A2A] text-[#F4C1C1]",
    neutral: "border-[#2D2E2E] text-[#D7DDD8]",
  };
  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${tones[state.tone]}`}>SLA {state.label}</span>;
}

function JobsContent() {
  const [jobsState, setJobsState] = useState({ loading: true, error: null, items: [] });
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [commandState, setCommandState] = useState({ loading: false, error: null, action: "" });
  const [filters, setFilters] = useState({ modulo: "todos", status: "todos", source: "todos", query: "" });

  async function loadJobs() {
    setJobsState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-jobs?action=list&limit=120", {}, {
        component: "jobs-board",
        label: "Carregar jobs centralizados",
      });
      const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      setJobsState({ loading: false, error: null, items });
      setSelectedJobId((current) => current || items[0]?.id || null);
    } catch (error) {
      setJobsState({ loading: false, error: error.message || "Falha ao carregar jobs.", items: [] });
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadJobs();
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  async function runCommand(action) {
    if (!selectedJobId) return;
    setCommandState({ loading: true, error: null, action });
    try {
      await adminFetch("/api/admin-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId: selectedJobId }),
      }, {
        component: "jobs-board",
        action,
        label: `Executar ${action} no job`,
      });
      await loadJobs();
      setCommandState({ loading: false, error: null, action: "" });
    } catch (error) {
      setCommandState({ loading: false, error: error.message || "Falha ao executar comando.", action: "" });
    }
  }

  const filteredJobs = useMemo(() => {
    const query = String(filters.query || "").trim().toLowerCase();
    return jobsState.items.filter((job) => {
      const moduloOk = filters.modulo === "todos" || String(job?.modulo || "") === filters.modulo;
      const displayStatus = deriveDisplayStatus(job);
      const statusOk = filters.status === "todos" || displayStatus === filters.status;
      const sourceOk = filters.source === "todos" || getJobControl(job).source === filters.source;
      const queryOk =
        !query ||
        [
          job?.acao,
          job?.modulo,
          job?.id,
          job?.last_error,
          getJobControl(job).rateLimitKey,
          JSON.stringify(job?.payload || {}),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return moduloOk && statusOk && sourceOk && queryOk;
    }).sort((left, right) => {
      const leftScore = getDispatchScore(left);
      const rightScore = getDispatchScore(right);
      if (leftScore.statusWeight !== rightScore.statusWeight) return leftScore.statusWeight - rightScore.statusWeight;
      if (leftScore.priorityWeight !== rightScore.priorityWeight) return leftScore.priorityWeight - rightScore.priorityWeight;
      return leftScore.createdAt - rightScore.createdAt;
    });
  }, [filters, jobsState.items]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) || jobsState.items.find((job) => job.id === selectedJobId) || null,
    [filteredJobs, jobsState.items, selectedJobId]
  );

  const metrics = useMemo(() => {
    const items = jobsState.items;
    return {
      total: items.length,
      running: items.filter((job) => deriveDisplayStatus(job) === "running").length,
      pending: items.filter((job) => ["pending", "scheduled", "paused", "retry_wait"].includes(deriveDisplayStatus(job))).length,
      failed: items.filter((job) => deriveDisplayStatus(job) === "error").length,
    };
  }, [jobsState.items]);

  const availableModules = useMemo(() => {
    return Array.from(new Set(jobsState.items.map((job) => String(job?.modulo || "").trim()).filter(Boolean)));
  }, [jobsState.items]);

  const canPause = selectedJob && ["pending", "running", "retry_wait"].includes(String(selectedJob.status || ""));
  const canResume = selectedJob && String(selectedJob.status || "") === "paused";
  const canRestart = Boolean(selectedJob);
  const canCancel = selectedJob && !["completed", "cancelled"].includes(String(selectedJob.status || ""));
  const canRunNow = selectedJob && ["contacts", "processos", "publicacoes"].includes(String(selectedJob?.modulo || "")) && !["paused", "completed", "cancelled"].includes(String(selectedJob.status || ""));
  const portalJobs = useMemo(() => jobsState.items.filter((job) => String(job?.modulo || "") === "portal"), [jobsState.items]);
  const selectedPortalRoute = selectedJob ? getPortalRouting(selectedJob) : null;
  const canMarkPortalRunning = selectedJob && String(selectedJob?.modulo || "") === "portal" && !["running", "completed", "cancelled"].includes(String(selectedJob?.status || ""));
  const canMarkPortalCompleted = selectedJob && String(selectedJob?.modulo || "") === "portal" && !["completed", "cancelled"].includes(String(selectedJob?.status || ""));
  const canMarkPortalError = selectedJob && String(selectedJob?.modulo || "") === "portal" && !["completed", "cancelled", "error"].includes(String(selectedJob?.status || ""));
  const overduePortalJobs = useMemo(
    () => portalJobs.filter((job) => !["completed", "cancelled"].includes(deriveDisplayStatus(job)) && getSlaState(job).tone === "critical"),
    [portalJobs]
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Jobs totais" value={metrics.total} helper="Execucoes persistidas visiveis na camada central." />
        <MetricCard label="Executando" value={metrics.running} helper="Jobs ativos consumindo fila agora." />
        <MetricCard label="Backlog" value={metrics.pending} helper="Pendentes, agendados, pausados ou esperando retry." />
        <MetricCard label="Falharam" value={metrics.failed} helper="Jobs que precisam revisao, restart ou reprocesso." />
      </div>

      {portalJobs.length ? (
        <Panel title="Triagem do portal" eyebrow="Origem cliente">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Jobs portal" value={portalJobs.length} helper="Pedidos criados a partir das areas do portal do cliente." />
            <MetricCard label="Pendentes portal" value={portalJobs.filter((job) => ["pending", "running", "retry_wait"].includes(String(job?.status || ""))).length} helper="Pedidos do cliente aguardando triagem ou tratamento interno." />
            <MetricCard label="Criticos portal" value={overduePortalJobs.length} helper="Pedidos do portal acima da janela de 24h e que merecem prioridade." />
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Mesa central de jobs"
        eyebrow="Execucao em lote"
        actions={<ActionButton onClick={() => loadJobs()} disabled={jobsState.loading || commandState.loading}>Atualizar</ActionButton>}
      >
        <div className="grid gap-3 md:grid-cols-[220px_220px_180px_1fr]">
          <select value={filters.modulo} onChange={(event) => setFilters((current) => ({ ...current, modulo: event.target.value }))} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
            <option value="todos">Todos os modulos</option>
            {availableModules.map((modulo) => <option key={modulo} value={modulo}>{MODULE_LABELS[modulo] || modulo}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
            <option value="todos">Todos os status</option>
            <option value="running">Executando</option>
            <option value="pending">Pendente</option>
            <option value="scheduled">Agendado</option>
            <option value="paused">Pausado</option>
            <option value="retry_wait">Aguardando retry</option>
            <option value="completed">Concluido</option>
            <option value="error">Falhou</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
            <option value="todos">Todas as origens</option>
            <option value="interno">Interno</option>
            <option value="portal">Portal</option>
          </select>
          <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Buscar por acao, id, erro ou payload" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
        </div>

        {jobsState.loading ? <p className="mt-4 text-sm opacity-60">Carregando jobs...</p> : null}
        {jobsState.error ? <p className="mt-4 text-sm text-red-300">{jobsState.error}</p> : null}
        {!jobsState.loading && !filteredJobs.length ? <p className="mt-4 text-sm opacity-60">Nenhum job encontrado com os filtros atuais.</p> : null}

        {filteredJobs.length ? (
          <div className="mt-5 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              {filteredJobs.map((job) => {
                const active = selectedJobId === job.id;
                const displayStatus = deriveDisplayStatus(job);
                const progress = getProgress(job);
                const control = getJobControl(job);
                return (
                  <button key={job.id} type="button" onClick={() => setSelectedJobId(job.id)} className={`block w-full border p-4 text-left ${active ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : "border-[#2D2E2E] hover:border-[#C5A059]"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{job.acao}</p>
                        <StatusBadge status={displayStatus} />
                        <SlaBadge job={job} />
                        <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">{MODULE_LABELS[job.modulo] || job.modulo || "Modulo"}</span>
                        <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">{SOURCE_LABELS[control.source] || control.source}</span>
                        <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">P{control.priority}</span>
                      </div>
                      <span className="text-xs opacity-60">{formatDateTime(getJobReferenceTime(job))}</span>
                    </div>
                    <p className="mt-2 text-sm opacity-75">{summarizeJob(job)}</p>
                    <p className="mt-2 text-xs opacity-55">Bucket: {control.rateLimitKey} • idade: {formatAgeLabel(job)}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                      <div className="h-full bg-[#C5A059]" style={{ width: `${progress}%` }} />
                    </div>
                    {job.last_error ? <p className="mt-3 text-xs text-red-200">{job.last_error}</p> : null}
                  </button>
                );
              })}
            </div>

            <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-5">
              {!selectedJob ? <p className="text-sm opacity-60">Selecione um job para ver os detalhes e comandar a execucao.</p> : (
                <div className="space-y-5 text-sm">
                  {(() => {
                    const control = getJobControl(selectedJob);
                    const slaState = getSlaState(selectedJob);
                    return (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-serif text-2xl">{selectedJob.acao}</p>
                      <StatusBadge status={deriveDisplayStatus(selectedJob)} />
                      <SlaBadge job={selectedJob} />
                      <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">{SOURCE_LABELS[control.source] || control.source}</span>
                      <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">Prioridade {control.priority}</span>
                    </div>
                    <p className="mt-2 opacity-65">ID: {selectedJob.id}</p>
                    <p className="mt-1 opacity-65">Bucket de rate limit: {control.rateLimitKey}</p>
                    <p className="mt-1 opacity-65">Visivel ao portal: {control.visibleToPortal ? "sim" : "nao"}</p>
                    <p className="mt-1 opacity-65">Idade operacional: {formatAgeLabel(selectedJob)} • {slaState.helper}</p>
                  </div>
                    );
                  })()}

                  <div className="grid gap-3 md:grid-cols-2">
                    <MetricCard label="Solicitados" value={Number(selectedJob.requested_count || 0)} />
                    <MetricCard label="Processados" value={Number(selectedJob.processed_count || 0)} />
                    <MetricCard label="Sucesso" value={Number(selectedJob.success_count || 0)} />
                    <MetricCard label="Erros" value={Number(selectedJob.error_count || 0)} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="border border-[#2D2E2E] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] opacity-55">Criado em</p>
                      <p className="mt-2">{formatDateTime(selectedJob.created_at)}</p>
                    </div>
                    <div className="border border-[#2D2E2E] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] opacity-55">Agendado para</p>
                      <p className="mt-2">{formatDateTime(getScheduledFor(selectedJob))}</p>
                    </div>
                    <div className="border border-[#2D2E2E] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] opacity-55">Inicio</p>
                      <p className="mt-2">{formatDateTime(selectedJob.started_at)}</p>
                    </div>
                    <div className="border border-[#2D2E2E] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] opacity-55">Fim</p>
                      <p className="mt-2">{formatDateTime(selectedJob.finished_at)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ActionButton onClick={() => runCommand("pause")} disabled={!canPause || commandState.loading}>Pausar</ActionButton>
                    <ActionButton onClick={() => runCommand("resume")} disabled={!canResume || commandState.loading}>Continuar</ActionButton>
                    <ActionButton onClick={() => runCommand("restart")} disabled={!canRestart || commandState.loading}>Reiniciar</ActionButton>
                    <ActionButton onClick={() => runCommand("run_now")} disabled={!canRunNow || commandState.loading} tone="primary">Rodar agora</ActionButton>
                    <ActionButton onClick={() => runCommand("cancel")} disabled={!canCancel || commandState.loading} tone="danger">Cancelar</ActionButton>
                  </div>

                  {String(selectedJob?.modulo || "") === "portal" ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <ActionButton onClick={() => runCommand("mark_running")} disabled={!canMarkPortalRunning || commandState.loading}>Marcar em analise</ActionButton>
                        <ActionButton onClick={() => runCommand("mark_completed")} disabled={!canMarkPortalCompleted || commandState.loading} tone="primary">Concluir triagem</ActionButton>
                        <ActionButton onClick={() => runCommand("mark_error")} disabled={!canMarkPortalError || commandState.loading} tone="danger">Marcar falha</ActionButton>
                      </div>
                      {selectedPortalRoute ? (
                        <div className="rounded-[20px] border border-[#2D2E2E] p-4">
                          <p className="text-xs uppercase tracking-[0.14em] opacity-55">Destino sugerido</p>
                          <p className="mt-2 text-sm opacity-75">{selectedPortalRoute.helper}</p>
                          <div className="mt-4">
                            <Link href={selectedPortalRoute.href} prefetch={false} className="inline-flex border border-[#C5A059] px-4 py-2 text-sm hover:border-[#E7C98C]">
                              {selectedPortalRoute.label}
                            </Link>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {commandState.error ? <p className="text-sm text-red-300">{commandState.error}</p> : null}

                  <div className="border border-[#2D2E2E] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] opacity-55">Payload</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs opacity-75">{JSON.stringify(selectedJob.payload || {}, null, 2)}</pre>
                  </div>

                  {selectedJob.result_summary ? (
                    <div className="border border-[#2D2E2E] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] opacity-55">Resumo do resultado</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs opacity-75">{JSON.stringify(selectedJob.result_summary || {}, null, 2)}</pre>
                    </div>
                  ) : null}

                  {selectedJob.last_error ? (
                    <div className="border border-[#5C2A2A] bg-[rgba(127,29,29,0.18)] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-[#F4C1C1]">Ultimo erro</p>
                      <p className="mt-2 text-sm text-[#F4C1C1]">{selectedJob.last_error}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

export default function InternoJobsPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Jobs"
          description="Mesa central de execucao em lote para controlar backlog, evitar rate limit e acompanhar jobs do interno em uma trilha unica."
        >
          <JobsContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
