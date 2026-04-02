import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { clientFetch } from "../../lib/client/api";

const INITIAL_STATE = {
  loading: true,
  error: null,
  warning: null,
  items: [],
  invoices: [],
  subscriptions: [],
  others: [],
  summary: null,
  mapping: null,
  fieldCatalog: null,
};

function formatMoney(value) {
  if (value == null || value === "") return "A definir";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "A definir";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("pt-BR");
}

function statusStyle(status) {
  if (status === "pago") return "border-[#0B6B53] bg-[rgba(11,107,83,0.16)] text-[#B9F3E0]";
  if (status === "ativa") return "border-[#1D4ED8] bg-[rgba(29,78,216,0.16)] text-[#DBEAFE]";
  if (status === "atrasado") return "border-[#8A2E2E] bg-[rgba(138,46,46,0.16)] text-[#FECACA]";
  if (status === "nao_pago") return "border-[#7C3A10] bg-[rgba(124,58,16,0.18)] text-[#FCD9B6]";
  if (status === "aberto") return "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#FDE68A]";
  if (status === "encerrado") return "border-[#3B4A45] bg-[rgba(59,74,69,0.2)] text-[#D1D5DB]";
  return "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#FDE68A]";
}

export default function PortalFinanceiroPage() {
  const [state, setState] = useState(INITIAL_STATE);

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Financeiro"
          description="Controle financeiro extraido dos negocios do Freshsales, com leitura de faturas, assinaturas e vinculo com processos quando o CRM estiver sincronizado."
        >
          <FinanceiroContent state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function FinanceiroContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-financeiro");
        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            warning: payload.warning || null,
            items: payload.items || [],
            invoices: payload.invoices || [],
            subscriptions: payload.subscriptions || [],
            others: payload.others || [],
            summary: payload.summary || null,
            mapping: payload.mapping || null,
            fieldCatalog: payload.field_catalog || null,
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

  const summaryCards = useMemo(() => {
    const summary = state.summary || {};
    return [
      { label: "Negocios financeiros", value: summary.total_items || 0, helper: "Deals pareados ao contato" },
      { label: "Faturas", value: summary.invoices || 0, helper: "Associadas a processo/account" },
      { label: "Assinaturas", value: summary.subscriptions || 0, helper: "Planos recorrentes identificados" },
      { label: "Em aberto", value: formatMoney(summary.open_amount || 0), helper: "Valor pendente estimado" },
    ];
  }, [state.summary]);

  if (state.loading) {
    return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando financeiro...</div>;
  }

  if (state.error) {
    return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {summaryCards.map((card) => (
          <article key={card.label} className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
            <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">{card.label}</p>
            <p className="mt-4 font-serif text-3xl">{card.value}</p>
            <p className="mt-2 text-sm opacity-60">{card.helper}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusSummaryCard label="Abertas" value={state.summary?.status_counts?.aberto || 0} status="aberto" />
        <StatusSummaryCard label="Pagas" value={state.summary?.status_counts?.pago || 0} status="pago" />
        <StatusSummaryCard label="Atrasadas" value={state.summary?.status_counts?.atrasado || 0} status="atrasado" />
        <StatusSummaryCard label="Nao pagas" value={state.summary?.status_counts?.nao_pago || 0} status="nao_pago" />
      </section>

      {state.warning ? (
        <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm leading-7">{state.warning}</div>
      ) : null}

      {!state.items.length ? (
        <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8 text-sm opacity-75">
          Nenhum negocio financeiro apareceu para o seu contato no Freshsales neste momento.
        </div>
      ) : null}

      <FinanceSection
        title="Faturas e cobrancas"
        description="Deals financeiros vinculados a processos/accounts do CRM."
        items={state.invoices}
        emptyMessage="Nenhuma fatura vinculada apareceu para este contato."
      />

      <FinanceSection
        title="Assinaturas e planos"
        description="Negocios recorrentes ou planos reconhecidos pelo catalogo de campos do Freshsales."
        items={state.subscriptions}
        emptyMessage="Nenhuma assinatura ativa foi identificada para este contato."
      />

      {(state.summary?.refunds || 0) > 0 ? (
        <FinanceSection
          title="Reembolsos"
          description="Deals classificados como reembolso no Freshsales."
          items={state.items.filter((item) => item.kind === "refund")}
          emptyMessage=""
        />
      ) : null}

      {state.others.length ? (
        <FinanceSection
          title="Outros negocios"
          description="Deals ainda sem classificacao segura entre fatura e assinatura."
          items={state.others}
          emptyMessage=""
        />
      ) : null}

      {state.mapping ? <MappingInsightCard mapping={state.mapping} /> : null}
      {state.fieldCatalog ? <FieldCatalogCard fieldCatalog={state.fieldCatalog} /> : null}
    </div>
  );
}

function FinanceSection({ title, description, items, emptyMessage }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="font-serif text-3xl">{title}</h3>
          <p className="text-sm opacity-62">{description}</p>
        </div>
        <p className="text-xs uppercase tracking-[0.16em] opacity-45">{items.length} item(ns)</p>
      </div>

      {!items.length ? (
        <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 text-sm opacity-70">{emptyMessage}</div>
      ) : null}

      {items.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-[30px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">{item.kind_label}</p>
                  <h4 className="mt-3 font-serif text-2xl">{item.title}</h4>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${statusStyle(item.status)}`}>
                  {item.status_label}
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Metric label="Valor" value={item.amount_label || "A definir"} />
                <Metric label="Data-base" value={formatDate(item.due_date)} />
                <Metric label="Estagio" value={item.stage || "A definir"} />
              </div>

              {item.process_account ? (
                <div className="mt-5 rounded-[24px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">Processo associado</p>
                  <p className="mt-3 text-lg font-semibold">{item.process_account.process_reference || item.process_account.name}</p>
                  <p className="mt-1 text-sm opacity-62">{item.process_account.status || item.process_account.name}</p>
                  <Link
                    href={`/portal/processos?account=${encodeURIComponent(item.process_account.id)}`}
                    className="mt-4 inline-flex rounded-2xl border border-[#20332D] px-4 py-2 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56]"
                  >
                    Ver area de processos
                  </Link>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[22px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 text-sm">{value}</p>
    </div>
  );
}

function StatusSummaryCard({ label, value, status }) {
  return (
    <article className={`rounded-[24px] border p-5 ${statusStyle(status)}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-3 font-serif text-3xl">{value}</p>
    </article>
  );
}

function FieldCatalogCard({ fieldCatalog }) {
  const groups = [
    { title: "Campos candidatos para tipo do deal", items: fieldCatalog.deal_type_candidates || [] },
    { title: "Campos candidatos para valor", items: fieldCatalog.amount_candidates || [] },
    { title: "Campos candidatos para processo/account", items: fieldCatalog.account_candidates || [] },
  ].filter((group) => group.items.length);

  if (!groups.length) return null;

  return (
    <section className="rounded-[30px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">Pareamento do modulo</p>
        <h3 className="mt-3 font-serif text-3xl">Campos identificados no Freshsales</h3>
        <p className="mt-3 text-sm leading-7 opacity-62">
          O portal esta lendo os fields sincronizados do modulo de deals e de accounts para melhorar o pareamento entre faturas, assinaturas e processos.
        </p>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <article key={group.title} className="rounded-[24px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-5">
            <h4 className="text-sm font-semibold">{group.title}</h4>
            <div className="mt-4 space-y-3">
              {group.items.slice(0, 5).map((item) => (
                <div key={`${item.key}-${item.label}`} className="rounded-2xl border border-[#20332D] px-4 py-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs opacity-55">{item.key}</p>
                  {item.samples?.length ? <p className="mt-2 text-xs opacity-70">{item.samples.join(" | ")}</p> : null}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MappingInsightCard({ mapping }) {
  const cards = [
    {
      title: "Campo escolhido para fatura x assinatura",
      field: mapping.deal_type_field,
      helper: "O classificador usa este field como principal para separar deals recorrentes de cobrancas pontuais.",
    },
    {
      title: "Campo escolhido para processo no account",
      field: mapping.process_reference_field,
      helper: "Esse campo tende a carregar o numero do processo ou a referencia principal do sales account.",
    },
    {
      title: "Campo escolhido para status do account",
      field: mapping.account_status_field,
      helper: "Esse field ajuda a contextualizar a situacao do processo vinculado.",
    },
    {
      title: "Campo escolhido para estagio do deal",
      field: mapping.deal_stage_field,
      helper: "Os valores observados abaixo orientam a traducao para pago, em aberto e cancelado.",
    },
  ].filter((item) => item.field);

  const stageRows = [
    { title: "Pago", items: mapping.stage_semantics?.pago || [] },
    { title: "Em aberto", items: mapping.stage_semantics?.em_aberto || [] },
    { title: "Cancelado", items: mapping.stage_semantics?.cancelado || [] },
  ].filter((group) => group.items.length);

  if (!cards.length && !stageRows.length) return null;

  return (
    <section className="rounded-[30px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">Mapeamento automatico</p>
        <h3 className="mt-3 font-serif text-3xl">Leitura real dos fields do Freshsales</h3>
        <p className="mt-3 text-sm leading-7 opacity-62">
          Abaixo esta a escolha automatica do portal para classificar assinatura, fatura, processo vinculado e significado dos estagios do deal.
        </p>
      </div>

      {cards.length ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <article key={card.title} className="rounded-[24px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-5">
              <p className="text-sm font-semibold">{card.title}</p>
              <p className="mt-3 text-lg">{card.field.label}</p>
              <p className="mt-1 text-xs opacity-55">{card.field.key}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.14em] opacity-45">
                {card.field.source === "config" ? "Travado por configuracao" : "Selecionado por inferencia"}
              </p>
              <p className="mt-3 text-sm opacity-68">{card.helper}</p>
            </article>
          ))}
        </div>
      ) : null}

      {stageRows.length ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {stageRows.map((group) => (
            <article key={group.title} className="rounded-[24px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-5">
              <p className="text-sm font-semibold">{group.title}</p>
              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <div key={`${group.title}-${item.value}`} className="rounded-2xl border border-[#20332D] px-4 py-3">
                    <p className="text-sm">{item.value}</p>
                    <p className="mt-1 text-xs opacity-55">{item.occurrences} ocorrencia(s)</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
