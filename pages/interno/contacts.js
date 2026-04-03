import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

function MetricCard({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</p>
      <p className="mb-2 font-serif text-3xl">{value}</p>
      {helper ? <p className="text-sm leading-relaxed opacity-65">{helper}</p> : null}
    </div>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "#C5A059" }}>
          {eyebrow}
        </p>
      ) : null}
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function formatTypeOptions(tipos = {}) {
  return Object.entries(tipos).sort((a, b) => b[1] - a[1]);
}

export default function InternoContactsPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestao de Contacts"
          description="Espelho local dos contatos do Freshsales com filtros, detalhe operacional e enriquecimento pontual por CEP e DirectData."
        >
          <ContactsContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function ContactsContent() {
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [listState, setListState] = useState({ loading: true, error: null, items: [], totalRows: 0 });
  const [detailState, setDetailState] = useState({ loading: false, error: null, data: null });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [syncLimit, setSyncLimit] = useState(20);
  const [cep, setCep] = useState("");
  const [personType, setPersonType] = useState("pf");

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    loadList(page, query, type);
  }, [page, query, type]);

  useEffect(() => {
    if (!selectedContactId) {
      setDetailState({ loading: false, error: null, data: null });
      return;
    }
    loadDetail(selectedContactId);
  }, [selectedContactId]);

  async function loadOverview() {
    setOverview({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-contacts?action=overview");
      setOverview({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setOverview({ loading: false, error: error.message || "Falha ao carregar overview.", data: null });
    }
  }

  async function loadList(nextPage, nextQuery, nextType) {
    setListState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(
        `/api/admin-hmadv-contacts?action=list&page=${nextPage}&pageSize=20&query=${encodeURIComponent(nextQuery || "")}&type=${encodeURIComponent(nextType || "")}`
      );
      setListState({
        loading: false,
        error: null,
        items: payload.data.items || [],
        totalRows: payload.data.totalRows || 0,
      });
      if (!selectedContactId && payload.data.items?.[0]?.freshsales_contact_id) {
        setSelectedContactId(payload.data.items[0].freshsales_contact_id);
      }
    } catch (error) {
      setListState({ loading: false, error: error.message || "Falha ao carregar contatos.", items: [], totalRows: 0 });
    }
  }

  async function loadDetail(contactId) {
    setDetailState({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-contacts?action=detail&contactId=${encodeURIComponent(contactId)}`);
      setDetailState({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setDetailState({ loading: false, error: error.message || "Falha ao carregar detalhe do contato.", data: null });
    }
  }

  async function runAction(action, payload = {}) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const response = await adminFetch("/api/admin-hmadv-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      setActionState({ loading: false, error: null, result: response.data });
      await Promise.all([loadOverview(), loadList(page, query, type), selectedContactId ? loadDetail(selectedContactId) : Promise.resolve()]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
    }
  }

  const overviewData = overview.data || {};
  const selected = detailState.data;
  const typeOptions = useMemo(() => formatTypeOptions(overviewData.tipos || {}), [overviewData.tipos]);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contacts espelhados" value={overviewData.total || 0} helper="Itens persistidos em public.freshsales_contacts." />
        <MetricCard label="Com e-mail" value={overviewData.comEmail || 0} helper="Contatos com identificador de e-mail preenchido." />
        <MetricCard label="Com CPF" value={overviewData.comCpf || 0} helper="Base apta para enriquecimento de pessoa física." />
        <MetricCard label="Com CNPJ" value={overviewData.comCnpj || 0} helper="Base apta para enriquecimento de pessoa jurídica." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Lista paginada" eyebrow="Espelho local">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_auto_auto]">
              <input
                value={query}
                onChange={(event) => {
                  setPage(1);
                  setQuery(event.target.value);
                }}
                placeholder="Buscar por nome, e-mail ou telefone"
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
              <select
                value={type}
                onChange={(event) => {
                  setPage(1);
                  setType(event.target.value);
                }}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              >
                <option value="">Todos os tipos</option>
                {typeOptions.map(([label, total]) => (
                  <option key={label} value={label}>
                    {label} ({total})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => runAction("sync_contacts", { limit: syncLimit, dryRun: true })}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Simular sync
              </button>
              <button
                type="button"
                onClick={() => runAction("sync_contacts", { limit: syncLimit, dryRun: false })}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-4 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Sincronizar
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.15em] opacity-50">Lote sync</span>
              <input
                type="number"
                min="1"
                max="100"
                value={syncLimit}
                onChange={(event) => setSyncLimit(Number(event.target.value || 20))}
                className="w-28 border border-[#2D2E2E] bg-[#050706] p-2 text-sm outline-none focus:border-[#C5A059]"
              />
            </div>

            {listState.loading ? <p className="text-sm opacity-60">Carregando contatos...</p> : null}
            {listState.error ? <p className="text-sm text-red-300">{listState.error}</p> : null}
            <div className="space-y-3">
              {listState.items.map((item) => {
                const active = selectedContactId === item.freshsales_contact_id;
                return (
                  <button
                    key={item.freshsales_contact_id}
                    type="button"
                    onClick={() => setSelectedContactId(item.freshsales_contact_id)}
                    className={`block w-full border p-4 text-left ${active ? "border-[#C5A059]" : "border-[#2D2E2E]"}`}
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{item.name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65">
                        <span>Tipo: {item.type}</span>
                        {item.email ? <span>E-mail: {item.email}</span> : null}
                        {item.phone ? <span>Telefone: {item.phone}</span> : null}
                        {item.cpf ? <span>CPF: {item.cpf}</span> : null}
                        {item.cnpj ? <span>CNPJ: {item.cnpj}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="opacity-60">Total estimado: {listState.totalRows || 0}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1 || listState.loading}
                  className="border border-[#2D2E2E] px-3 py-2 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={listState.loading}
                  className="border border-[#2D2E2E] px-3 py-2 disabled:opacity-40"
                >
                  Proxima
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Detalhe do contato" eyebrow="Operacao">
          {!selectedContactId ? <p className="text-sm opacity-60">Selecione um contato para carregar o detalhe.</p> : null}
          {detailState.loading ? <p className="text-sm opacity-60">Carregando detalhe...</p> : null}
          {detailState.error ? <p className="text-sm text-red-300">{detailState.error}</p> : null}
          {selected ? (
            <div className="space-y-6 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-lg">{selected.contact.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 opacity-70">
                  <span>Tipo: {selected.contact.type}</span>
                  {selected.contact.email ? <span>E-mail: {selected.contact.email}</span> : null}
                  {selected.contact.phone ? <span>Telefone: {selected.contact.phone}</span> : null}
                  {selected.contact.cep ? <span>CEP: {selected.contact.cep}</span> : null}
                </div>
                {selected.contact.freshsales_url ? (
                  <a
                    href={selected.contact.freshsales_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline opacity-80 hover:text-[#C5A059]"
                  >
                    Abrir contato no Freshsales
                  </a>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Processos" value={selected.metrics.processos || 0} />
                <MetricCard label="Publicacoes" value={selected.metrics.publicacoes || 0} />
                <MetricCard label="Audiencias" value={selected.metrics.audiencias || 0} />
              </div>

              <div className="grid gap-4 md:grid-cols-[180px_180px_auto_auto]">
                <input
                  value={cep}
                  onChange={(event) => setCep(event.target.value)}
                  placeholder="CEP para ViaCEP"
                  className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
                />
                <select
                  value={personType}
                  onChange={(event) => setPersonType(event.target.value)}
                  className="border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
                >
                  <option value="pf">Pessoa fisica</option>
                  <option value="pj">Pessoa juridica</option>
                </select>
                <button
                  type="button"
                  onClick={() => runAction("enrich_cep", { contactId: selected.contact.freshsales_contact_id, cep: cep || selected.contact.cep })}
                  disabled={actionState.loading}
                  className="border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
                >
                  Enriquecer via CEP
                </button>
                <button
                  type="button"
                  onClick={() => runAction("enrich_directdata", { contactId: selected.contact.freshsales_contact_id, personType })}
                  disabled={actionState.loading}
                  className="bg-[#C5A059] px-4 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
                >
                  Enriquecer DirectData
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.15em] opacity-50">Processos vinculados no HMADV</p>
                {!selected.processos?.length ? <p className="opacity-60">Nenhum processo vinculado por contato_freshsales_id ainda.</p> : null}
                {selected.processos?.map((processo) => (
                  <div key={processo.id} className="border border-[#2D2E2E] p-3">
                    <div className="space-y-1">
                      <p className="font-semibold">{processo.numero_cnj || processo.id}</p>
                      {processo.titulo ? <p className="opacity-70">{processo.titulo}</p> : null}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
                        {processo.status_atual_processo ? <span>Status: {processo.status_atual_processo}</span> : null}
                        {processo.account_id_freshsales ? (
                          <a
                            href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${processo.account_id_freshsales}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-[#C5A059]"
                          >
                            Account {processo.account_id_freshsales}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title="Resultado da ultima acao" eyebrow="Retorno operacional">
        {actionState.loading ? <p className="text-sm opacity-60">Executando acao...</p> : null}
        {actionState.error ? <p className="text-sm text-red-300">{actionState.error}</p> : null}
        {!actionState.loading && !actionState.error && actionState.result ? (
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs opacity-80">{JSON.stringify(actionState.result, null, 2)}</pre>
        ) : null}
        {!actionState.loading && !actionState.error && !actionState.result ? (
          <p className="text-sm opacity-60">Nenhuma acao executada nesta sessao.</p>
        ) : null}
      </Panel>
    </div>
  );
}
