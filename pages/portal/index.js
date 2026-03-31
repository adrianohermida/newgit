import { useEffect, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <p className="text-xs uppercase tracking-[0.2em] opacity-45">{label}</p>
      <p className="mt-4 font-serif text-5xl">{value}</p>
      <p className="mt-3 text-sm leading-6 opacity-60">{helper}</p>
    </div>
  );
}

export default function PortalHomePage() {
  const [state, setState] = useState({ loading: true, summary: null, warnings: [], error: null });

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Visao geral"
          description="Seu painel central para acompanhar consultas, suporte, documentos e a ativacao progressiva do portal do cliente."
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
          setState({ loading: false, summary: payload.summary, warnings: payload.warnings || [], error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, summary: null, warnings: [], error: error.message });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  if (state.loading) {
    return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando resumo do portal...</div>;
  }

  if (state.error) {
    return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  }

  const summary = state.summary || { processos: 0, tickets: 0, consultas: 0, documentos: 0, financeiro: 0 };

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Processos" value={summary.processos} helper="Acompanhamento processual liberado conforme a fonte de dados do cliente." />
        <StatCard label="Tickets" value={summary.tickets} helper="Interacoes de suporte abertas no Freshdesk para seu e-mail." />
        <StatCard label="Consultas" value={summary.consultas} helper="Leitura real dos agendamentos ja registrados no site." />
        <StatCard label="Documentos" value={summary.documentos} helper="Estante documental ligada progressivamente conforme o projeto." />
      </section>

      {state.warnings.length ? (
        <section className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#F2DEB5]">Avisos do portal</p>
          <div className="space-y-3 text-sm opacity-80">
            {state.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/portal/consultas", label: "Abrir consultas", helper: "Veja seus horarios e agende novos atendimentos." },
          { href: "/portal/tickets", label: "Abrir suporte", helper: "Acompanhe chamados e envie uma nova solicitacao." },
          { href: "/portal/documentos", label: "Abrir documentos", helper: "Estante documental e futuros envios do portal." },
          { href: "/portal/perfil", label: "Abrir perfil", helper: "Atualize dados essenciais do seu cadastro." },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 transition hover:border-[#C49C56]"
          >
            <h3 className="font-serif text-2xl">{item.label}</h3>
            <p className="mt-3 text-sm leading-6 opacity-62">{item.helper}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
