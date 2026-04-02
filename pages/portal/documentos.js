import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

const INITIAL_STATE = { loading: true, error: null, warning: null, items: [], summary: null };

function formatDate(value) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("pt-BR");
}

function statusStyle(status) {
  if (status === "pendente") return "border-[#7A5C20] bg-[rgba(122,92,32,0.18)] text-[#F3DEAD]";
  if (status === "concluido") return "border-[#24533D] bg-[rgba(19,72,49,0.2)] text-[#B8F0D5]";
  if (status === "expirado") return "border-[#8A2E2E] bg-[rgba(138,46,46,0.16)] text-[#FECACA]";
  return "border-[#31463F] bg-[rgba(32,51,45,0.22)] text-[#D9DFDB]";
}

export default function PortalDocumentosPage() {
  const [state, setState] = useState(INITIAL_STATE);

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Documentos"
          description="Estante documental do cliente com organizacao por categoria, status e linha do tempo das entregas disponiveis no portal."
        >
          <DocumentosContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function DocumentosContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-documentos");
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            warning: payload.warning || null,
            items: payload.items || [],
            summary: payload.summary || null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ ...INITIAL_STATE, loading: false, error: error.message });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  const categories = useMemo(() => {
    const source = state.summary?.categorias || {};
    return Object.entries(source).sort((left, right) => right[1] - left[1]);
  }, [state.summary]);

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando documentos...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Documentos" value={state.summary?.total || 0} helper="Arquivos e registros visiveis no portal." />
        <StatCard label="Disponiveis" value={state.summary?.disponiveis || 0} helper="Itens prontos para consulta ou download." />
        <StatCard label="Pendentes" value={state.summary?.pendentes || 0} helper="Documentos aguardando conclusao ou assinatura." />
      </section>

      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{state.warning}</div> : null}

      {categories.length ? (
        <section className="rounded-[30px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Categorias da estante</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {categories.map(([category, count]) => (
              <span key={category} className="rounded-full border border-[#31463F] bg-[rgba(32,51,45,0.22)] px-4 py-2 text-xs uppercase tracking-[0.14em]">
                {category} • {count}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {!state.items.length ? (
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Estante vazia</p>
          <h3 className="mt-3 font-serif text-3xl">Nenhum documento disponivel no portal neste momento.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Quando os documentos do seu caso forem sincronizados, eles aparecerao aqui com categoria, status e acesso direto.
          </p>
        </div>
      ) : null}

      {state.items.length ? (
        <section className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Linha do tempo documental</p>
            <h3 className="mt-3 font-serif text-3xl">Ultimos documentos e entregas</h3>
          </div>

          <div className="space-y-4">
            {state.items.map((item) => (
              <article key={item.id} className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${statusStyle(item.status)}`}>
                        {item.status_label}
                      </span>
                      <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-75">
                        {item.category_label}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">
                        {formatDate(item.reference_date)}
                      </span>
                    </div>

                    <h3 className="font-serif text-2xl">{item.name}</h3>
                    {item.summary ? <p className="mt-3 text-sm leading-6 opacity-65">{item.summary}</p> : null}

                    <div className="mt-4 flex flex-wrap gap-4 text-sm opacity-65">
                      {item.process_id ? (
                        <Link href={`/portal/processos/detalhe?id=${encodeURIComponent(item.process_id)}`} prefetch={false} className="text-[#C49C56]">
                          Ver processo relacionado
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56]">
                      Abrir documento
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <p className="text-xs uppercase tracking-[0.2em] opacity-45">{label}</p>
      <p className="mt-4 font-serif text-5xl">{value}</p>
      <p className="mt-3 text-sm leading-6 opacity-60">{helper}</p>
    </div>
  );
}
