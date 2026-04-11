import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { clientFetch } from "../../lib/client/api";
import { sanitizePortalCopy } from "../../lib/client/portal-copy";

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
  linkedAccounts: [],
  diagnostics: null,
};

const SECTION_PAGE_SIZE = 6;
const DEAL_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "invoice", label: "Faturas" },
  { value: "subscription", label: "Assinaturas" },
  { value: "open", label: "Em aberto" },
  { value: "paid", label: "Pagos" },
];

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

function syncStatusStyle(status) {
  if (status === "freshsales_synced") return "border-[#2E5744] bg-[rgba(46,87,68,0.16)] text-[#C7F1D7]";
  return "border-[#6F5826] bg-[rgba(111,88,38,0.18)] text-[#F7E4A7]";
}

export default function PortalFinanceiroPage() {
  const [state, setState] = useState(INITIAL_STATE);

  return (
    <RequireClient>
      {(profile) => (
        <PortalLayout
          profile={profile}
          title="Financeiro"
          description="Acompanhe cobrancas, pagamentos e servicos financeiros vinculados ao seu atendimento e aos seus processos."
          breadcrumbs={[
            { href: "/portal", label: "Portal" },
            { label: "Financeiro" },
          ]}
          rightRailLabel="painel de apoio"
          rightRailDefaultOpen={false}
        >
          <FinanceiroContent profile={profile} state={state} setState={setState} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function FinanceiroContent({ profile, state, setState }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [visibleCounts, setVisibleCounts] = useState({
    invoices: SECTION_PAGE_SIZE,
    subscriptions: SECTION_PAGE_SIZE,
    refunds: SECTION_PAGE_SIZE,
    others: SECTION_PAGE_SIZE,
    filtered: SECTION_PAGE_SIZE,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await clientFetch("/api/client-financeiro");
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_financeiro_load",
            label: "Financeiro do portal carregado",
            module: "portal-financeiro",
            status: "success",
            path: "/portal/financeiro",
            response: `itens=${payload.items?.length || 0}, invoices=${payload.invoices?.length || 0}`,
            consolePane: ["routes", "crm"],
            domain: "portal",
            system: "financeiro",
          });
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
            linkedAccounts: payload.linked_accounts || [],
            diagnostics: payload.diagnostics || null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_financeiro_load",
            label: "Falha ao carregar financeiro do portal",
            module: "portal-financeiro",
            status: "error",
            path: "/portal/financeiro",
            error: error.message,
            consolePane: ["routes", "crm"],
            domain: "portal",
            system: "financeiro",
          });
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
      { label: "Lancamentos", value: summary.total_items || 0, helper: "Itens financeiros vinculados ao seu atendimento" },
      { label: "Faturas", value: summary.invoices || 0, helper: "Cobrancas associadas a processos ou servicos" },
      { label: "Planos", value: summary.subscriptions || 0, helper: "Servicos recorrentes identificados" },
      { label: "Em aberto", value: formatMoney(summary.open_amount || 0), helper: "Valor pendente estimado" },
    ];
  }, [state.summary]);

  const filteredDeals = useMemo(() => {
    if (activeFilter === "invoice") return state.items.filter((item) => item.kind === "invoice");
    if (activeFilter === "subscription") return state.items.filter((item) => item.kind === "subscription");
    if (activeFilter === "open") return state.items.filter((item) => ["aberto", "atrasado", "nao_pago"].includes(item.status));
    if (activeFilter === "paid") return state.items.filter((item) => item.status === "pago");
    return state.items;
  }, [activeFilter, state.items]);

  const isDevObserver = String(profile?.email || "").trim().toLowerCase() === "adrianohermida@gmail.com";

  useEffect(() => {
    if (state.loading) return;
    setModuleHistory(
      "portal-financeiro",
      buildModuleSnapshot("portal-financeiro", {
        routePath: "/portal/financeiro",
        status: state.error ? "error" : "ready",
        activeFilter,
        summary: state.summary,
        diagnostics: state.diagnostics,
        counts: {
          totalItems: state.items.length,
          invoices: state.invoices.length,
          subscriptions: state.subscriptions.length,
          others: state.others.length,
          filteredDeals: filteredDeals.length,
          linkedAccounts: state.linkedAccounts.length,
        },
        coverage: {
          hasItems: state.items.length > 0,
          hasWarning: Boolean(state.warning),
          hasDiagnostics: Boolean(state.diagnostics),
          hasLinkedAccounts: state.linkedAccounts.length > 0,
        },
      })
    );
  }, [activeFilter, filteredDeals.length, state.diagnostics, state.error, state.invoices.length, state.items.length, state.linkedAccounts.length, state.loading, state.others.length, state.subscriptions.length, state.summary, state.warning]);

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
        <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm leading-7">{sanitizePortalCopy(state.warning)}</div>
      ) : null}

      {isDevObserver ? (
        <section className="rounded-[28px] border border-[#35554B] bg-[rgba(11,24,21,0.72)] p-6">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">Modo dev do portal</p>
            <h3 className="mt-3 font-serif text-3xl">Leitura técnica da base financeira</h3>
            <p className="mt-3 text-sm leading-7 opacity-62">
              Este bloco aparece só para o usuário de observação técnica do portal e ajuda a validar se a leitura já está vindo da base canônica.
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Origem" value={state.diagnostics?.source || "n/d"} />
            <Metric label="Contacts encontrados" value={state.diagnostics?.contacts_found ?? 0} />
            <Metric label="Accounts ligados" value={state.diagnostics?.linked_accounts ?? 0} />
            <Metric label="Itens relacionados" value={state.diagnostics?.related_deals ?? 0} />
            <Metric label="Deals sincronizados" value={state.diagnostics?.freshsales_synced ?? 0} />
            <Metric label="Somente canonicos" value={state.diagnostics?.canonical_only ?? 0} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link
              href="/interno/financeiro"
              prefetch={false}
              className="inline-flex rounded-2xl border border-[#35554B] px-4 py-2 transition hover:border-[#C49C56] hover:text-[#C49C56]"
            >
              Abrir módulo interno financeiro
            </Link>
            <span className="inline-flex rounded-2xl border border-[#35554B] px-4 py-2 opacity-70">
              Base canônica: {state.summary?.total_items || 0} item(ns)
            </span>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm opacity-62">Filtrar itens:</p>
          {DEAL_FILTERS.map((option) => {
            const active = activeFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveFilter(option.value)}
                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.15em] transition ${
                  active
                    ? "border-[#C49C56] bg-[#C49C56] text-[#07110E]"
                    : "border-[#20332D] text-[#F4F1EA] hover:border-[#C49C56] hover:text-[#C49C56]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm opacity-62">Exibindo {Math.min(filteredDeals.length, visibleCounts.filtered)} de {filteredDeals.length} item(ns) no filtro atual.</p>
      </section>

      <FinanceSection
        title="Visao consolidada"
        description="Leitura geral com filtro rapido e contexto dos processos vinculados."
        items={filteredDeals}
        emptyMessage="Nenhum item encontrado para o filtro atual."
        visibleCount={visibleCounts.filtered}
        onLoadMore={() => setVisibleCounts((current) => ({ ...current, filtered: current.filtered + SECTION_PAGE_SIZE }))}
      />

      {!state.items.length ? (
        <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8 text-sm opacity-75">
          Nenhum item financeiro apareceu para o seu cadastro neste momento.
        </div>
      ) : null}

      {(state.linkedAccounts?.length || state.diagnostics) ? (
        <section className="rounded-[30px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">Processos vinculados</p>
            <h3 className="mt-3 font-serif text-3xl">Processos relacionados a esta area financeira</h3>
            <p className="mt-3 text-sm leading-7 opacity-62">
              Quando houver cobrancas ou servicos vinculados a processos especificos, voce pode identificá-los por aqui.
            </p>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {(state.linkedAccounts || []).map((account) => (
              <article key={account.id} className="rounded-[24px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-5">
                <p className="text-sm font-semibold">{account.name}</p>
                <p className="mt-2 text-xs opacity-60">{account.process_reference || "Sem referencia de processo"}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs opacity-70">
                  {account.status ? <span>Status: {account.status}</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <FinanceSection
        title="Faturas e cobrancas"
        description="Cobrancas e itens financeiros vinculados aos seus processos ou servicos."
        items={state.invoices}
        emptyMessage="Nenhuma fatura vinculada apareceu para este contato."
        visibleCount={visibleCounts.invoices}
        onLoadMore={() => setVisibleCounts((current) => ({ ...current, invoices: current.invoices + SECTION_PAGE_SIZE }))}
      />

      <FinanceSection
        title="Assinaturas e planos"
        description="Servicos recorrentes ou planos de acompanhamento financeiro."
        items={state.subscriptions}
        emptyMessage="Nenhuma assinatura ativa foi identificada para este contato."
        visibleCount={visibleCounts.subscriptions}
        onLoadMore={() => setVisibleCounts((current) => ({ ...current, subscriptions: current.subscriptions + SECTION_PAGE_SIZE }))}
      />

      {(state.summary?.refunds || 0) > 0 ? (
        <FinanceSection
          title="Reembolsos"
          description="Valores devolvidos ou creditos associados ao seu atendimento."
          items={state.items.filter((item) => item.kind === "refund")}
          emptyMessage=""
          visibleCount={visibleCounts.refunds}
          onLoadMore={() => setVisibleCounts((current) => ({ ...current, refunds: current.refunds + SECTION_PAGE_SIZE }))}
        />
      ) : null}

      {state.others.length ? (
        <FinanceSection
          title="Outros lancamentos"
          description="Itens financeiros ainda em classificacao ou sem categoria principal."
          items={state.others}
          emptyMessage=""
          visibleCount={visibleCounts.others}
          onLoadMore={() => setVisibleCounts((current) => ({ ...current, others: current.others + SECTION_PAGE_SIZE }))}
        />
      ) : null}

    </div>
  );
}

function FinanceSection({ title, description, items, emptyMessage, visibleCount = SECTION_PAGE_SIZE, onLoadMore }) {
  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleItems.length < items.length;

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
          {visibleItems.map((item) => (
            <article key={item.id} className="rounded-[30px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">{item.kind_label}</p>
                  <h4 className="mt-3 font-serif text-2xl">{item.title}</h4>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${statusStyle(item.status)}`}>
                    {item.status_label}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${syncStatusStyle(item.sync_status)}`}>
                    {item.sync_status_label}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Metric label="Valor" value={item.amount_label || "A definir"} />
                <Metric label="Data-base" value={formatDate(item.due_date)} />
                <Metric label="Estagio" value={item.stage || "A definir"} />
              </div>
              {item.freshsales_deal_id ? (
                <div className="mt-4 rounded-[20px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-4 text-sm opacity-75">
                  Deal Freshsales: {item.freshsales_deal_id}
                </div>
              ) : null}

              {item.process_account ? (
                <div className="mt-5 rounded-[24px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] opacity-45">Processo associado</p>
                  <p className="mt-3 text-lg font-semibold">{item.process_account.process_reference || item.process_account.name}</p>
                  <p className="mt-1 text-sm opacity-62">{item.process_account.status || item.process_account.name}</p>
                  <Link
                    href={`/portal/processos?account=${encodeURIComponent(item.process_account.id)}`}
                    prefetch={false}
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

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-2xl border border-[#20332D] px-5 py-3 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56]"
          >
            Carregar mais itens
          </button>
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
