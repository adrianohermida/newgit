import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

const EMPTY_FORM = {
  numero_cnj_pai: "",
  numero_cnj_filho: "",
  tipo_relacao: "dependencia",
  status: "ativo",
  observacoes: "",
};

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

export default function InternoProcessosPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestao de Processos"
          description="Controle interno da carteira processual, incluindo monitoramento, status e arvore de processos relacionados para refletir corretamente no portal do cliente."
        >
          <InternoProcessosContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function InternoProcessosContent() {
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [relations, setRelations] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1 });
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState({ loading: false, items: [] });
  const [lookupTerm, setLookupTerm] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    loadRelations(1, search);
  }, [search]);

  useEffect(() => {
    const term = lookupTerm.trim();
    if (!term) {
      setLookup({ loading: false, items: [] });
      return undefined;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLookup((current) => ({ ...current, loading: true }));
      try {
        const payload = await adminFetch(`/api/admin-hmadv-processos?action=buscar_processos&query=${encodeURIComponent(term)}&limit=8`);
        if (!cancelled) {
          setLookup({ loading: false, items: payload.data.items || [] });
        }
      } catch {
        if (!cancelled) {
          setLookup({ loading: false, items: [] });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [lookupTerm]);

  async function loadOverview() {
    setOverview({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=overview");
      setOverview({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setOverview({ loading: false, error: error.message || "Falha ao carregar overview.", data: null });
    }
  }

  async function loadRelations(page = 1, query = "") {
    setRelations((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}`);
      setRelations({
        loading: false,
        error: null,
        items: payload.data.items || [],
        totalRows: payload.data.totalRows || 0,
        page: payload.data.page || page,
      });
    } catch (error) {
      setRelations({ loading: false, error: error.message || "Falha ao carregar relacoes.", items: [], totalRows: 0, page });
    }
  }

  async function handleSave() {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "salvar_relacao",
          ...form,
        }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      setForm(EMPTY_FORM);
      await Promise.all([loadOverview(), loadRelations(relations.page, search)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao salvar relacao.", result: null });
    }
  }

  async function handleDelete(id) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remover_relacao",
          id,
        }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      await loadRelations(relations.page, search);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao remover relacao.", result: null });
    }
  }

  const data = overview.data || {};
  const quickStats = useMemo(
    () => [
      { label: "Processos totais", value: data.processosTotal || 0, helper: "Carteira atual persistida no HMADV." },
      { label: "Monitoramento ativo", value: data.monitoramentoAtivo || 0, helper: "Processos acompanhados na rotina principal." },
      { label: "Sem movimentacoes", value: data.processosSemMovimentacao || 0, helper: "Itens que ainda pedem enriquecimento operacional." },
      { label: "Relacoes visiveis", value: relations.totalRows || 0, helper: "Vinculos processuais manuais que alimentam a arvore do portal." },
    ],
    [data, relations.totalRows]
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickStats.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Vincular processos relacionados" eyebrow="Arvore processual">
          <div className="space-y-4">
            <Field
              label="Processo principal / pai"
              value={form.numero_cnj_pai}
              onChange={(value) => setForm((current) => ({ ...current, numero_cnj_pai: value }))}
              placeholder="CNJ do processo principal"
            />
            <Field
              label="Processo relacionado / filho"
              value={form.numero_cnj_filho}
              onChange={(value) => setForm((current) => ({ ...current, numero_cnj_filho: value }))}
              placeholder="CNJ do apenso, incidente, recurso ou dependencia"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Tipo de relacao"
                value={form.tipo_relacao}
                onChange={(value) => setForm((current) => ({ ...current, tipo_relacao: value }))}
                options={[
                  { value: "dependencia", label: "Dependencia" },
                  { value: "apenso", label: "Apenso" },
                  { value: "incidente", label: "Incidente" },
                  { value: "recurso", label: "Recurso" },
                ]}
              />
              <SelectField
                label="Status"
                value={form.status}
                onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                options={[
                  { value: "ativo", label: "Ativo" },
                  { value: "inativo", label: "Inativo" },
                ]}
              />
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] opacity-50">Observacoes</span>
              <textarea
                value={form.observacoes}
                onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                rows={4}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
                placeholder="Ex.: recurso distribuido por dependencia do principal."
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Salvar relacao
              </button>
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM)}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Limpar formulario
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Busca rapida de processos" eyebrow="Apoio operacional">
          <div className="space-y-4">
            <Field
              label="Buscar por CNJ ou titulo"
              value={lookupTerm}
              onChange={setLookupTerm}
              placeholder="Digite o CNJ ou parte do titulo"
            />
            {lookup.loading ? <p className="text-sm opacity-60">Buscando processos...</p> : null}
            {!lookup.loading && !lookup.items.length && lookupTerm.trim() ? (
              <p className="text-sm opacity-60">Nenhum processo encontrado para esse termo.</p>
            ) : null}
            <div className="space-y-3">
              {lookup.items.map((item) => (
                <div key={item.id || item.numero_cnj} className="border border-[#2D2E2E] p-4 text-sm">
                  <p className="font-semibold">{item.numero_cnj || "Sem CNJ"}</p>
                  <p className="mt-1 opacity-70">{item.titulo || "Sem titulo"}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-60">
                    <span>Status: {item.status || "sem_status"}</span>
                    {item.account_id_freshsales ? <span>Account: {item.account_id_freshsales}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, numero_cnj_pai: item.numero_cnj || current.numero_cnj_pai }))}
                      className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                    >
                      Usar como pai
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, numero_cnj_filho: item.numero_cnj || current.numero_cnj_filho }))}
                      className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                    >
                      Usar como filho
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Relacoes processuais cadastradas" eyebrow="Reflexo no portal">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtrar por CNJ relacionado"
            className="min-w-[280px] border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm outline-none focus:border-[#C5A059]"
          />
          <button
            type="button"
            onClick={() => loadRelations(1, search)}
            className="border border-[#2D2E2E] px-4 py-2 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
          >
            Atualizar
          </button>
        </div>

        {relations.loading ? <p className="text-sm opacity-60">Carregando relacoes...</p> : null}
        {relations.error ? <p className="text-sm text-red-300">{relations.error}</p> : null}
        {!relations.loading && !relations.items.length ? <p className="text-sm opacity-60">Nenhuma relacao cadastrada ainda.</p> : null}

        <div className="space-y-4">
          {relations.items.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.15em]">
                  <span className="border border-[#2D2E2E] px-2 py-1">{item.tipo_relacao}</span>
                  <span className="border border-[#2D2E2E] px-2 py-1">{item.status}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={actionState.loading}
                  className="border border-[#4B2222] px-3 py-2 text-xs text-red-200 hover:border-[#C96A6A]"
                >
                  Remover
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <RelationProcessCard title="Processo principal" process={item.processo_pai} fallbackNumber={item.numero_cnj_pai} />
                <RelationProcessCard title="Processo relacionado" process={item.processo_filho} fallbackNumber={item.numero_cnj_filho} />
              </div>
              {item.observacoes ? <p className="mt-3 text-sm opacity-65">{item.observacoes}</p> : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Resultado da ultima acao" eyebrow="Retorno operacional">
        {actionState.loading ? <p className="text-sm opacity-65">Executando acao...</p> : null}
        {actionState.error ? <p className="text-sm text-red-300">{actionState.error}</p> : null}
        {!actionState.loading && !actionState.error && actionState.result ? (
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs opacity-80">{JSON.stringify(actionState.result, null, 2)}</pre>
        ) : null}
        {!actionState.loading && !actionState.error && !actionState.result ? (
          <p className="text-sm opacity-65">Nenhuma acao executada ainda nesta sessao.</p>
        ) : null}
      </Panel>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RelationProcessCard({ title, process, fallbackNumber }) {
  return (
    <div className="border border-[#2D2E2E] bg-[#050706] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] opacity-50">{title}</p>
      <p className="mt-3 break-all font-semibold">{process?.numero_cnj || fallbackNumber || "Sem CNJ"}</p>
      <p className="mt-1 text-sm opacity-70">{process?.titulo || "Processo ainda nao encontrado na base judiciaria."}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-60">
        {process?.status_atual_processo ? <span>Status: {process.status_atual_processo}</span> : null}
        {process?.account_id_freshsales ? <span>Account: {process.account_id_freshsales}</span> : null}
      </div>
    </div>
  );
}
