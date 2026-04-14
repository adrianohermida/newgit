import Link from "next/link";
import SidebarNavItem from "./SidebarNavItem";
import { NAV_ITEMS, normalizeDisplayName } from "./sidebarConfig";

function getSidebarClassName({ isMobileShell, leftCollapsed, isCopilotWorkspace, sidebarToneClass }) {
  const mobileClass = `fixed inset-y-0 left-0 w-[min(86vw,320px)] max-w-[calc(100vw-3rem)] rounded-r-[26px] rounded-l-none border-y-0 border-l-0 ${
    leftCollapsed ? "pointer-events-none -translate-x-full opacity-0" : "translate-x-0 opacity-100"
  }`;
  const desktopClass = leftCollapsed
    ? "w-[88px] min-w-[88px]"
    : isCopilotWorkspace
      ? "w-[320px] min-w-[296px] max-w-[340px]"
      : "w-[264px] min-w-[220px] max-w-[312px]";
  return `z-40 shrink-0 flex h-full min-h-0 flex-col overflow-hidden border px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.02)] transition-all ${sidebarToneClass} ${isMobileShell ? mobileClass : desktopClass}`;
}

export default function InternoSidebar(props) {
  const {
    profile,
    pathname,
    isLightTheme,
    isMobileShell,
    isCopilotWorkspace,
    leftCollapsed,
    onNavigate,
    onSignOut,
    sidebarToneClass,
  } = props;

  return (
    <aside className={getSidebarClassName({ isMobileShell, leftCollapsed, isCopilotWorkspace, sidebarToneClass })}>
      <Link href="/interno" prefetch={false} className="mb-8 block shrink-0">
        {!leftCollapsed ? (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia</p>
            <h1 className={`text-[32px] font-semibold tracking-[-0.03em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Centro operacional</h1>
            <p className={`mt-3 max-w-[18rem] text-sm leading-6 ${isLightTheme ? "text-[#5E706C]" : "text-[#8FA39C]"}`}>Centro operacional para processos, CRM, governanca de agentes e engenharia de inteligencia do escritorio.</p>
          </>
        ) : <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#233630]"}`}>HM</div>}
      </Link>
      {!leftCollapsed ? <div className={`mb-6 shrink-0 rounded-[18px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,249,251,0.84))]" : "border-[#1D2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))]"}`}>
        <p className={`text-[11px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#6D7F7B]" : "text-[#7F928C]"}`}>Perfil conectado</p>
        <p className={`mt-3 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{normalizeDisplayName(profile)}</p>
        <p className={`mt-1 text-sm ${isLightTheme ? "text-[#60716E]" : "text-[#91A49E]"}`}>{profile?.email}</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#C5A059]">{profile?.role}</p>
      </div> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <nav aria-label="Navegacao interna" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {NAV_ITEMS.map((item) => <SidebarNavItem key={item.href} item={item} active={pathname === item.href} collapsed={leftCollapsed} isLightTheme={isLightTheme} onNavigate={onNavigate} />)}
        </nav>
        <div className="mt-4 shrink-0 space-y-3 pt-2">
          {!leftCollapsed ? <div className={`rounded-[18px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,249,251,0.84))]" : "border-[#1D2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"}`}>
            <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6D7F7B]" : "text-[#7E918B]"}`}>Workspace</p>
            <p className={`mt-2 text-sm font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Sidebar, modulo e Dotobot</p>
            <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#60716E]" : "text-[#92A59F]"}`}>{pathname === "/interno/copilot" ? "O Copilot agora opera como workspace centralizado: histórico à esquerda, conversa ao centro e módulos integrados na barra lateral direita." : "O painel lateral serve como atalho rápido. A experiência completa de conversa, tarefas e execução vive no AI Task central."}</p>
          </div> : null}
          <button type="button" onClick={onSignOut} className={`w-full rounded-[16px] border px-4 py-3 text-sm transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.86)] text-[#22312F]" : "border-[#22342F] bg-[rgba(255,255,255,0.015)] text-[#D8DEDA]"}`}>
            {!leftCollapsed ? "Sair" : "X"}
          </button>
        </div>
      </div>
    </aside>
  );
}
