import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
import { useInternalTheme } from "./InternalThemeProvider";
import DotobotCopilot from "./DotobotPanel";
import DotobotExtensionManager from "./DotobotExtensionManager";
import {
  appendFrontendIssue,
  appendActivityLog,
  appendOperationalNote,
  appendSchemaIssue,
  archiveActivityLog,
  clearActivityLog,
  formatActivityLogText,
  formatActivityLogMarkdown,
  formatFrontendIssuesMarkdown,
  formatSchemaIssuesMarkdown,
  getActivityLogResponseText,
  getActivityLogFilters,
  getFrontendIssues,
  getFingerprintStates,
  getSchemaIssues,
  setModuleHistory as persistModuleHistory,
  setFingerprintState,
  subscribeActivityLog,
  setActivityLogFilters,
} from "../../lib/admin/activity-log";
import {
  SPECIAL_LOG_PANES,
  TAG_LOG_PANES,
  normalizeConsoleFilters,
  entryMatchesConsoleFilters,
  buildTagScopedLogs,
  countHistorySnapshots,
  countUnclassifiedEntries,
} from "../../lib/admin/console-log-utils.js";
import { inferModuleKeyFromPathname, listModuleRegistryEntries } from "../../lib/admin/module-registry.js";

const INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY = "hmadv:interno:right-rail-mode";

const NAV_ITEMS = [
  { href: "/interno", label: "Visao geral" },
  { href: "/interno/copilot", label: "Copilot" },
  { href: "/interno/ai-task", label: "AI Task" },
  { href: "/interno/aprovacoes", label: "Aprovacoes" },
  { href: "/interno/financeiro", label: "Financeiro" },
  { href: "/interno/jobs", label: "Jobs" },
  { href: "/interno/processos", label: "Processos" },
  { href: "/interno/publicacoes", label: "Publicacoes" },
  { href: "/interno/contacts", label: "Contatos" },
  { href: "/interno/agentlab", label: "AgentLab" },
  { href: "/interno/integration-kit", label: "Integration Kit" },
  { href: "/interno/setup-integracao", label: "Setup Inicial" },
  { href: "/llm-test", label: "LLM Test" },
  { href: "/interno/posts", label: "Conteudo" },
  { href: "/interno/agendamentos", label: "Agenda" },
  { href: "/interno/leads", label: "Leads" },
  { href: "/interno/market-ads", label: "Market Ads" },
];

function normalizeDisplayName(profile) {
  return profile?.full_name || profile?.email || "Hermida Maia";
}

function SidebarItem({ item, active, collapsed, isLightTheme, onNavigate }) {
  const router = useRouter();

  function handleNavigate(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const currentPath = router.asPath;
    let usedFallback = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!usedFallback && router.asPath === currentPath) {
        usedFallback = true;
        window.location.assign(item.href);
      }
    }, 1200);

    router.push(item.href).then((navigated) => {
      window.clearTimeout(fallbackTimer);
      if (!navigated && !usedFallback) {
        usedFallback = true;
        window.location.assign(item.href);
        return;
      }
      if (navigated) {
        onNavigate?.();
      }
    }).catch(() => {
      window.clearTimeout(fallbackTimer);
      if (!usedFallback) {
        usedFallback = true;
        window.location.assign(item.href);
      }
    });
  }

  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={handleNavigate}
      className={`group flex items-center gap-3 rounded-[16px] border px-3.5 py-3 text-sm transition-all duration-200 ${
        active
          ? "border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[#07110E] shadow-[0_8px_22px_rgba(197,160,89,0.2)]"
          : isLightTheme
            ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.86)] text-[#22312F] hover:border-[#BAC8D6] hover:bg-[rgba(255,255,255,0.98)]"
            : "border-[#1F2A27] bg-[rgba(255,255,255,0.015)] text-[#D8DED9] hover:border-[#31433D] hover:bg-[rgba(255,255,255,0.03)]"
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-[12px] border ${active ? "border-[rgba(7,17,14,0.12)] bg-[rgba(7,17,14,0.08)]" : isLightTheme ? "border-[#D4DEE8] bg-[rgba(238,242,247,0.92)] group-hover:border-[#BAC8D6]" : "border-[#233630] bg-[rgba(255,255,255,0.02)] group-hover:border-[#35554B]"}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-[#07110E]" : "bg-[#C5A059]"}`} />
      </span>
      {!collapsed ? <span className="font-medium">{item.label}</span> : null}
    </Link>
  );
}

function RailPanel({ title, subtitle, children }) {
  return (
    <section className="rounded-[20px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">{title}</p>
      {subtitle ? <p className="mt-2 text-sm font-medium text-[#F5F1E8]">{subtitle}</p> : null}
      <div className="mt-3 text-sm leading-6 text-[#92A59F]">{children}</div>
    </section>
  );
}

function getModuleIntegrationGuide(pathname = "") {
  const guides = {
    "/interno/contacts": {
      title: "Contatos: webhooks e edge functions",
      subtitle: "Freshsales, Supabase, portal e interno alinhados no mesmo fluxo.",
      items: [
        {
          label: "Painel interno",
          helper: "Operacoes do frontend passam por /api/admin-hmadv-contacts para sync, enriquecimento, reconciliacao e bulk actions.",
          endpoint: "/api/admin-hmadv-contacts",
          trigger: "Use para sync_contacts, enrich_cep, enrich_directdata, merge_contacts e vinculacao em lote.",
        },
        {
          label: "Webhook Freshsales",
          helper: "O webhook central do CRM deve cair em fs-webhook para responder rapido e enfileirar o processamento.",
          endpoint: "_hmadv_review/supabase/functions/fs-webhook",
          trigger: "Configure o workflow do Freshsales para POST com account_id e cf_processo sempre que o account/contato precisar disparar sincronizacao operacional.",
        },
        {
          label: "Processo e espelho",
          helper: "Quando a reconciliacao do contato depende do processo, a trilha de processo-sync, datajud-worker e sync-worker fecha o ciclo HMADV -> Freshsales.",
          endpoint: "_hmadv_review/supabase/functions/processo-sync + datajud-worker + sync-worker",
          trigger: "Acione quando o contato depende de processo, activity ou account repair antes de consolidar os dados do CRM.",
        },
        {
          label: "Persistencia portal",
          helper: "Dados exibidos ao cliente ficam persistidos no portal via perfil, sem perder o espelho operacional do interno.",
          endpoint: "/api/client-profile",
          trigger: "Use para manter contacts/addresses consistentes em /portal/perfil depois da higienizacao da base.",
        },
      ],
    },
    "/interno/processos": {
      title: "Processos: acionamento operacional",
      subtitle: "DataJud, Freshsales e HMADV sincronizados a partir do interno.",
      items: [
        {
          label: "Painel interno",
          helper: "As acoes do modulo usam /api/admin-hmadv-processos como ponte segura do frontend.",
          endpoint: "/api/admin-hmadv-processos",
          trigger: "Use para lotes, correcao operacional, auditoria e reparo orientado por fila.",
        },
        {
          label: "Webhook / Edge",
          helper: "fs-webhook recebe o evento rapido; processo-sync e datajud-worker consolidam o processo no Supabase.",
          endpoint: "_hmadv_review/supabase/functions/fs-webhook + processo-sync + datajud-worker",
          trigger: "Acione quando o Freshsales ou DataJud precisar iniciar/validar a sincronizacao do processo.",
        },
      ],
    },
    "/interno/publicacoes": {
      title: "Publicacoes: fila e reflexo CRM",
      subtitle: "Extracao, persistencia e envio de activity no Freshsales.",
      items: [
        {
          label: "Painel interno",
          helper: "O frontend centraliza as rotinas do modulo em /api/admin-hmadv-publicacoes.",
          endpoint: "/api/admin-hmadv-publicacoes",
          trigger: "Use para criar processos, extrair partes, sincronizar partes e drenar filas.",
        },
        {
          label: "Edge functions",
          helper: "publicacoes-freshsales e sync-worker cuidam do reflexo no CRM; datajud-search e tpu-sync complementam o enriquecimento.",
          endpoint: "_hmadv_review/supabase/functions/publicacoes-freshsales + sync-worker + datajud-search + tpu-sync",
          trigger: "Acione quando a publicacao precisar virar processo, activity ou enriquecimento posterior.",
        },
      ],
    },
    "/interno/financeiro": {
      title: "Financeiro: reflexo CRM e rastreio",
      subtitle: "Deals, eventos e conciliação financeira precisam manter o rastro operacional visível.",
      items: [
        {
          label: "Painel interno",
          helper: "As rotas administrativas do financeiro concentram os disparos seguros do frontend.",
          endpoint: "/api/admin-hmadv-financeiro",
          trigger: "Use para publicar, reparar e auditar o reflexo de faturamento e deals.",
        },
        {
          label: "Freshsales",
          helper: "O CRM recebe updates por rotinas internas e eventuais webhooks externos conforme a esteira de deals.",
          endpoint: "functions/api/admin-hmadv-financeiro.js",
          trigger: "Acione sempre com console ligado para capturar payload, erro e resumo da remessa.",
        },
      ],
    },
    "/interno/ai-task": {
      title: "AI Task: orquestracao e observabilidade",
      subtitle: "Erros precisam ficar rastreaveis entre run, console e backend.",
      items: [
        {
          label: "Painel interno",
          helper: "O modulo usa o backend administrativo do AI Task para execucao e captura de contexto.",
          endpoint: "/api/admin-lawdesk-chat",
          trigger: "Use para runs assistidas, automacao e investigacao de falhas da IA.",
        },
        {
          label: "Edge / embeddings",
          helper: "As rotas de embed e funcoes do Supabase complementam a trilha de IA quando houver dependencias vetoriais.",
          endpoint: "supabase/functions/dotobot-embed",
          trigger: "Acione quando a pipeline de contexto precisar regenerar embeddings ou depurar resposta do copiloto.",
        },
      ],
    },
    "/interno/market-ads": {
      title: "Market Ads: growth, compliance e campanha",
      subtitle: "Anuncios juridicos precisam unir inteligencia competitiva, operacao de midia e filtro etico no mesmo loop.",
      items: [
        {
          label: "Painel interno",
          helper: "O cockpit administrativo do modulo parte de /api/admin-market-ads para benchmarks, previsoes e validacao de copy.",
          endpoint: "/api/admin-market-ads",
          trigger: "Use para carregar o dashboard, gerar preview de anuncio e validar compliance OAB antes da publicacao.",
        },
        {
          label: "Geracao assistida",
          helper: "A camada de IA produz headlines, descricoes, CTA, criativos sugeridos e keywords sempre com guarda juridica.",
          endpoint: "lib/admin/market-ads.js",
          trigger: "Acione quando precisar montar variacoes A/B, revisar copy ou preparar o handoff para integracoes futuras.",
        },
        {
          label: "Integracoes futuras",
          helper: "Google Ads, Meta Ads, analytics e landing pages devem convergir para uma mesma trilha de auditoria e otimizacao.",
          endpoint: "Google Ads API + Meta Marketing API + HMADV landing pages",
          trigger: "Acione quando o modulo sair do modo cockpit e passar a sincronizar campanhas reais com publicacao segura.",
        },
      ],
    },
  };
  return guides[pathname] || null;
}

function IntegrationGuideCard({ guide }) {
  if (!guide) return null;
  return (
    <section className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(10,12,11,0.58)] p-5">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A059]">Integracoes operacionais</p>
          <h3 className="mt-2 text-lg font-semibold text-[#F8F4EB]">{guide.title}</h3>
          {guide.subtitle ? <p className="mt-2 max-w-4xl text-sm leading-6 text-[#99ADA6]">{guide.subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {guide.items.map((item) => (
          <div key={`${guide.title}-${item.label}`} className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F4E7C2]">{item.label}</p>
            <p className="mt-2 text-sm leading-6 text-[#C7D0CA]">{item.helper}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Endpoint / funcao</p>
            <p className="mt-1 break-all text-sm text-[#D9B46A]">{item.endpoint}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Quando acionar</p>
            <p className="mt-1 text-sm leading-6 text-[#99ADA6]">{item.trigger}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const LOG_PANES = [
  { key: "activity", label: "Atividade", group: "visao", alwaysVisible: true },
  { key: "history", label: "Historico", group: "visao", alwaysVisible: true },
  { key: "debug", label: "Debug UI", group: "visao", alwaysVisible: true },
  { key: "frontend", label: "Frontend", group: "auditoria", alwaysVisible: true },
  { key: "schema", label: "Schema", group: "auditoria", alwaysVisible: true },
  { key: "notes", label: "Notas", group: "auditoria", alwaysVisible: true },
  { key: "crm", label: "CRM", group: "integracoes" },
  { key: "supabase", label: "Supabase", group: "integracoes" },
  { key: "webhook", label: "Webhook", group: "integracoes" },
  { key: "functions", label: "Functions", group: "integracoes" },
  { key: "routes", label: "Rotas", group: "integracoes" },
  { key: "jobs", label: "Jobs", group: "integracoes" },
  { key: "dotobot", label: "Dotobot", group: "ia" },
  { key: "ai-task", label: "AI Task", group: "ia" },
  { key: "security", label: "Seguranca", group: "governanca" },
  { key: "data-quality", label: "Qualidade de dados", group: "governanca" },
];
const LOG_PANE_GROUPS = [
  { key: "visao", label: "Visao" },
  { key: "auditoria", label: "Auditoria" },
  { key: "integracoes", label: "Integracoes" },
  { key: "ia", label: "IA" },
  { key: "governanca", label: "Governanca" },
];

function getSeverityTone(severity) {
  if (severity === "error") return "border-[#5B2D2D] text-[#FECACA]";
  if (severity === "warn") return "border-[#6E5630] text-[#FDE68A]";
  return "border-[#30543A] text-[#B7F7C6]";
}

function getFingerprintStatusTone(status) {
  if (status === "resolvido") return "border-[#30543A] text-[#B7F7C6]";
  if (status === "acompanhando") return "border-[#6E5630] text-[#FDE68A]";
  return "border-[#5B2D2D] text-[#FECACA]";
}

function summarizeFingerprints(entries = [], fingerprintStates = {}) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry?.fingerprint;
    if (!key) continue;
    const triage = fingerprintStates?.[key] || null;
    const current = map.get(key) || {
      fingerprint: key,
      count: 0,
      severity: entry?.severity || "info",
      label: entry?.label || entry?.action || "Evento",
      recommendedAction: entry?.recommendedAction || "",
      status: triage?.status || "aberto",
      note: triage?.note || "",
      updatedAt: triage?.updatedAt || null,
      lastEntryId: triage?.lastEntryId || entry?.id || null,
    };
    current.count += 1;
    if (entry?.severity === "error") current.severity = "error";
    else if (entry?.severity === "warn" && current.severity !== "error") current.severity = "warn";
    map.set(key, current);
  }
  return Array.from(map.values()).filter((item) => item.count > 1).sort((a, b) => b.count - a.count).slice(0, 4);
}

function summarizeRecommendations(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const key = String(entry?.recommendedAction || "").trim();
    if (!key) continue;
    const current = map.get(key) || { action: key, count: 0, severity: entry?.severity || "info" };
    current.count += 1;
    if (entry?.severity === "error") current.severity = "error";
    else if (entry?.severity === "warn" && current.severity !== "error") current.severity = "warn";
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 3);
}

function calculateRiskScore(entries = [], recurring = []) {
  const errors = entries.filter((entry) => entry?.severity === "error").length;
  const warnings = entries.filter((entry) => entry?.severity === "warn").length;
  const unresolvedRecurring = recurring.filter((item) => item.status !== "resolvido").length;
  const score = Math.min(100, (errors * 18) + (warnings * 7) + (unresolvedRecurring * 12));
  const tone = score >= 70 ? "error" : score >= 35 ? "warn" : "info";
  const label = score >= 70 ? "alto" : score >= 35 ? "medio" : "baixo";
  return { score, tone, label };
}

function formatPaneCountLabel(count) {
  return count > 0 ? `(${count})` : "";
}

function shouldShowLogPane(pane, paneCounts = {}, activePane = "") {
  if (!pane) return false;
  if (pane.alwaysVisible) return true;
  if (pane.key === activePane) return true;
  return Number(paneCounts?.[pane.key] || 0) > 0;
}

function summarizeTimeline(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const hints = Array.isArray(entry?.traceHints) ? entry.traceHints : [];
    for (const hint of hints) {
      const key = `${hint.type}:${hint.value}`;
      const current = map.get(key) || {
        key,
        label: hint.label || key,
        count: 0,
        severity: entry?.severity || "info",
        lastAt: entry?.createdAt || entry?.startedAt || null,
      };
      current.count += 1;
      if (entry?.severity === "error") current.severity = "error";
      else if (entry?.severity === "warn" && current.severity !== "error") current.severity = "warn";
      const candidateDate = entry?.createdAt || entry?.startedAt || null;
      if (candidateDate && (!current.lastAt || new Date(candidateDate).getTime() > new Date(current.lastAt).getTime())) {
        current.lastAt = candidateDate;
      }
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
}

function getAgeBucket(createdAt) {
  const time = createdAt ? new Date(createdAt).getTime() : 0;
  if (!time || Number.isNaN(time)) return "sem_data";
  const diffHours = (Date.now() - time) / (1000 * 60 * 60);
  if (diffHours <= 4) return "ate_4h";
  if (diffHours <= 24) return "ate_24h";
  if (diffHours <= 72) return "ate_72h";
  return "acima_72h";
}

function summarizeSla(entries = [], recurring = [], fingerprintStates = {}) {
  const errors = entries.filter((entry) => entry?.severity === "error");
  const openRecurring = recurring.filter((item) => item.status === "aberto").length;
  const watchingRecurring = recurring.filter((item) => item.status === "acompanhando").length;
  const resolvedRecurring = recurring.filter((item) => item.status === "resolvido").length;
  const buckets = { ate_4h: 0, ate_24h: 0, ate_72h: 0, acima_72h: 0, sem_data: 0 };

  for (const entry of errors) {
    const state = entry?.fingerprint ? fingerprintStates?.[entry.fingerprint] : null;
    if (state?.status === "resolvido") continue;
    buckets[getAgeBucket(entry?.createdAt || entry?.startedAt)] += 1;
  }

  const overdue = buckets.acima_72h + buckets.sem_data;
  const tone = overdue > 0 || openRecurring >= 3 ? "error" : openRecurring > 0 || watchingRecurring > 0 ? "warn" : "info";
  return { tone, openRecurring, watchingRecurring, resolvedRecurring, buckets, overdue };
}

function inferSnapshotTone(snapshot) {
  if (!snapshot) return "muted";
  if (snapshot.error) return "danger";
  if (snapshot.loading) return "warn";
  if (snapshot.uiState === "error" || snapshot.status === "error") return "danger";
  return "success";
}

function inferSnapshotSummary(key, snapshot) {
  if (!snapshot) return "Sem dados coletados.";
  if (snapshot.error) return snapshot.error;
  if (snapshot.routePath && snapshot.shell) {
    return `${snapshot.shell} em ${snapshot.routePath}`;
  }
  if (snapshot.routePath) return `Rota ${snapshot.routePath}`;
  if (key === "contacts" && snapshot.overview) {
    return `Contatos ${snapshot.overview.total || 0}, duplicados ${snapshot.overview.duplicados || 0}`;
  }
  if (key === "processos") {
    return `Histórico local ${snapshot.executionHistory?.length || 0}, remoto ${snapshot.remoteHistory?.length || 0}`;
  }
  if (key === "publicacoes") {
    return `Jobs ${snapshot.jobs?.length || 0}, histórico remoto ${snapshot.remoteHistory?.length || 0}`;
  }
  if (key === "ai-task") {
    return `Eventos ${snapshot.eventsTotal || 0}, automação ${snapshot.automation || "idle"}`;
  }
  if (key === "dotobot") {
    return `Conversas ${snapshot.conversationCount || 0}, modo ${snapshot.mode || "n/a"}`;
  }
  if (key === "aprovacoes") {
    return `Pendências de cadastro ${snapshot.pendingCadastro || 0}`;
  }
  return "Snapshot atualizado.";
}

function formatRelativeTime(value) {
  if (!value) return "sem horario";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "sem horario";
  const diffMs = Date.now() - parsed.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / (1000 * 60)));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d`;
}

function getJobStatusTone(status) {
  const normalized = String(status || "").trim();
  if (normalized === "completed") return "border-[#30543A] text-[#B7F7C6]";
  if (normalized === "running") return "border-[#6E5630] text-[#FDE68A]";
  if (normalized === "paused" || normalized === "retry_wait" || normalized === "scheduled") return "border-[#2D4D60] text-[#B8D9F0]";
  if (normalized === "error" || normalized === "cancelled") return "border-[#5B2D2D] text-[#FECACA]";
  return "border-[#22342F] text-[#D8DEDA]";
}

function formatQueueLabel(key) {
  const labels = {
    semMovimentacoes: "Sem movimentacoes",
    movimentacoesPendentes: "Movimentacoes pendentes",
    publicacoesPendentes: "Publicacoes pendentes",
    partesSemContato: "Partes sem contato",
    audienciasPendentes: "Audiencias pendentes",
    camposOrfaos: "Campos orfaos",
    orfaos: "Sem Sales Account",
    candidatosProcessos: "Processos criaveis",
    candidatosPartes: "Partes extraiveis",
  };
  return labels[key] || key;
}

function buildOperationalRailData(moduleKey, snapshot, entries = []) {
  if (!moduleKey || !snapshot) return null;
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
  const activeJobs = jobs.filter((item) => ["pending", "running", "paused", "retry_wait", "scheduled"].includes(String(item?.status || ""))).slice(0, 5);
  const failedJobs = jobs.filter((item) => String(item?.status || "") === "error").slice(0, 3);
  const queues = Object.entries(snapshot?.queues || {})
    .map(([key, value]) => ({
      key,
      label: formatQueueLabel(key),
      totalRows: Number(value?.totalRows || 0),
      error: value?.error || null,
      updatedAt: value?.updatedAt || null,
      limited: Boolean(value?.limited),
    }))
    .filter((item) => item.totalRows > 0 || item.error)
    .sort((left, right) => {
      if (Boolean(left.error) !== Boolean(right.error)) return left.error ? -1 : 1;
      return right.totalRows - left.totalRows;
    })
    .slice(0, 5);
  const batchHints = Object.entries(snapshot?.queueBatchSizes || {})
    .map(([key, value]) => ({ key, label: formatQueueLabel(key), value: Number(value || 0) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
  const recentErrors = (entries || [])
    .filter((entry) => entry?.module === moduleKey && entry?.severity === "error")
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      label: entry.label || entry.action || "Erro operacional",
      message: entry.error || getActivityLogResponseText(entry) || entry.recommendedAction || "Falha sem detalhe.",
      createdAt: entry.createdAt || null,
      fingerprint: entry.fingerprint || "",
    }));
  const actionState = snapshot?.actionState || {};
  const selectedCount = Object.entries(snapshot?.ui || {})
    .filter(([key]) => key.startsWith("selected"))
    .reduce((total, [, value]) => total + Number(value || 0), 0);
  const moduleLabelMap = {
    processos: "Processos",
    publicacoes: "Publicacoes",
    jobs: "Jobs",
    financeiro: "Financeiro",
  };
  const shouldRender =
    activeJobs.length ||
    failedJobs.length ||
    queues.length ||
    batchHints.length ||
    recentErrors.length ||
    actionState?.loading ||
    actionState?.error;
  if (!shouldRender) return null;
  return {
    moduleKey,
    moduleLabel: moduleLabelMap[moduleKey] || moduleKey,
    activeJobs,
    failedJobs,
    queues,
    batchHints,
    recentErrors,
    selectedCount,
    actionState,
    backendHealth: snapshot?.backendHealth || null,
    operationalStatus: snapshot?.operationalStatus || null,
    limit: Number(snapshot?.ui?.limit || 0) || null,
    activeJobId: snapshot?.activeJobId || null,
    drainInFlight: Boolean(snapshot?.drainInFlight),
  };
}

function OperationalRightRail({ data, onOpenConsole, onOpenJobsLog }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Execucao em tempo real</p>
            <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{data.moduleLabel}</p>
            <p className="mt-2 text-xs leading-5 text-[#92A59F]">
              Lotes protegidos, fila persistida, erros correlacionados com o console e prioridade para nao estourar rate limit.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onOpenConsole} className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#C5A059]">
              Console
            </button>
            <button type="button" onClick={onOpenJobsLog} className="rounded-full border border-[#6E5630] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FDE68A] hover:border-[#C5A059]">
              Jobs
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
          {data.backendHealth?.status ? <span className={`rounded-full border px-2 py-1 ${getJobStatusTone(data.backendHealth.status)}`}>backend {data.backendHealth.status}</span> : null}
          {data.operationalStatus?.mode ? <span className={`rounded-full border px-2 py-1 ${getJobStatusTone(data.operationalStatus.mode)}`}>operacao {data.operationalStatus.mode}</span> : null}
          {data.limit ? <span className="rounded-full border border-[#22342F] px-2 py-1 text-[#D8DEDA]">lote base {data.limit}</span> : null}
          {data.selectedCount ? <span className="rounded-full border border-[#22342F] px-2 py-1 text-[#D8DEDA]">{data.selectedCount} selecionados</span> : null}
          {data.drainInFlight ? <span className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">drenando fila</span> : null}
          {data.actionState?.loading ? <span className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">acao em execucao</span> : null}
        </div>
      </div>

      {data.activeJobs.length ? <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Jobs ativos</p>
        <div className="mt-3 space-y-2">
          {data.activeJobs.map((job) => {
            const requested = Number(job?.requested_count || 0);
            const processed = Number(job?.processed_count || 0);
            const progress = requested ? Math.max(0, Math.min(100, Math.round((processed / requested) * 100))) : 0;
            return (
              <div key={job.id} className={`rounded-xl border p-3 ${job.id === data.activeJobId ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.45)]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#F5F1E8]">{job.acao || "job"}</span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getJobStatusTone(job.status)}`}>{job.status || "pending"}</span>
                </div>
                <p className="mt-2 text-[11px] text-[#9BAEA8]">{processed}/{requested || processed} processado(s) • atualizado ha {formatRelativeTime(job.updated_at || job.started_at || job.created_at)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div className="h-full bg-[#C5A059]" style={{ width: `${progress}%` }} />
                </div>
                {job.last_error ? <p className="mt-2 text-[11px] text-[#FECACA]">{job.last_error}</p> : null}
              </div>
            );
          })}
        </div>
      </div> : null}

      {data.queues.length ? <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Filas monitoradas</p>
        <div className="mt-3 space-y-2">
          {data.queues.map((queue) => (
            <div key={queue.key} className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.45)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#F5F1E8]">{queue.label}</span>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${queue.error ? "border-[#5B2D2D] text-[#FECACA]" : "border-[#22342F] text-[#D8DEDA]"}`}>{queue.totalRows} itens</span>
              </div>
              <p className="mt-2 text-[11px] text-[#9BAEA8]">Atualizada ha {formatRelativeTime(queue.updatedAt)}{queue.limited ? " • leitura limitada" : ""}</p>
              {queue.error ? <p className="mt-2 text-[11px] text-[#FECACA]">{queue.error}</p> : null}
            </div>
          ))}
        </div>
      </div> : null}

      {data.batchHints.length ? <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Janela segura de lote</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.batchHints.map((item) => <span key={item.key} className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#D8DEDA]">{item.label}: {item.value}</span>)}
        </div>
      </div> : null}

      {data.recentErrors.length || data.actionState?.error ? <div className="rounded-[20px] border border-[#5B2D2D] bg-[rgba(91,45,45,0.14)] p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#E8B4B4]">Erros correlacionados</p>
        <div className="mt-3 space-y-2 text-[11px]">
          {data.actionState?.error ? <div className="rounded-xl border border-[#5B2D2D] bg-[rgba(34,12,14,0.45)] p-3 text-[#FECACA]">{data.actionState.error}</div> : null}
          {data.recentErrors.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#5B2D2D] bg-[rgba(34,12,14,0.45)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#F8D6D6]">{item.label}</span>
                <span className="text-[#D9B46A]">{formatRelativeTime(item.createdAt)}</span>
              </div>
              <p className="mt-2 text-[#F1C3C3]">{item.message}</p>
            </div>
          ))}
        </div>
      </div> : null}
    </div>
  );
}

function buildCoverageCards(moduleHistory = {}) {
  const registry = new Map(listModuleRegistryEntries().map((entry) => [entry.key, entry]));
  const keys = new Set([...registry.keys(), ...Object.keys(moduleHistory || {})]);
  return Array.from(keys)
    .map((key) => {
      const registered = registry.get(key) || null;
      const snapshot = moduleHistory?.[key] || null;
      return {
        key,
        label: registered?.label || key,
        routePath: snapshot?.routePath || snapshot?.asPath || registered?.routePath || null,
        updatedAt: snapshot?.updatedAt || snapshot?.lastNavigationAt || null,
        tone: snapshot ? inferSnapshotTone(snapshot) : "muted",
        summary: snapshot ? inferSnapshotSummary(key, snapshot) : "Cobertura ainda nao publicada neste modulo.",
        capabilities: snapshot?.capabilities || registered?.capabilities || [],
        quickActions: snapshot?.quickActions || registered?.quickActions || [],
        consoleTags: snapshot?.consoleTags || registered?.consoleTags || ["ai-task", key].filter(Boolean),
        snapshot,
      };
    })
    .sort((a, b) => {
      if (Boolean(a.snapshot) !== Boolean(b.snapshot)) return a.snapshot ? -1 : 1;
      const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return right - left;
    });
}

const PRIORITY_MODULE_KEYS = new Set(["contacts", "publicacoes", "processos", "dotobot", "ai-task"]);

function summarizeModuleAlert(moduleKey, entries = [], fingerprintStates = {}) {
  const moduleEntries = entries.filter((entry) => entry?.module === moduleKey);
  const recurring = summarizeFingerprints(moduleEntries, fingerprintStates);
  const sla = summarizeSla(moduleEntries, recurring, fingerprintStates);
  const errors = moduleEntries.filter((entry) => entry?.severity === "error").length;
  const warnings = moduleEntries.filter((entry) => entry?.severity === "warn").length;
  const recurringOpen = recurring.filter((item) => item.status === "aberto").length;
  const tone = sla.tone === "error" || errors >= 3 ? "danger" : sla.tone === "warn" || warnings > 0 ? "warn" : "success";
  return {
    moduleKey,
    entries: moduleEntries.length,
    errors,
    warnings,
    recurringOpen,
    recurringWatching: recurring.filter((item) => item.status === "acompanhando").length,
    overdue: sla.overdue,
    stale: sla.buckets.acima_72h,
    buckets: sla.buckets,
    tone,
  };
}

function deriveModuleSafeWindow(moduleKey, snapshot, alert) {
  const tone = alert?.tone || "success";
  const isCritical = tone === "danger";
  const isWarn = tone === "warn";

  if (moduleKey === "contacts") {
    const syncLimit = Number(snapshot?.settings?.syncLimit || 0) || 100;
    const reconcileLimit = Number(snapshot?.settings?.reconcileLimit || 0) || 20;
    return {
      blocked: isCritical,
      summary: isCritical
        ? "Segure novas bulk actions amplas em contatos ate estabilizar CRM e persistencia."
        : isWarn
          ? "Reduza a operacao para um lote menor e acompanhe CRM/portal antes de ampliar."
          : "Bulk actions podem seguir em lote curto com observacao normal.",
      chips: [
        `sync sugerido ${Math.max(10, Math.min(syncLimit, isCritical ? 25 : isWarn ? 50 : 100))}`,
        `reconcile sugerido ${Math.max(5, Math.min(reconcileLimit, isCritical ? 10 : isWarn ? 15 : 20))}`,
      ],
    };
  }

  if (moduleKey === "publicacoes") {
    const limit = Number(snapshot?.limit || 0) || 10;
    const pendingJobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs.filter((item) => ["pending", "running"].includes(String(item?.status || ""))).length : 0;
    return {
      blocked: isCritical || pendingJobs > 1,
      summary: isCritical || pendingJobs > 1
        ? "Nao amplie o lote de publicacoes enquanto houver recorrencia critica ou jobs concorrentes."
        : isWarn
          ? "Use lote curto e drene a fila antes de disparar nova rodada."
          : "Fila sob controle para uma rodada operacional padrao.",
      chips: [
        `lote sugerido ${Math.max(5, Math.min(limit, isCritical ? 5 : isWarn ? 8 : 10))}`,
        `jobs ativos ${pendingJobs}`,
      ],
    };
  }

  if (moduleKey === "processos") {
    const limit = Number(snapshot?.limit || 0) || 2;
    const queueHints = Object.values(snapshot?.queueBatchSizes || {}).map((value) => Number(value || 0)).filter(Boolean);
    const baseline = queueHints.length ? Math.min(...queueHints) : limit;
    return {
      blocked: isCritical,
      summary: isCritical
        ? "Trave lote amplo em processos e priorize a amostra reincidente."
        : isWarn
          ? "Operar processos em lote minimo ate validar o ganho do ciclo."
          : "Lote de processos pode seguir no ritmo padrao do painel.",
      chips: [
        `lote sugerido ${Math.max(2, Math.min(baseline, isCritical ? 5 : isWarn ? 8 : 15))}`,
        `filas ${queueHints.length || 0}`,
      ],
    };
  }

  return null;
}

function getModulePlaybook(moduleKey) {
  const playbooks = {
    contacts: {
      pane: "crm",
      tag: "crm",
      checklist: [
        "Validar mapeamento Freshsales e IDs de contato/account antes de novo lote.",
        "Checar persistencia no portal e reconciliacao no Supabase.",
      ],
    },
    publicacoes: {
      pane: "jobs",
      tag: "jobs",
      checklist: [
        "Inspecionar fila, drain e reflexo no Freshsales antes de reenviar.",
        "Conferir edge functions de extracao e sync posteriores.",
      ],
    },
    processos: {
      pane: "functions",
      tag: "functions",
      checklist: [
        "Revisar processo-sync, datajud-worker e payload do lote.",
        "Confirmar IDs de processo e consistencia do espelho operacional.",
      ],
    },
    dotobot: {
      pane: "dotobot",
      tag: "dotobot",
      checklist: [
        "Checar contexto, tools acionadas e estado do copiloto.",
        "Confirmar se a falha veio do prompt, do backend ou de permissao.",
      ],
    },
    "ai-task": {
      pane: "ai-task",
      tag: "ai-task",
      checklist: [
        "Revisar run ativa, provider, embeddings e orchestration path.",
        "Conferir erros recorrentes antes de reexecutar automacoes.",
      ],
    },
  };
  return playbooks[moduleKey] || null;
}

function getTagPlaybook(tagKey) {
  const playbooks = {
    webhook: {
      title: "Playbook webhook",
      checklist: [
        "Validar origem, assinatura e deduplicacao antes de reenviar o evento.",
        "Conferir payload recebido e resposta rapida do endpoint de entrada.",
      ],
    },
    supabase: {
      title: "Playbook supabase",
      checklist: [
        "Revisar RLS, schema, policy e funcoes chamadas pelo fluxo.",
        "Confirmar erro PostgREST/PGRST e impacto no cache de schema.",
      ],
    },
    functions: {
      title: "Playbook functions",
      checklist: [
        "Inspecionar payload, secrets, timeout e logs da edge/API function.",
        "Checar dependencia externa antes de reenfileirar ou repetir o lote.",
      ],
    },
    crm: {
      title: "Playbook CRM",
      checklist: [
        "Validar IDs Freshsales, rate limit e mapeamento de campos.",
        "Confirmar se o espelho no interno e portal bate com o CRM antes do retry.",
      ],
    },
    jobs: {
      title: "Playbook jobs",
      checklist: [
        "Verificar fila, itens presos, drain parcial e volume do lote.",
        "Checar se o job falhou por timeout, lock ou dado inconsistente.",
      ],
    },
  };
  return playbooks[tagKey] || null;
}

function getBulkGuardrail(logPane, paneRisk, paneSla, paneEntries = []) {
  const eligible = new Set(["crm", "jobs", "functions"]);
  const moduleLike = new Set(["contacts", "publicacoes", "processos"]);
  if (!eligible.has(logPane) && !moduleLike.has(logPane)) return null;

  const total = paneEntries.length;
  const running = paneEntries.filter((entry) => entry?.status === "running").length;
  const errors = paneEntries.filter((entry) => entry?.severity === "error").length;
  const shouldThrottle = paneRisk.score >= 35 || paneSla.openRecurring > 0 || paneSla.buckets.acima_72h > 0;
  const shouldBlockRetry = paneRisk.score >= 70 || errors >= 4 || paneSla.buckets.acima_72h >= 2;

  return {
    title: shouldBlockRetry ? "Bloqueio preventivo de retry" : "Retry seguro para lotes",
    tone: shouldBlockRetry ? "error" : shouldThrottle ? "warn" : "info",
    summary: shouldBlockRetry
      ? "Existe reincidencia suficiente para evitar novo lote cheio ate revisar causa raiz."
      : shouldThrottle
        ? "O lote deve ser reduzido e reprocessado por fatias menores com observacao reforcada."
        : "Trilha sob controle, mas ainda vale repetir em lotes pequenos quando houver dependencias externas.",
    actions: shouldBlockRetry
      ? [
          "Nao repetir lote completo agora; priorizar fingerprints abertos e itens acima de 72h.",
          "Executar validacao de payload, IDs e dependencia externa antes de novo retry.",
        ]
      : shouldThrottle
        ? [
            "Reduzir o lote para uma janela menor e acompanhar no console a cada tentativa.",
            "Separar itens com erro recorrente antes de reenfileirar o restante.",
          ]
        : [
            "Preferir retry incremental e registrar o resultado no console logo apos a execucao.",
            "Manter filtros por modulo/tag para isolar regressao rapidamente.",
          ],
    metrics: { total, running, errors },
  };
}

function getConsoleHeightLimits() {
  return { min: 180, max: 260, preferred: 220 };
}

export default function InternoLayout({
  title,
  description,
  profile,
  children,
  hideDotobotRail = false,
  forceDotobotRail = false,
  rightRailFullscreen = false,
  rightRail,
}) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();
  const { isLightTheme, toggleTheme } = useInternalTheme();
  const isCopilotWorkspace = router.pathname === "/interno/copilot";
  const initialWorkspaceOpen = router.pathname === "/interno/agentlab/conversations";
  const shouldStartWithOpenRail = rightRailFullscreen || router.pathname === "/interno/agentlab/conversations";
  const shouldRenderDotobotRail = !hideDotobotRail || forceDotobotRail;
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(!shouldStartWithOpenRail);
  const [rightRailMode, setRightRailMode] = useState("expanded");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(shouldStartWithOpenRail);
  const [isMobileShell, setIsMobileShell] = useState(false);
  const [consoleTab, setConsoleTab] = useState("console");
  const [logPane, setLogPane] = useState("activity");
  const [activityLog, setActivityLog] = useState([]);
  const [archivedLogs, setArchivedLogs] = useState([]);
  const [operationalNotes, setOperationalNotes] = useState([]);
  const [frontendIssues, setFrontendIssues] = useState(() => getFrontendIssues());
  const [fingerprintStates, setFingerprintStates] = useState(() => getFingerprintStates());
  const [schemaIssues, setSchemaIssues] = useState(() => getSchemaIssues());
  const [moduleHistory, setModuleHistory] = useState({});
  const [consoleHeight, setConsoleHeight] = useState(() => getConsoleHeightLimits().preferred);
  const [noteInput, setNoteInput] = useState("");
  const [frontendForm, setFrontendForm] = useState({
    page: "",
    component: "",
    detail: "",
    status: "aberto",
  });
  const [schemaForm, setSchemaForm] = useState({
    type: "",
    table: "",
    column: "",
    code: "",
    detail: "",
  });
  const [logFilters, setLogFilters] = useState(() => getActivityLogFilters());
  const [logSearch, setLogSearch] = useState("");
  const [logExpanded, setLogExpanded] = useState(null);
  const dragStateRef = useRef({ dragging: false, startY: 0, startHeight: 260 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persistedMode = window.localStorage.getItem(INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY);
    if (persistedMode === "compact" || persistedMode === "expanded") {
      setRightRailMode(persistedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY, rightRailMode);
  }, [rightRailMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function syncResponsiveShell() {
      const width = window.innerWidth;
      const mobile = width < 900;
      setIsMobileShell(mobile);
      setLeftCollapsed(isCopilotWorkspace ? width < 900 : width < 1180);
      if (width < 1024) {
        setRightCollapsed(true);
        setCopilotOpen(false);
        setRightRailMode("compact");
      }
    }
    syncResponsiveShell();
    window.addEventListener("resize", syncResponsiveShell);
    return () => window.removeEventListener("resize", syncResponsiveShell);
  }, [isCopilotWorkspace]);

  function closeMobileSidebar() {
    if (isMobileShell) {
      setLeftCollapsed(true);
    }
  }

  function toggleRightRailMode() {
    setRightRailMode((current) => (current === "compact" ? "expanded" : "compact"));
    if (rightCollapsed) {
      setRightCollapsed(false);
      setCopilotOpen(true);
    }
  }

  useEffect(() => {
    return subscribeActivityLog((entries, archives, notes, filters, frontendItems, schemaItems, moduleSnapshot, fingerprintSnapshot) => {
      setActivityLog(entries);
      setArchivedLogs(archives || []);
      setOperationalNotes(notes || []);
      setFrontendIssues(frontendItems || []);
      setSchemaIssues(schemaItems || []);
      setFingerprintStates(fingerprintSnapshot && typeof fingerprintSnapshot === "object" ? fingerprintSnapshot : {});
      if (moduleSnapshot && typeof moduleSnapshot === "object") {
        setModuleHistory(moduleSnapshot);
      }
      setLogFilters(filters && typeof filters === "object" ? filters : {});
    });
  }, []);

  useEffect(() => {
    function handleMove(event) {
      if (!dragStateRef.current.dragging) return;
      const delta = dragStateRef.current.startY - event.clientY;
      const limits = getConsoleHeightLimits();
      const nextHeight = Math.min(limits.max, Math.max(limits.min, dragStateRef.current.startHeight + delta));
      setConsoleHeight(nextHeight);
    }
    function handleUp() {
      dragStateRef.current.dragging = false;
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const archivedCount = archivedLogs.length;
  const lastArchiveAt = archivedLogs[0]?.createdAt || null;
  const formattedArchiveHint = useMemo(() => {
    if (!lastArchiveAt) return "Sem arquivos ainda";
    const date = new Date(lastArchiveAt);
    return `Ultimo arquivo: ${date.toLocaleString("pt-BR")}`;
  }, [lastArchiveAt]);
  const coverageCards = useMemo(() => buildCoverageCards(moduleHistory), [moduleHistory]);
  const currentModuleKey = useMemo(() => inferModuleKeyFromPathname(router.pathname), [router.pathname]);
  const coverageRouteCount = useMemo(() => {
    return new Set(coverageCards.map((item) => item.routePath).filter(Boolean)).size;
  }, [coverageCards]);
  const coverageErrorCount = useMemo(() => {
    return coverageCards.filter((item) => item.tone === "danger").length;
  }, [coverageCards]);
  const moduleAlerts = useMemo(() => {
    const map = new Map();
    for (const card of coverageCards) {
      if (!PRIORITY_MODULE_KEYS.has(card.key)) continue;
      const alert = summarizeModuleAlert(card.key, activityLog, fingerprintStates);
      map.set(card.key, {
        ...alert,
        safeWindow: deriveModuleSafeWindow(card.key, card.snapshot, alert),
      });
    }
    return map;
  }, [activityLog, coverageCards, fingerprintStates]);

  useEffect(() => {
    function syncConsoleHeightToViewport() {
      const limits = getConsoleHeightLimits();
      setConsoleHeight((current) => {
        const safeCurrent = Number(current || 0) || limits.preferred;
        return Math.min(limits.max, Math.max(limits.min, safeCurrent));
      });
    }

    syncConsoleHeightToViewport();
    window.addEventListener("resize", syncConsoleHeightToViewport);
    return () => {
      window.removeEventListener("resize", syncConsoleHeightToViewport);
    };
  }, []);

  useEffect(() => {
    const limits = getConsoleHeightLimits();
    setConsoleHeight(limits.preferred);
  }, [router.pathname]);

  useEffect(() => {
    persistModuleHistory("interno-shell", {
      routePath: router.pathname,
      shell: "interno",
      title,
      description,
      consoleOpen,
      consoleTab,
      logPane,
      copilotOpen,
      navItems: NAV_ITEMS.length,
      archivedCount,
      recentLogCount: activityLog.length,
      frontendIssueCount: frontendIssues.length,
      schemaIssueCount: schemaIssues.length,
      updatedAt: new Date().toISOString(),
    });
  }, [
    activityLog.length,
    archivedCount,
    consoleOpen,
    consoleTab,
    copilotOpen,
    description,
    frontendIssues.length,
    logPane,
    router.pathname,
    schemaIssues.length,
    title,
  ]);

  useEffect(() => {
    if (!currentModuleKey) return;
    persistModuleHistory(currentModuleKey, {
      routePath: router.pathname,
      title,
      description,
      shell: "interno-page",
      consoleOpen,
      consoleTab,
      logPane,
      copilotOpen,
      coverage: {
        routeTracked: true,
        consoleIntegrated: true,
        rightRailEnabled: shouldRenderDotobotRail,
      },
    });
  }, [
    consoleOpen,
    consoleTab,
    copilotOpen,
    currentModuleKey,
    description,
    logPane,
    router.pathname,
    shouldRenderDotobotRail,
    title,
  ]);

  function handleStartResize(event) {
    if (!consoleOpen) return;
    dragStateRef.current.dragging = true;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.startHeight = consoleHeight;
  }

  async function handleCopyLog() {
    const text = formatActivityLogText(activityLog);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleExportLog() {
    const text = formatActivityLogMarkdown(activityLog, operationalNotes);
    if (!text) return;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hmadv-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleCopyFrontendIssues() {
    const text = formatFrontendIssuesMarkdown(frontendIssues);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleCopySchemaIssues() {
    const text = formatSchemaIssuesMarkdown(schemaIssues);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleCopyProcessHistory() {
    const payload = {
      local: processosLocalHistory,
      remote: processosRemoteHistory,
    };
    const text = JSON.stringify(payload, null, 2);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleCopyPublicacoesHistory() {
    const payload = publicacoesHistory || {
      local: publicacoesLocalHistory,
      remote: publicacoesRemoteHistory,
    };
    const text = JSON.stringify(payload, null, 2);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleCopyDotobotHistory() {
    const payload = moduleHistory?.dotobot || {};
    const text = JSON.stringify(payload, null, 2);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleCopyAiTaskHistory() {
    const payload = moduleHistory?.["ai-task"] || {};
    const text = JSON.stringify(payload, null, 2);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function handleCopyContactsHistory() {
    const payload = moduleHistory?.contacts || {};
    const text = JSON.stringify(payload, null, 2);
    if (text && navigator?.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }

  function handleArchive(reason) {
    archiveActivityLog(reason);
  }

  function handleAddNote() {
    const text = noteInput.trim();
    if (!text) return;
    appendOperationalNote({ text, type: "observacao" });
    setNoteInput("");
  }

  function handleFingerprintStateChange(entryOrFingerprint, status, note = "") {
    const fingerprint = typeof entryOrFingerprint === "string" ? entryOrFingerprint : entryOrFingerprint?.fingerprint;
    if (!fingerprint) return;
    const entry = typeof entryOrFingerprint === "string"
      ? activityLog.find((item) => item.fingerprint === fingerprint)
      : entryOrFingerprint;
    setFingerprintState(fingerprint, {
      status,
      note,
      lastEntryId: entry?.id || null,
      lastLabel: entry?.label || entry?.action || "Evento",
      source: "console",
    });
  }

  function handleFingerprintNote(entryOrFingerprint) {
    const fingerprint = typeof entryOrFingerprint === "string" ? entryOrFingerprint : entryOrFingerprint?.fingerprint;
    if (!fingerprint) return;
    const current = fingerprintStates?.[fingerprint] || {};
    const entry = typeof entryOrFingerprint === "string"
      ? activityLog.find((item) => item.fingerprint === fingerprint)
      : entryOrFingerprint;
    const note = window.prompt("Registrar observacao para este fingerprint:", current.note || "");
    if (note === null) return;
    handleFingerprintStateChange(entry || fingerprint, current.status || "acompanhando", note);
    if (String(note || "").trim()) {
      appendOperationalNote({
        type: "fingerprint",
        text: `${entry?.label || entry?.action || fingerprint}: ${String(note).trim()}`,
        meta: { fingerprint, status: current.status || "acompanhando" },
      });
    }
  }

  function handleBulkFingerprintStateChange(status) {
    if (!paneFingerprintSummary.length) return;
    const targets = paneFingerprintSummary.filter((item) => item.status !== status);
    if (!targets.length) return;
    for (const item of targets) {
      handleFingerprintStateChange(item.fingerprint, status, item.note || "");
    }
    appendOperationalNote({
      type: "bulk_triage",
      text: `Trilha ${logPane}: ${targets.length} fingerprint(s) marcados como ${status}.`,
      meta: { logPane, status, total: targets.length },
    });
  }

  function handleBulkFingerprintReset() {
    if (!paneFingerprintSummary.length) return;
    const targets = paneFingerprintSummary.filter((item) => item.status !== "aberto");
    if (!targets.length) return;
    for (const item of targets) {
      handleFingerprintStateChange(item.fingerprint, "aberto", item.note || "");
    }
    appendOperationalNote({
      type: "bulk_triage",
      text: `Trilha ${logPane}: ${targets.length} fingerprint(s) reabertos.`,
      meta: { logPane, status: "aberto", total: targets.length },
    });
  }

  function handleAddFrontendIssue() {
    if (!frontendForm.detail.trim()) return;
    appendFrontendIssue({
      page: frontendForm.page,
      component: frontendForm.component,
      detail: frontendForm.detail,
      status: frontendForm.status || "aberto",
    });
    appendActivityLog({
      label: "Registro Frontend UX",
      action: "frontend_issue",
      method: "UI",
      status: "success",
      module: inferFrontendModule(frontendForm.page),
      page: frontendForm.page || router.pathname,
      component: frontendForm.component || "Frontend UX",
      response: frontendForm.detail,
      consolePane: "frontend",
      domain: "ux",
      channel: "manual",
      tags: ["frontend", "ux", "manual"],
    });
    setFrontendForm({ page: "", component: "", detail: "", status: "aberto" });
  }

  function handleAddSchemaIssue() {
    const hasPayload = schemaForm.type || schemaForm.table || schemaForm.column || schemaForm.code || schemaForm.detail;
    if (!hasPayload) return;
    const issuePayload = {
      type: schemaForm.type || "schema_issue",
      table: schemaForm.table || null,
      column: schemaForm.column || null,
      code: schemaForm.code || null,
      detail: schemaForm.detail || null,
    };
    appendSchemaIssue({
      ...issuePayload,
    });
    appendActivityLog({
      label: "Registro de schema",
      action: "schema_issue",
      method: "UI",
      status: "success",
      page: router.pathname,
      component: "Schema",
      response: JSON.stringify(issuePayload, null, 2),
      schemaIssue: issuePayload,
      consolePane: "schema",
      domain: "database",
      channel: "manual",
      tags: ["schema", "manual"],
    });
    setSchemaForm({ type: "", table: "", column: "", code: "", detail: "" });
  }

  function updateFilters(next) {
    const normalized = normalizeConsoleFilters(next);
    setLogFilters(normalized);
    setActivityLogFilters(normalized);
  }

  function handleOpenModuleAlert(moduleKey) {
    const playbook = getModulePlaybook(moduleKey);
    setConsoleOpen(true);
    setConsoleTab("log");
    if (playbook?.pane) {
      setLogPane(playbook.pane);
    }
    updateFilters({
      module: moduleKey,
      tag: playbook?.tag || "",
    });
    setLogSearch("");
    appendOperationalNote({
      type: "alerta_modulo",
      text: `Console direcionado para o modulo ${moduleKey}.`,
      meta: { moduleKey, pane: playbook?.pane || "activity", tag: playbook?.tag || "" },
    });
  }

  function handlePageDebug() {
    appendActivityLog({
      label: "Debug UI (pagina)",
      status: "success",
      method: "UI",
      action: "debug_ui",
      path: router.pathname,
      page: router.pathname,
      component: title || "Pagina interna",
      response: `Debug manual iniciado em ${router.pathname}`,
      consolePane: "debug-ui",
      domain: "runtime",
      channel: "manual",
      tags: ["debug-ui", "manual"],
    });
  }

  function inferFrontendModule(pageValue) {
    const value = String(pageValue || "").toLowerCase();
    if (value.includes("contacts")) return "contacts";
    if (value.includes("processos")) return "processos";
    if (value.includes("publicacoes")) return "publicacoes";
    if (value.includes("financeiro")) return "financeiro";
    if (value.includes("ai-task")) return "ai-task";
    return "";
  }

  const processosHistory = moduleHistory?.processos || null;
  const processosLocalHistory = processosHistory?.executionHistory || [];
  const processosRemoteHistory = processosHistory?.remoteHistory || [];
  const publicacoesHistory = moduleHistory?.publicacoes || null;
  const publicacoesLocalHistory = publicacoesHistory?.executionHistory || [];
  const publicacoesRemoteHistory = publicacoesHistory?.remoteHistory || [];
  const dotobotHistory = moduleHistory?.dotobot || null;
  const aiTaskHistory = moduleHistory?.["ai-task"] || null;
  const contactsHistory = moduleHistory?.contacts || null;
  const integrationGuide = useMemo(() => getModuleIntegrationGuide(router.pathname), [router.pathname]);

  const filteredLog = useMemo(() => {
    return activityLog.filter((entry) => entryMatchesConsoleFilters(entry, logFilters, logSearch));
  }, [activityLog, logFilters, logSearch]);
  const debugLog = useMemo(() => filteredLog.filter((entry) => entry.action === "debug_ui" || (entry.tags || []).includes("debug-ui")), [filteredLog]);
  const activityOnlyLog = useMemo(() => filteredLog.filter((entry) => !["debug_ui", "frontend_issue", "schema_issue"].includes(String(entry.action || "")) && !(entry.tags || []).includes("debug-ui")), [filteredLog]);
  const tagScopedLogs = useMemo(() => buildTagScopedLogs(filteredLog), [filteredLog]);
  const historyPaneCount = useMemo(() => countHistorySnapshots(moduleHistory), [moduleHistory]);
  const unclassifiedTagEntriesCount = useMemo(() => countUnclassifiedEntries(activityOnlyLog), [activityOnlyLog]);
  const paneEntries = useMemo(() => {
    if (logPane === "activity") return activityOnlyLog;
    if (logPane === "debug") return debugLog;
    return tagScopedLogs[logPane] || [];
  }, [activityOnlyLog, debugLog, logPane, tagScopedLogs]);
  const paneCounts = useMemo(() => ({
    activity: activityOnlyLog.length,
    debug: debugLog.length,
    history: historyPaneCount,
    frontend: frontendIssues.length,
    schema: schemaIssues.length,
    notes: operationalNotes.length,
    security: tagScopedLogs.security.length,
    functions: tagScopedLogs.functions.length,
    routes: tagScopedLogs.routes.length,
    jobs: tagScopedLogs.jobs.length,
    webhook: tagScopedLogs.webhook.length,
    crm: tagScopedLogs.crm.length,
    supabase: tagScopedLogs.supabase.length,
    dotobot: tagScopedLogs.dotobot.length,
    "ai-task": tagScopedLogs["ai-task"].length,
    "data-quality": tagScopedLogs["data-quality"].length,
  }), [activityOnlyLog.length, debugLog.length, frontendIssues.length, historyPaneCount, operationalNotes.length, schemaIssues.length, tagScopedLogs]);
  const visibleLogPaneGroups = useMemo(() => LOG_PANE_GROUPS.map((group) => ({
    ...group,
    panes: LOG_PANES.filter((pane) => pane.group === group.key && shouldShowLogPane(pane, paneCounts, logPane)),
  })).filter((group) => group.panes.length > 0), [logPane, paneCounts]);
  const paneFingerprintSummary = useMemo(() => summarizeFingerprints(paneEntries, fingerprintStates), [fingerprintStates, paneEntries]);
  const paneRecommendationSummary = useMemo(() => summarizeRecommendations(paneEntries), [paneEntries]);
  const paneRisk = useMemo(() => calculateRiskScore(paneEntries, paneFingerprintSummary), [paneEntries, paneFingerprintSummary]);
  const paneTimeline = useMemo(() => summarizeTimeline(paneEntries), [paneEntries]);
  const paneSla = useMemo(() => summarizeSla(paneEntries, paneFingerprintSummary, fingerprintStates), [fingerprintStates, paneEntries, paneFingerprintSummary]);
  const paneTagPlaybook = useMemo(() => getTagPlaybook(logPane), [logPane]);
  const paneBulkGuardrail = useMemo(() => getBulkGuardrail(logPane, paneRisk, paneSla, paneEntries), [logPane, paneEntries, paneRisk, paneSla]);
  const currentOperationalRail = useMemo(() => {
    return buildOperationalRailData(currentModuleKey, moduleHistory?.[currentModuleKey] || null, activityLog);
  }, [activityLog, currentModuleKey, moduleHistory]);
  useEffect(() => {
    setLogExpanded(null);
  }, [logPane]);

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/interno/login");
  }

  useEffect(() => {
    setRightCollapsed(!shouldStartWithOpenRail);
    setCopilotOpen(shouldStartWithOpenRail);
  }, [shouldStartWithOpenRail]);

  function handleToggleRightRail() {
    if (!shouldRenderDotobotRail) return;
    setRightCollapsed((current) => {
      const nextCollapsed = !current;
      if (!nextCollapsed) {
        setCopilotOpen(true);
      }
      return nextCollapsed;
    });
  }

  function handleToggleCopilot() {
    if (!shouldRenderDotobotRail) return;
    setCopilotOpen((current) => {
      const next = !current;
      setRightCollapsed(!next);
      return next;
    });
  }

  const showExtensionManager = router.pathname === "/interno/ai-task" || router.pathname === "/interno/agentlab";
  const resolvedRightRail = typeof rightRail === "function"
    ? rightRail({ moduleKey: currentModuleKey, moduleHistory, activityLog })
    : rightRail;
  const consoleReservedSpace = consoleOpen ? consoleHeight + 20 : 52;
  const consoleDockLeft = isMobileShell ? 0 : leftCollapsed ? 88 : 272;
  const desktopRightRailWidth = rightRailMode === "compact" ? 320 : 388;
  const consoleDockRight = !isMobileShell && shouldRenderDotobotRail && !rightCollapsed ? desktopRightRailWidth : 0;

  return (
    <div className={`relative flex h-screen w-full overflow-hidden p-2 text-[Arial,sans-serif] md:p-3 ${isLightTheme ? "bg-[linear-gradient(180deg,#EEF2F6_0%,#E4EAF1_100%)] text-[#13201D]" : "bg-[radial-gradient(circle_at_top_left,rgba(30,24,13,0.16),transparent_24%),linear-gradient(180deg,#040605_0%,#070A09_100%)] text-[#F4F1EA]"}`}>
      {isMobileShell && !leftCollapsed ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setLeftCollapsed(true)}
          className="absolute inset-0 z-30 bg-[rgba(5,8,9,0.5)] backdrop-blur-[2px]"
        />
      ) : null}
      {/* SIDEBAR */}
      <aside className={`z-40 shrink-0 flex h-full flex-col rounded-[26px] border px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.02)] transition-all ${isLightTheme ? "border-[#C9D5E2] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.98))]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(11,18,16,0.98),rgba(8,14,13,0.95))]"} ${isMobileShell ? `absolute bottom-2 left-2 top-2 w-[292px] max-w-[calc(100vw-1rem)] ${leftCollapsed ? "pointer-events-none -translate-x-[110%] opacity-0" : "translate-x-0 opacity-100"}` : leftCollapsed ? "w-[88px] min-w-[88px]" : "w-[264px] min-w-[220px] max-w-[312px]"}`}>
        <Link href="/interno" prefetch={false} className="mb-8 block">
          {!leftCollapsed ? (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia</p>
              <h1 className={`text-[32px] font-semibold tracking-[-0.03em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Centro operacional</h1>
              <p className={`mt-3 max-w-[18rem] text-sm leading-6 ${isLightTheme ? "text-[#5E706C]" : "text-[#8FA39C]"}`}>
                Centro operacional para processos, CRM, governanca de agentes e engenharia de inteligencia do escritorio.
              </p>
            </>
          ) : (
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#233630]"}`}>
              HM
            </div>
          )}
        </Link>
        {!leftCollapsed ? (
          <div className={`mb-6 rounded-[18px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,249,251,0.84))]" : "border-[#1D2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))]"}`}>
            <p className={`text-[11px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#6D7F7B]" : "text-[#7F928C]"}`}>Perfil conectado</p>
            <p className={`mt-3 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{normalizeDisplayName(profile)}</p>
            <p className={`mt-1 text-sm ${isLightTheme ? "text-[#60716E]" : "text-[#91A49E]"}`}>{profile?.email}</p>
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#C5A059]">{profile?.role}</p>
          </div>
        ) : null}
        <nav aria-label="Navegacao interna" className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const active = router.pathname === item.href;
            return <SidebarItem key={item.href} item={item} active={active} collapsed={leftCollapsed} isLightTheme={isLightTheme} onNavigate={closeMobileSidebar} />;
          })}
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          {!leftCollapsed ? (
            <div className={`rounded-[18px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,249,251,0.84))]" : "border-[#1D2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"}`}>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6D7F7B]" : "text-[#7E918B]"}`}>Workspace</p>
              <p className={`mt-2 text-sm font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Sidebar, modulo e Dotobot</p>
              <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#60716E]" : "text-[#92A59F]"}`}>
                O painel lateral serve como atalho rapido. A experiencia completa de conversa, tarefas e execucao vive no AI Task central.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            className={`w-full rounded-[16px] border px-4 py-3 text-sm transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.86)] text-[#22312F]" : "border-[#22342F] bg-[rgba(255,255,255,0.015)] text-[#D8DEDA]"}`}
          >
            {!leftCollapsed ? "Sair" : "X"}
          </button>
        </div>
      </aside>
      {/* MAIN + COPILOT */}
        <div className={`${isMobileShell ? "ml-0" : "ml-2 md:ml-3"} flex h-full min-h-0 flex-1`}>
        {/* CONTEÚDO PRINCIPAL */}
        <div className={`relative flex h-full min-h-0 flex-1 min-w-0 flex-col overflow-hidden rounded-[26px] border shadow-[0_20px_56px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#CBD5E1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,247,250,0.96))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.95))]"}`}>
          <div className={`shrink-0 flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 md:px-5 md:py-3.5 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(247,249,251,0.88))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))]"}`}>
            <div className={`rounded-[16px] border px-3 py-2 ${isLightTheme ? "border-[#D5DEE9] bg-[rgba(255,255,255,0.82)]" : "border-[#1F2D29] bg-[rgba(255,255,255,0.02)]"}`}>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#7F928C]">Workspace</p>
              <p className="mt-1 text-[11px] text-[#C6D1CC]">{router.pathname}</p>
            </div>
            <div className="flex-1 px-4 xl:px-6">
              <div className={`mx-auto flex max-w-xl items-center gap-3 rounded-[16px] border px-4 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D5DEE9] bg-[rgba(255,255,255,0.84)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,15,14,0.86),rgba(8,10,9,0.9))]"}`}>
                <input
                  type="text"
                  placeholder="Buscar por processos, publicacoes, contas..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#60706A]"
                />
                <button
                  type="button"
                  onClick={handleToggleCopilot}
                  className={`rounded-[12px] border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#9A6E2D] hover:border-[#C5A059]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#C5A059] hover:border-[#C5A059] hover:text-[#F5E6C5]"}`}
                >
                  Chat
                </button>
              </div>
            </div>
          <div className={`flex shrink-0 items-center gap-2 rounded-[16px] border px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D5DEE9] bg-[rgba(255,255,255,0.84)]" : "border-[#1F2D29] bg-[rgba(255,255,255,0.02)]"}`}>
            <button
              type="button"
              onClick={handlePageDebug}
              className={`rounded-xl border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] text-[#60706A]" : "border-[#22342F] text-[#9BAEA8]"}`}
              title="Registrar debug desta pagina"
            >
              Debug
            </button>
            <button
              type="button"
              onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
              className={`flex h-10 w-10 items-center justify-center rounded-[14px] border transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#22312F]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]"}`}
              title={isLightTheme ? "Ativar modo escuro" : "Ativar modo claro"}
            >
              <span className="sr-only">{isLightTheme ? "Modo escuro" : "Modo claro"}</span>
              {isLightTheme ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2.5" />
                  <path d="M12 19.5V22" />
                  <path d="M4.93 4.93l1.77 1.77" />
                  <path d="M17.3 17.3l1.77 1.77" />
                  <path d="M2 12h2.5" />
                  <path d="M19.5 12H22" />
                  <path d="M4.93 19.07l1.77-1.77" />
                  <path d="M17.3 6.7l1.77-1.77" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLeftCollapsed((current) => !current)}
                className={`flex h-10 w-10 items-center justify-center rounded-[14px] border text-[0px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#22312F]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]"}`}
                title="Alternar sidebar"
              >
                <span className="sr-only">Sidebar</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </svg>
                <span className="text-lg">≡</span>
              </button>
              <button
                type="button"
                onClick={handleToggleRightRail}
                className={`flex h-10 w-10 items-center justify-center rounded-[14px] border text-[0px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#22312F]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]"}`}
                title="Alternar painel direito"
              >
                <span className="sr-only">Painel</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M15 4v16" />
                </svg>
                <span className="text-lg">▣</span>
              </button>
              <button
                type="button"
                onClick={() => setConsoleOpen((current) => !current)}
                className={`flex h-10 w-10 items-center justify-center rounded-[14px] border text-[0px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#22312F]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]"}`}
                title="Alternar console"
              >
                <span className="sr-only">Console</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="m8 10 2 2-2 2" />
                  <path d="M13 16h3" />
                </svg>
                <span className="text-lg">▤</span>
              </button>
            </div>
          </div>
          <div className={`flex min-h-0 flex-1 flex-col overflow-x-hidden ${isCopilotWorkspace ? "overflow-hidden" : "overflow-y-auto"}`} style={{ paddingBottom: `${consoleReservedSpace}px` }}>
          {!isCopilotWorkspace ? (
            <header className={`mb-6 shrink-0 border-b pb-5 px-4 pt-5 md:px-6 md:pt-6 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.14))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))]"}`}>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">Operacao interna</p>
                  <h2 className={`text-3xl font-semibold tracking-[-0.035em] md:text-[38px] ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{title}</h2>
                  {description ? <p className={`mt-3 max-w-3xl text-sm leading-7 ${isLightTheme ? "text-[#60716E]" : "text-[#99ADA6]"}`}>{description}</p> : null}
                </div>
              </div>
            </header>
          ) : null}
          <div className={`flex min-h-0 flex-1 flex-col ${isCopilotWorkspace ? "overflow-hidden px-3 pb-3 md:px-4 md:pb-4" : "gap-6 px-4 pb-4 md:px-6 md:pb-6"}`}>
            {!isCopilotWorkspace ? <IntegrationGuideCard guide={integrationGuide} /> : null}
            {children}
            {showExtensionManager && !isCopilotWorkspace ? <DotobotExtensionManager /> : null}
          </div>
          </div>
          <div
            className={`fixed bottom-3 z-30 min-h-[52px] overflow-hidden rounded-[24px] border shadow-[0_-12px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.02)] transition-all ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(10,12,11,0.985),rgba(6,8,7,0.98))]"} ${consoleOpen ? "flex flex-col" : "block h-[52px]"}`}
            style={{
              left: `${consoleDockLeft + (isMobileShell ? 8 : 12)}px`,
              right: `${consoleDockRight + 12}px`,
              height: consoleOpen ? `${consoleHeight}px` : undefined,
            }}
          >
            {consoleOpen ? (
              <div
                onMouseDown={handleStartResize}
                className={`shrink-0 flex h-3 cursor-row-resize items-center justify-center border-b text-[#60706A] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(210,219,229,0.55)]" : "border-[#1E2E29] bg-[rgba(255,255,255,0.02)]"}`}
                title="Arraste para redimensionar"
              >
                <span className={`h-1 w-10 rounded-full ${isLightTheme ? "bg-[#A5B4C3]" : "bg-[#22342F]"}`} />
              </div>
            ) : null}
            <div className={`shrink-0 flex items-center justify-between border-b px-5 py-3 text-xs uppercase tracking-[0.18em] text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8]" : "border-[#1A2421]"}`}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConsoleTab("console")}
                  className={`rounded-[14px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition ${
                    consoleTab === "console"
                      ? "border-[#C5A059] text-[#C5A059]"
                      : "border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059]"
                  }`}
                >
                  Console
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab("log")}
                  className={`rounded-[14px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition ${
                    consoleTab === "log"
                      ? "border-[#C5A059] text-[#C5A059]"
                      : "border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059]"
                  }`}
                >
                  Log
                </button>
                {consoleTab === "log" ? (
                  <div className="flex max-w-[70vw] flex-wrap items-start gap-3">
                    <span className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]">
                      {activityLog.length} entradas
                    </span>
                    {visibleLogPaneGroups.map((group) => (
                      <div key={group.key} className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[#60706A]">{group.label}</span>
                        {group.panes.map((pane) => <button
                          key={pane.key}
                          type="button"
                          onClick={() => setLogPane(pane.key)}
                          className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${logPane === pane.key ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#C5A059]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
                        >
                          {pane.label} {formatPaneCountLabel(paneCounts[pane.key] || 0)}
                        </button>)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setConsoleOpen((current) => !current)}
                className="rounded-[14px] border border-[#22342F] px-3 py-1.5 text-[10px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                {consoleOpen ? "Minimizar" : "Abrir"}
              </button>
            </div>
            {consoleOpen ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 text-xs text-[#9BAEA8]">
                {consoleTab === "console" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Snapshots</p>
                        <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{coverageCards.length}</p>
                        <p className="mt-1 text-[11px] text-[#9BAEA8]">Módulos e shells publicados no console.</p>
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Rotas cobertas</p>
                        <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{coverageRouteCount}</p>
                        <p className="mt-1 text-[11px] text-[#9BAEA8]">Rotas com telemetria ou snapshot ativo.</p>
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Com erro</p>
                        <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{coverageErrorCount}</p>
                        <p className="mt-1 text-[11px] text-[#9BAEA8]">Snapshots que reportaram falha visível.</p>
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Issues abertas</p>
                        <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{frontendIssues.length + schemaIssues.length}</p>
                        <p className="mt-1 text-[11px] text-[#9BAEA8]">UX e schema consolidados no workspace.</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 text-[11px] text-[#9BAEA8]">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Cobertura ativa</p>
                      <p className="mt-2">
                        O console agora agrega snapshots do app shell, layouts público e portal, shell interno e módulos operacionais.
                        Isso substitui o placeholder anterior e cria uma base única para expansão da cobertura por página e componente.
                      </p>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      {coverageCards.length ? coverageCards.map((item) => (
                        <div key={item.key} className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.55)] p-3 text-[11px]">
                          {moduleAlerts.has(item.key) ? <div className="mb-3 rounded-lg border border-[#22342F] bg-[rgba(10,12,11,0.45)] px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Alerta do modulo</span>
                              <span className={
                                moduleAlerts.get(item.key)?.tone === "danger"
                                  ? "text-red-200"
                                  : moduleAlerts.get(item.key)?.tone === "warn"
                                    ? "text-[#D9B46A]"
                                    : "text-[#11D473]"
                              }>
                                {moduleAlerts.get(item.key)?.tone === "danger" ? "critico" : moduleAlerts.get(item.key)?.tone === "warn" ? "monitorar" : "estavel"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                              <span className="rounded-full border border-[#5B2D2D] px-2 py-0.5 text-[#FECACA]">erros {moduleAlerts.get(item.key)?.errors || 0}</span>
                              <span className="rounded-full border border-[#6E5630] px-2 py-0.5 text-[#FDE68A]">warn {moduleAlerts.get(item.key)?.warnings || 0}</span>
                              <span className="rounded-full border border-[#22342F] px-2 py-0.5 text-[#E6E0D3]">abertos {moduleAlerts.get(item.key)?.recurringOpen || 0}</span>
                              <span className="rounded-full border border-[#22342F] px-2 py-0.5 text-[#E6E0D3]">acima 72h {moduleAlerts.get(item.key)?.stale || 0}</span>
                            </div>
                            {moduleAlerts.get(item.key)?.safeWindow ? <div className="mt-3 rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">
                                  {moduleAlerts.get(item.key).safeWindow.blocked ? "trava preventiva" : "janela segura"}
                                </span>
                                <div className="flex flex-wrap gap-2 text-[10px]">
                                  {moduleAlerts.get(item.key).safeWindow.chips.map((chip) => (
                                    <span key={`${item.key}_${chip}`} className="rounded-full border border-[#22342F] px-2 py-0.5 text-[#E6E0D3]">{chip}</span>
                                  ))}
                                </div>
                              </div>
                              <p className="mt-2 text-[#C7D0CA]">{moduleAlerts.get(item.key).safeWindow.summary}</p>
                            </div> : null}
                            {getModulePlaybook(item.key)?.checklist?.length ? <div className="mt-3 space-y-1 text-[11px] text-[#C7D0CA]">
                              {getModulePlaybook(item.key).checklist.map((step) => (
                                <div key={`${item.key}_${step}`} className="rounded-lg border border-[#1E2E29] bg-[rgba(8,10,9,0.45)] px-2 py-1.5">
                                  {step}
                                </div>
                              ))}
                            </div> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenModuleAlert(item.key)}
                                className="rounded-full border border-[#C5A059] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#F4E7C2]"
                              >
                                Abrir trilha guiada
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConsoleOpen(true);
                                  setConsoleTab("log");
                                  setLogPane("activity");
                                  updateFilters({ module: item.key });
                                  setLogSearch("");
                                }}
                                className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]"
                              >
                                Ver atividade
                              </button>
                            </div>
                          </div> : null}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{item.key}</p>
                              <p className="mt-1 font-semibold text-[#F5F1E8]">{item.routePath || "sem rota declarada"}</p>
                            </div>
                            <span
                              className={
                                item.tone === "danger"
                                  ? "text-red-200"
                                  : item.tone === "warn"
                                    ? "text-[#D9B46A]"
                                    : "text-[#11D473]"
                              }
                            >
                              {item.tone === "danger" ? "erro" : item.tone === "warn" ? "atencao" : "ok"}
                            </span>
                          </div>
                          <p className="mt-2 text-[#C7D0CA]">{item.summary}</p>
                          <div className="mt-2 text-[10px] text-[#7E918B]">
                            Atualizado em {item.updatedAt ? new Date(item.updatedAt).toLocaleString("pt-BR") : "sem horario"}
                          </div>
                          {item.capabilities?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.capabilities.slice(0, 4).map((capability) => (
                                <span key={`${item.key}_${capability}`} className="rounded-full border border-[#22342F] px-2 py-0.5 text-[10px] text-[#9BAEA8]">
                                  {capability}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {item.consoleTags?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.consoleTags.slice(0, 4).map((tag) => (
                                <span key={`${item.key}_${tag}`} className="rounded-full border border-[#3C3320] px-2 py-0.5 text-[10px] text-[#E7C987]">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {item.quickActions?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.quickActions.slice(0, 2).map((action) => (
                                <span key={`${item.key}_${action.id}`} className="rounded-full border border-[#35554B] px-2 py-0.5 text-[10px] text-[#B7D5CB]">
                                  {action.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.55)] p-3 text-[11px] text-[#9BAEA8]">
                          Nenhum snapshot publicado ainda.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.45)] px-3 py-2 text-[11px] text-[#7F928C]">
                      Itens organizados por grupos de visao, auditoria, integracoes, IA e governanca para reduzir mistura entre tipo de evento e origem tecnica.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => clearActivityLog()}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Limpar (arquivar)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive("Arquivo manual")}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Arquivar
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyLog}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Copiar log
                      </button>
                      <button
                        type="button"
                        onClick={handleExportLog}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Exportar MD
                      </button>
                      <span className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]">
                        Arquivos: {archivedCount}
                      </span>
                      <span className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]">
                        {formattedArchiveHint}
                      </span>
                    </div>
                    {!SPECIAL_LOG_PANES.has(logPane) ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 text-[10px] uppercase tracking-[0.14em] text-[#7F928C]">
                      <span>Filtros</span>
                      <input
                        value={logFilters.module || ""}
                        onChange={(event) => updateFilters({ ...logFilters, module: event.target.value })}
                        placeholder="Modulo"
                        className="h-7 w-[110px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                      />
                      <input
                        value={logFilters.page || ""}
                        onChange={(event) => updateFilters({ ...logFilters, page: event.target.value })}
                        placeholder="Pagina"
                        className="h-7 w-[140px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                      />
                      <input
                        value={logFilters.component || ""}
                        onChange={(event) => updateFilters({ ...logFilters, component: event.target.value })}
                        placeholder="Componente"
                        className="h-7 w-[140px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                      />
                      <input
                        value={logFilters.status || ""}
                        onChange={(event) => updateFilters({ ...logFilters, status: event.target.value })}
                        placeholder="Status"
                        className="h-7 w-[90px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                      />
                      <input
                        value={logFilters.tag || ""}
                        onChange={(event) => updateFilters({ ...logFilters, tag: event.target.value })}
                        placeholder="Tag"
                        className="h-7 w-[90px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                      />
                      <input
                        value={logSearch}
                        onChange={(event) => setLogSearch(event.target.value)}
                        placeholder="Buscar detalhes"
                        className="h-7 flex-1 min-w-[160px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                      />
                      <button
                        type="button"
                        onClick={() => updateFilters({ ...logFilters, tag: "severity:error" })}
                        className="rounded-full border border-[#5B2D2D] px-3 py-1 text-[10px] text-[#FECACA] transition hover:border-[#FCA5A5]"
                      >
                        So erro
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFilters({ ...logFilters, tag: "severity:warn" })}
                        className="rounded-full border border-[#6E5630] px-3 py-1 text-[10px] text-[#FDE68A] transition hover:border-[#FDE68A]"
                      >
                        So warn
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogSearch("");
                          updateFilters({});
                        }}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Limpar filtros
                      </button>
                    </div> : null}
                    {TAG_LOG_PANES.has(logPane) ? <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 text-[11px] text-[#9BAEA8]">
                      Trilha automatica por tag: <span className="text-[#F4E7C2]">{LOG_PANES.find((pane) => pane.key === logPane)?.label || logPane}</span>. Os eventos entram aqui pela taxonomia do console.
                      {!paneEntries.length && unclassifiedTagEntriesCount ? (
                        <span className="block mt-2 text-[#C7D0CA]">
                          Nenhuma entrada classificada nesta trilha. Existem {unclassifiedTagEntriesCount} evento(s) ainda sem tag automatica compativel.
                        </span>
                      ) : null}
                    </div> : null}
                    {paneTagPlaybook ? <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{paneTagPlaybook.title}</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Checklist sugerido para a trilha atual do console.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateFilters({ ...logFilters, tag: logPane });
                            appendOperationalNote({
                              type: "playbook_tag",
                              text: `Playbook ${logPane} consultado no console.`,
                              meta: { tag: logPane, pane: logPane },
                            });
                          }}
                          className="rounded-full border border-[#C5A059] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#F4E7C2]"
                        >
                          Fixar filtro
                        </button>
                      </div>
                      <div className="mt-3 space-y-2 text-[11px] text-[#C7D0CA]">
                        {paneTagPlaybook.checklist.map((step) => (
                          <div key={`${logPane}_${step}`} className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2">
                            {step}
                          </div>
                        ))}
                      </div>
                    </div> : null}
                    {paneBulkGuardrail ? <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{paneBulkGuardrail.title}</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">{paneBulkGuardrail.summary}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(paneBulkGuardrail.tone)}`}>
                          itens {paneBulkGuardrail.metrics.total} · erros {paneBulkGuardrail.metrics.errors} · running {paneBulkGuardrail.metrics.running}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2 text-[11px] text-[#C7D0CA]">
                        {paneBulkGuardrail.actions.map((step) => (
                          <div key={`${logPane}_${step}`} className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2">
                            {step}
                          </div>
                        ))}
                      </div>
                    </div> : null}
                    {!SPECIAL_LOG_PANES.has(logPane) && paneEntries.length ? <div className="grid gap-3 xl:grid-cols-2">
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 xl:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Risco da trilha</p>
                            <p className="mt-1 text-[11px] text-[#9BAEA8]">Score baseado em erros, warnings e recorrencia recente.</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(paneRisk.tone)}`}>
                            risco {paneRisk.label} · {paneRisk.score}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 xl:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">SLA e idade dos erros</p>
                            <p className="mt-1 text-[11px] text-[#9BAEA8]">Envelhecimento dos erros ainda nao resolvidos nesta trilha.</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(paneSla.tone)}`}>
                            aberto {paneSla.openRecurring} · acompanhando {paneSla.watchingRecurring} · resolvido {paneSla.resolvedRecurring}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="text-[#7F928C]">até 4h</div>
                            <div className="mt-1 font-semibold text-[#F4F1EA]">{paneSla.buckets.ate_4h}</div>
                          </div>
                          <div className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="text-[#7F928C]">4h - 24h</div>
                            <div className="mt-1 font-semibold text-[#F4F1EA]">{paneSla.buckets.ate_24h}</div>
                          </div>
                          <div className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="text-[#7F928C]">24h - 72h</div>
                            <div className="mt-1 font-semibold text-[#F4F1EA]">{paneSla.buckets.ate_72h}</div>
                          </div>
                          <div className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="text-[#7F928C]">acima de 72h</div>
                            <div className={`mt-1 font-semibold ${paneSla.buckets.acima_72h ? "text-[#FECACA]" : "text-[#F4F1EA]"}`}>{paneSla.buckets.acima_72h}</div>
                          </div>
                          <div className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="text-[#7F928C]">sem data</div>
                            <div className={`mt-1 font-semibold ${paneSla.buckets.sem_data ? "text-[#FDE68A]" : "text-[#F4F1EA]"}`}>{paneSla.buckets.sem_data}</div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Recorrencia</p>
                          {paneFingerprintSummary.length ? <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleBulkFingerprintStateChange("acompanhando")}
                              className="rounded-full border border-[#6E5630] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FDE68A]"
                            >
                              Acompanhar todos
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBulkFingerprintStateChange("resolvido")}
                              className="rounded-full border border-[#30543A] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#B7F7C6]"
                            >
                              Resolver todos
                            </button>
                            <button
                              type="button"
                              onClick={handleBulkFingerprintReset}
                              className="rounded-full border border-[#5B2D2D] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FECACA]"
                            >
                              Reabrir
                            </button>
                          </div> : null}
                        </div>
                        {!paneFingerprintSummary.length ? <p className="mt-2 text-[11px] opacity-60">Nenhum fingerprint recorrente nesta trilha.</p> : <div className="mt-2 space-y-2">
                          {paneFingerprintSummary.map((item) => <div key={item.fingerprint} className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{item.label}</span>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getFingerprintStatusTone(item.status)}`}>{item.status}</span>
                                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(item.severity)}`}>{item.count}x</span>
                              </div>
                            </div>
                            <div className="mt-1 text-[#7F928C]">{item.fingerprint}</div>
                            {item.note ? <div className="mt-2 text-[#C7D0CA]">{item.note}</div> : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleFingerprintStateChange(item.fingerprint, "aberto", item.note || "")}
                                className="rounded-full border border-[#5B2D2D] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FECACA]"
                              >
                                Aberto
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFingerprintStateChange(item.fingerprint, "acompanhando", item.note || "")}
                                className="rounded-full border border-[#6E5630] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FDE68A]"
                              >
                                Acompanhar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFingerprintStateChange(item.fingerprint, "resolvido", item.note || "")}
                                className="rounded-full border border-[#30543A] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#B7F7C6]"
                              >
                                Resolver
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFingerprintNote(item.fingerprint)}
                                className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]"
                              >
                                Nota
                              </button>
                            </div>
                          </div>)}
                        </div>}
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Acao recomendada</p>
                        {!paneRecommendationSummary.length ? <p className="mt-2 text-[11px] opacity-60">Sem recomendacoes consolidadas ainda.</p> : <div className="mt-2 space-y-2">
                          {paneRecommendationSummary.map((item) => <div key={item.action} className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{item.action}</span>
                              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(item.severity)}`}>{item.count}</span>
                            </div>
                          </div>)}
                        </div>}
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 xl:col-span-2">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Timeline operacional</p>
                        {!paneTimeline.length ? <p className="mt-2 text-[11px] opacity-60">Sem jobId/runId/contactId/processoId identificados nesta trilha.</p> : <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {paneTimeline.map((item) => <div key={item.key} className="rounded-lg border border-[#22342F] bg-[rgba(8,10,9,0.45)] px-3 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{item.label}</span>
                              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(item.severity)}`}>{item.count}</span>
                            </div>
                            <div className="mt-1 text-[#7F928C]">{item.lastAt ? new Date(item.lastAt).toLocaleString("pt-BR") : "sem data"}</div>
                          </div>)}
                        </div>}
                      </div>
                    </div> : null}
                    {logPane === "history" ? <div className="space-y-3">
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 text-[11px] text-[#9BAEA8]">
                        Historicos e snapshots operacionais separados por modulo.
                      </div>
                      <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Historico de execucao</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Consolidado do modulo Processos no console.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyProcessHistory}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar historico
                        </button>
                      </div>
                      {processosRemoteHistory.length ? (
                        <div className="mt-3 space-y-2">
                          {processosRemoteHistory.slice(0, 6).map((entry) => (
                            <div key={entry.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{entry.acao || "acao"}</span>
                                <span className={entry.status === "error" ? "text-red-200" : "text-[#11D473]"}>
                                  {entry.status}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] text-[#7E918B]">
                                {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "sem data"}
                              </div>
                              {entry.resumo ? <div className="mt-1 text-[#C7D0CA]">{entry.resumo}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico remoto disponível.</div>
                      )}
                      {processosLocalHistory.length ? (
                        <div className="mt-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Memoria local</p>
                          <div className="mt-2 space-y-2">
                            {processosLocalHistory.slice(0, 6).map((entry) => (
                              <div key={entry.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{entry.label || entry.action}</span>
                                  <span className="text-[#9BAEA8]">{entry.status || "status"}</span>
                                </div>
                                <div className="mt-1 text-[10px] text-[#7E918B]">
                                  {entry.startedAt ? new Date(entry.startedAt).toLocaleString("pt-BR") : "sem data"}
                                </div>
                                {entry.preview ? <div className="mt-1 text-[#C7D0CA]">{entry.preview}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico local registrado.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Historico de publicacoes</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Consolidado do modulo Publicacoes no console.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyPublicacoesHistory}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar historico
                        </button>
                      </div>
                      {publicacoesRemoteHistory.length ? (
                        <div className="mt-3 space-y-2">
                          {publicacoesRemoteHistory.slice(0, 6).map((entry) => (
                            <div key={entry.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{entry.acao || "acao"}</span>
                                <span className={entry.status === "error" ? "text-red-200" : "text-[#11D473]"}>
                                  {entry.status}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] text-[#7E918B]">
                                {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "sem data"}
                              </div>
                              {entry.resumo ? <div className="mt-1 text-[#C7D0CA]">{entry.resumo}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico remoto disponível.</div>
                      )}
                      {publicacoesLocalHistory.length ? (
                        <div className="mt-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Memoria local</p>
                          <div className="mt-2 space-y-2">
                            {publicacoesLocalHistory.slice(0, 6).map((entry) => (
                              <div key={entry.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{entry.label || entry.action}</span>
                                  <span className="text-[#9BAEA8]">{entry.status || "status"}</span>
                                </div>
                                <div className="mt-1 text-[10px] text-[#7E918B]">
                                  {entry.startedAt ? new Date(entry.startedAt).toLocaleString("pt-BR") : "sem data"}
                                </div>
                                {entry.preview ? <div className="mt-1 text-[#C7D0CA]">{entry.preview}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico local registrado.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Contacts</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Snapshot de qualidade da base, bulk actions e persistencia do modulo.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyContactsHistory}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar snapshot
                        </button>
                      </div>
                      {contactsHistory ? (
                        <div className="mt-3 space-y-2 text-[11px]">
                          <div className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Contato em foco</span>
                              <span className={contactsHistory.actionState?.error ? "text-red-200" : "text-[#11D473]"}>
                                {contactsHistory.selectedContact?.name || "nenhum"}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-[#7E918B]">
                              total {contactsHistory.overview?.total || 0} · duplicados {contactsHistory.overview?.duplicados || 0} · partes sem contato {contactsHistory.overview?.partesSemContato || 0}
                            </div>
                            <div className="mt-1 text-[#C7D0CA]">
                              sync {contactsHistory.settings?.syncLimit || 0} · reconcile {contactsHistory.settings?.reconcileLimit || 0} · pendentes selecionadas {contactsHistory.partesPendentes?.selected || 0} · vinculadas selecionadas {contactsHistory.partesVinculadas?.selected || 0}
                            </div>
                            {contactsHistory.actionState?.preview ? <div className="mt-1 text-[#C7D0CA]">Ultima acao: {contactsHistory.actionState.preview}</div> : null}
                            {contactsHistory.actionState?.error ? <div className="mt-1 text-red-200">Erro: {contactsHistory.actionState.error}</div> : null}
                          </div>
                          {Array.isArray(contactsHistory.executionHistory) && contactsHistory.executionHistory.length ? (
                            <div className="space-y-2">
                              {contactsHistory.executionHistory.slice(0, 4).map((entry) => (
                                <div key={entry.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold">{entry.label || entry.action}</span>
                                    <span className={entry.status === "error" ? "text-red-200" : entry.status === "success" ? "text-[#11D473]" : "text-[#D9B46A]"}>
                                      {entry.status || "running"}
                                    </span>
                                  </div>
                                  {entry.preview ? <div className="mt-1 text-[#C7D0CA]">{entry.preview}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem snapshot de Contacts.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Dotobot</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Snapshot do copilot, chat e task runs locais.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyDotobotHistory}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar snapshot
                        </button>
                      </div>
                      {dotobotHistory ? (
                        <div className="mt-3 space-y-2 text-[11px]">
                          <div className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Estado</span>
                              <span className={dotobotHistory.error ? "text-red-200" : "text-[#11D473]"}>
                                {dotobotHistory.uiState || "idle"}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-[#7E918B]">
                              modo {dotobotHistory.mode || "n/a"} · provider {dotobotHistory.provider || "n/a"} · conversas {dotobotHistory.conversationCount || 0}
                            </div>
                            {dotobotHistory.activeTask ? <div className="mt-1 text-[#C7D0CA]">Task ativa: {dotobotHistory.activeTask.query || dotobotHistory.activeTask.id}</div> : null}
                            {dotobotHistory.error ? <div className="mt-1 text-red-200">Erro: {dotobotHistory.error}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem snapshot do Dotobot.</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">AI Task</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Run ativa, trilha de logs e contexto persistido do orquestrador.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyAiTaskHistory}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar snapshot
                        </button>
                      </div>
                      {aiTaskHistory ? (
                        <div className="mt-3 space-y-2 text-[11px]">
                          <div className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Automacao</span>
                              <span className={aiTaskHistory.error ? "text-red-200" : "text-[#11D473]"}>
                                {aiTaskHistory.automation || "idle"}
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] text-[#7E918B]">
                              modo {aiTaskHistory.mode || "n/a"} · provider {aiTaskHistory.provider || "n/a"} · eventos {aiTaskHistory.eventsTotal || 0}
                            </div>
                            {aiTaskHistory.activeRun?.id ? <div className="mt-1 text-[#C7D0CA]">Run: {aiTaskHistory.activeRun.id}</div> : null}
                            {aiTaskHistory.error ? <div className="mt-1 text-red-200">Erro: {aiTaskHistory.error}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem snapshot do AI Task.</div>
                      )}
                    </div>
                    </div> : null}
                    {logPane === "frontend" ? <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Frontend UX</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Registre bugs de interface e debitos tecnicos por pagina.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyFrontendIssues}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar UX
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[#7F928C]">
                        <input
                          value={frontendForm.page}
                          onChange={(event) => setFrontendForm({ ...frontendForm, page: event.target.value })}
                          placeholder="Pagina"
                          className="h-7 w-[140px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={frontendForm.component}
                          onChange={(event) => setFrontendForm({ ...frontendForm, component: event.target.value })}
                          placeholder="Componente"
                          className="h-7 w-[160px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={frontendForm.status}
                          onChange={(event) => setFrontendForm({ ...frontendForm, status: event.target.value })}
                          placeholder="Status"
                          className="h-7 w-[110px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={frontendForm.detail}
                          onChange={(event) => setFrontendForm({ ...frontendForm, detail: event.target.value })}
                          placeholder="Detalhe do bug/UX"
                          className="h-7 flex-1 min-w-[220px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <button
                          type="button"
                          onClick={handleAddFrontendIssue}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Adicionar
                        </button>
                      </div>
                      {frontendIssues.length ? (
                        <div className="mt-3 space-y-2">
                          {frontendIssues.slice(0, 8).map((issue) => (
                            <div key={issue.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{issue.page || "pagina n/a"}</span>
                                <span className="text-[#D9B46A]">{issue.status || "aberto"}</span>
                              </div>
                              {issue.component ? <div className="mt-1 text-[#9BAEA8]">{issue.component}</div> : null}
                              <div className="mt-1 text-[#C7D0CA]">{issue.detail}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Nenhum bug/UX registrado.</div>
                      )}
                    </div> : null}
                    {logPane === "schema" ? <div className="rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Schema</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Mapeie rotas quebradas, SQL e ajustes de schema.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopySchemaIssues}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Copiar Schema
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[#7F928C]">
                        <input
                          value={schemaForm.type}
                          onChange={(event) => setSchemaForm({ ...schemaForm, type: event.target.value })}
                          placeholder="Tipo"
                          className="h-7 w-[120px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={schemaForm.table}
                          onChange={(event) => setSchemaForm({ ...schemaForm, table: event.target.value })}
                          placeholder="Tabela"
                          className="h-7 w-[140px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={schemaForm.column}
                          onChange={(event) => setSchemaForm({ ...schemaForm, column: event.target.value })}
                          placeholder="Coluna"
                          className="h-7 w-[140px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={schemaForm.code}
                          onChange={(event) => setSchemaForm({ ...schemaForm, code: event.target.value })}
                          placeholder="Codigo"
                          className="h-7 w-[120px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <input
                          value={schemaForm.detail}
                          onChange={(event) => setSchemaForm({ ...schemaForm, detail: event.target.value })}
                          placeholder="Detalhe/SQL"
                          className="h-7 flex-1 min-w-[220px] rounded-full border border-[#22342F] bg-transparent px-2 text-[10px] text-[#E6E0D3] outline-none placeholder:text-[#53625C]"
                        />
                        <button
                          type="button"
                          onClick={handleAddSchemaIssue}
                          className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Adicionar
                        </button>
                      </div>
                      {schemaIssues.length ? (
                        <div className="mt-3 space-y-2">
                          {schemaIssues.slice(0, 8).map((issue) => (
                            <div key={issue.id || issue.createdAt} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold">{issue.issue?.type || "schema_issue"}</span>
                                {issue.issue?.code ? <span className="text-[#D9B46A]">{issue.issue.code}</span> : null}
                              </div>
                              <div className="mt-1 text-[#9BAEA8]">
                                {issue.issue?.table ? `Tabela: ${issue.issue.table}` : "Tabela: n/a"}
                                {issue.issue?.column ? ` | Coluna: ${issue.issue.column}` : ""}
                              </div>
                              {issue.issue?.detail ? <div className="mt-1 text-[#C7D0CA]">{issue.issue.detail}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Nenhum ponto de schema registrado.</div>
                      )}
                    </div> : null}
                    {paneEntries.length ? (
                      <div className="space-y-2">
                        {paneEntries.slice(0, 30).map((entry) => (
                          <div key={entry.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(8,10,9,0.6)] px-3 py-2 text-[11px]">
                            {entry.fingerprint ? <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getFingerprintStatusTone(fingerprintStates?.[entry.fingerprint]?.status || "aberto")}`}>
                                  {fingerprintStates?.[entry.fingerprint]?.status || "aberto"}
                                </span>
                                {fingerprintStates?.[entry.fingerprint]?.updatedAt ? <span className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]">
                                  {new Date(fingerprintStates[entry.fingerprint].updatedAt).toLocaleString("pt-BR")}
                                </span> : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleFingerprintStateChange(entry, "acompanhando", fingerprintStates?.[entry.fingerprint]?.note || "")}
                                  className="rounded-full border border-[#6E5630] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FDE68A]"
                                >
                                  Acompanhar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFingerprintStateChange(entry, "resolvido", fingerprintStates?.[entry.fingerprint]?.note || "")}
                                  className="rounded-full border border-[#30543A] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#B7F7C6]"
                                >
                                  Resolver
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFingerprintNote(entry)}
                                  className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]"
                                >
                                  Nota
                                </button>
                              </div>
                            </div> : null}
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{entry.label || entry.action}</span>
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(entry.severity || (entry.status === "error" ? "error" : entry.status === "running" ? "warn" : "info"))}`}
                              >
                                {entry.severity || entry.status}
                              </span>
                            </div>
                            <div className="opacity-60">
                              {(entry.method || "").toUpperCase()} {entry.action || entry.path || entry.page}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[#6F7E78]">
                              {entry.module ? <span className="rounded-full border border-[#22342F] px-2 py-1">{entry.module}</span> : null}
                              {entry.page ? <span className="rounded-full border border-[#22342F] px-2 py-1">{entry.page}</span> : null}
                              {entry.component ? <span className="rounded-full border border-[#22342F] px-2 py-1">{entry.component}</span> : null}
                              {entry.durationMs !== undefined ? <span className="rounded-full border border-[#22342F] px-2 py-1">{entry.durationMs}ms</span> : null}
                              {entry.fingerprint ? <span className="rounded-full border border-[#22342F] px-2 py-1">{entry.fingerprint}</span> : null}
                              {(entry.tags || []).length ? <span className="rounded-full border border-[#22342F] px-2 py-1">tags: {(entry.tags || []).join(", ")}</span> : null}
                            </div>
                            {entry.recommendedAction ? <div className="mt-2 rounded-lg border border-[#22342F] bg-[rgba(10,12,11,0.45)] px-3 py-2 text-[11px] text-[#C7D0CA]">
                              <span className="text-[#D9B46A]">Proxima acao:</span> {entry.recommendedAction}
                            </div> : null}
                            {entry.fingerprint && fingerprintStates?.[entry.fingerprint]?.note ? <div className="mt-2 rounded-lg border border-[#22342F] bg-[rgba(10,12,11,0.45)] px-3 py-2 text-[11px] text-[#C7D0CA]">
                              <span className="text-[#D9B46A]">Observacao:</span> {fingerprintStates[entry.fingerprint].note}
                            </div> : null}
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setLogExpanded((current) => (current === entry.id ? null : entry.id))}
                                className="text-[10px] uppercase tracking-[0.14em] text-[#C5A059]"
                              >
                                {logExpanded === entry.id ? "Ocultar detalhes" : "Ver detalhes"}
                              </button>
                            </div>
                            {logExpanded === entry.id ? (
                              <div className="mt-2 space-y-2 text-[11px] text-[#C7D0CA]">
                                {entry.request ? (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#7F928C]">Request</p>
                                    <pre className="mt-1 max-h-[160px] overflow-auto rounded-lg border border-[#1E2E29] bg-[rgba(9,12,11,0.6)] p-2 text-[10px] text-[#DADFD8]">{entry.request}</pre>
                                  </div>
                                ) : null}
                                {getActivityLogResponseText(entry) ? (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#7F928C]">Response</p>
                                    <pre className="mt-1 max-h-[160px] overflow-auto rounded-lg border border-[#1E2E29] bg-[rgba(9,12,11,0.6)] p-2 text-[10px] text-[#DADFD8]">{getActivityLogResponseText(entry)}</pre>
                                  </div>
                                ) : null}
                                {entry.error ? (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#D18585]">Erro</p>
                                    <pre className="mt-1 max-h-[160px] overflow-auto rounded-lg border border-[#3A1F22] bg-[rgba(34,12,14,0.6)] p-2 text-[10px] text-[#F2C7C7]">{entry.error}</pre>
                                  </div>
                                ) : null}
                                {entry.schemaIssue ? (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#D9B46A]">Schema/SQL</p>
                                    <pre className="mt-1 max-h-[160px] overflow-auto rounded-lg border border-[#2B2616] bg-[rgba(20,16,8,0.7)] p-2 text-[10px] text-[#EAD9B2]">{JSON.stringify(entry.schemaIssue, null, 2)}</pre>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : !SPECIAL_LOG_PANES.has(logPane) ? (
                      <div className="text-[11px] opacity-60">
                        {logPane === "debug" ? "Nenhum debug UI registrado." : `Nenhuma entrada classificada em ${LOG_PANES.find((pane) => pane.key === logPane)?.label || logPane}.`}
                      </div>
                    ) : null}
                    {logPane === "notes" ? <div className="mt-4 rounded-xl border border-[#1E2E29] bg-[rgba(8,10,9,0.5)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Memoria operacional</p>
                          <p className="mt-1 text-[11px] text-[#9BAEA8]">Registre gargalos, debitos tecnicos e progresso.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={noteInput}
                            onChange={(event) => setNoteInput(event.target.value)}
                            placeholder="Adicionar nota rapida..."
                            className="h-8 w-[220px] rounded-full border border-[#22342F] bg-transparent px-3 text-[11px] text-[#E6E0D3] outline-none placeholder:text-[#54605B]"
                          />
                          <button
                            type="button"
                            onClick={handleAddNote}
                            className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>
                      {operationalNotes.length ? (
                        <div className="mt-3 space-y-2">
                          {operationalNotes.slice(0, 10).map((note) => (
                            <div key={note.id} className="rounded-lg border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] px-3 py-2 text-[11px]">
                              <div className="flex items-center justify-between">
                                <span className="text-[#D9B46A]">{note.type || "nota"}</span>
                                <span className="text-[10px] text-[#6E7E78]">
                                  {new Date(note.createdAt || Date.now()).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div className="mt-1 text-[#C7D0CA]">{note.text}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Nenhuma nota registrada.</div>
                      )}
                    </div> : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {shouldRenderDotobotRail && !rightCollapsed ? (
          <div className="fixed inset-y-3 right-3 z-40 flex w-[min(100vw-0.75rem,420px)] flex-col overflow-hidden rounded-[30px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.96))] shadow-[-24px_0_56px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.02)] xl:relative xl:inset-y-auto xl:right-auto xl:z-auto xl:h-full xl:w-[360px] xl:min-w-[320px] xl:max-w-[420px] xl:rounded-[30px] xl:bg-[linear-gradient(180deg,rgba(8,10,9,0.96),rgba(7,9,8,0.94))] xl:shadow-none">
            {currentOperationalRail || resolvedRightRail ? (
              <div className="max-h-[42%] shrink-0 overflow-auto border-b border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 xl:max-h-[48%]">
                {currentOperationalRail ? (
                  <OperationalRightRail
                    data={currentOperationalRail}
                    onOpenConsole={() => {
                      setConsoleOpen(true);
                      setConsoleTab("console");
                    }}
                    onOpenJobsLog={() => {
                      setConsoleOpen(true);
                      setConsoleTab("log");
                      setLogPane("jobs");
                      updateFilters({ module: currentModuleKey, tag: "jobs" });
                    }}
                  />
                ) : null}
                {resolvedRightRail ? <div className={currentOperationalRail ? "mt-4" : ""}>{resolvedRightRail}</div> : null}
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              {copilotOpen ? (
                <DotobotCopilot
                  profile={profile}
                  routePath={router.pathname}
                  initialWorkspaceOpen={rightRailFullscreen ? true : false}
                  defaultCollapsed={false}
                  compactRail={!rightRailFullscreen}
                  showCollapsedTrigger={false}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#9BAEA8]">
                  Painel direito fechado.
                </div>
              )}
            </div>
          </div>
        ) : null}
        {shouldRenderDotobotRail ? (
          <button
            type="button"
            onClick={handleToggleCopilot}
            className="group fixed bottom-24 right-4 z-[80] flex items-center gap-2 rounded-[18px] border border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#07110E] shadow-[0_10px_30px_rgba(197,160,89,0.3)]"
          >
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#07110E]" />
            <span>{copilotOpen && !rightCollapsed ? "Fechar painel" : "Abrir copilot"}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
