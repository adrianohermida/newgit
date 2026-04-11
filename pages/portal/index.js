import { useEffect, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { clientFetch } from "../../lib/client/api";
import { sanitizePortalList } from "../../lib/client/portal-copy";

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-[24px] border border-[#1F302B] bg-[rgba(255,255,255,0.02)] p-5 transition hover:border-[#35554A]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-4xl font-semibold tracking-[-0.04em] text-[#F8F4EB]">{value}</p>
        <span className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#C49C56]">Ativo</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#95A8A2]">{helper}</p>
    </div>
  );
}

function QuickPill({ label, value }) {
  return (
    <div className="rounded-[18px] border border-[#243732] bg-[rgba(8,15,13,0.6)] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#82958F]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#F8F4EB]">{value}</p>
    </div>
  );
}

export default function PortalHomePage() {
  const [state, setState] = useState({ loading: true, summary: null, coverage: null, warnings: [], recentActivity: [], attentionItems: [], error: null });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Visao geral"
          description="Seu workspace central para acompanhar consultas, suporte, documentos e a ativacao progressiva do portal do cliente."
          breadcrumbs={[{ label: "Portal" }]}
        >
          <OverviewContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function OverviewContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-summary");
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_summary_load",
            label: "Portal carregado",
            module: "portal-home",
            status: "success",
            path: "/portal",
            response: `summary=${payload.summary?.processos || 0} processos, ${payload.summary?.tickets || 0} tickets`,
          });
          setState({
            loading: false,
            summary: payload.summary,
            coverage: payload.coverage || null,
            warnings: sanitizePortalList(payload.warnings || []),
            recentActivity: payload.recentActivity || [],
            attentionItems: payload.attentionItems || [],
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_summary_load",
            label: "Falha ao carregar portal",
            module: "portal-home",
            status: "error",
            path: "/portal",
            error: error.message,
          });
          setState({ loading: false, summary: null, coverage: null, warnings: [], recentActivity: [], attentionItems: [], error: error.message });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  if (state.loading) {
    return <div className="rounded-[24px] border border-[#1F302B] bg-[rgba(255,255,255,0.02)] p-6">Carregando resumo do portal...</div>;
  }

  if (state.error) {
    return <div className="rounded-[24px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  }

  const summary = state.summary || { processos: 0, tickets: 0, consultas: 0, documentos: 0, financeiro: 0, publicacoes: 0 };
  const coverage = state.coverage || {
    total: summary.processos || 0,
    withAccount: 0,
    withoutAccount: 0,
    withMovements: 0,
    withPublications: 0,
    baseCovered: 0,
    baseCoverageRate: 0,
    crmCoverageRate: 0,
  };

  useEffect(() => {
    if (state.loading) return;
    setModuleHistory(
      "portal-home",
      buildModuleSnapshot("portal-home", {
        routePath: "/portal",
        status: state.error ? "error" : "ready",
        summary,
        coverageOverview: coverage,
        warningsCount: state.warnings.length,
        recentActivityCount: state.recentActivity.length,
        attentionItemsCount: state.attentionItems.length,
        coverage: {
          hasWarnings: state.warnings.length > 0,
          hasRecentActivity: state.recentActivity.length > 0,
          hasAttentionItems: state.attentionItems.length > 0,
        },
      })
    );
  }, [coverage, state.attentionItems.length, state.error, state.loading, state.recentActivity.length, state.warnings.length, summary]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="rounded-[28px] border border-[#1F302B] bg-[linear-gradient(135deg,rgba(196,156,86,0.08),rgba(255,255,255,0.02)_42%,rgba(255,255,255,0.01))] p-6 md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C49C56]">Workspace do cliente</p>
              <h3 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[#F8F4EB] md:text-[36px]">
                Tudo o que precisa da sua atencao, sem perder o contexto do caso.
              </h3>
              <p className="mt-4 text-sm leading-7 text-[#99ADA6]">
                O portal centraliza processos, consultas, solicitacoes, publicacoes e documentos em uma estrutura continua de acompanhamento.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:w-[280px]">
              <QuickPill label="Processos" value={summary.processos} />
              <QuickPill label="Consultas" value={summary.consultas} />
              <QuickPill label="Solicitacoes" value={summary.tickets} />
              <QuickPill label="Docs" value={summary.documentos} />
            </div>
          </div>
        </div>

        <section className="rounded-[28px] border border-[#1F302B] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C49C56]">Sua atencao agora</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#F8F4EB]">Prioridades do portal</h3>
            </div>
            <Link href="/portal/processos" prefetch={false} className="text-sm text-[#C49C56]">
              Abrir acompanhamento
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {!state.attentionItems.length ? (
              <p className="text-sm leading-6 text-[#95A8A2]">Quando houver alguma pendencia, publicacao recente ou cobranca em aberto, ela aparece aqui.</p>
            ) : null}
            {state.attentionItems.map((item) => (
              <Link key={item.id} href={item.href} prefetch={false} className={`block rounded-[20px] border px-4 py-4 transition hover:border-[#C49C56] ${attentionTone(item.tone)}`}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-2 text-sm text-[#A2B5AF]">{item.helper}</p>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Processos" value={summary.processos} helper="Acompanhamento processual liberado conforme a fonte de dados do cliente." />
        <StatCard label="Solicitacoes" value={summary.tickets} helper="Pedidos e atendimentos abertos no seu portal." />
        <StatCard label="Consultas" value={summary.consultas} helper="Leitura real dos agendamentos ja registrados no site." />
        <StatCard label="Documentos" value={summary.documentos} helper="Estante documental ligada progressivamente conforme o projeto." />
        <StatCard label="Publicacoes" value={summary.publicacoes} helper="Atos e publicacoes judiciais vinculados aos seus processos." />
      </section>

      <section className="rounded-[28px] border border-[#1F302B] bg-[rgba(255,255,255,0.02)] p-6">
        <div className="flex flex-col gap-3 border-b border-[#1F302B] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Cobertura da carteira</p>
            <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[#F8F4EB]">Quanto do Freshsales ja esta refletido nos seus processos</h3>
          </div>
          <span className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#C49C56]">
            Base {coverage.baseCoverageRate}%
          </span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Com account" value={coverage.withAccount} helper={`Cobertura CRM ${coverage.crmCoverageRate}% da carteira.`} />
          <StatCard label="Com movimentos" value={coverage.withMovements} helper="Processos com andamentos visiveis no portal ou no CRM." />
          <StatCard label="Com publicacoes" value={coverage.withPublications} helper="Processos com publicacoes recentes refletidas no acompanhamento." />
          <StatCard label="Base coberta" value={coverage.baseCovered} helper="Processos com account e algum sinal operacional util no Freshsales/base judicial." />
        </div>
      </section>

      {state.warnings.length ? (
        <section className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#F2DEB5]">Avisos do portal</p>
          <div className="space-y-3 text-sm text-[#F0E3C7]">
            {state.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-[28px] border border-[#1F302B] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="flex flex-col gap-3 border-b border-[#1F302B] pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Atividade recente</p>
              <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[#F8F4EB]">O que mudou no seu acompanhamento</h3>
            </div>
            <Link href="/portal/processos" prefetch={false} className="text-sm text-[#C49C56]">
              Ver carteira processual
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {!state.recentActivity.length ? (
              <p className="text-sm leading-6 text-[#95A8A2]">Assim que houver atos, publicacoes ou consultas recentes, o portal resume tudo aqui.</p>
            ) : null}
            {state.recentActivity.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className="block rounded-[22px] border border-[#1F302B] bg-[rgba(255,255,255,0.015)] px-4 py-4 transition hover:border-[#C49C56]"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C49C56]">{item.type}</p>
                    <p className="mt-2 text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-[#99ADA6]">{item.helper}</p>
                  </div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#7D908A]">{item.date ? formatDate(item.date) : "Sem data"}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-[#1F302B] bg-[rgba(255,255,255,0.02)] p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Acoes rapidas</p>
            <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[#F8F4EB]">Continue de onde parou</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {[
              { href: "/portal/processos", label: "Abrir processos", helper: "Veja sua carteira processual e acompanhe atos." },
              { href: "/portal/publicacoes", label: "Abrir publicacoes", helper: "Leia os atos judiciais mais recentes do acervo." },
              { href: "/portal/consultas", label: "Abrir consultas", helper: "Veja horarios e novos atendimentos." },
              { href: "/portal/tickets", label: "Abrir solicitacoes", helper: "Acompanhe pedidos e envie nova solicitacao ao escritorio." },
              { href: "/portal/perfil", label: "Abrir perfil", helper: "Atualize dados essenciais do cadastro." },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="block rounded-[22px] border border-[#1F302B] bg-[rgba(255,255,255,0.015)] px-4 py-4 transition hover:border-[#C49C56]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-2 text-sm text-[#98ACA5]">{item.helper}</p>
                  </div>
                  <span className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#C49C56]">Abrir</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function attentionTone(tone) {
  if (tone === "critical") return "border-[#8A2E2E] bg-[rgba(138,46,46,0.14)]";
  if (tone === "warning") return "border-[#7A5C20] bg-[rgba(122,92,32,0.18)]";
  if (tone === "info") return "border-[#375B78] bg-[rgba(31,67,96,0.18)]";
  return "border-[#22342F] bg-[rgba(255,255,255,0.02)]";
}
