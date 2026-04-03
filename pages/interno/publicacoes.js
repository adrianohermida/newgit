import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

function MetricCard({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl mb-2">{value}</p>
      {helper ? <p className="text-sm opacity-65 leading-relaxed">{helper}</p> : null}
    </div>
  );
}

function Panel({ title, eyebrow, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
          {eyebrow}
        </p>
      ) : null}
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

function QueueList({
  title,
  helper,
  rows,
  selected,
  onToggle,
  onTogglePage,
  page,
  setPage,
  loading,
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {helper ? <p className="text-xs opacity-60">{helper}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTogglePage(!allSelected)}
            className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
          >
            {allSelected ? "Desmarcar pagina" : "Selecionar pagina"}
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
            className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={loading}
            className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40"
          >
            Proxima
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm opacity-60">Carregando fila...</p> : null}
      {!loading && !rows.length ? <p className="text-sm opacity-60">Nenhum item encontrado nesta pagina.</p> : null}
      <div className="space-y-3">
        {rows.map((row) => (
          <label key={row.key} className="block border border-[#2D2E2E] p-4 cursor-pointer">
            <div className="flex gap-3">
              <input
                type="checkbox"
                checked={selected.includes(row.key)}
                onChange={() => onToggle(row.key)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="font-semibold break-all">{row.numero_cnj || row.key}</p>
                {row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}
                {row.snippet ? <p className="opacity-60 line-clamp-3">{row.snippet}</p> : null}
                <div className="flex flex-wrap gap-x-4 gap-y-1 opacity-60 text-xs">
                  {row.publicacoes ? <span>Publicacoes: {row.publicacoes}</span> : null}
                  {row.ultima_publicacao ? <span>Ultima publicacao: {row.ultima_publicacao}</span> : null}
                  {row.partes_novas ? <span>Partes novas: {row.partes_novas}</span> : null}
                  {row.partes_existentes !== undefined ? <span>Partes existentes: {row.partes_existentes}</span> : null}
                  {row.account_id_freshsales ? <span>Account: {row.account_id_freshsales}</span> : null}
                </div>
                {row.sample_partes?.length ? (
                  <p className="text-xs opacity-60">
                    Exemplos: {row.sample_partes.map((item) => `${item.nome} (${item.polo})`).join(" | ")}
                  </p>
                ) : null}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function InternoPublicacoesPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestao de Publicacoes"
          description="Modulo interno para drenagem do backlog Advise, criacao de processos, extracao retroativa de partes e sincronizacao com Freshsales."
        >
          <PublicacoesContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function PublicacoesContent() {
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [processCandidates, setProcessCandidates] = useState({ loading: true, error: null, items: [] });
  const [partesCandidates, setPartesCandidates] = useState({ loading: true, error: null, items: [] });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [processNumbers, setProcessNumbers] = useState("");
  const [limit, setLimit] = useState(10);
  const [processPage, setProcessPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [selectedProcessKeys, setSelectedProcessKeys] = useState([]);
  const [selectedPartesKeys, setSelectedPartesKeys] = useState([]);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    loadProcessCandidates(processPage);
  }, [processPage]);

  useEffect(() => {
    loadPartesCandidates(partesPage);
  }, [partesPage]);

  async function loadOverview() {
    setOverview({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=overview");
      setOverview({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setOverview({ loading: false, error: error.message || "Falha ao carregar modulo de publicacoes.", data: null });
    }
  }

  async function loadProcessCandidates(page) {
    setProcessCandidates((state) => ({ ...state, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_processos&page=${page}&pageSize=20`);
      setProcessCandidates({ loading: false, error: null, items: payload.data.items || [] });
    } catch (error) {
      setProcessCandidates({ loading: false, error: error.message || "Falha ao carregar candidatos.", items: [] });
    }
  }

  async function loadPartesCandidates(page) {
    setPartesCandidates((state) => ({ ...state, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_partes&page=${page}&pageSize=20`);
      setPartesCandidates({ loading: false, error: null, items: payload.data.items || [] });
    } catch (error) {
      setPartesCandidates({ loading: false, error: error.message || "Falha ao carregar candidatos de partes.", items: [] });
    }
  }

  function toggleSelection(setter, current, key) {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function togglePageSelection(setter, current, rows, nextState) {
    const keys = rows.map((item) => item.key);
    if (nextState) {
      setter([...new Set([...current, ...keys])]);
      return;
    }
    setter(current.filter((item) => !keys.includes(item)));
  }

  const selectedProcessNumbers = useMemo(
    () => processCandidates.items.filter((item) => selectedProcessKeys.includes(item.key)).map((item) => item.numero_cnj),
    [processCandidates.items, selectedProcessKeys]
  );
  const selectedPartesNumbers = useMemo(
    () => partesCandidates.items.filter((item) => selectedPartesKeys.includes(item.key)).map((item) => item.numero_cnj),
    [partesCandidates.items, selectedPartesKeys]
  );

  async function handleAction(action, apply = false, numbers = []) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          apply,
          limit,
          processNumbers: numbers.length ? numbers.join("\n") : processNumbers,
        }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      await Promise.all([loadOverview(), loadProcessCandidates(processPage), loadPartesCandidates(partesPage)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
    }
  }

  const data = overview.data || {};

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Publicacoes totais" value={data.publicacoesTotal || 0} helper="Estoque atualmente persistido no HMADV." />
        <MetricCard label="Com activity" value={data.publicacoesComActivity || 0} helper="Ja refletidas como activity no Freshsales." />
        <MetricCard label="Pendentes" value={data.publicacoesPendentesComAccount || 0} helper="Ainda sem activity em processos com account vinculado." />
        <MetricCard label="Sem processo" value={data.publicacoesSemProcesso || 0} helper="Publicacoes ainda sem processo vinculado no HMADV." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Criacao de processos a partir das publicacoes" eyebrow="Fila paginada">
          <div className="space-y-4">
            <QueueList
              title="Processos criaveis"
              helper="Selecione itens da pagina para disparar a criacao do processo no HMADV via DataJud."
              rows={processCandidates.items}
              selected={selectedProcessKeys}
              onToggle={(key) => toggleSelection(setSelectedProcessKeys, selectedProcessKeys, key)}
              onTogglePage={(nextState) => togglePageSelection(setSelectedProcessKeys, selectedProcessKeys, processCandidates.items, nextState)}
              page={processPage}
              setPage={setProcessPage}
              loading={processCandidates.loading}
            />
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">CNJs para foco manual</span>
              <textarea
                value={processNumbers}
                onChange={(event) => setProcessNumbers(event.target.value)}
                rows={4}
                placeholder="Opcional: cole CNJs manualmente, um por linha."
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">Lote</span>
              <input
                type="number"
                min="1"
                max="20"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value || 10))}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleAction("criar_processos_publicacoes", false, selectedProcessNumbers)}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Criar processos das publicacoes
              </button>
              <button
                type="button"
                onClick={() => handleAction("run_sync_worker", false)}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Rodar sync-worker
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Extracao retroativa de partes" eyebrow="Fila paginada">
          <div className="space-y-4">
            <QueueList
              title="Processos com partes extraiveis"
              helper="Selecione processos vinculados que ainda tenham partes detectadas no conteudo das publicacoes."
              rows={partesCandidates.items}
              selected={selectedPartesKeys}
              onToggle={(key) => toggleSelection(setSelectedPartesKeys, selectedPartesKeys, key)}
              onTogglePage={(nextState) => togglePageSelection(setSelectedPartesKeys, selectedPartesKeys, partesCandidates.items, nextState)}
              page={partesPage}
              setPage={setPartesPage}
              loading={partesCandidates.loading}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", false, selectedPartesNumbers)}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Simular extracao
              </button>
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", true, selectedPartesNumbers)}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Aplicar extracao
              </button>
              <button
                type="button"
                onClick={async () => {
                  await Promise.all([loadOverview(), loadProcessCandidates(processPage), loadPartesCandidates(partesPage)]);
                }}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Atualizar leitura
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Leitura de backlog" eyebrow="Operacao">
          {overview.loading ? <p className="text-sm opacity-65">Carregando leitura...</p> : null}
          {overview.error ? <p className="text-sm text-red-300">{overview.error}</p> : null}
          {!overview.loading && !overview.error ? (
            <div className="space-y-3 text-sm opacity-75">
              <p>Partes totais: {data.partesTotal || 0}</p>
              <p>Publicacoes totais: {data.publicacoesTotal || 0}</p>
              <p>Publicacoes com activity: {data.publicacoesComActivity || 0}</p>
              <p>Publicacoes pendentes com account: {data.publicacoesPendentesComAccount || 0}</p>
              <p>Publicacoes sem processo: {data.publicacoesSemProcesso || 0}</p>
              <p>Publicacoes marcadas como leilao ignorado: {data.publicacoesLeilaoIgnorado || 0}</p>
            </div>
          ) : null}
        </Panel>
      </div>

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
