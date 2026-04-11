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

function OperationButton({ label, helper, onClick, disabled, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="border border-[#2D2E2E] bg-[#050706] p-4 text-left transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
    >
      <p className="font-semibold">{loading ? "Executando..." : label}</p>
      {helper ? <p className="mt-2 text-sm opacity-65">{helper}</p> : null}
    </button>
  );
}

function ConfigField({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</p>
      <input
        type={type}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
      />
    </label>
  );
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
  const [textualBackfillLimit, setTextualBackfillLimit] = useState(50);
  const [textualBackfillState, setTextualBackfillState] = useState({ loading: false, error: null, result: null });
  const [operationState, setOperationState] = useState({ loading: null, error: null, result: null });
  const [configForm, setConfigForm] = useState({
    backfill_limit: 50,
    materialize_workspace_id: "",
    reprocess_limit: 3000,
    publish_limit: 50,
    crm_events_limit: 50,
    freshsales_owner_id: "",
  });
  const [configState, setConfigState] = useState({ loading: false, error: null, result: null });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-hmadv-financeiro");
      const settings = payload.data?.config?.settings?.value || {};
      setConfigForm({
        backfill_limit: settings.backfill_limit ?? 50,
        materialize_workspace_id: settings.materialize_workspace_id ?? "",
        reprocess_limit: settings.reprocess_limit ?? 3000,
        publish_limit: settings.publish_limit ?? 50,
        crm_events_limit: settings.crm_events_limit ?? 50,
        freshsales_owner_id: settings.freshsales_owner_id ?? "",
      });
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

  async function backfillTextualAccounts() {
    setTextualBackfillState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "backfill_textual_accounts",
          limit: textualBackfillLimit,
        }),
      });
      setTextualBackfillState({ loading: false, error: null, result: payload.data || null });
      await load();
    } catch (error) {
      setTextualBackfillState({ loading: false, error: error.message || "Falha ao criar/vincular accounts textuais.", result: null });
    }
  }

  async function runOperation(operation) {
    setOperationState({ loading: operation, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_operation",
          operation,
        }),
      }, { timeoutMs: 180000, maxRetries: 0 });
      setOperationState({ loading: null, error: null, result: payload.data || null });
      await load();
    } catch (error) {
      setOperationState({ loading: null, error: error.message || "Falha ao executar operacao administrativa.", result: null });
    }
  }

  async function saveConfig() {
    setConfigState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          settings: configForm,
        }),
      });
      setConfigState({ loading: false, error: null, result: payload.data || null });
      await load();
    } catch (error) {
      setConfigState({ loading: false, error: error.message || "Falha ao salvar configuracao operacional.", result: null });
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
  const freshsalesAuth = data.freshsales_auth || {};
  const operationButtons = Array.isArray(data.config?.operations) ? data.config.operations : [];

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
          <div className="mb-4 grid gap-3 md:grid-cols-[140px_auto]">
            <input
              type="number"
              min="1"
              max="200"
              value={textualBackfillLimit}
              onChange={(event) => setTextualBackfillLimit(Number(event.target.value || 50))}
              className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
            />
            <button
              type="button"
              onClick={backfillTextualAccounts}
              disabled={textualBackfillState.loading}
              className="border border-[#C5A059] bg-[#C5A059] px-4 py-3 text-sm font-semibold text-[#050706] disabled:opacity-50"
            >
              {textualBackfillState.loading ? "Criando/vinculando accounts..." : "Backfill de accounts textuais"}
            </button>
          </div>
          {textualBackfillState.error ? <p className="mb-4 text-sm text-red-200">{textualBackfillState.error}</p> : null}
          {textualBackfillState.result ? (
            <div className="mb-4 rounded-[18px] border border-[#35554B] bg-[rgba(11,24,21,0.72)] p-4 text-sm">
              <p className="font-semibold">
                {textualBackfillState.result.updated_contracts || 0} contrato(s) atualizados, {textualBackfillState.result.updated_receivables || 0} recebível(is) ligados.
              </p>
              <p className="mt-2 opacity-70">
                Existing: {textualBackfillState.result.linked_existing || 0} | Criadas: {textualBackfillState.result.created_accounts || 0}
              </p>
            </div>
          ) : null}
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

      <Panel title="Operacao assistida" eyebrow="Runner">
        <p className="mb-4 text-sm opacity-65">
          Este runner lê a configuração operacional do backend do financeiro e expõe sempre os acionamentos disponíveis para migração, publicação e suporte de CRM.
        </p>
        {data.config?.endpoints ? (
          <div className="mb-4 rounded-[18px] border border-[#2D2E2E] bg-[#050706] p-4 text-sm">
            <p className="font-semibold">Endpoints configurados no backend</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.config.endpoints).map(([key, endpoint]) => (
                <StatusBadge key={key} tone="accent">
                  {endpoint.method} {endpoint.path} [{key}]
                </StatusBadge>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ConfigField
            label="Backfill limit"
            type="number"
            value={configForm.backfill_limit}
            onChange={(event) => setConfigForm((current) => ({ ...current, backfill_limit: Number(event.target.value || 50) }))}
          />
          <ConfigField
            label="Workspace padrao"
            value={configForm.materialize_workspace_id}
            placeholder="UUID do workspace"
            onChange={(event) => setConfigForm((current) => ({ ...current, materialize_workspace_id: event.target.value }))}
          />
          <ConfigField
            label="Reprocess limit"
            type="number"
            value={configForm.reprocess_limit}
            onChange={(event) => setConfigForm((current) => ({ ...current, reprocess_limit: Number(event.target.value || 3000) }))}
          />
          <ConfigField
            label="Publish limit"
            type="number"
            value={configForm.publish_limit}
            onChange={(event) => setConfigForm((current) => ({ ...current, publish_limit: Number(event.target.value || 50) }))}
          />
          <ConfigField
            label="CRM events limit"
            type="number"
            value={configForm.crm_events_limit}
            onChange={(event) => setConfigForm((current) => ({ ...current, crm_events_limit: Number(event.target.value || 50) }))}
          />
          <ConfigField
            label="Freshsales owner"
            value={configForm.freshsales_owner_id}
            placeholder="ID do owner no Freshsales"
            onChange={(event) => setConfigForm((current) => ({ ...current, freshsales_owner_id: event.target.value }))}
          />
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveConfig}
            disabled={configState.loading}
            className="border border-[#C5A059] bg-[#C5A059] px-4 py-3 text-sm font-semibold text-[#050706] disabled:opacity-50"
          >
            {configState.loading ? "Salvando configuracao..." : "Salvar configuracao operacional"}
          </button>
          {data.config?.settings?.updated_at ? (
            <span className="text-sm opacity-65">Atualizado em {formatDate(data.config.settings.updated_at)}</span>
          ) : null}
        </div>
        {configState.error ? <p className="mb-4 text-sm text-red-200">{configState.error}</p> : null}
        {configState.result ? <p className="mb-4 text-sm opacity-70">Configuracao operacional persistida no backend.</p> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {operationButtons.map((item) => (
            <OperationButton
              key={item.key}
              label={item.label}
              helper={`${item.helper}${item.payload ? ` | payload: ${JSON.stringify(item.payload)}` : ""}`}
              loading={operationState.loading === item.key}
              disabled={Boolean(operationState.loading)}
              onClick={() => runOperation(item.key)}
            />
          ))}
        </div>
        {operationState.error ? <p className="mt-4 text-sm text-red-200">{operationState.error}</p> : null}
        {operationState.result ? (
          <div className="mt-4 rounded-[18px] border border-[#35554B] bg-[rgba(11,24,21,0.72)] p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{operationState.result.operation}</p>
              <StatusBadge tone={operationState.result.code === 0 ? "success" : "danger"}>exit {operationState.result.code}</StatusBadge>
            </div>
            {operationState.result.json?.output ? <p className="mt-2 opacity-80">Arquivo: {operationState.result.json.output}</p> : null}
            {operationState.result.json?.total_rows != null ? <p className="mt-2 opacity-80">Linhas: {operationState.result.json.total_rows}</p> : null}
            {operationState.result.stdout ? (
              <pre className="mt-3 overflow-auto whitespace-pre-wrap border border-[#2D2E2E] bg-[#050706] p-3 text-xs opacity-85">
                {operationState.result.stdout}
              </pre>
            ) : null}
            {operationState.result.guidance ? (
              <div className="mt-4 border border-[#2D2E2E] bg-[#050706] p-4">
                <p className="font-semibold">Proximo passo recomendado</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge tone="accent">publish_ready: {operationState.result.guidance.snapshot?.publish_ready ?? 0}</StatusBadge>
                  <StatusBadge tone="warn">sem account: {operationState.result.guidance.snapshot?.receivables_without_account ?? 0}</StatusBadge>
                  <StatusBadge tone="warn">pendente contato: {operationState.result.guidance.snapshot?.pending_contact ?? 0}</StatusBadge>
                  <StatusBadge tone="warn">pendente account: {operationState.result.guidance.snapshot?.pending_account ?? 0}</StatusBadge>
                </div>
                <div className="mt-3 space-y-2">
                  {(operationState.result.guidance.next_steps || []).map((item) => (
                    <p key={item} className="opacity-80">{item}</p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {operationState.result.guidance.fallback?.should_export_accounts_csv ? <StatusBadge tone="accent">fallback accounts CSV</StatusBadge> : null}
                  {operationState.result.guidance.fallback?.should_export_deals_csv ? <StatusBadge tone="accent">fallback deals CSV</StatusBadge> : null}
                  {operationState.result.guidance.fallback?.should_retry_publish ? <StatusBadge tone="success">retry publish direto</StatusBadge> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

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

      <Panel title="Freshsales auth" eyebrow="OAuth">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="API key" value={freshsalesAuth.has_api_key ? "OK" : "Ausente"} helper="Melhor rota para operar a migração sem depender de OAuth." />
          <MetricCard label="Access token" value={freshsalesAuth.has_access_token ? "OK" : "Ausente"} helper="Token atual para leitura/escrita." />
          <MetricCard label="Refresh token" value={freshsalesAuth.has_refresh_token ? "OK" : "Ausente"} helper="Necessário para renovar o acesso." />
          <MetricCard label="OAuth client" value={freshsalesAuth.has_client_id && freshsalesAuth.has_client_secret ? "OK" : "Faltando"} helper="Client ID e secret do app Freshsales." />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge tone={freshsalesAuth.has_api_key ? "success" : "warn"}>
            {freshsalesAuth.has_api_key ? "API key pronta" : "Sem API key local"}
          </StatusBadge>
          <StatusBadge tone={freshsalesAuth.has_access_token ? "success" : "warn"}>
            {freshsalesAuth.has_access_token ? "Token presente" : "Token ausente ou inválido"}
          </StatusBadge>
          <StatusBadge tone={freshsalesAuth.has_refresh_token ? "success" : "warn"}>
            {freshsalesAuth.has_refresh_token ? "Refresh configurado" : "Sem refresh"}
          </StatusBadge>
        </div>
        {freshsalesAuth.preferred_auth_mode ? <p className="mt-4 text-sm opacity-65">Modo preferido: {freshsalesAuth.preferred_auth_mode}</p> : null}
        {freshsalesAuth.api_base ? <p className="mt-4 text-sm opacity-65">Base: {freshsalesAuth.api_base}</p> : null}
        {freshsalesAuth.org_domain ? <p className="mt-2 text-sm opacity-65">Org domain: {freshsalesAuth.org_domain}</p> : null}
        {freshsalesAuth.token_expiry ? <p className="mt-2 text-sm opacity-65">Expira em: {formatDate(freshsalesAuth.token_expiry)}</p> : null}
        {freshsalesAuth.authorization_url ? (
          <p className="mt-4">
            <a
              href={freshsalesAuth.authorization_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block border border-[#C5A059] px-3 py-2 text-sm text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#050706]"
            >
              Reautorizar Freshsales
            </a>
          </p>
        ) : (
          <p className="mt-4 text-sm opacity-65">Preencha as variáveis OAuth para gerar a URL de autorização.</p>
        )}
      </Panel>

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
