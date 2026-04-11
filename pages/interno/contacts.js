import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch as adminFetchRaw } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory, updateActivityLog } from "../../lib/admin/activity-log";

const CONTACT_TYPE_OPTIONS = [
  "Cliente",
  "Parte Adversa",
  "Advogado Adverso",
  "Correspondente",
  "Terceiro Interessado",
  "Prestador de Servico",
  "Fornecedor",
  "Perito",
  "Juiz",
  "Promotor",
  "Desembargador",
  "Testemunha",
];

const CONTACT_ACTION_LABELS = {
  sync_contacts: "Sincronizar contacts do Freshsales",
  validate_contacts: "Validar e higienizar contatos",
  bulk_create_contacts: "Criar contatos em lote",
  delete_contacts_bulk: "Excluir contatos em lote",
  enrich_cep: "Enriquecer contato via CEP",
  enrich_directdata: "Enriquecer contato via DirectData",
  create_name_only: "Criar contato simplificado",
  create_contact: "Criar contato completo",
  update_contact: "Atualizar contato",
  delete_contact: "Excluir contato",
  merge_contacts: "Mesclar contatos duplicados",
  reconcile_partes: "Reconciliar partes com contacts",
  vincular_partes: "Vincular partes ao contato",
  desvincular_partes: "Desvincular partes",
  reclassificar_partes: "Reclassificar partes",
};

function parseBulkLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyLogPayload(payload, limit = 8000) {
  if (payload === undefined) return "";
  let text = "";
  try {
    text = JSON.stringify(payload, null, 2);
  } catch {
    text = String(payload);
  }
  if (text.length > limit) {
    return `${text.slice(0, limit)}...`;
  }
  return text;
}

function extractActionFromRequest(path, init) {
  let action = "";
  if (typeof window !== "undefined" && typeof path === "string") {
    try {
      const url = new URL(path, window.location.origin);
      action = url.searchParams.get("action") || "";
    } catch {}
  }
  if (!action && init?.body) {
    try {
      const parsed = JSON.parse(init.body);
      action = parsed?.action || "";
    } catch {}
  }
  return action;
}

function buildActionPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (typeof result.message === "string" && result.message.trim()) return result.message;
  if (typeof result.partesAtualizadas === "number") return `Partes atualizadas: ${result.partesAtualizadas}`;
  if (typeof result.contatosVinculados === "number") return `Contatos vinculados: ${result.contatosVinculados}`;
  if (typeof result.contatosCriados === "number") return `Contatos criados: ${result.contatosCriados}`;
  if (typeof result.processosLidos === "number") return `Processos lidos: ${result.processosLidos}`;
  if (typeof result.totalRows === "number") return `Total: ${result.totalRows}`;
  if (Array.isArray(result.sample)) return `Amostra: ${result.sample.length}`;
  return "Acao concluida";
}

function MetricCard({ label, value, helper }) {
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</p><p className="mb-2 font-serif text-3xl">{value}</p>{helper ? <p className="text-sm leading-relaxed opacity-65">{helper}</p> : null}</div>;
}

function Panel({ title, eyebrow, children }) {
  return <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">{eyebrow ? <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "#C5A059" }}>{eyebrow}</p> : null}<h3 className="mb-4 font-serif text-2xl">{title}</h3>{children}</section>;
}

function ActionButton({ children, tone = "subtle", ...props }) {
  const tones = {
    subtle: "border border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]",
    primary: "bg-[#C5A059] text-[#050706]",
    danger: "border border-[#4B2222] text-red-200 hover:border-[#C96A6A]",
  };
  return <button type="button" {...props} className={`px-4 py-3 text-sm disabled:opacity-50 ${tones[tone]}`}>{children}</button>;
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

function buildEditableForm(contact) {
  return {
    name: contact?.name || "",
    type: contact?.type || "Cliente",
    email: contact?.email || "",
    phone: contact?.phone || "",
    cpf: contact?.cpf || "",
    cnpj: contact?.cnpj || "",
    cep: contact?.cep || "",
    externalId: contact?.external_id || "",
  };
}

function renderResultSummary(result) {
  if (!result) return null;
  if (Array.isArray(result.sample) && result.sample.length) {
    return <div className="space-y-3">
      {result.sample.slice(0, 12).map((item, index) => {
        const partes = Array.isArray(item.partes) ? item.partes : [];
        return <div key={item.processo_id || item.parte_id || index} className="border border-[#2D2E2E] p-3">
          <div className="flex flex-wrap items-center gap-2">
            {item.numero_cnj ? <p className="font-semibold">{item.numero_cnj}</p> : null}
            {item.nome ? <p className="font-semibold">{item.nome}</p> : null}
            {item.tipo_contato ? <StatusBadge tone="accent">{item.tipo_contato}</StatusBadge> : null}
            {item.contato_freshsales_id ? <StatusBadge tone="success">contato vinculado</StatusBadge> : null}
          </div>
          {item.account_id_freshsales ? <p className="mt-1 text-xs opacity-60">Account {item.account_id_freshsales}</p> : null}
          {partes.length ? <div className="mt-3 flex flex-col gap-2">
            {partes.map((parte) => <div key={parte.parte_id} className="rounded border border-[#2D2E2E] p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{parte.nome}</span>
                {parte.tipo_contato ? <StatusBadge tone="accent">{parte.tipo_contato}</StatusBadge> : null}
                {parte.modo === "matched_existing" ? <StatusBadge tone="success">match automatico</StatusBadge> : null}
                {parte.modo === "created" ? <StatusBadge tone="success">contato criado</StatusBadge> : null}
                {parte.modo === "already_linked" ? <StatusBadge tone="neutral">ja vinculada</StatusBadge> : null}
                {parte.modo === "ambiguous_match" ? <StatusBadge tone="warn">match ambiguo</StatusBadge> : null}
                {parte.modo === "create_needed" ? <StatusBadge tone="warn">precisa criar contato</StatusBadge> : null}
              </div>
            </div>)}
          </div> : null}
        </div>;
      })}
    </div>;
  }
  return null;
}

export default function InternoContactsPage() {
  return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestao de Contacts" description="Sincronizacao, detalhe, reconciliacao com partes, duplicados, CRUD e enriquecimento de contatos do Freshsales."><ContactsContent /></InternoLayout>}</RequireAdmin>;
}

function ContactsContent() {
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [listState, setListState] = useState({ loading: true, error: null, items: [], totalRows: 0 });
  const [detailState, setDetailState] = useState({ loading: false, error: null, data: null });
  const [duplicatesState, setDuplicatesState] = useState({ loading: true, error: null, items: [], totalRows: 0 });
  const [partesPendentes, setPartesPendentes] = useState({ loading: true, error: null, items: [], totalRows: 0 });
  const [partesVinculadas, setPartesVinculadas] = useState({ loading: true, error: null, items: [], totalRows: 0 });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [duplicatesPage, setDuplicatesPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [linkedPage, setLinkedPage] = useState(1);
  const [query, setQuery] = useState("");
  const [partesQuery, setPartesQuery] = useState("");
  const [linkedQuery, setLinkedQuery] = useState("");
  const [linkedType, setLinkedType] = useState("");
  const [type, setType] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactPageSize, setContactPageSize] = useState(20);
  const [syncLimit, setSyncLimit] = useState(100);
  const [reconcileLimit, setReconcileLimit] = useState(20);
  const [selectedPartes, setSelectedPartes] = useState([]);
  const [selectedLinkedPartes, setSelectedLinkedPartes] = useState([]);
  const [createForm, setCreateForm] = useState({ name: "", type: "Cliente", email: "", phone: "", cpf: "", cnpj: "", cep: "", externalId: "" });
  const [bulkCreateText, setBulkCreateText] = useState("");
  const [bulkCreateIntervalMs, setBulkCreateIntervalMs] = useState(1200);
  const [editForm, setEditForm] = useState(buildEditableForm(null));
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [cep, setCep] = useState("");
  const [personType, setPersonType] = useState("pf");
  const [linkType, setLinkType] = useState("Cliente");
  const selected = detailState.data;

  async function adminFetch(path, init = {}, meta = {}) {
    const startedAt = Date.now();
    const method = String(init?.method || "GET").toUpperCase();
    const action = meta.action || extractActionFromRequest(path, init);
    let requestPayload = "";
    if (init?.body) {
      try {
        requestPayload = stringifyLogPayload(JSON.parse(init.body));
      } catch {
        requestPayload = stringifyLogPayload(init.body);
      }
    }
    const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    appendActivityLog({
      id: entryId,
      module: "contacts",
      component: meta.component || "contacts",
      label: meta.label || CONTACT_ACTION_LABELS[action] || action || "Chamada administrativa",
      action,
      method,
      path,
      expectation: meta.expectation || (action ? `Executar ${action}` : "Consultar backend de contatos"),
      request: requestPayload,
      status: "running",
      startedAt,
      durationMs: null,
      response: "",
      error: "",
    });
    try {
      const payload = await adminFetchRaw(path, init, meta);
      updateActivityLog(entryId, {
        status: "success",
        durationMs: Date.now() - startedAt,
        response: stringifyLogPayload(payload),
      });
      return payload;
    } catch (error) {
      updateActivityLog(entryId, {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: stringifyLogPayload(error?.payload || error?.message || error),
      });
      throw error;
    }
  }

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { loadList(page, query, type, contactPageSize); }, [contactPageSize, page, query, type]);
  useEffect(() => { loadDuplicates(duplicatesPage); }, [duplicatesPage]);
  useEffect(() => { loadPartesPendentes(partesPage, partesQuery); }, [partesPage, partesQuery]);
  useEffect(() => { loadPartesVinculadas(linkedPage, linkedQuery, linkedType); }, [linkedPage, linkedQuery, linkedType]);
  useEffect(() => {
    if (!selectedContactId) {
      setDetailState({ loading: false, error: null, data: null });
      setEditForm(buildEditableForm(null));
      return;
    }
    loadDetail(selectedContactId);
  }, [selectedContactId]);
  useEffect(() => {
    setModuleHistory("contacts", {
      overview: overview.data || null,
      list: {
        loading: listState.loading,
        error: listState.error,
        totalRows: Number(listState.totalRows || 0),
        query,
        type,
        page,
        pageSize: contactPageSize,
        selected: selectedContactIds.length,
        missingEmailOnPage: Number(listState.items.filter((item) => !item.email).length || 0),
        missingPhoneOnPage: Number(listState.items.filter((item) => !item.phone).length || 0),
        missingDocumentOnPage: Number(listState.items.filter((item) => !item.cpf && !item.cnpj).length || 0),
      },
      duplicates: {
        loading: duplicatesState.loading,
        error: duplicatesState.error,
        totalRows: Number(duplicatesState.totalRows || 0),
        page: duplicatesPage,
      },
      partesPendentes: {
        loading: partesPendentes.loading,
        error: partesPendentes.error,
        totalRows: Number(partesPendentes.totalRows || 0),
        page: partesPage,
        query: partesQuery,
        selected: selectedPartes.length,
      },
      partesVinculadas: {
        loading: partesVinculadas.loading,
        error: partesVinculadas.error,
        totalRows: Number(partesVinculadas.totalRows || 0),
        page: linkedPage,
        query: linkedQuery,
        type: linkedType,
        selected: selectedLinkedPartes.length,
      },
      selectedContact: selected?.contact
        ? {
            id: selected.contact.freshsales_contact_id,
            name: selected.contact.name,
            type: selected.contact.type,
            email: selected.contact.email || null,
            phone: selected.contact.phone || null,
          }
        : null,
      actionState: {
        loading: actionState.loading,
        error: actionState.error,
        preview: buildActionPreview(actionState.result),
      },
      settings: {
        syncLimit: Number(syncLimit || 0),
        bulkCreateIntervalMs: Number(bulkCreateIntervalMs || 0),
        reconcileLimit: Number(reconcileLimit || 0),
        personType,
        linkType,
      },
      executionHistory,
    });
  }, [
    actionState.error,
    actionState.loading,
    actionState.result,
    detailState.data,
    duplicatesPage,
    duplicatesState.error,
    duplicatesState.loading,
    duplicatesState.totalRows,
    executionHistory,
    linkedPage,
    linkedQuery,
    linkedType,
    listState.error,
    listState.items,
    listState.loading,
    listState.totalRows,
    overview.data,
    page,
    contactPageSize,
    partesPage,
    partesPendentes.error,
    partesPendentes.loading,
    partesPendentes.totalRows,
    partesQuery,
    partesVinculadas.error,
    partesVinculadas.loading,
    partesVinculadas.totalRows,
    personType,
    query,
    reconcileLimit,
    selected,
    selectedContactIds.length,
    selectedLinkedPartes.length,
    selectedPartes.length,
    syncLimit,
    bulkCreateIntervalMs,
    type,
  ]);

  async function loadOverview() {
    setOverview({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-contacts?action=overview", {}, {
        component: "contacts-overview",
        label: "Carregar overview de contacts",
      });
      setOverview({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setOverview({ loading: false, error: error.message || "Falha ao carregar overview.", data: null });
    }
  }

  async function loadList(nextPage, nextQuery, nextType, nextPageSize = contactPageSize) {
    setListState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-contacts?action=list&page=${nextPage}&pageSize=${encodeURIComponent(nextPageSize || 20)}&query=${encodeURIComponent(nextQuery || "")}&type=${encodeURIComponent(nextType || "")}`, {}, {
        component: "contacts-list",
        label: "Listar contacts paginados",
      });
      setListState({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0 });
      if (!selectedContactId && payload.data.items?.[0]?.freshsales_contact_id) setSelectedContactId(payload.data.items[0].freshsales_contact_id);
    } catch (error) {
      setListState({ loading: false, error: error.message || "Falha ao carregar contatos.", items: [], totalRows: 0 });
    }
  }

  async function loadDuplicates(nextPage) {
    setDuplicatesState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-contacts?action=duplicates&page=${nextPage}&pageSize=10`, {}, {
        component: "contacts-duplicates",
        label: "Listar duplicados de contacts",
      });
      setDuplicatesState({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0 });
    } catch (error) {
      setDuplicatesState({ loading: false, error: error.message || "Falha ao carregar duplicados.", items: [], totalRows: 0 });
    }
  }

  async function loadPartesPendentes(nextPage, nextQuery) {
    setPartesPendentes((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-contacts?action=partes_pendentes&page=${nextPage}&pageSize=20&query=${encodeURIComponent(nextQuery || "")}`, {}, {
        component: "contacts-partes-pendentes",
        label: "Listar partes pendentes de vinculacao",
      });
      setPartesPendentes({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0 });
    } catch (error) {
      setPartesPendentes({ loading: false, error: error.message || "Falha ao carregar partes pendentes.", items: [], totalRows: 0 });
    }
  }

  async function loadPartesVinculadas(nextPage, nextQuery, nextType) {
    setPartesVinculadas((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-contacts?action=partes_vinculadas&page=${nextPage}&pageSize=20&query=${encodeURIComponent(nextQuery || "")}&type=${encodeURIComponent(nextType || "")}`, {}, {
        component: "contacts-partes-vinculadas",
        label: "Listar partes ja vinculadas",
      });
      setPartesVinculadas({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0 });
    } catch (error) {
      setPartesVinculadas({ loading: false, error: error.message || "Falha ao carregar partes vinculadas.", items: [], totalRows: 0 });
    }
  }

  async function loadDetail(contactId) {
    setDetailState({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-contacts?action=detail&contactId=${encodeURIComponent(contactId)}`, {}, {
        component: "contacts-detail",
        label: "Carregar detalhe do contato",
      });
      setDetailState({ loading: false, error: null, data: payload.data });
      setEditForm(buildEditableForm(payload.data?.contact));
      setCep(payload.data?.contact?.cep || "");
    } catch (error) {
      setDetailState({ loading: false, error: error.message || "Falha ao carregar detalhe.", data: null });
    }
  }

  async function runAction(action, payload = {}) {
    setActionState({ loading: true, error: null, result: null });
    const historyEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      startedAt: new Date().toISOString(),
      action,
      label: CONTACT_ACTION_LABELS[action] || action,
      payload,
      status: "running",
      preview: "",
    };
    setExecutionHistory((current) => [historyEntry, ...current].slice(0, 20));
    try {
      const response = await adminFetch("/api/admin-hmadv-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      }, {
        component: "contacts-actions",
        action,
        label: CONTACT_ACTION_LABELS[action] || action,
        expectation: `Executar ${CONTACT_ACTION_LABELS[action] || action} e refletir o retorno no console`,
      });
      setActionState({ loading: false, error: null, result: response.data });
      setExecutionHistory((current) => current.map((entry) => entry.id === historyEntry.id ? {
        ...entry,
        status: "success",
        finishedAt: new Date().toISOString(),
        preview: buildActionPreview(response.data),
        result: response.data,
      } : entry));
      await Promise.all([
        loadOverview(),
        loadList(page, query, type, contactPageSize),
        loadDuplicates(duplicatesPage),
        loadPartesPendentes(partesPage, partesQuery),
        loadPartesVinculadas(linkedPage, linkedQuery, linkedType),
        selectedContactId ? loadDetail(selectedContactId) : Promise.resolve(),
      ]);
      return response.data;
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      setExecutionHistory((current) => current.map((entry) => entry.id === historyEntry.id ? {
        ...entry,
        status: "error",
        finishedAt: new Date().toISOString(),
        preview: error.message || "Falha ao executar acao.",
        error: error?.payload || error?.message || error,
      } : entry));
      throw error;
    }
  }

  function toggleParteSelection(id) {
    setSelectedPartes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function toggleLinkedParteSelection(id) {
    setSelectedLinkedPartes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function togglePendingPageSelection(nextChecked) {
    const pageIds = partesPendentes.items.map((item) => item.id).filter(Boolean);
    setSelectedPartes((current) => {
      if (nextChecked) return Array.from(new Set([...current, ...pageIds]));
      return current.filter((id) => !pageIds.includes(id));
    });
  }
  function toggleLinkedPageSelection(nextChecked) {
    const pageIds = partesVinculadas.items.map((item) => item.id).filter(Boolean);
    setSelectedLinkedPartes((current) => {
      if (nextChecked) return Array.from(new Set([...current, ...pageIds]));
      return current.filter((id) => !pageIds.includes(id));
    });
  }

  function toggleContactSelection(contactId) {
    setSelectedContactIds((current) => current.includes(contactId) ? current.filter((item) => item !== contactId) : [...current, contactId]);
  }

  function toggleContactsPageSelection(nextChecked) {
    const pageIds = listState.items.map((item) => item.freshsales_contact_id).filter(Boolean);
    setSelectedContactIds((current) => {
      if (nextChecked) return Array.from(new Set([...current, ...pageIds]));
      return current.filter((id) => !pageIds.includes(id));
    });
  }

  async function selectAllFilteredContacts() {
    const payload = await adminFetch(`/api/admin-hmadv-contacts?action=contact_ids&query=${encodeURIComponent(query || "")}&type=${encodeURIComponent(type || "")}`, {}, {
      component: "contacts-selection",
      label: "Selecionar todos os contatos filtrados",
    });
    const ids = Array.isArray(payload?.data?.ids) ? payload.data.ids : [];
    setSelectedContactIds(ids);
  }

  const overviewData = overview.data || {};
  const typeOptions = useMemo(() => Object.entries(overviewData.tipos || {}).sort((a, b) => b[1] - a[1]), [overviewData.tipos]);
  const selectedParteNumbers = useMemo(() => {
    const procMap = new Map();
    for (const item of partesPendentes.items) {
      if (selectedPartes.includes(item.id) && item.processo?.numero_cnj) procMap.set(item.processo.numero_cnj, item.processo.numero_cnj);
    }
    return Array.from(procMap.values());
  }, [partesPendentes.items, selectedPartes]);
  const pendingPageSelectedCount = useMemo(() => partesPendentes.items.filter((item) => selectedPartes.includes(item.id)).length, [partesPendentes.items, selectedPartes]);
  const linkedPageSelectedCount = useMemo(() => partesVinculadas.items.filter((item) => selectedLinkedPartes.includes(item.id)).length, [partesVinculadas.items, selectedLinkedPartes]);
  const allPendingPageSelected = Boolean(partesPendentes.items.length) && pendingPageSelectedCount === partesPendentes.items.length;
  const allLinkedPageSelected = Boolean(partesVinculadas.items.length) && linkedPageSelectedCount === partesVinculadas.items.length;
  const contactPageSelectedCount = useMemo(() => listState.items.filter((item) => selectedContactIds.includes(item.freshsales_contact_id)).length, [listState.items, selectedContactIds]);
  const allContactPageSelected = Boolean(listState.items.length) && contactPageSelectedCount === listState.items.length;
  const bulkCreateNames = useMemo(() => parseBulkLines(bulkCreateText), [bulkCreateText]);
  const missingEmailOnPage = useMemo(() => listState.items.filter((item) => !item.email).length, [listState.items]);
  const missingPhoneOnPage = useMemo(() => listState.items.filter((item) => !item.phone).length, [listState.items]);
  const missingDocumentOnPage = useMemo(() => listState.items.filter((item) => !item.cpf && !item.cnpj).length, [listState.items]);

  return <div className="space-y-8">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Contacts espelhados" value={overviewData.total || 0} helper="Contatos persistidos em public.freshsales_contacts." />
      <MetricCard label="Com e-mail" value={overviewData.comEmail || 0} helper="Aptos para match forte por identificador." />
      <MetricCard label="Com CPF" value={overviewData.comCpf || 0} helper="Prontos para DirectData PF." />
      <MetricCard label="Duplicados" value={overviewData.duplicados || 0} helper="Grupos detectados por nome normalizado." />
      <MetricCard label="Partes sem contato" value={overviewData.partesSemContato || 0} helper="Pendencias de vinculacao no HMADV." />
    </div>

    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel title="Sync e lista paginada" eyebrow="Freshsales -> espelho local">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px_120px_auto_auto]">
            <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Buscar por nome, e-mail ou telefone" className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <select value={type} onChange={(event) => { setPage(1); setType(event.target.value); }} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
              <option value="">Todos os tipos</option>
              {typeOptions.map(([label, total]) => <option key={label} value={label}>{label} ({total})</option>)}
            </select>
            <select value={contactPageSize} onChange={(event) => { setPage(1); setContactPageSize(Number(event.target.value || 20)); }} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
              <option value={20}>20 / pagina</option>
              <option value={50}>50 / pagina</option>
              <option value={100}>100 / pagina</option>
            </select>
            <ActionButton onClick={() => runAction("sync_contacts", { limit: syncLimit, dryRun: true, fetchAll: false })} disabled={actionState.loading}>Simular sync</ActionButton>
            <ActionButton tone="primary" onClick={() => runAction("sync_contacts", { limit: syncLimit, dryRun: false, fetchAll: true })} disabled={actionState.loading}>Importar todos</ActionButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-[0.15em] opacity-50">Lote sync</span>
            <input type="number" min="1" max="5000" value={syncLimit} onChange={(event) => setSyncLimit(Number(event.target.value || 100))} className="w-28 border border-[#2D2E2E] bg-[#050706] p-2 text-sm outline-none focus:border-[#C5A059]" />
            <ActionButton onClick={() => toggleContactsPageSelection(!allContactPageSelected)} disabled={!listState.items.length}>
              {allContactPageSelected ? "Desmarcar pagina" : "Selecionar pagina"}
            </ActionButton>
            <ActionButton onClick={() => selectAllFilteredContacts()} disabled={listState.loading}>Selecionar filtrados</ActionButton>
            <ActionButton onClick={() => setSelectedContactIds([])} disabled={!selectedContactIds.length}>Limpar selecao</ActionButton>
            <ActionButton onClick={() => runAction("validate_contacts", { contactIds: selectedContactIds, query, type, limit: selectedContactIds.length || contactPageSize, apply: false })} disabled={actionState.loading || (!selectedContactIds.length && !listState.items.length)}>Validar selecao</ActionButton>
            <ActionButton tone="primary" onClick={() => runAction("validate_contacts", { contactIds: selectedContactIds, query, type, limit: selectedContactIds.length || contactPageSize, apply: true })} disabled={actionState.loading || (!selectedContactIds.length && !listState.items.length)}>Aplicar higienizacao</ActionButton>
            <ActionButton tone="danger" onClick={() => runAction("delete_contacts_bulk", { contactIds: selectedContactIds })} disabled={actionState.loading || !selectedContactIds.length}>Excluir selecionados</ActionButton>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
            <span>Selecionados: {selectedContactIds.length}</span>
            <span>Nesta pagina: {contactPageSelectedCount}/{listState.items.length || 0}</span>
            <span>Total estimado: {listState.totalRows || 0}</span>
          </div>
          {listState.loading ? <p className="text-sm opacity-60">Carregando contatos...</p> : null}
          {listState.error ? <p className="text-sm text-red-300">{listState.error}</p> : null}
          <div className="space-y-3">
            {listState.items.map((item) => {
              const active = selectedContactId === item.freshsales_contact_id;
              return <div key={item.freshsales_contact_id} className={`border p-4 ${active ? "border-[#C5A059]" : "border-[#2D2E2E]"}`}>
                <div className="flex gap-3">
                  <input type="checkbox" checked={selectedContactIds.includes(item.freshsales_contact_id)} onChange={() => toggleContactSelection(item.freshsales_contact_id)} className="mt-1" />
                  <button type="button" onClick={() => setSelectedContactId(item.freshsales_contact_id)} className="min-w-0 flex-1 text-left">
                    <div className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{item.name}</p>
                        <StatusBadge tone="accent">{item.type}</StatusBadge>
                        {item.cpf || item.cnpj ? <StatusBadge tone="success">documentado</StatusBadge> : <StatusBadge tone="warn">sem documento</StatusBadge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65">
                        {item.email ? <span>E-mail: {item.email}</span> : <span>Sem e-mail</span>}
                        {item.phone ? <span>Telefone: {item.phone}</span> : <span>Sem telefone</span>}
                        {item.cpf ? <span>CPF: {item.cpf}</span> : null}
                        {item.cnpj ? <span>CNPJ: {item.cnpj}</span> : null}
                      </div>
                      {item.freshsales_url ? <a href={item.freshsales_url} target="_blank" rel="noreferrer" className="text-xs underline opacity-70 hover:text-[#C5A059]" onClick={(event) => event.stopPropagation()}>Abrir contato no Freshsales</a> : null}
                    </div>
                  </button>
                </div>
              </div>;
            })}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="opacity-60">Pagina {page} com {listState.items.length} registros carregados</p>
            <div className="flex gap-2">
              <ActionButton onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1 || listState.loading}>Anterior</ActionButton>
              <ActionButton onClick={() => setPage(page + 1)} disabled={listState.loading}>Proxima</ActionButton>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Detalhe, edicao e enriquecimento" eyebrow="Contato selecionado">
        {!selectedContactId ? <p className="text-sm opacity-60">Selecione um contato para carregar o detalhe.</p> : null}
        {detailState.loading ? <p className="text-sm opacity-60">Carregando detalhe...</p> : null}
        {detailState.error ? <p className="text-sm text-red-300">{detailState.error}</p> : null}
        {selected ? <div className="space-y-6 text-sm">
          <div className="space-y-2">
            <p className="font-semibold text-lg">{selected.contact.name}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 opacity-70">
              <span>Tipo: {selected.contact.type}</span>
              {selected.contact.email ? <span>E-mail: {selected.contact.email}</span> : null}
              {selected.contact.phone ? <span>Telefone: {selected.contact.phone}</span> : null}
              {selected.contact.cep ? <span>CEP: {selected.contact.cep}</span> : null}
            </div>
            {selected.contact.freshsales_url ? <a href={selected.contact.freshsales_url} target="_blank" rel="noreferrer" className="text-xs underline opacity-80 hover:text-[#C5A059]">Abrir contato no Freshsales</a> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Processos" value={selected.metrics.processos || 0} />
            <MetricCard label="Publicacoes" value={selected.metrics.publicacoes || 0} />
            <MetricCard label="Audiencias" value={selected.metrics.audiencias || 0} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <select value={editForm.type} onChange={(event) => setEditForm((current) => ({ ...current, type: event.target.value }))} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
              {CONTACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} placeholder="E-mail" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefone" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <input value={editForm.cpf} onChange={(event) => setEditForm((current) => ({ ...current, cpf: event.target.value }))} placeholder="CPF" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <input value={editForm.cnpj} onChange={(event) => setEditForm((current) => ({ ...current, cnpj: event.target.value }))} placeholder="CNPJ" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <input value={editForm.cep} onChange={(event) => { setEditForm((current) => ({ ...current, cep: event.target.value })); setCep(event.target.value); }} placeholder="CEP" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <input value={editForm.externalId} onChange={(event) => setEditForm((current) => ({ ...current, externalId: event.target.value }))} placeholder="External ID" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionButton tone="primary" onClick={() => runAction("update_contact", { contactId: selected.contact.freshsales_contact_id, ...editForm })} disabled={actionState.loading}>Salvar alteracoes</ActionButton>
            <ActionButton tone="danger" onClick={() => runAction("delete_contact", { contactId: selected.contact.freshsales_contact_id })} disabled={actionState.loading}>Excluir contato</ActionButton>
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_180px_auto_auto]">
            <input value={cep} onChange={(event) => setCep(event.target.value)} placeholder="CEP para ViaCEP" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <select value={personType} onChange={(event) => setPersonType(event.target.value)} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
              <option value="pf">Pessoa fisica</option>
              <option value="pj">Pessoa juridica</option>
            </select>
            <ActionButton onClick={() => runAction("enrich_cep", { contactId: selected.contact.freshsales_contact_id, cep: cep || selected.contact.cep })} disabled={actionState.loading}>Enriquecer via CEP</ActionButton>
            <ActionButton tone="primary" onClick={() => runAction("enrich_directdata", { contactId: selected.contact.freshsales_contact_id, personType })} disabled={actionState.loading}>Enriquecer DirectData</ActionButton>
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.15em] opacity-50">Processos vinculados no HMADV</p>
            {!selected.processos?.length ? <p className="opacity-60">Nenhum processo vinculado por contato_freshsales_id ainda.</p> : null}
            {selected.processos?.map((processo) => <div key={processo.id} className="border border-[#2D2E2E] p-3"><p className="font-semibold">{processo.numero_cnj || processo.id}</p>{processo.titulo ? <p className="opacity-70">{processo.titulo}</p> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">{processo.status_atual_processo ? <span>Status: {processo.status_atual_processo}</span> : null}{processo.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${processo.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {processo.account_id_freshsales}</a> : null}</div></div>)}
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.15em] opacity-50">Publicacoes relacionadas</p>
            {!selected.publicacoes?.length ? <p className="opacity-60">Nenhuma publicacao recente encontrada para os processos deste contato.</p> : null}
            {selected.publicacoes?.map((publicacao) => <div key={publicacao.id} className="border border-[#2D2E2E] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {publicacao.processo?.numero_cnj ? <p className="font-semibold">{publicacao.processo.numero_cnj}</p> : null}
                {publicacao.data_publicacao ? <StatusBadge tone="neutral">{new Date(publicacao.data_publicacao).toLocaleDateString("pt-BR")}</StatusBadge> : null}
              </div>
              {publicacao.processo?.titulo ? <p className="mt-1 text-xs opacity-60">{publicacao.processo.titulo}</p> : null}
              {publicacao.resumo ? <p className="mt-2 opacity-75">{publicacao.resumo}</p> : null}
            </div>)}
          </div>
        </div> : null}
      </Panel>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Qualidade da base e persistencia" eyebrow="Freshsales + Supabase + portal">
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard label="Sem e-mail na pagina" value={missingEmailOnPage} helper="Ajuda a priorizar enriquecimento e match forte no CRM." />
          <MetricCard label="Sem telefone na pagina" value={missingPhoneOnPage} helper="Contato com baixo potencial de acionamento operacional." />
          <MetricCard label="Sem CPF/CNPJ na pagina" value={missingDocumentOnPage} helper="Base com baixa rastreabilidade para DirectData e deduplicacao." />
          <MetricCard label="Lotes marcados" value={`${selectedContactIds.length} / ${selectedPartes.length} / ${selectedLinkedPartes.length}`} helper="Contatos, partes pendentes e partes vinculadas prontas para bulk actions nesta sessao." />
        </div>
        <div className="mt-4 rounded-[20px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-sm">
          <p className="font-semibold">Persistencia no portal</p>
          <p className="mt-2 opacity-75">
            O portal ja persiste contatos e enderecos pelo endpoint <code>/api/client-profile</code>. Use o modulo de contacts para higienizar e reconciliar a base operacional, e o perfil do cliente em <a href="/portal/perfil" className="underline hover:text-[#C5A059]">/portal/perfil</a> para refletir os dados que precisam permanecer disponiveis na experiencia do cliente.
          </p>
        </div>
        <div className="mt-4 rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.16)] p-4 text-sm text-[#F8E7B5]">
          <p className="font-semibold">Trilha recomendada para lote grande</p>
          <p className="mt-2">1. Sincronizar contacts do Freshsales.</p>
          <p className="mt-1">2. Corrigir gaps de CEP e documento.</p>
          <p className="mt-1">3. Reconciliar partes pendentes em lote controlado.</p>
          <p className="mt-1">4. Validar persistencia no portal para os contatos que precisam aparecer ao cliente.</p>
        </div>
      </Panel>

      <Panel title="Criar novo contato" eyebrow="CRUD + lote">
        <div className="grid gap-3 md:grid-cols-2">
          <input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome completo" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <select value={createForm.type} onChange={(event) => setCreateForm((current) => ({ ...current, type: event.target.value }))} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
            {CONTACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <input value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} placeholder="E-mail" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <input value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefone" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <input value={createForm.cpf} onChange={(event) => setCreateForm((current) => ({ ...current, cpf: event.target.value }))} placeholder="CPF" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <input value={createForm.cnpj} onChange={(event) => setCreateForm((current) => ({ ...current, cnpj: event.target.value }))} placeholder="CNPJ" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <input value={createForm.cep} onChange={(event) => setCreateForm((current) => ({ ...current, cep: event.target.value }))} placeholder="CEP" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <input value={createForm.externalId} onChange={(event) => setCreateForm((current) => ({ ...current, externalId: event.target.value }))} placeholder="External ID" className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <ActionButton tone="primary" onClick={() => runAction("create_contact", createForm)} disabled={actionState.loading}>Criar contato</ActionButton>
        </div>
        <div className="mt-6 space-y-3 border-t border-[#2D2E2E] pt-5">
          <p className="text-xs uppercase tracking-[0.15em] opacity-50">Criacao em lote com protecao de rate limit</p>
          <textarea value={bulkCreateText} onChange={(event) => setBulkCreateText(event.target.value)} placeholder={"Um nome por linha\n, Maria da Silva\nJoao Pereira,\nEmpresa XPTO LTDA"} rows={8} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <div className="grid gap-3 md:grid-cols-[220px_auto_auto]">
            <input type="number" min="500" step="100" value={bulkCreateIntervalMs} onChange={(event) => setBulkCreateIntervalMs(Number(event.target.value || 1200))} className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
            <ActionButton onClick={() => runAction("bulk_create_contacts", { names: bulkCreateNames, type: createForm.type, intervalMs: bulkCreateIntervalMs, dryRun: true })} disabled={actionState.loading || !bulkCreateNames.length}>Simular lote</ActionButton>
            <ActionButton tone="primary" onClick={() => runAction("bulk_create_contacts", { names: bulkCreateNames, type: createForm.type, intervalMs: bulkCreateIntervalMs, dryRun: false })} disabled={actionState.loading || !bulkCreateNames.length}>Criar em lote</ActionButton>
          </div>
          <p className="text-xs opacity-60">{bulkCreateNames.length} nomes prontos para criacao. A higienizacao remove virgulas no inicio/fim e o backend respeita intervalo entre chamadas no Freshsales.</p>
        </div>
      </Panel>

      <Panel title="Mescla de duplicados" eyebrow="Correcao">
        <div className="space-y-4">
          <input value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} placeholder="ID do contato duplicado a mesclar no contato selecionado" className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <div className="flex flex-wrap gap-3">
            <ActionButton tone="primary" onClick={() => runAction("merge_contacts", { primaryContactId: selectedContactId, duplicateContactId: mergeTargetId })} disabled={actionState.loading || !selectedContactId || !mergeTargetId}>Mesclar no contato selecionado</ActionButton>
          </div>
          <div className="space-y-3">
            {duplicatesState.loading ? <p className="text-sm opacity-60">Carregando duplicados...</p> : null}
            {duplicatesState.error ? <p className="text-sm text-red-300">{duplicatesState.error}</p> : null}
            {duplicatesState.items.map((group) => <div key={group.key} className="border border-[#2D2E2E] p-4 text-sm"><p className="font-semibold">{group.label}</p><p className="text-xs opacity-60">{group.total} contatos no grupo</p><div className="mt-2 space-y-2">{group.items.map((item) => <div key={item.freshsales_contact_id} className="rounded border border-[#2D2E2E] p-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span>{item.name} · {item.type}</span><a href={item.freshsales_url} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Abrir</a></div><p className="opacity-60">ID: {item.freshsales_contact_id}</p></div>)}</div></div>)}
          </div>
        </div>
      </Panel>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
    <Panel title="Partes pendentes de vinculacao" eyebrow="HMADV -> Contacts">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_120px_220px_auto_auto_auto]">
          <input value={partesQuery} onChange={(event) => { setPartesPage(1); setPartesQuery(event.target.value); }} placeholder="Buscar parte por nome" className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <input type="number" min="1" max="50" value={reconcileLimit} onChange={(event) => setReconcileLimit(Number(event.target.value || 20))} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <select value={linkType} onChange={(event) => setLinkType(event.target.value)} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
            {CONTACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <ActionButton onClick={() => runAction("reconcile_partes", { processNumbers: selectedParteNumbers.join("\n"), limit: reconcileLimit, apply: false })} disabled={actionState.loading}>Simular vinculacao</ActionButton>
          <ActionButton tone="primary" onClick={() => runAction("reconcile_partes", { processNumbers: selectedParteNumbers.join("\n"), limit: reconcileLimit, apply: true })} disabled={actionState.loading}>Aplicar vinculacao</ActionButton>
          <ActionButton tone="primary" onClick={() => runAction("vincular_partes", { parteIds: selectedPartes, contactId: selectedContactId, type: linkType })} disabled={actionState.loading || !selectedContactId || !selectedPartes.length}>Vincular ao contato selecionado</ActionButton>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
          <span>Contato em foco: {selected?.contact?.name || "nenhum selecionado"}</span>
          <span>Partes marcadas: {selectedPartes.length}</span>
          <span>Tipo ao vincular: {linkType}</span>
          <span>Selecionadas nesta pagina: {pendingPageSelectedCount}/{partesPendentes.items.length || 0}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton onClick={() => togglePendingPageSelection(!allPendingPageSelected)} disabled={!partesPendentes.items.length}>
            {allPendingPageSelected ? "Desmarcar pagina" : "Selecionar pagina"}
          </ActionButton>
          <ActionButton onClick={() => setSelectedPartes([])} disabled={!selectedPartes.length}>Limpar selecao</ActionButton>
        </div>
        {partesPendentes.loading ? <p className="text-sm opacity-60">Carregando partes pendentes...</p> : null}
        {partesPendentes.error ? <p className="text-sm text-red-300">{partesPendentes.error}</p> : null}
        <div className="space-y-3">
          {partesPendentes.items.map((item) => <label key={item.id} className="block border border-[#2D2E2E] p-4 cursor-pointer"><div className="flex gap-3"><input type="checkbox" checked={selectedPartes.includes(item.id)} onChange={() => toggleParteSelection(item.id)} className="mt-1" /><div className="min-w-0 flex-1 text-sm"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.nome}</p>{item.cliente_hmadv || item.representada_pelo_escritorio ? <StatusBadge tone="accent">cliente</StatusBadge> : null}{item.polo === "ativo" ? <StatusBadge tone="neutral">polo ativo</StatusBadge> : null}{item.polo === "passivo" ? <StatusBadge tone="neutral">polo passivo</StatusBadge> : null}{item.principal_no_account ? <StatusBadge tone="success">principal</StatusBadge> : null}</div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65"><span>Tipo pessoa: {item.tipo_pessoa || "n/d"}</span>{item.processo?.numero_cnj ? <span>Processo: {item.processo.numero_cnj}</span> : null}{item.processo?.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${item.processo.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {item.processo.account_id_freshsales}</a> : null}</div>{item.processo?.titulo ? <p className="mt-1 opacity-60">{item.processo.titulo}</p> : null}</div></div></label>)}
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="opacity-60">Total estimado: {partesPendentes.totalRows || 0}</p>
          <div className="flex gap-2">
            <ActionButton onClick={() => setPartesPage(Math.max(1, partesPage - 1))} disabled={partesPage <= 1 || partesPendentes.loading}>Anterior</ActionButton>
            <ActionButton onClick={() => setPartesPage(partesPage + 1)} disabled={partesPendentes.loading}>Proxima</ActionButton>
          </div>
        </div>
      </div>
    </Panel>

    <Panel title="Partes ja vinculadas" eyebrow="Revisao e correcao">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <input value={linkedQuery} onChange={(event) => { setLinkedPage(1); setLinkedQuery(event.target.value); }} placeholder="Buscar vinculadas por nome ou processo" className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]" />
          <select value={linkedType} onChange={(event) => { setLinkedPage(1); setLinkedType(event.target.value); }} className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]">
            <option value="">Todos os tipos</option>
            {CONTACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton tone="primary" onClick={() => runAction("vincular_partes", { parteIds: selectedLinkedPartes, contactId: selectedContactId, type: linkType })} disabled={actionState.loading || !selectedContactId || !selectedLinkedPartes.length}>Mover para contato selecionado</ActionButton>
          <ActionButton onClick={() => runAction("reclassificar_partes", { parteIds: selectedLinkedPartes, type: linkType })} disabled={actionState.loading || !selectedLinkedPartes.length}>Reclassificar tipo</ActionButton>
          <ActionButton tone="danger" onClick={() => runAction("desvincular_partes", { parteIds: selectedLinkedPartes })} disabled={actionState.loading || !selectedLinkedPartes.length}>Desvincular partes</ActionButton>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
          <span>Selecionadas para revisao: {selectedLinkedPartes.length}</span>
          <span>Contato em foco: {selected?.contact?.name || "nenhum selecionado"}</span>
          <span>Tipo alvo: {linkType}</span>
          <span>Selecionadas nesta pagina: {linkedPageSelectedCount}/{partesVinculadas.items.length || 0}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton onClick={() => toggleLinkedPageSelection(!allLinkedPageSelected)} disabled={!partesVinculadas.items.length}>
            {allLinkedPageSelected ? "Desmarcar pagina" : "Selecionar pagina"}
          </ActionButton>
          <ActionButton onClick={() => setSelectedLinkedPartes([])} disabled={!selectedLinkedPartes.length}>Limpar selecao</ActionButton>
        </div>
        {partesVinculadas.loading ? <p className="text-sm opacity-60">Carregando partes vinculadas...</p> : null}
        {partesVinculadas.error ? <p className="text-sm text-red-300">{partesVinculadas.error}</p> : null}
        <div className="space-y-3">
          {partesVinculadas.items.map((item) => <label key={item.id} className="block border border-[#2D2E2E] p-4 cursor-pointer text-sm"><div className="flex gap-3"><input type="checkbox" checked={selectedLinkedPartes.includes(item.id)} onChange={() => toggleLinkedParteSelection(item.id)} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.nome}</p><StatusBadge tone="accent">{item.tipo_contato || "Nao classificado"}</StatusBadge>{item.cliente_hmadv || item.representada_pelo_escritorio ? <StatusBadge tone="success">cliente</StatusBadge> : null}{item.principal_no_account ? <StatusBadge tone="success">principal</StatusBadge> : null}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65"><span>Polo: {item.polo || "n/d"}</span><span>Tipo pessoa: {item.tipo_pessoa || "n/d"}</span>{item.processo?.numero_cnj ? <span>Processo: {item.processo.numero_cnj}</span> : null}{item.processo?.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${item.processo.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {item.processo.account_id_freshsales}</a> : null}{item.contact?.freshsales_url ? <a href={item.contact.freshsales_url} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Contato {item.contact.freshsales_contact_id}</a> : null}</div>{item.processo?.titulo ? <p className="mt-1 opacity-60">{item.processo.titulo}</p> : null}</div></div></label>)}
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="opacity-60">Total estimado: {partesVinculadas.totalRows || 0}</p>
          <div className="flex gap-2">
            <ActionButton onClick={() => setLinkedPage(Math.max(1, linkedPage - 1))} disabled={linkedPage <= 1 || partesVinculadas.loading}>Anterior</ActionButton>
            <ActionButton onClick={() => setLinkedPage(linkedPage + 1)} disabled={partesVinculadas.loading}>Proxima</ActionButton>
          </div>
        </div>
      </div>
    </Panel>
    </div>

    <Panel title="Resultado da ultima acao" eyebrow="Retorno operacional">
      {actionState.loading ? <p className="text-sm opacity-60">Executando acao...</p> : null}
      {actionState.error ? <p className="text-sm text-red-300">{actionState.error}</p> : null}
      {!actionState.loading && !actionState.error && actionState.result ? <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {actionState.result.partesAtualizadas ? <StatusBadge tone="success">{actionState.result.partesAtualizadas} partes atualizadas</StatusBadge> : null}
          {actionState.result.contatosVinculados ? <StatusBadge tone="success">{actionState.result.contatosVinculados} contatos vinculados</StatusBadge> : null}
          {actionState.result.contatosCriados ? <StatusBadge tone="success">{actionState.result.contatosCriados} contatos criados</StatusBadge> : null}
          {actionState.result.processosLidos ? <StatusBadge tone="neutral">{actionState.result.processosLidos} processos lidos</StatusBadge> : null}
        </div>
        {renderResultSummary(actionState.result)}
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs opacity-70">{JSON.stringify(actionState.result, null, 2)}</pre>
      </div> : null}
      {!actionState.loading && !actionState.error && !actionState.result ? <p className="text-sm opacity-60">Nenhuma acao executada nesta sessao.</p> : null}
    </Panel>

    <Panel title="Historico operacional local" eyebrow="Console integrado">
      {!executionHistory.length ? <p className="text-sm opacity-60">As proximas acoes deste modulo passam a aparecer aqui e no console lateral.</p> : null}
      {executionHistory.length ? <div className="space-y-3">
        {executionHistory.slice(0, 8).map((entry) => <div key={entry.id} className="border border-[#2D2E2E] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{entry.label}</p>
            <StatusBadge tone={entry.status === "error" ? "danger" : entry.status === "success" ? "success" : "warn"}>{entry.status}</StatusBadge>
          </div>
          <p className="mt-1 text-xs opacity-60">{entry.startedAt ? new Date(entry.startedAt).toLocaleString("pt-BR") : "sem data"}</p>
          {entry.preview ? <p className="mt-2 opacity-75">{entry.preview}</p> : null}
        </div>)}
      </div> : null}
    </Panel>
  </div>;
}
