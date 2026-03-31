import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import PortalLayout from "../../../components/portal/PortalLayout";
import RequireClient from "../../../components/portal/RequireClient";
import { clientFetch } from "../../../lib/client/api";

function formatDate(value, withTime = false) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export default function PortalProcessDetailPage() {
  const router = useRouter();
  const processId = String(router.query.id || "").trim();
  const [state, setState] = useState({
    loading: true,
    error: null,
    process: null,
    parts: [],
    movements: [],
    publications: [],
    warnings: [],
  });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Detalhe do processo"
          description="Painel de acompanhamento processual com capa, partes, andamentos e publicacoes relevantes do seu caso."
          actions={
            <Link href="/portal/processos" prefetch={false} className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56]">
              Voltar aos processos
            </Link>
          }
        >
          <ProcessDetailContent processId={processId} state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function ProcessDetailContent({ processId, state, setState }) {
  useEffect(() => {
    if (!processId) {
      setState((current) => ({ ...current, loading: false, error: "Informe o identificador do processo." }));
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch(`/api/client-processo?id=${encodeURIComponent(processId)}`);
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            process: payload.process,
            parts: payload.parts || [],
            movements: payload.movements || [],
            publications: payload.publications || [],
            warnings: payload.warnings || [],
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error.message,
            process: null,
            parts: [],
            movements: [],
            publications: [],
            warnings: [],
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [processId, setState]);

  const summary = useMemo(() => {
    return {
      parts: state.parts.length,
      movements: state.movements.length,
      publications: state.publications.length,
    };
  }, [state.movements.length, state.parts.length, state.publications.length]);

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando detalhe do processo...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  if (!state.process) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">Processo nao encontrado para o cadastro autenticado.</div>;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>
            {state.process.court || "Tribunal"}
          </span>
          <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
            {state.process.status}
          </span>
        </div>
        <h3 className="font-serif text-4xl">{state.process.title}</h3>
        <p className="mt-3 font-mono text-sm opacity-55">{state.process.number || "Numero nao disponivel"}</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Meta label="Polo ativo" value={state.process.polo_ativo || "Nao identificado"} />
          <Meta label="Polo passivo" value={state.process.polo_passivo || "Nao identificado"} />
          <Meta label="Classe" value={state.process.classe || state.process.area || "Nao informada"} />
          <Meta label="Distribuicao" value={formatDate(state.process.filed_at)} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Partes" value={summary.parts} helper="Partes processuais identificadas." />
        <StatCard label="Andamentos" value={summary.movements} helper="Atos e movimentacoes sincronizados." />
        <StatCard label="Publicacoes" value={summary.publications} helper="Recortes e atos publicados." />
      </section>

      {state.warnings.length ? (
        <section className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#F2DEB5]">Avisos da fonte</p>
          <div className="space-y-2 text-sm">
            {state.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Partes do processo</p>
          <div className="mt-5 space-y-4">
            {!state.parts.length ? <EmptyText>Nenhuma parte visivel nesta sincronizacao.</EmptyText> : null}
            {state.parts.map((part) => (
              <div key={part.id} className="rounded-2xl border border-[#20332D] bg-black/10 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold">{part.name}</p>
                  <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
                    {part.role}
                  </span>
                  {part.is_client ? (
                    <span className="rounded-full border border-[#24533D] bg-[rgba(19,72,49,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#B8F0D5]">
                      Cliente identificado
                    </span>
                  ) : null}
                </div>
                {part.document ? <p className="mt-2 text-sm opacity-55">{part.document}</p> : null}
                {part.lawyers?.length ? (
                  <div className="mt-3 space-y-2 text-sm opacity-68">
                    {part.lawyers.map((lawyer, index) => (
                      <p key={`${part.id}-${index}`}>{lawyer.nome || lawyer.nome_completo || lawyer.oab || "Advogado vinculado"}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Andamentos recentes</p>
            <div className="mt-5 space-y-5">
              {!state.movements.length ? <EmptyText>Nenhum andamento sincronizado ainda.</EmptyText> : null}
              {state.movements.map((movement) => (
                <div key={movement.id} className="border-l-2 border-[#C49C56] pl-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] opacity-45">{formatDate(movement.date, true)}</p>
                  <p className="mt-2 text-sm font-semibold">{movement.title}</p>
                  {movement.body ? <p className="mt-2 text-sm leading-6 opacity-65">{movement.body}</p> : null}
                  {movement.source ? <p className="mt-2 text-xs opacity-45">Fonte: {movement.source}</p> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Publicacoes vinculadas</p>
              <Link href="/portal/publicacoes" prefetch={false} className="text-sm text-[#C49C56]">
                Ver todas
              </Link>
            </div>
            <div className="mt-5 space-y-4">
              {!state.publications.length ? <EmptyText>Nenhuma publicacao vinculada a este processo.</EmptyText> : null}
              {state.publications.map((publication) => (
                <article key={publication.id} className="rounded-2xl border border-[#20332D] bg-black/10 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold">{publication.title}</p>
                    {publication.status ? (
                      <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
                        {publication.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-45">{formatDate(publication.date)}</p>
                  {publication.summary ? <p className="mt-3 text-sm leading-6 opacity-65">{publication.summary}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {publication.source ? <span className="opacity-45">Fonte: {publication.source}</span> : null}
                    {publication.url ? (
                      <a href={publication.url} target="_blank" rel="noreferrer" className="text-[#C49C56]">
                        Abrir publicacao
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
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

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 leading-6">{value}</p>
    </div>
  );
}

function EmptyText({ children }) {
  return <p className="text-sm leading-6 opacity-62">{children}</p>;
}
