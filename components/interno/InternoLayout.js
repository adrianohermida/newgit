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
  getSchemaIssues,
  setModuleHistory as persistModuleHistory,
  subscribeActivityLog,
  setActivityLogFilters,
} from "../../lib/admin/activity-log";
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
          endpoint: "functions/api/admin-lawdesk-chat.js",
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
    return subscribeActivityLog((entries, archives, notes, filters, frontendItems, schemaItems, moduleSnapshot) => {
      setActivityLog(entries);
      setArchivedLogs(archives || []);
      setOperationalNotes(notes || []);
      setFrontendIssues(frontendItems || []);
      setSchemaIssues(schemaItems || []);
      if (moduleSnapshot && typeof moduleSnapshot === "object") {
        setModuleHistory(moduleSnapshot);
      }
      if (filters && Object.keys(filters).length) {
        setLogFilters(filters);
      }
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
      tags: ["schema", "manual"],
    });
    setSchemaForm({ type: "", table: "", column: "", code: "", detail: "" });
  }

  function updateFilters(next) {
    setLogFilters(next);
    setActivityLogFilters(next);
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
    const normalizedSearch = logSearch.trim().toLowerCase();
    return activityLog.filter((entry) => {
      if (logFilters.module && String(entry.module || "").toLowerCase() !== logFilters.module.toLowerCase()) {
        return false;
      }
      if (logFilters.page && String(entry.page || "").toLowerCase().indexOf(logFilters.page.toLowerCase()) === -1) {
        return false;
      }
      if (logFilters.component && String(entry.component || "").toLowerCase().indexOf(logFilters.component.toLowerCase()) === -1) {
        return false;
      }
      if (logFilters.status && String(entry.status || "").toLowerCase() !== logFilters.status.toLowerCase()) {
        return false;
      }
      if (logFilters.tag && !(Array.isArray(entry.tags) ? entry.tags : []).some((tag) => String(tag).toLowerCase().includes(logFilters.tag.toLowerCase()))) {
        return false;
      }
      if (normalizedSearch) {
        const haystack = [
          entry.label,
          entry.action,
          entry.path,
          entry.method,
          entry.page,
          entry.component,
          entry.module,
          entry.request,
          entry.response,
          entry.error,
          (entry.tags || []).join(" "),
          entry.schemaIssue ? JSON.stringify(entry.schemaIssue) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [activityLog, logFilters, logSearch]);
  const debugLog = useMemo(() => filteredLog.filter((entry) => entry.action === "debug_ui" || (entry.tags || []).includes("debug-ui")), [filteredLog]);
  const activityOnlyLog = useMemo(() => filteredLog.filter((entry) => !["debug_ui", "frontend_issue", "schema_issue"].includes(String(entry.action || "")) && !(entry.tags || []).includes("debug-ui")), [filteredLog]);
  const tagScopedLogs = useMemo(() => ({
    security: filteredLog.filter((entry) => (entry.tags || []).includes("security")),
    functions: filteredLog.filter((entry) => (entry.tags || []).includes("functions")),
    routes: filteredLog.filter((entry) => (entry.tags || []).includes("routes")),
    jobs: filteredLog.filter((entry) => (entry.tags || []).includes("jobs")),
    webhook: filteredLog.filter((entry) => (entry.tags || []).includes("webhook")),
    crm: filteredLog.filter((entry) => (entry.tags || []).includes("crm")),
    supabase: filteredLog.filter((entry) => (entry.tags || []).includes("supabase")),
    dotobot: filteredLog.filter((entry) => (entry.tags || []).includes("dotobot")),
    "ai-task": filteredLog.filter((entry) => (entry.tags || []).includes("ai-task")),
    "data-quality": filteredLog.filter((entry) => (entry.tags || []).includes("data-quality")),
  }), [filteredLog]);
  const paneEntries = useMemo(() => {
    if (logPane === "activity") return activityOnlyLog;
    if (logPane === "debug") return debugLog;
    return tagScopedLogs[logPane] || [];
  }, [activityOnlyLog, debugLog, logPane, tagScopedLogs]);
  const historyCards = useMemo(() => ([
    {
      key: "processos",
      title: "Historico de execucao",
      subtitle: "Consolidado do modulo Processos no console.",
      onCopy: handleCopyProcessHistory,
      remote: processosRemoteHistory,
      local: processosLocalHistory,
    },
    {
      key: "publicacoes",
      title: "Historico de publicacoes",
      subtitle: "Consolidado do modulo Publicacoes no console.",
      onCopy: handleCopyPublicacoesHistory,
      remote: publicacoesRemoteHistory,
      local: publicacoesLocalHistory,
    },
    {
      key: "contacts",
      title: "Contacts",
      subtitle: "Snapshot de qualidade da base, bulk actions e persistencia do modulo.",
      onCopy: handleCopyContactsHistory,
      snapshot: contactsHistory,
    },
    {
      key: "dotobot",
      title: "Dotobot",
      subtitle: "Snapshot do copilot, chat e task runs locais.",
      onCopy: handleCopyDotobotHistory,
      snapshot: dotobotHistory,
    },
    {
      key: "ai-task",
      title: "AI Task",
      subtitle: "Run ativa, trilha de logs e contexto persistido do orquestrador.",
      onCopy: handleCopyAiTaskHistory,
      snapshot: aiTaskHistory,
    },
  ]), [aiTaskHistory, contactsHistory, dotobotHistory, processosLocalHistory, processosRemoteHistory, publicacoesLocalHistory, publicacoesRemoteHistory]);

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
                      {pane.label}
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
                    {!["history", "frontend", "schema", "notes"].includes(logPane) ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 text-[10px] uppercase tracking-[0.14em] text-[#7F928C]">
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
                        onClick={() => {
                          setLogSearch("");
                          updateFilters({});
                        }}
                        className="rounded-full border border-[#22342F] px-3 py-1 text-[10px] text-[#9BAEA8] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Limpar filtros
                      </button>
                    </div> : null}
                    {!["activity", "debug", "history", "frontend", "schema", "notes"].includes(logPane) ? <div className="rounded-xl border border-[#1E2E29] bg-[rgba(10,12,11,0.6)] p-3 text-[11px] text-[#9BAEA8]">
                      Trilha automatica por tag: <span className="text-[#F4E7C2]">{LOG_PANES.find((pane) => pane.key === logPane)?.label || logPane}</span>. Os eventos entram aqui conforme heuristica de coleta do console.
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
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{entry.label || entry.action}</span>
                              <span
                                className={
                                  entry.status === "error"
                                    ? "text-red-200"
                                    : entry.status === "success"
                                      ? "text-[#11D473]"
                                      : "text-[#C5A059]"
                                }
                              >
                                {entry.status}
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
                              {(entry.tags || []).length ? <span className="rounded-full border border-[#22342F] px-2 py-1">tags: {(entry.tags || []).join(", ")}</span> : null}
                            </div>
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
                    ) : !["history", "frontend", "schema", "notes"].includes(logPane) ? (
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
