import { useEffect, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

const PAGE_SIZE = 10;

function formatDate(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function PortalPublicacoesPage() {
  const [state, setState] = useState({
    loading: true,
    loadingMore: false,
    error: null,
    warning: null,
    items: [],
    pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0, hasMore: false },
  });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Publicacoes"
          description="Leitura consolidada das publicacoes judiciais vinculadas aos seus processos, seguindo a mesma logica progressiva do painel do cliente."
        >
          <PublicacoesContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function PublicacoesContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch(`/api/client-publicacoes?page=1&pageSize=${PAGE_SIZE}`);
        if (!cancelled) {
          setState({
            loading: false,
            loadingMore: false,
            error: null,
            warning: payload.warning || null,
            items: payload.items || [],
            pagination: payload.pagination || { page: 1, pageSize: PAGE_SIZE, total: payload.items?.length || 0, totalPages: 1, hasMore: false },
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            loadingMore: false,
            error: error.message,
            warning: null,
            items: [],
            pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0, hasMore: false },
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  async function loadMore() {
    if (state.loadingMore || !state.pagination?.hasMore) return;

    setState((current) => ({ ...current, loadingMore: true }));

    try {
      const nextPage = (state.pagination?.page || 1) + 1;
      const payload = await clientFetch(`/api/client-publicacoes?page=${nextPage}&pageSize=${state.pagination?.pageSize || PAGE_SIZE}`);
      setState((current) => ({
        ...current,
        loading: false,
        loadingMore: false,
        error: null,
        warning: payload.warning || current.warning || null,
        items: [...current.items, ...(payload.items || [])],
        pagination: payload.pagination || current.pagination,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loadingMore: false, error: error.message }));
    }
  }

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando publicacoes...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <div className="space-y-4">
      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}

      {!state.items.length ? (
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Sem publicacoes</p>
          <h3 className="mt-3 font-serif text-3xl">Nenhuma publicacao visivel no portal neste momento.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Assim que o schema judiciario expuser esse historico, as publicacoes passarao a aparecer aqui com data, fonte e atalho para o processo relacionado.
          </p>
        </div>
      ) : null}

      {state.items.length ? (
        <p className="text-sm opacity-62">
          Exibindo {state.items.length} de {state.pagination?.total || state.items.length} publicacao(oes).
        </p>
      ) : null}

      {state.items.map((item) => (
        <article key={item.id} className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>
                  {item.source || "Publicacao"}
                </span>
                {item.status ? (
                  <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
                    {item.status}
                  </span>
                ) : null}
              </div>
              <h3 className="font-serif text-2xl">{item.title}</h3>
              <p className="mt-2 text-sm opacity-55">Publicada em {formatDate(item.date)}</p>
              {item.summary ? <p className="mt-4 max-w-3xl text-sm leading-6 opacity-65">{item.summary}</p> : null}
            </div>

            <div className="flex flex-wrap gap-3">
              {item.process_id ? (
                <Link
                  href={`/portal/processos/detalhe?id=${encodeURIComponent(item.process_id)}`}
                  prefetch={false}
                  className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56]"
                >
                  Abrir processo
                </Link>
              ) : null}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl bg-[#C49C56] px-4 py-3 text-sm font-semibold text-[#07110E] transition hover:brightness-110"
                >
                  Abrir fonte
                </a>
              ) : null}
            </div>
          </div>
        </article>
      ))}

      {state.pagination?.hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={state.loadingMore}
            className="rounded-2xl border border-[#20332D] px-5 py-3 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {state.loadingMore ? "Carregando mais publicacoes..." : "Carregar mais publicacoes"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
