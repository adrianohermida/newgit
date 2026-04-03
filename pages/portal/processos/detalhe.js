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
    audiencias: [],
    documents: [],
    warnings: [],
  });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Detalhe do processo"
          description="Painel de acompanhamento processual com capa, partes, andamentos e publicacoes relevantes do seu caso."
          breadcrumbs={[
            { href: "/portal", label: "Portal" },
            { href: "/portal/processos", label: "Processos" },
            { label: "Detalhe" },
          ]}
          actions={
            <Link href="/portal/processos" prefetch={false} className="rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56]">
              Voltar aos processos
            </Link>
          }
          rightRail={<ProcessDetailRightRail state={state} />}
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
            audiencias: payload.audiencias || [],
            documents: payload.documents || [],
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
            audiencias: [],
            documents: [],
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
      audiencias: state.audiencias.length,
      documents: state.documents.length,
    };
  }, [state.audiencias.length, state.documents.length, state.movements.length, state.parts.length, state.publications.length]);

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

      <section className="grid gap-4 md:grid-cols-5">
        <StatCard label="Partes" value={summary.parts} helper="Partes processuais identificadas." />
        <StatCard label="Andamentos" value={summary.movements} helper="Atos e movimentacoes sincronizados." />
        <StatCard label="Publicacoes" value={summary.publications} helper="Recortes e atos publicados." />
        <StatCard label="Audiencias" value={summary.audiencias} helper="Audiencias vinculadas ao processo." />
        <StatCard label="Documentos" value={summary.documents} helper="Documentos exibidos no portal." />
      </section>

      {state.process.total_related ? (
        <section className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Arvore processual</p>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-semibold">Processos principais relacionados</p>
              {!state.process.parent_links?.length ? <EmptyText>Nenhum processo principal vinculado.</EmptyText> : null}
              {(state.process.parent_links || []).map((relation) => (
                <RelationCard key={`parent-${relation.id}`} relation={relation} />
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold">Dependencias, apensos, incidentes e recursos</p>
              {!state.process.child_links?.length ? <EmptyText>Nenhum processo relacionado abaixo deste principal.</EmptyText> : null}
              {(state.process.child_links || []).map((relation) => (
                <RelationCard key={`child-${relation.id}`} relation={relation} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {(state.process.latest_movement || state.process.latest_publication || state.process.alerts?.length) ? (
        <section className="grid gap-4 xl:grid-cols-3">
          {state.process.latest_movement ? (
            <HighlightCard
              label="Ultimo andamento"
              title={state.process.latest_movement.title}
              helper={(state.process.latest_movement.summary || "").trim() || formatDate(state.process.latest_movement.date, true)}
            />
          ) : null}
          {state.process.latest_publication ? (
            <HighlightCard
              label="Ultima publicacao"
              title={state.process.latest_publication.title}
              helper={(state.process.latest_publication.summary || "").trim() || formatDate(state.process.latest_publication.date)}
            />
          ) : null}
          {state.process.alerts?.length ? (
            <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Alertas do processo</p>
              <div className="mt-4 space-y-3">
                {state.process.alerts.map((alert) => (
                  <div key={alert.label} className="rounded-2xl border border-[#20332D] bg-black/10 px-4 py-3">
                    <p className="text-sm font-semibold">{alert.label}</p>
                    <p className="mt-1 text-sm opacity-65">{alert.helper}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

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

      <section className="grid gap-6">
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
      </section>
    </div>
  );
}

function RailPanel({ title, helper, children, defaultOpen = true }) {
  return (
    <details open={defaultOpen} className="group rounded-[24px] border border-[#20332D] bg-[rgba(255,255,255,0.02)]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {helper ? <p className="mt-1 text-xs leading-5 opacity-55">{helper}</p> : null}
        </div>
        <span className="text-xs uppercase tracking-[0.16em] opacity-45 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-[#20332D] px-5 py-4">{children}</div>
    </details>
  );
}

function ProcessDetailRightRail({ state }) {
  return (
    <div className="space-y-4">
      <RailPanel title="Widget Freshsales" helper="Reserva para CRM, sincronizacoes e suporte contextual.">
        <div className="rounded-[20px] border border-dashed border-[#2F4B43] bg-[rgba(7,17,14,0.55)] p-4 text-sm opacity-68">
          O painel lateral esta preparado para widgets do Freshsales e componentes externos de apoio ao processo.
        </div>
      </RailPanel>

      <RailPanel title="Audiencias" helper="Compromissos e marcos vinculados ao processo.">
        <div className="space-y-4">
          {!state.audiencias.length ? <EmptyText>Nenhuma audiencia vinculada a este processo.</EmptyText> : null}
          {state.audiencias.map((audiencia) => (
            <article key={audiencia.id} className="rounded-2xl border border-[#20332D] bg-black/10 p-4">
              <p className="text-sm font-semibold">{audiencia.title}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-45">{formatDate(audiencia.date, true)}</p>
              {audiencia.summary ? <p className="mt-3 text-sm leading-6 opacity-65">{audiencia.summary}</p> : null}
            </article>
          ))}
        </div>
      </RailPanel>

      <RailPanel title="Publicacoes vinculadas" helper="Atualizacoes, recortes e publicacoes relacionadas ao caso.">
        <div className="space-y-4">
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
      </RailPanel>

      <RailPanel title="Documentos vinculados" helper="Arquivos e comprovantes associados ao processo.">
        <div className="space-y-4">
          {!state.documents.length ? <EmptyText>Nenhum documento vinculado a este processo.</EmptyText> : null}
          {state.documents.map((document) => (
            <article key={document.id} className="rounded-2xl border border-[#20332D] bg-black/10 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold">{document.name}</p>
                {document.status_label ? (
                  <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
                    {document.status_label}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-45">{formatDate(document.reference_date)}</p>
              {document.summary ? <p className="mt-3 text-sm leading-6 opacity-65">{document.summary}</p> : null}
              {document.url ? <a href={document.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-[#C49C56]">Abrir documento</a> : null}
            </article>
          ))}
        </div>
      </RailPanel>
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

function HighlightCard({ label, title, helper }) {
  return (
    <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">{label}</p>
      <p className="mt-4 text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 opacity-65">{helper}</p>
    </div>
  );
}

function RelationCard({ relation }) {
  return (
    <div className="rounded-2xl border border-[#20332D] bg-black/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
          {relation.type_label}
        </span>
        <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
          {relation.status}
        </span>
      </div>
      <p className="mt-3 font-mono text-sm">{relation.number}</p>
      <p className="mt-2 text-sm font-semibold">{relation.title || "Processo relacionado"}</p>
      {relation.observacoes ? <p className="mt-2 text-sm opacity-65">{relation.observacoes}</p> : null}
      {relation.process_id ? (
        <Link
          href={`/portal/processos/detalhe?id=${encodeURIComponent(relation.process_id)}`}
          prefetch={false}
          className="mt-3 inline-flex text-sm text-[#C49C56]"
        >
          Abrir processo relacionado
        </Link>
      ) : null}
    </div>
  );
}
