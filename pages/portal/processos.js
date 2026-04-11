import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import PortalLayout from "../../components/portal/PortalLayout";
import RequireClient from "../../components/portal/RequireClient";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";
import { clientFetch } from "../../lib/client/api";
import { sanitizePortalCopy } from "../../lib/client/portal-copy";

const PAGE_SIZE = 8;
const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "ativo", label: "Ativos" },
  { value: "baixado", label: "Baixados" },
  { value: "suspenso", label: "Suspensos" },
];

function normalizeStatusFilterValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["ativo", "ativos"].includes(normalized)) return "ativo";
  if (["baixado", "baixados", "arquivado", "arquivados", "encerrado", "encerrados"].includes(normalized)) return "baixado";
  if (["suspenso", "suspensos", "sobrestado", "sobrestados"].includes(normalized)) return "suspenso";
  return normalized;
}

function matchesStatusFilter(item, selectedStatus) {
  const normalizedFilter = normalizeStatusFilterValue(selectedStatus);
  if (!normalizedFilter) return true;
  const statusGroup = String(item?.status_group || "").trim().toLowerCase();
  const status = String(item?.status || "").trim().toLowerCase();
  if (normalizedFilter === "ativo") {
    return statusGroup === "ativo" || (!statusGroup && !/(baixado|arquivad|encerrad|extint|suspens|sobrestad)/.test(status));
  }
  if (normalizedFilter === "baixado") {
    return statusGroup === "baixado" || /(baixado|arquivad|encerrad|extint)/.test(status);
  }
  if (normalizedFilter === "suspenso") {
    return statusGroup === "suspenso" || /(suspens|sobrestad)/.test(status);
  }
  return statusGroup === normalizedFilter || status.includes(normalizedFilter);
}

function formatDate(value) {
  if (!value) return "Sem atualizacao";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function summarizeCoverage(items = []) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const total = safeItems.length;
  const withAccount = safeItems.filter((item) => item.account_id_freshsales).length;
  const withMovements = safeItems.filter((item) => Number(item?.movement_count || 0) > 0 || item?.latest_movement).length;
  const withPublications = safeItems.filter((item) => item?.latest_publication).length;
  const baseCovered = safeItems.filter((item) => item.account_id_freshsales && (Number(item?.movement_count || 0) > 0 || item?.latest_movement || item?.latest_publication)).length;
  return {
    total,
    withAccount,
    withMovements,
    withPublications,
    baseCovered,
    baseCoverageRate: total ? Math.round((baseCovered / total) * 100) : 0,
  };
}

export default function PortalProcessosPage() {
  const router = useRouter();
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
          title="Processos"
          description="Acompanhe sua carteira processual, veja atos recentes e abra o detalhe do caso quando houver informacoes disponiveis."
          rightRailLabel="painel de apoio"
          rightRailDefaultOpen={false}
        >
          <ProcessosContent state={state} setState={setState} router={router} />
        </PortalLayout>
      )}
    </RequireClient>
  );
}

function ProcessosContent({ state, setState, router }) {
  const [selectedStatus, setSelectedStatus] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    setSelectedStatus(normalizeStatusFilterValue(router.query.status));
  }, [router.isReady, router.query.status]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const normalizedStatus = normalizeStatusFilterValue(selectedStatus);
        const statusParam = normalizedStatus ? `&status=${encodeURIComponent(normalizedStatus)}` : "";
        const payload = await clientFetch(`/api/client-processos?page=1&pageSize=${PAGE_SIZE}${statusParam}`);
        const incomingItems = Array.isArray(payload.items) ? payload.items : [];
        const safeItems = incomingItems.filter((item) => matchesStatusFilter(item, normalizedStatus));
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_processos_load",
            label: "Carteira processual carregada",
            module: "portal-processos",
            status: "success",
            path: "/portal/processos",
            response: `itens=${safeItems.length}, filtro=${normalizedStatus || "todos"}`,
            consolePane: "routes",
            domain: "portal",
            system: "processos",
          });
          setState({
            loading: false,
            loadingMore: false,
            error: null,
            warning: payload.warning || null,
            items: safeItems,
            pagination: payload.pagination || { page: 1, pageSize: PAGE_SIZE, total: safeItems.length, totalPages: 1, hasMore: false },
          });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            type: "ui",
            action: "portal_processos_load",
            label: "Falha ao carregar carteira processual",
            module: "portal-processos",
            status: "error",
            path: "/portal/processos",
            error: error.message,
            consolePane: "routes",
            domain: "portal",
            system: "processos",
          });
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
  }, [selectedStatus, setState]);

  async function loadMore() {
    if (state.loadingMore || !state.pagination?.hasMore) return;

    setState((current) => ({ ...current, loadingMore: true }));

    try {
      const nextPage = (state.pagination?.page || 1) + 1;
      const normalizedStatus = normalizeStatusFilterValue(selectedStatus);
      const statusParam = normalizedStatus ? `&status=${encodeURIComponent(normalizedStatus)}` : "";
      const payload = await clientFetch(`/api/client-processos?page=${nextPage}&pageSize=${state.pagination?.pageSize || PAGE_SIZE}${statusParam}`);
      const incomingItems = Array.isArray(payload.items) ? payload.items : [];
      const safeItems = incomingItems.filter((item) => matchesStatusFilter(item, normalizedStatus));
      appendActivityLog({
        type: "ui",
        action: "portal_processos_load_more",
        label: "Mais processos carregados",
        module: "portal-processos",
        status: "success",
        path: "/portal/processos",
        response: `pagina=${nextPage}, itens=${safeItems.length}`,
        consolePane: "jobs",
        domain: "portal",
        system: "processos",
      });
      setState((current) => ({
        ...current,
        loading: false,
        loadingMore: false,
        error: null,
        warning: payload.warning || current.warning || null,
        items: [...current.items, ...safeItems],
        pagination: payload.pagination || current.pagination,
      }));
    } catch (error) {
      appendActivityLog({
        type: "ui",
        action: "portal_processos_load_more",
        label: "Falha ao carregar mais processos",
        module: "portal-processos",
        status: "error",
        path: "/portal/processos",
        error: error.message,
        consolePane: "jobs",
        domain: "portal",
        system: "processos",
      });
      setState((current) => ({ ...current, loadingMore: false, error: error.message }));
    }
  }

  const stats = useMemo(() => {
    const coverage = summarizeCoverage(state.items);
    return {
      total: state.pagination?.total || state.items.length,
      active: state.items.filter((item) => !String(item.status || "").toLowerCase().includes("arquiv")).length,
      withActs: state.items.filter((item) => item.movement_count > 0).length,
      withAccount: coverage.withAccount,
      withPublications: coverage.withPublications,
      baseCoverageRate: coverage.baseCoverageRate,
    };
  }, [state.items]);

  function handleStatusChange(nextStatus) {
    const normalizedStatus = normalizeStatusFilterValue(nextStatus);
    appendActivityLog({
      type: "ui",
      action: "portal_processos_filter_change",
      label: "Filtro de processos alterado",
      module: "portal-processos",
      status: "success",
      path: "/portal/processos",
      response: `status=${normalizedStatus || "todos"}`,
      consolePane: "activity",
      domain: "portal",
      system: "processos",
    });
    setSelectedStatus(normalizedStatus);
    const nextQuery = { ...router.query };
    if (normalizedStatus) {
      nextQuery.status = normalizedStatus;
    } else {
      delete nextQuery.status;
    }
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }

  useEffect(() => {
    if (state.loading) return;
    setModuleHistory(
      "portal-processos",
      buildModuleSnapshot("portal-processos", {
        routePath: "/portal/processos",
        status: state.error ? "error" : "ready",
        selectedStatus: selectedStatus || "todos",
        stats,
        visibleItems: state.items.length,
        pagination: state.pagination,
        warning: state.warning || null,
        coverage: {
          hasItems: state.items.length > 0,
          hasWarning: Boolean(state.warning),
          hasMore: Boolean(state.pagination?.hasMore),
        },
      })
    );
  }, [selectedStatus, state.error, state.items.length, state.loading, state.pagination, state.warning, stats]);

  if (state.loading) return <div className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6">Carregando modulo...</div>;
  if (state.error) return <div className="rounded-[28px] border border-[#7f1d1d] bg-[rgba(127,29,29,0.18)] p-6 text-sm">{state.error}</div>;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Processos totais" value={stats.total} helper="Processos vinculados ao seu cadastro." />
        <StatCard label="Em acompanhamento" value={stats.active} helper="Processos nao arquivados no portal." />
        <StatCard label="Com atos visiveis" value={stats.withActs} helper="Processos com andamentos identificados." />
        <StatCard label="Com account" value={stats.withAccount} helper="Processos ja refletidos como Sales Account no CRM." />
        <StatCard label="Cobertura base" value={`${stats.baseCoverageRate}%`} helper={`Publicacoes visiveis em ${stats.withPublications} processo(s).`} />
      </section>

      {state.warning ? <div className="rounded-[28px] border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-6 text-sm">{sanitizePortalCopy(state.warning)}</div> : null}

      <section className="rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm opacity-62">Filtrar por status:</p>
          {STATUS_OPTIONS.map((option) => {
            const active = selectedStatus === option.value;
            return (
              <button
                key={option.value || "todos"}
                type="button"
                onClick={() => handleStatusChange(option.value)}
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
      </section>

      {!state.items.length ? (
        <div className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Carteira vazia</p>
          <h3 className="mt-3 font-serif text-3xl">Nenhum processo disponivel no portal para o seu cadastro.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 opacity-65">
            Assim que a base processual do escritorio estiver vinculada ao seu cadastro, os processos aparecerao aqui com acesso ao detalhe, partes, andamentos e publicacoes.
          </p>
        </div>
      ) : null}

      {state.items.length ? (
        <>
          <p className="text-sm opacity-62">
            Exibindo {state.items.length} de {state.pagination?.total || state.items.length} processo(s).
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            {state.items.map((item) => (
              <Link
                key={item.id}
                href={`/portal/processos/detalhe?id=${encodeURIComponent(item.number || item.id)}`}
                prefetch={false}
                className="rounded-[32px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-6 transition hover:border-[#C49C56]"
              >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C49C56" }}>
                    {item.court || "Tribunal"}
                  </span>
                  <span className="rounded-full border border-[#31463F] px-3 py-1 text-[10px] uppercase tracking-[0.15em] opacity-70">
                    {item.status}
                  </span>
                  {item.movement_count ? (
                    <span className="rounded-full border border-[#375B78] bg-[rgba(31,67,96,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#C9E7FF]">
                      {item.movement_count} atos
                    </span>
                  ) : null}
                  {item.coverage ? (
                    <span className="rounded-full border border-[#24533D] bg-[rgba(19,72,49,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#B8F0D5]">
                      Cobertura {item.coverage.rate || 0}%
                    </span>
                  ) : null}
                </div>

                <h3 className="font-serif text-2xl">{item.title || item.number || "Processo"}</h3>
                <p className="mt-2 font-mono text-sm opacity-55">{item.number || "Numero nao disponivel"}</p>

                <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                  <Meta label="Polo ativo" value={item.polo_ativo || "Nao identificado"} />
                  <Meta label="Polo passivo" value={item.polo_passivo || "Nao identificado"} />
                  <Meta label="Classe" value={item.classe || item.area || "Nao informada"} />
                  <Meta label="Atualizado em" value={formatDate(item.updated_at)} />
                </div>

                {item.coverage ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <CoveragePill active={item.coverage.hasAccount} label="Account CRM" />
                    <CoveragePill active={item.coverage.detailsOk} label="Detalhes base" />
                    <CoveragePill active={item.coverage.hasMovements} label="Andamentos" />
                    <CoveragePill active={item.coverage.hasPublications} label="Publicacoes" />
                  </div>
                ) : null}

                {item.total_related ? (
                  <div className="mt-5 rounded-[22px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Arvore processual</p>
                    <p className="mt-2 text-sm font-semibold">{item.total_related} vinculacao(oes) relacionada(s)</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(item.parent_links || []).map((relation) => (
                        <span key={`${item.id}-parent-${relation.id}`} className="rounded-full border border-[#375B78] bg-[rgba(31,67,96,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#C9E7FF]">
                          {relation.type_label}: {relation.number}
                        </span>
                      ))}
                      {(item.child_links || []).slice(0, 3).map((relation) => (
                        <span key={`${item.id}-child-${relation.id}`} className="rounded-full border border-[#24533D] bg-[rgba(19,72,49,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#B8F0D5]">
                          {relation.type_label}: {relation.number}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(item.latest_movement || item.latest_publication) ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {item.latest_movement ? (
                      <InsightCard
                        label="Ultimo andamento"
                        title={item.latest_movement.title}
                        helper={item.latest_movement.summary || formatDate(item.latest_movement.date)}
                      />
                    ) : null}
                    {item.latest_publication ? (
                      <InsightCard
                        label="Ultima publicacao"
                        title={item.latest_publication.title}
                        helper={item.latest_publication.summary || formatDate(item.latest_publication.date)}
                      />
                    ) : null}
                  </div>
                ) : null}

                {item.alerts?.length ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {item.alerts.slice(0, 3).map((alert) => (
                      <AlertPill key={`${item.id}-${alert.label}`} alert={alert} />
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 text-sm font-semibold text-[#C49C56]">Abrir detalhe do processo</div>
              </Link>
            ))}
          </div>

          {state.pagination?.hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={state.loadingMore}
                className="rounded-2xl border border-[#20332D] px-5 py-3 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {state.loadingMore ? "Carregando mais processos..." : "Carregar mais processos"}
              </button>
            </div>
          ) : null}
        </>
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

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 leading-6">{value}</p>
    </div>
  );
}

function InsightCard({ label, title, helper }) {
  return (
    <div className="rounded-[22px] border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      {helper ? <p className="mt-2 text-xs leading-5 opacity-62">{helper}</p> : null}
    </div>
  );
}

function AlertPill({ alert }) {
  const toneClass =
    alert.tone === "highlight"
      ? "border-[#7A5C20] bg-[rgba(122,92,32,0.22)] text-[#F3DEAD]"
      : alert.tone === "info"
        ? "border-[#375B78] bg-[rgba(31,67,96,0.22)] text-[#C9E7FF]"
        : "border-[#31463F] bg-[rgba(32,51,45,0.22)] text-[#D9DFDB]";

  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${toneClass}`}>
      {alert.label}
    </span>
  );
}

function CoveragePill({ active, label }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${
        active
          ? "border-[#24533D] bg-[rgba(19,72,49,0.22)] text-[#B8F0D5]"
          : "border-[#5B3535] bg-[rgba(91,53,53,0.12)] text-[#E7B3B3]"
      }`}
    >
      {label}
    </span>
  );
}
