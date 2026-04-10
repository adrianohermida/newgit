import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
import DotobotCopilot from "./DotobotPanel";
import DotobotExtensionManager from "./DotobotExtensionManager";

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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLeftCollapsed((current) => !current)}
                className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Sidebar
              </button>
              <button
                type="button"
                onClick={() => setRightCollapsed((current) => !current)}
                className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Painel
              </button>
              <button
                type="button"
                onClick={() => setConsoleOpen((current) => !current)}
                className="rounded-full border border-[#22342F] px-3 py-2 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Console
              </button>
            </div>
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
                onClick={() => setCopilotOpen((current) => !current)}
                className="rounded-full border border-[#C5A059] px-3 py-2 text-xs text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
              >
                Copilot
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
            {children}
            <DotobotExtensionManager />
          </div>
          </div>
        </div>
        {shouldRenderDotobotRail ? (
          <div className="h-full">
            <DotobotCopilot
              profile={profile}
              routePath={router.pathname}
              initialWorkspaceOpen={rightRailFullscreen ? true : initialWorkspaceOpen}
              defaultCollapsed={rightRailFullscreen ? false : true}
              compactRail={false}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
