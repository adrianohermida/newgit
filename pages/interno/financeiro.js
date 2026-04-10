import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

function MetricCard({ label, value, helper }) {
  return (
    <article className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-relaxed opacity-65">{helper}</p> : null}
    </article>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      {eyebrow ? <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "#C5A059" }}>{eyebrow}</p> : null}
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function StatusBadge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-[#2D2E2E] text-[#D7DDD8]",
    accent: "border-[#C5A059] text-[#F4E7C2]",
    success: "border-[#2E5744] text-[#C7F1D7]",
    warn: "border-[#6F5826] text-[#F7E4A7]",
    danger: "border-[#5C2A2A] text-[#F4C1C1]",
  };

  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${tones[tone]}`}>{children}</span>;
}

function formatMoney(value) {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR");
}

function toneForStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("error") || normalized.includes("falh")) return "danger";
  if (normalized.includes("pending") || normalized.includes("pendente")) return "warn";
  if (normalized.includes("processed") || normalized.includes("pago") || normalized.includes("resolved")) return "success";
  if (normalized.includes("textual")) return "accent";
  return "neutral";
}

export default function InternoFinanceiroPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Financeiro"
          description="Leitura interna da base canônica de contratos, recebíveis, pendências de reconciliação e prontidão para publicação em Deals."
        >
          <FinanceiroInternoContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function FinanceiroInternoContent() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [selectedPendingRows, setSelectedPendingRows] = useState([]);
  const [processQuery, setProcessQuery] = useState("");
  const [processSearch, setProcessSearch] = useState({ loading: false, error: null, items: [] });
  const [resolutionState, setResolutionState] = useState({ loading: false, error: null, result: null });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-hmadv-financeiro");
      setState({ loading: false, error: null, data: payload.data || null });
    } catch (error) {
      setState({ loading: false, error: error.message || "Falha ao carregar o modulo financeiro.", data: null });
    }
  }

  async function searchProcesses(nextQuery = processQuery) {
    const effectiveQuery = String(nextQuery || "").trim();
    if (!effectiveQuery) {
      setProcessSearch({ loading: false, error: null, items: [] });
      return;
    }
    setProcessSearch({ loading: true, error: null, items: [] });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-financeiro?action=search_processes&query=${encodeURIComponent(effectiveQuery)}&limit=20`);
      setProcessSearch({ loading: false, error: null, items: payload.data?.items || [] });
    } catch (error) {
      setProcessSearch({ loading: false, error: error.message || "Falha ao buscar processos.", items: [] });
    }
  }

  async function applyProcessResolution(candidate) {
    if (!selectedPendingRows.length) {
      setResolutionState({ loading: false, error: "Selecione ao menos uma linha pendente.", result: null });
      return;
    }
    setResolutionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_account_rows",
          rowIds: selectedPendingRows,
          processId: candidate?.id || null,
          freshsalesAccountId: candidate?.account_id_freshsales || null,
          processReference: candidate?.numero_cnj || candidate?.numero_processo || candidate?.titulo || null,
        }),
      });
      setResolutionState({ loading: false, error: null, result: payload.data || null });
      setSelectedPendingRows([]);
      await load();
    } catch (error) {
      setResolutionState({ loading: false, error: error.message || "Falha ao aplicar reconciliacao manual.", result: null });
    }
  }

  function togglePendingRow(id) {
    setSelectedPendingRows((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  useEffect(() => {
    load();
  }, []);

  const cards = useMemo(() => {
    const overview = state.data?.overview || {};
    const resolution = state.data?.resolution || {};
    return [
      { label: "Import rows", value: overview.import_rows || 0, helper: "Volume total no staging financeiro." },
      { label: "Contracts", value: overview.contracts || 0, helper: "Contratos canônicos materializados." },
      { label: "Receivables", value: overview.receivables || 0, helper: "Recebíveis disponíveis para portal e CRM." },
      { label: "Portal ready", value: overview.portal_ready || 0, helper: "Recebíveis com contact resolvido." },
      { label: "Publish ready", value: overview.publish_ready || 0, helper: "Recebíveis aptos a virar Deal no Freshsales." },
      { label: "Pendente account", value: resolution.pending_account || 0, helper: "Linhas esperando vínculo com processo/account." },
      { label: "Em aberto", value: formatMoney(overview.open_amount || 0), helper: "Saldo aberto consolidado da base canônica." },
      { label: "Base canônica", value: formatMoney(overview.canonical_amount || 0), helper: "Montante total refletido em recebíveis." },
    ];
  }, [state.data]);

  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando leitura financeira...</div>;
  }

  if (state.error) {
    return <div className="border border-[#5C2A2A] bg-[rgba(91,53,53,0.16)] p-6 text-sm text-red-200">{state.error}</div>;
  }

  const data = state.data || {};
  const counts = data.counts || {};
  const diagnostics = data.diagnostics || {};

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={load}
          className="border border-[#2D2E2E] px-4 py-3 text-sm transition hover:border-[#C5A059] hover:text-[#C5A059]"
        >
          Atualizar leitura
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Estado da migração" eyebrow="Pipeline">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Pendente contato" value={data.resolution?.pending_contact || 0} helper="Ainda depende de vínculo de contact." />
            <MetricCard label="Pendente revisão" value={data.resolution?.pending_review || 0} helper="Linhas com erro ou ambiguidade." />
            <MetricCard label="Textual only" value={data.resolution?.contracts_textual_only || 0} helper="Contratos sem account resolvido, mas já úteis para o portal." />
            <MetricCard label="Receivables sem account" value={data.resolution?.receivables_without_account || 0} helper="Ficam fora da publicação em Deals por enquanto." />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone={diagnostics.ready_for_freshsales_publish ? "success" : "warn"}>
              {diagnostics.ready_for_freshsales_publish ? "Deals aptos para publicar" : "Deals ainda parciais"}
            </StatusBadge>
            <StatusBadge tone="accent">{diagnostics.contracts_textual_only_share || 0}% contratos textual_only</StatusBadge>
            <StatusBadge tone="accent">{diagnostics.receivables_without_account_share || 0}% recebíveis sem account</StatusBadge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(counts.import_status || {}).map(([key, value]) => (
              <StatusBadge key={key} tone={toneForStatus(key)}>{key}: {value}</StatusBadge>
            ))}
          </div>
        </Panel>

        <Panel title="Filas e publicação" eyebrow="Freshsales + CRM">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(counts.deal_sync_status || {}).map(([key, value]) => (
              <div key={key} className="border border-[#2D2E2E] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{key}</p>
                  <StatusBadge tone={toneForStatus(key)}>{value}</StatusBadge>
                </div>
              </div>
            ))}
            {Object.entries(counts.crm_queue_status || {}).map(([key, value]) => (
              <div key={key} className="border border-[#2D2E2E] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">CRM {key}</p>
                  <StatusBadge tone={toneForStatus(key)}>{value}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
          {!Object.keys(counts.deal_sync_status || {}).length && !Object.keys(counts.crm_queue_status || {}).length ? (
            <p className="text-sm opacity-65">Ainda não há volume operacional suficiente nas filas para esta leitura.</p>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Importações recentes" eyebrow="Runs">
          <div className="space-y-3">
            {(data.recent_import_runs || []).map((run) => (
              <article key={run.id} className="border border-[#2D2E2E] p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{run.source_file || run.source_name || "Import run"}</p>
                  <StatusBadge tone={toneForStatus(run.status)}>{run.status || "sem_status"}</StatusBadge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 opacity-65">
                  <span>Total: {run.total_rows || 0}</span>
                  <span>Válidas: {run.valid_rows || 0}</span>
                  <span>Erro: {run.error_rows || 0}</span>
                </div>
                <p className="mt-2 opacity-55">Início: {formatDate(run.started_at)}</p>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Fontes do staging" eyebrow="CSV">
          <div className="space-y-3 text-sm">
            {Object.entries(counts.import_sources || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between border border-[#2D2E2E] p-4">
                <p className="font-semibold">{key}</p>
                <StatusBadge tone="accent">{value}</StatusBadge>
              </div>
            ))}
            {!Object.keys(counts.import_sources || {}).length ? <p className="opacity-65">Nenhuma fonte de importação detectada.</p> : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recebíveis recentes" eyebrow="Base canônica">
          <div className="space-y-3">
            {(data.recent_receivables || []).map((item) => (
              <article key={item.id} className="border border-[#2D2E2E] p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.title}</p>
                  <StatusBadge tone={toneForStatus(item.status)}>{item.status || "sem_status"}</StatusBadge>
                  {item.freshsales_account_id ? <StatusBadge tone="success">account resolvido</StatusBadge> : <StatusBadge tone="warn">textual_only</StatusBadge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 opacity-70">
                  <span>Contato: {item.contact_name || item.contact_email || "sem contato"}</span>
                  <span>Vencimento: {item.due_date || "n/d"}</span>
                  <span>Saldo: {formatMoney(item.balance_due || 0)}</span>
                </div>
                {item.process_reference ? <p className="mt-2 opacity-55">Processo: {item.process_reference}</p> : null}
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Pendências de account" eyebrow="Reconciliação">
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={processQuery}
              onChange={(event) => setProcessQuery(event.target.value)}
              placeholder="Buscar processo por CNJ, número, account ou título"
              className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
            />
            <button
              type="button"
              onClick={() => searchProcesses()}
              className="border border-[#2D2E2E] px-4 py-3 text-sm transition hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Buscar processo
            </button>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <StatusBadge tone="accent">{selectedPendingRows.length} linha(s) selecionada(s)</StatusBadge>
            {resolutionState.loading ? <StatusBadge tone="warn">Aplicando reconciliacao...</StatusBadge> : null}
          </div>
          {resolutionState.error ? <p className="mb-4 text-sm text-red-200">{resolutionState.error}</p> : null}
          {resolutionState.result ? (
            <div className="mb-4 rounded-[18px] border border-[#35554B] bg-[rgba(11,24,21,0.72)] p-4 text-sm">
              <p className="font-semibold">Reconciliacao aplicada em {resolutionState.result.updated || 0} linha(s).</p>
              <p className="mt-2 opacity-70">
                Processo: {resolutionState.result.process_reference || resolutionState.result.process?.label || "n/d"}
              </p>
            </div>
          ) : null}
          <div className="space-y-3">
            {(data.pending_account_rows || []).map((row) => (
              <label key={row.id} className="block cursor-pointer border border-[#2D2E2E] p-4 text-sm">
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={selectedPendingRows.includes(row.id)}
                    onChange={() => togglePendingRow(row.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{row.person_name || row.email || "Linha sem identificação"}</p>
                      <StatusBadge tone="warn">{row.matching_status}</StatusBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 opacity-70">
                      {row.resolved_contact_name ? <span>Contato: {row.resolved_contact_name}</span> : null}
                      {row.invoice_number ? <span>Fatura: {row.invoice_number}</span> : null}
                      {row.billing_type_inferred ? <span>Cobrança: {row.billing_type_inferred}</span> : null}
                    </div>
                    <p className="mt-2 opacity-55">
                      Processo: {row.resolved_process_reference || row.deal_reference_raw || "sem referência forte"}
                    </p>
                    {(row.resolved_process_reference || row.deal_reference_raw) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const seed = row.resolved_process_reference || row.deal_reference_raw || "";
                          setProcessQuery(seed);
                          searchProcesses(seed);
                        }}
                        className="mt-3 border border-[#2D2E2E] px-3 py-2 text-xs transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Buscar candidatos para esta linha
                      </button>
                    ) : null}
                  </div>
                </div>
              </label>
            ))}
            {!data.pending_account_rows?.length ? <p className="opacity-65">Nenhuma pendência de account encontrada neste recorte.</p> : null}
          </div>
        </Panel>
      </div>

      <Panel title="Candidatos de processo/account" eyebrow="Resolução manual">
        {processSearch.loading ? <p className="text-sm opacity-65">Buscando processos...</p> : null}
        {processSearch.error ? <p className="text-sm text-red-200">{processSearch.error}</p> : null}
        <div className="grid gap-3 xl:grid-cols-2">
          {(processSearch.items || []).map((item) => (
            <article key={item.id} className="border border-[#2D2E2E] p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{item.label}</p>
                {item.account_id_freshsales ? <StatusBadge tone="success">account {item.account_id_freshsales}</StatusBadge> : <StatusBadge tone="warn">sem account</StatusBadge>}
                <StatusBadge tone="accent">{item.matched_by}</StatusBadge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 opacity-70">
                {item.numero_cnj ? <span>CNJ: {item.numero_cnj}</span> : null}
                {item.numero_processo ? <span>Número: {item.numero_processo}</span> : null}
                {item.status ? <span>Status: {item.status}</span> : null}
              </div>
              {item.titulo ? <p className="mt-2 opacity-55">{item.titulo}</p> : null}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => applyProcessResolution(item)}
                  disabled={!selectedPendingRows.length || resolutionState.loading}
                  className="border border-[#C5A059] bg-[#C5A059] px-4 py-2 text-sm font-semibold text-[#050706] disabled:opacity-50"
                >
                  Aplicar nas linhas selecionadas
                </button>
              </div>
            </article>
          ))}
          {!processSearch.loading && !processSearch.error && !processSearch.items.length ? (
            <p className="opacity-65">Busque um processo para aplicar reconciliação manual nas linhas pendentes.</p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Pendências de contato" eyebrow="Staging">
        <div className="grid gap-3 xl:grid-cols-2">
          {(data.pending_contact_rows || []).map((row) => (
            <article key={row.id} className="border border-[#2D2E2E] p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{row.person_name || row.email || "Linha sem identificação"}</p>
                <StatusBadge tone="warn">{row.matching_status}</StatusBadge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 opacity-70">
                {row.email ? <span>E-mail: {row.email}</span> : null}
                {row.invoice_number ? <span>Fatura: {row.invoice_number}</span> : null}
                {row.product_family_inferred ? <span>Produto: {row.product_family_inferred}</span> : null}
              </div>
              {row.validation_errors?.length ? (
                <p className="mt-2 opacity-55">Erros: {row.validation_errors.join(" | ")}</p>
              ) : null}
            </article>
          ))}
          {!data.pending_contact_rows?.length ? <p className="opacity-65">Sem pendências de contato neste recorte.</p> : null}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Falhas de publicação" eyebrow="Deals">
          <div className="space-y-3">
            {(data.deal_failures || []).map((item) => (
              <article key={item.id} className="border border-[#5C2A2A] bg-[rgba(91,53,53,0.12)] p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.billing_receivable_id || item.id}</p>
                  <StatusBadge tone="danger">erro</StatusBadge>
                </div>
                <p className="mt-2 opacity-75">{item.last_sync_error || "Sem detalhe do erro."}</p>
              </article>
            ))}
            {!data.deal_failures?.length ? <p className="opacity-65">Sem falhas recentes de publicação.</p> : null}
          </div>
        </Panel>

        <Panel title="Backlog CRM" eyebrow="Fila">
          <div className="space-y-3">
            {(data.crm_queue_backlog || []).map((item) => (
              <article key={item.id} className="border border-[#2D2E2E] p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.event_type || "evento"}</p>
                  <StatusBadge tone={toneForStatus(item.status)}>{item.status || "sem_status"}</StatusBadge>
                  <StatusBadge tone="accent">{item.attempts || 0} tentativas</StatusBadge>
                </div>
                {item.error ? <p className="mt-2 opacity-75">{item.error}</p> : null}
              </article>
            ))}
            {!data.crm_queue_backlog?.length ? <p className="opacity-65">Sem backlog atual de eventos CRM.</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
