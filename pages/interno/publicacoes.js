import { useEffect, useState } from "react";
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

export default function InternoPublicacoesPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestao de Publicacoes"
          description="Modulo interno para drenagem do backlog Advise, auditoria do filtro de leilao e extracao retroativa de partes a partir do conteudo das publicacoes."
        >
          <PublicacoesContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function PublicacoesContent() {
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [processNumbers, setProcessNumbers] = useState("");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setOverview({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=overview");
      setOverview({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setOverview({ loading: false, error: error.message || "Falha ao carregar modulo de publicacoes.", data: null });
    }
  }

  async function handleAction(action, apply = false) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          apply,
          limit,
          processNumbers,
        }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      await loadOverview();
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
        <Panel title="Criacao de processos a partir das publicacoes" eyebrow="Publicacoes -> Processos">
          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">CNJs para foco</span>
              <textarea
                value={processNumbers}
                onChange={(event) => setProcessNumbers(event.target.value)}
                rows={8}
                placeholder="Cole aqui a lista de CNJs, um por linha."
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">Limite</span>
              <input
                type="number"
                min="1"
                max="50"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value || 10))}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleAction("criar_processos_publicacoes", false)}
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

        <Panel title="Extracao retroativa de partes" eyebrow="Publicacoes -> Partes">
          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">CNJs para foco</span>
              <textarea
                value={processNumbers}
                onChange={(event) => setProcessNumbers(event.target.value)}
                rows={8}
                placeholder="Cole aqui a lista de CNJs, um por linha."
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">Limite</span>
              <input
                type="number"
                min="1"
                max="500"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value || 50))}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", false)}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Simular extracao
              </button>
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", true)}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Aplicar extracao
              </button>
              <button
                type="button"
                onClick={loadOverview}
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
