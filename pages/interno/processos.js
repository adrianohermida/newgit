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

export default function InternoProcessosPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestao de Processos"
          description="Painel operacional para sincronizacao DataJud, varredura de processos orfaos e retroativo de audiencias a partir das publicacoes do HMADV."
        >
          <ProcessosContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function ProcessosContent() {
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [orfaos, setOrfaos] = useState({ loading: true, error: null, items: [] });
  const [audiencias, setAudiencias] = useState({ loading: true, error: null, data: null });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [processNumbers, setProcessNumbers] = useState("");
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setOverview({ loading: true, error: null, data: null });
    setOrfaos({ loading: true, error: null, items: [] });
    setAudiencias({ loading: true, error: null, data: null });
    try {
      const [overviewPayload, orfaosPayload, audienciasPayload] = await Promise.all([
        adminFetch("/api/admin-hmadv-processos?action=overview"),
        adminFetch("/api/admin-hmadv-processos?action=orfaos&limit=20"),
        adminFetch("/api/admin-hmadv-processos?action=inspect_audiencias&limit=10"),
      ]);
      setOverview({ loading: false, error: null, data: overviewPayload.data });
      setOrfaos({ loading: false, error: null, items: orfaosPayload.data.items || [] });
      setAudiencias({ loading: false, error: null, data: audienciasPayload.data });
    } catch (error) {
      const message = error.message || "Falha ao carregar modulo de processos.";
      setOverview({ loading: false, error: message, data: null });
      setOrfaos({ loading: false, error: message, items: [] });
      setAudiencias({ loading: false, error: message, data: null });
    }
  }

  async function handleAction(action, apply = false) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload =
        action === "run_sync_worker"
          ? await adminFetch("/api/admin-hmadv-processos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            })
          : await adminFetch("/api/admin-hmadv-processos", {
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
      await loadAll();
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
    }
  }

  const data = overview.data || {};
  const worker = data.syncWorker?.worker || {};
  const pendencias = data.syncWorker?.p || {};

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Processos totais" value={data.processosTotal || 0} helper="Base atual consolidada no HMADV." />
        <MetricCard label="Com account" value={data.processosComAccount || 0} helper="Sales Accounts ja vinculadas no Freshsales." />
        <MetricCard label="DataJud enriquecido" value={data.datajudEnriquecido || 0} helper="Processos com enriquecimento persistido no Supabase." />
        <MetricCard label="Audiencias no banco" value={data.audienciasTotal || 0} helper="Linhas detectadas e persistidas em judiciario.audiencias." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Fila operacional" eyebrow="Sync-worker">
          {overview.loading ? <p className="text-sm opacity-65">Carregando fila...</p> : null}
          {overview.error ? <p className="text-sm text-red-300">{overview.error}</p> : null}
          {!overview.loading && !overview.error ? (
            <div className="grid gap-3 md:grid-cols-2 text-sm opacity-75">
              <p>Versao: {worker.versao || "-"}</p>
              <p>Publicacoes pendentes: {pendencias.pubs || 0}</p>
              <p>Processos sem account: {pendencias.proc_sem_acc || 0}</p>
              <p>Fila DataJud: {pendencias.fila_dj || 0}</p>
              <p>Audiencias enviadas no ultimo lote: {worker.ultimo_lote?.audiencias || 0}</p>
              <p>Reunioes no ultimo lote: {worker.ultimo_lote?.reunioes || 0}</p>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleAction("run_sync_worker")}
              disabled={actionState.loading}
              className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
            >
              Rodar sync-worker
            </button>
            <button
              type="button"
              onClick={loadAll}
              className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Atualizar status
            </button>
          </div>
        </Panel>

        <Panel title="Retroativo de audiencias" eyebrow="Backfill">
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
                onChange={(event) => setLimit(Number(event.target.value || 100))}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleAction("backfill_audiencias", false)}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Simular retroativo
              </button>
              <button
                type="button"
                onClick={() => handleAction("backfill_audiencias", true)}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Aplicar retroativo
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Processos orfaos" eyebrow="Sem Sales Account">
          {orfaos.loading ? <p className="text-sm opacity-65">Carregando amostra...</p> : null}
          {orfaos.error ? <p className="text-sm text-red-300">{orfaos.error}</p> : null}
          {!orfaos.loading && !orfaos.error ? (
            <div className="space-y-3 text-sm opacity-75">
              {orfaos.items.length ? (
                orfaos.items.map((item) => (
                  <div key={item.id} className="border border-[#2D2E2E] p-3">
                    <p className="font-semibold">{item.numero_cnj || item.titulo}</p>
                    <p className="opacity-60">{item.titulo}</p>
                  </div>
                ))
              ) : (
                <p>Nenhum processo orfao encontrado na amostra atual.</p>
              )}
            </div>
          ) : null}
        </Panel>

        <Panel title="Audiencias detectadas" eyebrow="Banco HMADV">
          {audiencias.loading ? <p className="text-sm opacity-65">Carregando audiencias...</p> : null}
          {audiencias.error ? <p className="text-sm text-red-300">{audiencias.error}</p> : null}
          {!audiencias.loading && !audiencias.error ? (
            <div className="space-y-3 text-sm opacity-75">
              {(audiencias.data?.sample || []).length ? (
                audiencias.data.sample.map((item) => (
                  <div key={item.id} className="border border-[#2D2E2E] p-3">
                    <p className="font-semibold">{item.titulo_resolvido}</p>
                    <p>Processo: {item.raw?.metadata?.numero_cnj || item.processo_id}</p>
                    <p>Data: {item.data_resolvida || "-"}</p>
                    <p>Freshsales activity: {item.freshsales_activity_id || "pendente"}</p>
                  </div>
                ))
              ) : (
                <p>Nenhuma audiencia detectada ainda.</p>
              )}
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
