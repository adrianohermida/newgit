import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

const EMPTY_FORM = { numero_cnj_pai: "", numero_cnj_filho: "", tipo_relacao: "dependencia", status: "ativo", observacoes: "" };
const PROCESS_VIEW_ITEMS = [
  { key: "operacao", label: "Operacao" },
  { key: "filas", label: "Filas" },
  { key: "relacoes", label: "Relacoes" },
  { key: "resultado", label: "Resultado" },
];
const HISTORY_STORAGE_KEY = "hmadv:interno-processos:history:v1";

function buildHistoryPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (typeof result.publicacoes === "number") return `Publicacoes processadas: ${result.publicacoes}`;
  if (typeof result.updated === "number") return `Atualizados: ${result.updated}`;
  if (typeof result.inserted === "number") return `Inseridos: ${result.inserted}`;
  if (typeof result.total === "number") return `Total: ${result.total}`;
  if (typeof result.items?.length === "number") return `Itens retornados: ${result.items.length}`;
  if (typeof result.sample?.length === "number") return `Amostra: ${result.sample.length}`;
  return "Execucao concluida";
}

function loadHistoryEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHistoryEntries(entries) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 40)));
  } catch {}
}

function MetricCard({ label, value, helper }) {
  return <div className="rounded-[28px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.98),rgba(7,9,8,0.98))] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)]"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{label}</p><p className="mb-2 font-serif text-3xl">{value}</p>{helper ? <p className="text-sm leading-relaxed opacity-65">{helper}</p> : null}</div>;
}
function Panel({ title, eyebrow, children }) {
  return <section className="rounded-[30px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))] p-6 shadow-[0_14px_48px_rgba(0,0,0,0.22)]">{eyebrow ? <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>{eyebrow}</p> : null}<h3 className="mb-4 font-serif text-[1.9rem] leading-tight">{title}</h3>{children}</section>;
}
function Field({ label, value, onChange, placeholder }) {
  return <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{label}</span><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" /></label>;
}
function SelectField({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function ActionButton({ children, tone = "subtle", className = "", ...props }) {
  const tones = {
    subtle: "border border-[#2D2E2E] text-[#F4F1EA] hover:border-[#C5A059] hover:text-[#C5A059]",
    primary: "bg-[#C5A059] text-[#050706] hover:brightness-110",
    danger: "border border-[#4B2222] text-red-200 hover:border-[#C96A6A]",
  };
  return <button type="button" {...props} className={`rounded-2xl px-5 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.subtle} ${className}`.trim()}>{children}</button>;
}
function SectionNav({ items }) {
  return <div className="flex flex-wrap gap-2">{items.map((item) => <a key={item.href} href={item.href} className="rounded-full border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#C5A059] transition hover:border-[#C5A059] hover:bg-[rgba(197,160,89,0.08)]">{item.label}</a>)}</div>;
}
function ViewToggle({ value, onChange }) {
  return <div className="flex flex-wrap gap-2">{PROCESS_VIEW_ITEMS.map((item) => {
    const active = item.key === value;
    return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${active ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#F8E7B5]" : "border-[#2D2E2E] text-[#C5A059] hover:border-[#C5A059]"}`}>{item.label}</button>;
  })}</div>;
}
function QueueList({ title, rows, selected, onToggle, onTogglePage, page, setPage, loading, helper, totalRows = 0, pageSize = 20 }) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{title}</p><span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70">{rows.length} nesta pagina</span><span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70">{totalRows} no total</span>{selected.length ? <span className="rounded-full border border-[#6E5630] bg-[rgba(76,57,26,0.22)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#FDE68A]">{selected.length} selecionado(s)</span> : null}</div>{helper ? <p className="mt-1 text-xs leading-6 opacity-60">{helper}</p> : null}{totalRows ? <p className="mt-1 text-xs opacity-50">Pagina {page} de {totalPages}</p> : null}</div><div className="flex flex-wrap gap-2"><ActionButton onClick={() => onTogglePage(!allSelected)} className="px-3 py-2 text-xs">{allSelected ? "Desmarcar pagina" : "Selecionar pagina"}</ActionButton><ActionButton onClick={() => setPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className="px-3 py-2 text-xs">Anterior</ActionButton><ActionButton onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} className="px-3 py-2 text-xs">Proxima</ActionButton></div></div>{loading ? <p className="text-sm opacity-60">Carregando fila...</p> : null}{!loading && !rows.length ? <p className="rounded-2xl border border-dashed border-[#2D2E2E] px-4 py-6 text-sm opacity-60">Nenhum item encontrado nesta pagina.</p> : null}<div className="space-y-3">{rows.map((row) => <label key={row.key} className="block cursor-pointer rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 transition hover:border-[#3A3E3D]"><div className="flex gap-3"><input type="checkbox" checked={selected.includes(row.key)} onChange={() => onToggle(row.key)} className="mt-1" /><div className="min-w-0 flex-1 space-y-2 text-sm"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold break-all">{row.numero_cnj || row.key}</p>{row.monitoramento_fallback ? <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70">fallback</span> : null}</div>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 opacity-60 text-xs">{row.status_atual_processo ? <span>Status: {row.status_atual_processo}</span> : null}{row.quantidade_movimentacoes !== undefined ? <span>Movimentacoes: {row.quantidade_movimentacoes ?? 0}</span> : null}{row.monitoramento_ativo !== undefined ? <span>Monitorado: {row.monitoramento_ativo ? "sim" : "nao"}</span> : null}{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]" onClick={(e) => e.stopPropagation()}>Account {row.account_id_freshsales}</a> : <span>Sem Sales Account</span>}</div></div></div></label>)}</div></div>;
}
function RelationProcessCard({ title, process, fallbackNumber }) {
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[#050706] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{title}</p><p className="mt-3 break-all font-semibold">{process?.numero_cnj || fallbackNumber || "Sem CNJ"}</p><p className="mt-1 text-sm opacity-70">{process?.titulo || "Processo ainda nao encontrado na base judiciaria."}</p><div className="mt-2 flex flex-wrap gap-3 text-xs opacity-60">{process?.status_atual_processo ? <span>Status: {process.status_atual_processo}</span> : null}{process?.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${process.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {process.account_id_freshsales}</a> : null}</div></div>;
}
function OperationResult({ result }) {
  const rows = Array.isArray(result?.items) ? result.items : Array.isArray(result?.sample) ? result.sample : [];
  return rows.length ? <div className="space-y-3"><div className="rounded-2xl border border-[#1D2321] bg-[rgba(4,6,6,0.45)] px-4 py-3 text-xs uppercase tracking-[0.16em] opacity-65">Amostra operacional: {rows.length} item(ns)</div>{rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.id || index}`} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm"><p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs underline opacity-70 hover:text-[#C5A059]">Abrir account {row.account_id_freshsales}</a> : null}{row.result ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs opacity-70">{JSON.stringify(row.result, null, 2)}</pre> : null}</div>)}</div> : <pre className="overflow-x-auto whitespace-pre-wrap rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-xs opacity-80">{JSON.stringify(result, null, 2)}</pre>;
}
function HistoryCard({ entry, onReuse }) {
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{entry.label}</p><p className="text-xs opacity-60">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${entry.status === "running" ? "border-[#6E5630] text-[#FDE68A]" : entry.status === "error" ? "border-[#4B2222] text-red-200" : "border-[#2D2E2E] opacity-70"}`}>{entry.status}</span>
    </div>
    {entry.preview ? <p className="mt-3 opacity-70">{entry.preview}</p> : null}
    {entry.meta?.selectedCount ? <p className="mt-2 text-xs opacity-60">Itens selecionados: {entry.meta.selectedCount}</p> : null}
    {entry.meta?.limit ? <p className="mt-1 text-xs opacity-60">Lote: {entry.meta.limit}</p> : null}
    {entry.meta?.processNumbersPreview ? <p className="mt-2 break-all text-xs opacity-60">CNJs: {entry.meta.processNumbersPreview}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => onReuse(entry)} className="px-3 py-2 text-xs">Reusar parametros</ActionButton></div>
  </div>;
}
function QueueSummaryCard({ title, count, helper, onOpen, accent = "text-[#C5A059]" }) {
  return <button type="button" onClick={onOpen} className="w-full rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-left transition hover:border-[#C5A059]">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{title}</p>
    <p className={`mt-2 font-serif text-3xl ${accent}`}>{count}</p>
    <p className="mt-2 text-sm opacity-65">{helper}</p>
  </button>;
}

export default function InternoProcessosPage() {
  return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestao de Processos" description="Painel operacional para sincronizacao DataJud, criacao de accounts, correcao de gaps no Freshsales e vinculacao de processos relacionados."><InternoProcessosContent /></InternoLayout>}</RequireAdmin>;
}

function InternoProcessosContent() {
  const [view, setView] = useState("operacao");
  const [overview, setOverview] = useState({ loading: true, data: null });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [limit, setLimit] = useState(10);
  const [processNumbers, setProcessNumbers] = useState("");
  const [withoutMovements, setWithoutMovements] = useState({ loading: true, items: [] });
  const [monitoringActive, setMonitoringActive] = useState({ loading: true, items: [] });
  const [monitoringInactive, setMonitoringInactive] = useState({ loading: true, items: [] });
  const [fieldGaps, setFieldGaps] = useState({ loading: true, items: [] });
  const [orphans, setOrphans] = useState({ loading: true, items: [] });
  const [wmPage, setWmPage] = useState(1);
  const [maPage, setMaPage] = useState(1);
  const [fgPage, setFgPage] = useState(1);
  const [selectedWithoutMovements, setSelectedWithoutMovements] = useState([]);
  const [selectedMonitoringActive, setSelectedMonitoringActive] = useState([]);
  const [selectedMonitoringInactive, setSelectedMonitoringInactive] = useState([]);
  const [selectedFieldGaps, setSelectedFieldGaps] = useState([]);
  const [selectedOrphans, setSelectedOrphans] = useState([]);
  const [relations, setRelations] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1 });
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState({ loading: false, items: [] });
  const [lookupTerm, setLookupTerm] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRelationId, setEditingRelationId] = useState(null);

  useEffect(() => {
    const syncViewFromLocation = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const queryView = url.searchParams.get("view");
      const hashView = window.location.hash ? window.location.hash.replace("#", "") : "";
      const nextView = PROCESS_VIEW_ITEMS.some((item) => item.key === queryView)
        ? queryView
        : PROCESS_VIEW_ITEMS.some((item) => item.key === hashView)
          ? hashView
          : "operacao";
      setView(nextView);
    };
    syncViewFromLocation();
    if (typeof window !== "undefined") window.addEventListener("hashchange", syncViewFromLocation);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("hashchange", syncViewFromLocation);
    };
  }, []);
  useEffect(() => { setExecutionHistory(loadHistoryEntries()); }, []);
  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { loadQueue("sem_movimentacoes", setWithoutMovements, wmPage); }, [wmPage]);
  useEffect(() => { loadQueue("monitoramento_ativo", setMonitoringActive, maPage); }, [maPage]);
  useEffect(() => { loadQueue("monitoramento_inativo", setMonitoringInactive, maPage); }, [maPage]);
  useEffect(() => { loadQueue("campos_orfaos", setFieldGaps, fgPage); }, [fgPage]);
  useEffect(() => { loadOrphans(); }, []);
  useEffect(() => { loadRelations(1, search); }, [search]);
  useEffect(() => {
    const term = lookupTerm.trim();
    if (!term) { setLookup({ loading: false, items: [] }); return undefined; }
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLookup((current) => ({ ...current, loading: true }));
      try {
        const payload = await adminFetch(`/api/admin-hmadv-processos?action=buscar_processos&query=${encodeURIComponent(term)}&limit=8`);
        if (!cancelled) setLookup({ loading: false, items: payload.data.items || [] });
      } catch { if (!cancelled) setLookup({ loading: false, items: [] }); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [lookupTerm]);

  async function loadOverview() { try { const payload = await adminFetch("/api/admin-hmadv-processos?action=overview"); setOverview({ loading: false, data: payload.data }); } catch { setOverview({ loading: false, data: null }); } }
  async function loadQueue(action, setter, page) {
    setter((state) => ({ ...state, loading: true }));
    try { const payload = await adminFetch(`/api/admin-hmadv-processos?action=${action}&page=${page}&pageSize=20`); setter({ loading: false, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })) }); } catch { setter({ loading: false, items: [] }); }
  }
  async function loadOrphans() {
    setOrphans((state) => ({ ...state, loading: true }));
    try { const payload = await adminFetch(`/api/admin-hmadv-processos?action=orfaos&limit=20`); setOrphans({ loading: false, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })) }); } catch { setOrphans({ loading: false, items: [] }); }
  }
  async function loadRelations(page = 1, query = "") {
    setRelations((current) => ({ ...current, loading: true, error: null }));
    try { const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}`); setRelations({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page }); } catch (error) { setRelations({ loading: false, error: error.message || "Falha ao carregar relacoes.", items: [], totalRows: 0, page }); }
  }
  function toggleSelection(setter, current, key) { setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  function togglePageSelection(setter, current, rows, nextState) { const keys = rows.map((item) => item.key); if (nextState) { setter([...new Set([...current, ...keys])]); return; } setter(current.filter((item) => !keys.includes(item))); }
  function getSelectedNumbers(rows, selected) { return rows.filter((item) => selected.includes(item.key)).map((item) => item.numero_cnj).filter(Boolean); }
  function updateView(nextView) {
    setView(nextView);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextView;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function buildActionMeta(payload = {}) {
    const explicitNumbers = String(payload.processNumbers || "").trim();
    const fallbackNumbers = String(processNumbers || "").trim();
    return {
      limit,
      selectedCount: selectedWithoutMovements.length + selectedMonitoringActive.length + selectedMonitoringInactive.length + selectedFieldGaps.length + selectedOrphans.length,
      processNumbersPreview: (explicitNumbers || fallbackNumbers).split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean).slice(0, 6).join(", "),
    };
  }
  function pushHistoryEntry(entry) {
    setExecutionHistory((current) => {
      const next = [entry, ...current].slice(0, 40);
      persistHistoryEntries(next);
      return next;
    });
  }
  function replaceHistoryEntry(id, patch) {
    setExecutionHistory((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      persistHistoryEntries(next);
      return next;
    });
  }
  async function handleAction(action, payload = {}) {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    const historyId = `${action}:${Date.now()}`;
    pushHistoryEntry({
      id: historyId,
      action,
      label: action,
      status: "running",
      createdAt: new Date().toISOString(),
      preview: "Execucao iniciada",
      meta: buildActionMeta(payload),
      payload: {
        action,
        limit,
        processNumbers: payload.processNumbers || processNumbers,
      },
    });
    try {
      const response = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, limit, processNumbers, ...payload }) });
      setActionState({ loading: false, error: null, result: response.data });
      replaceHistoryEntry(historyId, {
        status: "success",
        preview: buildHistoryPreview(response.data),
        result: response.data,
      });
      await Promise.all([loadOverview(), loadQueue("sem_movimentacoes", setWithoutMovements, wmPage), loadQueue("monitoramento_ativo", setMonitoringActive, maPage), loadQueue("monitoramento_inativo", setMonitoringInactive, maPage), loadQueue("campos_orfaos", setFieldGaps, fgPage), loadOrphans()]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      replaceHistoryEntry(historyId, {
        status: "error",
        preview: error.message || "Falha ao executar acao.",
        error: error.message || "Falha ao executar acao.",
      });
    }
  }
  async function handleSaveRelation() {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "salvar_relacao", id: editingRelationId, ...form }) });
      setActionState({ loading: false, error: null, result: payload.data }); setForm(EMPTY_FORM); setEditingRelationId(null); await loadRelations(relations.page, search);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao salvar relacao.", result: null }); }
  }
  async function handleDeleteRelation(id) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remover_relacao", id }) });
      setActionState({ loading: false, error: null, result: payload.data }); await loadRelations(relations.page, search);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao remover relacao.", result: null }); }
  }
  function startEditing(item) { setEditingRelationId(item.id); setForm({ numero_cnj_pai: item.numero_cnj_pai || "", numero_cnj_filho: item.numero_cnj_filho || "", tipo_relacao: item.tipo_relacao || "dependencia", status: item.status || "ativo", observacoes: item.observacoes || "" }); }
  function reuseHistoryEntry(entry) {
    if (entry?.payload?.processNumbers) setProcessNumbers(entry.payload.processNumbers);
    if (entry?.payload?.limit) setLimit(Number(entry.payload.limit) || 10);
    updateView("operacao");
  }
  function clearHistory() {
    setExecutionHistory([]);
    persistHistoryEntries([]);
  }

  const data = overview.data || {};
  const quickStats = useMemo(() => [{ label: "Processos totais", value: data.processosTotal || 0, helper: "Carteira persistida no HMADV." }, { label: "Com account", value: data.processosComAccount || 0, helper: "Sales Accounts ja vinculadas." }, { label: "Sem account", value: data.processosSemAccount || 0, helper: "Processos orfaos." }, { label: "Sem movimentacoes", value: data.processosSemMovimentacao || 0, helper: "Fila de reconsulta DataJud." }, { label: "Monitoramento ativo", value: data.monitoramentoAtivo || 0, helper: "Com fallback para processos com account." }, { label: "Campos orfaos", value: data.processosSemPolos || 0, helper: "Polos/status ainda pendentes." }, { label: "Fila monitoramento", value: data.monitoramentoFilaPendente || 0, helper: "Pendencias da rotina." }, { label: "Audiencias no banco", value: data.audienciasTotal || 0, helper: "Persistidas em judiciario.audiencias." }], [data]);
  const relationTypeSummary = useMemo(() => relations.items.reduce((acc, item) => { acc[item.tipo_relacao] = (acc[item.tipo_relacao] || 0) + 1; return acc; }, {}), [relations.items]);
  const selectedSummary = selectedWithoutMovements.length + selectedMonitoringActive.length + selectedMonitoringInactive.length + selectedFieldGaps.length + selectedOrphans.length;
  const latestHistory = executionHistory[0] || null;

  return <div className="space-y-8">
    <section className="rounded-[34px] border border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))] px-6 py-6 md:px-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C5A059]">Centro operacional</p>
          <h3 className="mt-3 font-serif text-4xl leading-tight">Sincronismo de processos, monitoramento e reparo CRM em uma unica trilha.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 opacity-65">A tela agora separa operacao, filas, relacoes e resultado em visoes distintas. Isso reduz ruido visual e preserva memoria do que foi executado nesta sessao de trabalho.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-[26px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm">
          <div className="flex items-center justify-between gap-4"><span className="opacity-60">Selecionados no momento</span><strong className="font-serif text-2xl">{selectedSummary}</strong></div>
          <div className="flex items-center justify-between gap-4"><span className="opacity-60">Ultima acao</span><span className="text-right text-xs uppercase tracking-[0.16em] text-[#C5A059]">{actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}</span></div>
          {latestHistory ? <p className="text-xs opacity-60">{latestHistory.label}: {latestHistory.preview}</p> : null}
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <ViewToggle value={view} onChange={updateView} />
        <SectionNav items={[{ href: "#operacao", label: "Operacao" }, { href: "#filas", label: "Filas" }, { href: "#relacoes", label: "Relacoes" }, { href: "#resultado", label: "Resultado" }]} />
      </div>
    </section>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{quickStats.map((card) => <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />)}</div>

    {view === "operacao" ? <div id="operacao" className="grid gap-6 xl:grid-cols-2">
      <Panel title="Fila operacional" eyebrow="Sincronismo Freshsales + Supabase">
        <div className="space-y-4">
          <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">CNJs para foco manual</span><textarea value={processNumbers} onChange={(e) => setProcessNumbers(e.target.value)} rows={4} placeholder="Opcional: cole CNJs manualmente, um por linha." className="w-full rounded-[22px] border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" /></label>
          <label className="block max-w-[160px]"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Lote</span><input type="number" min="1" max="20" value={limit} onChange={(e) => setLimit(Number(e.target.value || 10))} className="w-full rounded-2xl border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" /></label>
          <div className="grid gap-3 md:grid-cols-2">
            <ActionButton onClick={() => handleAction("run_sync_worker")} disabled={actionState.loading}>Rodar sync-worker</ActionButton>
            <ActionButton tone="primary" onClick={() => handleAction("push_orfaos", { limit })} disabled={actionState.loading}>Criar accounts no Freshsales</ActionButton>
            <ActionButton onClick={() => handleAction("push_orfaos", { processNumbers: getSelectedNumbers(orphans.items, selectedOrphans).join("\n"), limit })} disabled={actionState.loading}>Criar accounts selecionadas</ActionButton>
            <ActionButton onClick={() => handleAction("repair_freshsales_accounts", { processNumbers: getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n"), limit })} disabled={actionState.loading}>Corrigir campos no Freshsales</ActionButton>
            <ActionButton onClick={() => handleAction("backfill_audiencias", { processNumbers: getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n"), limit, apply: true })} disabled={actionState.loading}>Retroagir audiencias</ActionButton>
            <ActionButton onClick={() => handleAction("auditoria_sync")} disabled={actionState.loading} className="md:col-span-2">Rodar auditoria</ActionButton>
          </div>
        </div>
      </Panel>
      <Panel title="Reenriquecimento DataJud" eyebrow="Consulta e persistencia">
        <div className="space-y-4"><p className="text-sm opacity-70">A consulta do DataJud precisa persistir primeiro no Supabase; a correcao no Freshsales vem como segunda etapa.</p><div className="grid gap-3 md:grid-cols-2"><ActionButton tone="primary" onClick={() => handleAction("enriquecer_datajud", { processNumbers: getSelectedNumbers(withoutMovements.items, selectedWithoutMovements).join("\n"), limit })} disabled={actionState.loading}>Buscar movimentacoes no DataJud</ActionButton><ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n"), limit })} disabled={actionState.loading}>Sincronizar monitorados</ActionButton><ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n"), limit })} disabled={actionState.loading} className="md:col-span-2">Reenriquecer processos com gap</ActionButton></div></div>
      </Panel>
    </div> : null}

    {view === "filas" ? <div id="filas" className="grid gap-6 xl:grid-cols-2">
      <Panel title="Processos sem movimentacoes" eyebrow="Fila paginada"><QueueList title="Sem movimentacoes" helper="Itens sem andamento local para reconsulta no DataJud." rows={withoutMovements.items} selected={selectedWithoutMovements} onToggle={(key) => toggleSelection(setSelectedWithoutMovements, selectedWithoutMovements, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedWithoutMovements, selectedWithoutMovements, withoutMovements.items, nextState)} page={wmPage} setPage={setWmPage} loading={withoutMovements.loading} /></Panel>
      <Panel title="Monitoramento ativo" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Monitorados" helper="Se a base ainda nao marca monitoramento_ativo, o painel usa fallback pelos processos com account." rows={monitoringActive.items} selected={selectedMonitoringActive} onToggle={(key) => toggleSelection(setSelectedMonitoringActive, selectedMonitoringActive, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMonitoringActive, selectedMonitoringActive, monitoringActive.items, nextState)} page={maPage} setPage={setMaPage} loading={monitoringActive.loading} /><div className="flex flex-wrap gap-3"><ActionButton onClick={() => handleAction("monitoramento_status", { processNumbers: getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n"), active: false, limit })} disabled={actionState.loading}>Desativar monitoramento</ActionButton></div></div></Panel>
      <Panel title="Monitoramento inativo" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Nao monitorados" helper="Use esta fila para reativar o sync dos processos que ficaram fora da rotina." rows={monitoringInactive.items} selected={selectedMonitoringInactive} onToggle={(key) => toggleSelection(setSelectedMonitoringInactive, selectedMonitoringInactive, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMonitoringInactive, selectedMonitoringInactive, monitoringInactive.items, nextState)} page={maPage} setPage={setMaPage} loading={monitoringInactive.loading} /><div className="flex flex-wrap gap-3"><ActionButton tone="primary" onClick={() => handleAction("monitoramento_status", { processNumbers: getSelectedNumbers(monitoringInactive.items, selectedMonitoringInactive).join("\n"), active: true, limit })} disabled={actionState.loading}>Ativar monitoramento</ActionButton></div></div></Panel>
      <Panel title="GAP DataJud -> CRM" eyebrow="Campos orfaos"><QueueList title="Campos pendentes no Freshsales" helper="Processos vinculados cujo espelho ainda tem campos importantes em branco." rows={fieldGaps.items} selected={selectedFieldGaps} onToggle={(key) => toggleSelection(setSelectedFieldGaps, selectedFieldGaps, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedFieldGaps, selectedFieldGaps, fieldGaps.items, nextState)} page={fgPage} setPage={setFgPage} loading={fieldGaps.loading} /></Panel>
      <Panel title="Sem Sales Account" eyebrow="Processos orfaos"><QueueList title="Orfaos" helper="Itens do HMADV que ainda nao viraram Sales Account." rows={orphans.items} selected={selectedOrphans} onToggle={(key) => toggleSelection(setSelectedOrphans, selectedOrphans, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedOrphans, selectedOrphans, orphans.items, nextState)} page={1} setPage={() => {}} loading={orphans.loading} /></Panel>
    </div> : null}

    {view === "relacoes" ? <div id="relacoes" className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel title="Vincular processos relacionados" eyebrow="Arvore processual">
        <div className="space-y-4">{editingRelationId ? <div className="rounded-2xl border border-[#6E5630] bg-[rgba(76,57,26,0.22)] px-4 py-3 text-sm">Editando relacao existente. Salve novamente para atualizar o vinculo.</div> : null}<Field label="Processo principal / pai" value={form.numero_cnj_pai} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_pai: value }))} placeholder="CNJ do processo principal" /><Field label="Processo relacionado / filho" value={form.numero_cnj_filho} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_filho: value }))} placeholder="CNJ do apenso, incidente, recurso ou dependencia" /><div className="grid gap-4 md:grid-cols-2"><SelectField label="Tipo de relacao" value={form.tipo_relacao} onChange={(value) => setForm((current) => ({ ...current, tipo_relacao: value }))} options={[{ value: "dependencia", label: "Dependencia" }, { value: "apenso", label: "Apenso" }, { value: "incidente", label: "Incidente" }, { value: "recurso", label: "Recurso" }]} /><SelectField label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} /></div><label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Observacoes</span><textarea value={form.observacoes} onChange={(e) => setForm((current) => ({ ...current, observacoes: e.target.value }))} rows={4} className="w-full rounded-[22px] border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" placeholder="Ex.: recurso distribuido por dependencia do principal." /></label><div className="flex flex-wrap gap-3"><ActionButton tone="primary" onClick={handleSaveRelation} disabled={actionState.loading}>{editingRelationId ? "Atualizar relacao" : "Salvar relacao"}</ActionButton><ActionButton onClick={() => { setForm(EMPTY_FORM); setEditingRelationId(null); }} disabled={actionState.loading}>{editingRelationId ? "Cancelar edicao" : "Limpar formulario"}</ActionButton></div></div>
      </Panel>
      <Panel title="Busca rapida de processos" eyebrow="Apoio operacional">
        <div className="space-y-4"><Field label="Buscar por CNJ ou titulo" value={lookupTerm} onChange={setLookupTerm} placeholder="Digite o CNJ ou parte do titulo" />{lookup.loading ? <p className="text-sm opacity-60">Buscando processos...</p> : null}{!lookup.loading && !lookup.items.length && lookupTerm.trim() ? <p className="text-sm opacity-60">Nenhum processo encontrado para esse termo.</p> : null}<div className="space-y-3">{lookup.items.map((item) => <div key={item.id || item.numero_cnj} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm"><p className="font-semibold">{item.numero_cnj || "Sem CNJ"}</p><p className="mt-1 opacity-70">{item.titulo || "Sem titulo"}</p><div className="mt-2 flex flex-wrap gap-3 text-xs opacity-60"><span>Status: {item.status || "sem_status"}</span>{item.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${item.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {item.account_id_freshsales}</a> : null}</div><div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_pai: item.numero_cnj || current.numero_cnj_pai }))} className="px-3 py-2 text-xs">Usar como pai</ActionButton><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_filho: item.numero_cnj || current.numero_cnj_filho }))} className="px-3 py-2 text-xs">Usar como filho</ActionButton></div></div>)}</div></div>
      </Panel>
    </div> : null}

    {view === "relacoes" ? <Panel title="Relacoes processuais cadastradas" eyebrow="Reflexo no portal">
      <div className="mb-4 flex flex-wrap items-center gap-3"><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por CNJ relacionado" className="min-w-[280px] rounded-2xl border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm outline-none focus:border-[#C5A059]" /><ActionButton onClick={() => loadRelations(1, search)} className="px-4 py-2">Atualizar</ActionButton><ActionButton onClick={() => loadRelations(Math.max(1, relations.page - 1), search)} disabled={relations.loading || relations.page <= 1} className="px-4 py-2">Anterior</ActionButton><ActionButton onClick={() => loadRelations(relations.page + 1, search)} disabled={relations.loading || !relations.items.length} className="px-4 py-2">Proxima</ActionButton></div>
      {relations.items.length ? <div className="mb-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] opacity-70">{Object.entries(relationTypeSummary).map(([key, value]) => <span key={key} className="border border-[#2D2E2E] px-2 py-1">{key}: {value}</span>)}</div> : null}
      {relations.loading ? <p className="text-sm opacity-60">Carregando relacoes...</p> : null}
      {relations.error ? <p className="text-sm text-red-300">{relations.error}</p> : null}
      {!relations.loading && !relations.items.length ? <p className="text-sm opacity-60">Nenhuma relacao cadastrada ainda.</p> : null}
      <div className="space-y-4">{relations.items.map((item) => <div key={item.id} className="rounded-[28px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.15em]"><span className="border border-[#2D2E2E] px-2 py-1">{item.tipo_relacao}</span><span className="border border-[#2D2E2E] px-2 py-1">{item.status}</span></div><div className="flex gap-2"><ActionButton onClick={() => startEditing(item)} disabled={actionState.loading} className="px-3 py-2 text-xs">Editar</ActionButton><ActionButton tone="danger" onClick={() => handleDeleteRelation(item.id)} disabled={actionState.loading} className="px-3 py-2 text-xs">Remover</ActionButton></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><RelationProcessCard title="Processo principal" process={item.processo_pai} fallbackNumber={item.numero_cnj_pai} /><RelationProcessCard title="Processo relacionado" process={item.processo_filho} fallbackNumber={item.numero_cnj_filho} /></div>{item.observacoes ? <p className="mt-3 text-sm opacity-65">{item.observacoes}</p> : null}</div>)}</div>
    </Panel> : null}

    {view === "resultado" ? <div id="resultado" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Resultado da ultima acao" eyebrow="Retorno operacional">{actionState.loading ? <p className="text-sm opacity-65">Executando acao...</p> : null}{actionState.error ? <p className="rounded-2xl border border-[#4B2222] bg-[rgba(127,29,29,0.18)] p-4 text-sm text-red-200">{actionState.error}</p> : null}{!actionState.loading && !actionState.error && actionState.result ? <OperationResult result={actionState.result} /> : null}{!actionState.loading && !actionState.error && !actionState.result ? <p className="text-sm opacity-65">Nenhuma acao executada ainda nesta sessao.</p> : null}</Panel>
      <Panel title="Historico de execucao" eyebrow="Memoria local da operacao">
        <div className="mb-4 flex flex-wrap gap-3">
          <ActionButton onClick={() => updateView("operacao")} className="px-4 py-2">Voltar para operacao</ActionButton>
          <ActionButton onClick={clearHistory} className="px-4 py-2">Limpar historico</ActionButton>
        </div>
        {!executionHistory.length ? <p className="text-sm opacity-65">Nenhuma solicitacao registrada ainda neste navegador.</p> : <div className="space-y-3">{executionHistory.map((entry) => <HistoryCard key={entry.id} entry={entry} onReuse={reuseHistoryEntry} />)}</div>}
      </Panel>
    </div> : null}
  </div>;
}
