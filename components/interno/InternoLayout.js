import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
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

const NAV_ITEMS = [
  { href: "/interno", label: "Visao geral" },
  { href: "/interno/ai-task", label: "AI Task" },
  { href: "/interno/aprovacoes", label: "Aprovacoes" },
  { href: "/interno/financeiro", label: "Financeiro" },
  { href: "/interno/processos", label: "Processos" },
  { href: "/interno/publicacoes", label: "Publicacoes" },
  { href: "/interno/contacts", label: "Contatos" },
  { href: "/interno/agentlab", label: "AgentLab" },
  { href: "/interno/posts", label: "Conteudo" },
  { href: "/interno/agendamentos", label: "Agenda" },
  { href: "/interno/leads", label: "Leads" },
];

function normalizeDisplayName(profile) {
  return profile?.full_name || profile?.email || "Hermida Maia";
}

function SidebarItem({ item, active, collapsed }) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-all ${
        active
          ? "border-[#C5A059] bg-[#C5A059] text-[#07110E] shadow-[0_10px_30px_rgba(197,160,89,0.16)]"
          : "border-[#1F2A27] bg-[rgba(255,255,255,0.01)] text-[#D8DED9] hover:border-[#2F3E39] hover:bg-[rgba(255,255,255,0.025)]"
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${active ? "border-[rgba(7,17,14,0.1)] bg-[rgba(7,17,14,0.08)]" : "border-[#233630] bg-[rgba(255,255,255,0.02)] group-hover:border-[#35554B]"}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-[#07110E]" : "bg-[#C5A059]"}`} />
      </span>
      {!collapsed ? <span className="font-medium">{item.label}</span> : null}
    </Link>
  );
}

function RailPanel({ title, subtitle, children }) {
  return (
    <section className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
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
  { key: "activity", label: "Atividade" },
  { key: "debug", label: "Debug UI" },
  { key: "history", label: "Historico" },
  { key: "frontend", label: "Frontend" },
  { key: "schema", label: "Schema" },
  { key: "security", label: "Seguranca" },
  { key: "functions", label: "Functions" },
  { key: "routes", label: "Rotas" },
  { key: "jobs", label: "Jobs" },
  { key: "webhook", label: "Webhook" },
  { key: "crm", label: "CRM" },
  { key: "supabase", label: "Supabase" },
  { key: "dotobot", label: "Dotobot" },
  { key: "ai-task", label: "AI Task" },
  { key: "data-quality", label: "Dados" },
  { key: "notes", label: "Notas" },
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
  const initialWorkspaceOpen = router.pathname === "/interno/agentlab/conversations";
  const shouldRenderDotobotRail = !hideDotobotRail || forceDotobotRail;
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [consoleTab, setConsoleTab] = useState("console");
  const [logPane, setLogPane] = useState("activity");
  const [activityLog, setActivityLog] = useState([]);
  const [archivedLogs, setArchivedLogs] = useState([]);
  const [operationalNotes, setOperationalNotes] = useState([]);
  const [frontendIssues, setFrontendIssues] = useState(() => getFrontendIssues());
  const [fingerprintStates, setFingerprintStates] = useState(() => getFingerprintStates());
  const [schemaIssues, setSchemaIssues] = useState(() => getSchemaIssues());
  const [moduleHistory, setModuleHistory] = useState({});
  const [consoleHeight, setConsoleHeight] = useState(260);
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
      const nextHeight = Math.min(560, Math.max(160, dragStateRef.current.startHeight + delta));
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
  const paneFingerprintSummary = useMemo(() => summarizeFingerprints(paneEntries, fingerprintStates), [fingerprintStates, paneEntries]);
  const paneRecommendationSummary = useMemo(() => summarizeRecommendations(paneEntries), [paneEntries]);
  const paneRisk = useMemo(() => calculateRiskScore(paneEntries, paneFingerprintSummary), [paneEntries, paneFingerprintSummary]);
  const paneTimeline = useMemo(() => summarizeTimeline(paneEntries), [paneEntries]);
  const paneSla = useMemo(() => summarizeSla(paneEntries, paneFingerprintSummary, fingerprintStates), [fingerprintStates, paneEntries, paneFingerprintSummary]);
  useEffect(() => {
    setLogExpanded(null);
  }, [logPane]);

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/interno/login");
  }

  return (
    <div className="flex w-full h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(30,24,13,0.24),transparent_30%),linear-gradient(180deg,#050706_0%,#070A09_100%)] text-[#F4F1EA]">
      {/* SIDEBAR */}
      <aside className={`flex flex-col h-full border-r border-[#22342F] bg-[linear-gradient(180deg,rgba(10,18,16,0.98),rgba(8,15,13,0.94))] px-5 py-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)] transition-all ${leftCollapsed ? "w-[88px]" : "w-[272px] min-w-[220px] max-w-[320px]"}`}>
        <Link href="/interno" prefetch={false} className="mb-8 block">
          {!leftCollapsed ? (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia</p>
              <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#F5F1E8]">Centro operacional</h1>
              <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#8FA39C]">
                Centro operacional para processos, CRM, governanca de agentes e engenharia de inteligencia do escritorio.
              </p>
            </>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#233630] text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059]">
              HM
            </div>
          )}
        </Link>
        {!leftCollapsed ? (
          <div className="mb-6 rounded-[24px] border border-[#1D2E29] bg-[rgba(255,255,255,0.03)] p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F928C]">Perfil conectado</p>
            <p className="mt-3 text-lg font-semibold text-[#F8F4EB]">{normalizeDisplayName(profile)}</p>
            <p className="mt-1 text-sm text-[#91A49E]">{profile?.email}</p>
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#C5A059]">{profile?.role}</p>
          </div>
        ) : null}
        <nav aria-label="Navegacao interna" className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const active = router.pathname === item.href;
            return <SidebarItem key={item.href} item={item} active={active} collapsed={leftCollapsed} />;
          })}
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          {!leftCollapsed ? (
            <div className="rounded-[22px] border border-[#1D2E29] bg-[rgba(255,255,255,0.02)] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Workspace</p>
              <p className="mt-2 text-sm font-medium text-[#F5F1E8]">Sidebar, modulo e Dotobot</p>
              <p className="mt-2 text-sm leading-6 text-[#92A59F]">
                O painel lateral serve como atalho rapido. A experiencia completa de conversa, tarefas e execucao vive no AI Task central.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-2xl border border-[#22342F] px-4 py-3 text-sm text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
          >
            {!leftCollapsed ? "Sair" : "X"}
          </button>
        </div>
      </aside>
      {/* MAIN + COPILOT */}
      <div className="flex flex-1 h-full">
        {/* CONTEÚDO PRINCIPAL */}
        <div className="flex flex-1 min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-[#1E2E29] px-6 py-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#7F928C]">Workspace</div>
            <div className="flex-1 px-6">
              <div className="mx-auto flex max-w-xl items-center gap-3 rounded-full border border-[#22342F] bg-[rgba(8,10,9,0.7)] px-4 py-2 text-sm">
                <input
                  type="text"
                  placeholder="Buscar por processos, publicacoes, contas..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[#60706A]"
                />
                <button
                  type="button"
                  onClick={() => setCopilotOpen((current) => !current)}
                  className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#C5A059] transition hover:border-[#C5A059] hover:text-[#F5E6C5]"
                >
                  Chat
                </button>
              </div>
            </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePageDebug}
              className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              title="Registrar debug desta pagina"
            >
              Debug
            </button>
            <button
              type="button"
              onClick={() => setLeftCollapsed((current) => !current)}
                className="h-9 w-9 rounded-lg border border-[#22342F] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                title="Alternar sidebar"
              >
                <span className="sr-only">Sidebar</span>
                <span className="text-lg">≡</span>
              </button>
              <button
                type="button"
                onClick={() => setRightCollapsed((current) => !current)}
                className="h-9 w-9 rounded-lg border border-[#22342F] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                title="Alternar painel direito"
              >
                <span className="sr-only">Painel</span>
                <span className="text-lg">▣</span>
              </button>
              <button
                type="button"
                onClick={() => setConsoleOpen((current) => !current)}
                className="h-9 w-9 rounded-lg border border-[#22342F] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                title="Alternar console"
              >
                <span className="sr-only">Console</span>
                <span className="text-lg">▤</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
          <header className="mb-6 border-b border-[#1E2E29] pb-5 px-6 pt-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">Operacao interna</p>
                <h2 className="text-3xl font-semibold tracking-[-0.035em] text-[#F8F4EB] md:text-[38px]">{title}</h2>
                {description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-[#99ADA6]">{description}</p> : null}
              </div>
            </div>
          </header>
          <div className="space-y-6 px-6 pb-6">
            <IntegrationGuideCard guide={integrationGuide} />
            {children}
            <DotobotExtensionManager />
          </div>
          </div>
          <div
            className={`border-t border-[#1E2E29] bg-[rgba(6,8,7,0.92)] transition-all ${consoleOpen ? "" : "h-[44px]"}`}
            style={consoleOpen ? { height: `${consoleHeight}px` } : undefined}
          >
            {consoleOpen ? (
              <div
                onMouseDown={handleStartResize}
                className="flex h-3 cursor-row-resize items-center justify-center border-b border-[#1E2E29] text-[#60706A]"
                title="Arraste para redimensionar"
              >
                <span className="h-1 w-10 rounded-full bg-[#22342F]" />
              </div>
            ) : null}
            <div className="flex items-center justify-between px-5 py-2 text-xs uppercase tracking-[0.18em] text-[#C5A059]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConsoleTab("console")}
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
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
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
                    consoleTab === "log"
                      ? "border-[#C5A059] text-[#C5A059]"
                      : "border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059]"
                  }`}
                >
                  Log
                </button>
                {consoleTab === "log" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#22342F] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9BAEA8]">
                      {activityLog.length} entradas
                    </span>
                    {LOG_PANES.map((pane) => <button
                      key={pane.key}
                      type="button"
                      onClick={() => setLogPane(pane.key)}
                      className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${logPane === pane.key ? "border-[#C5A059] text-[#C5A059]" : "border-[#22342F] text-[#9BAEA8]"}`}
                    >
                      {pane.label} {paneCounts[pane.key] ? `(${paneCounts[pane.key]})` : ""}
                    </button>)}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setConsoleOpen((current) => !current)}
                className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                {consoleOpen ? "Minimizar" : "Abrir"}
              </button>
            </div>
            {consoleOpen ? (
              <div className="h-[calc(100%-52px)] overflow-y-auto px-5 pb-4 text-xs text-[#9BAEA8]">
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
          <div className="relative h-full w-[380px] border-l border-[#22342F] bg-[rgba(8,10,9,0.9)]">
            {copilotOpen ? (
              <DotobotCopilot
                profile={profile}
                routePath={router.pathname}
                initialWorkspaceOpen={rightRailFullscreen ? true : initialWorkspaceOpen}
                defaultCollapsed={false}
                compactRail={false}
                showCollapsedTrigger={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#9BAEA8]">
                Painel direito fechado.
              </div>
            )}
          </div>
        ) : null}
        {copilotOpen ? (
          <button
            type="button"
            onClick={() => setCopilotOpen(false)}
            className="group fixed right-0 top-1/2 z-[80] -translate-y-1/2 rounded-l-2xl border border-[#C5A059] bg-[#C5A059] px-2 py-5 text-[10px] uppercase tracking-[0.32em] text-[#07110E] shadow-[0_10px_30px_rgba(197,160,89,0.3)]"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            <span className="group-hover:hidden">Copilot</span>
            <span className="hidden group-hover:block text-[12px]">X</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
