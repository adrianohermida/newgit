import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import InternoUserAvatarMenu from "./InternoUserAvatarMenu";
import SidebarNavItem from "./SidebarNavItem";
import { NAV_ITEMS, normalizeDisplayName } from "./sidebarConfig";

function getSidebarClassName({ isMobileShell, leftCollapsed, isCopilotWorkspace, sidebarToneClass }) {
  const mobileClass = `fixed inset-y-0 left-0 w-[min(84vw,280px)] max-w-[calc(100vw-2rem)] rounded-r-[24px] rounded-l-none border-y-0 border-l-0 ${leftCollapsed ? "pointer-events-none -translate-x-full opacity-0" : "translate-x-0 opacity-100"}`;
  const desktopClass = leftCollapsed ? "w-[76px] min-w-[76px]" : isCopilotWorkspace ? "w-[248px] min-w-[232px] max-w-[264px]" : "w-[232px] min-w-[220px] max-w-[248px]";
  return `z-40 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border px-3 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.02)] transition-all ${sidebarToneClass} ${isMobileShell ? mobileClass : desktopClass}`;
}

function getGroupedItems() {
  return NAV_ITEMS.reduce((groups, item) => {
    const key = item.group || "Geral";
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

export default function InternoSidebar(props) {
  const { profile, pathname, isLightTheme, isMobileShell, isCopilotWorkspace, leftCollapsed, onNavigate, onOpenSettings, onSignOut, router, sidebarToneClass } = props;
  const groups = getGroupedItems();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserMenuOpen(false);
    }

    function handleEscape(event) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const copilotMenuItems = [
    { key: "dashboard", label: "Dashboard", action: () => router.push("/interno") },
    { key: "account", label: "Definicoes de conta", action: () => router.push("/portal/perfil") },
    { key: "settings", label: "Configuracoes", action: onOpenSettings },
    { key: "signout", label: "Sair", action: onSignOut },
  ];

  return <aside className={getSidebarClassName({ isMobileShell, leftCollapsed, isCopilotWorkspace, sidebarToneClass })}>
    <Link href="/interno" prefetch={false} className={`mb-4 block shrink-0 ${leftCollapsed ? "self-center" : ""}`}>
      {!leftCollapsed ? <><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Interno</p><h1 className={`mt-2 text-[20px] font-semibold tracking-[-0.03em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Centro operacional</h1><p className={`mt-2 text-[12px] leading-5 ${isLightTheme ? "text-[#6A7A85]" : "text-[#8FA39C]"}`}>Navegacao vertical compacta para acesso rapido aos modulos.</p></> : <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C5A059] ${isLightTheme ? "border-[#DCE4ED] bg-white" : "border-[#233630]"}`}>HM</div>}
    </Link>
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Navegacao interna" className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-color:#C5A059_transparent] [scrollbar-width:thin]">
        <div className="space-y-4">{Object.entries(groups).map(([group, items]) => <section key={group} className="space-y-1.5">{!leftCollapsed ? <p className={`px-2 text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7A8995]" : "text-[#6F847D]"}`}>{group}</p> : null}<div className="space-y-1">{items.map((item) => <SidebarNavItem key={item.href} item={item} active={pathname === item.href} collapsed={leftCollapsed} isLightTheme={isLightTheme} onNavigate={onNavigate} />)}</div></section>)}</div>
      </nav>
      <div className={`mt-3 shrink-0 border-t pt-3 ${isLightTheme ? "border-[#E1E8EF]" : "border-[#243732]"}`}>
        {isCopilotWorkspace ? (
          <InternoUserAvatarMenu
            isLightTheme={isLightTheme}
            menuItems={copilotMenuItems}
            onClose={() => setUserMenuOpen(false)}
            onToggle={() => setUserMenuOpen((current) => !current)}
            open={userMenuOpen}
            profile={profile}
            userMenuRef={userMenuRef}
            variant="sidebar"
          />
        ) : (
          <>
            {!leftCollapsed ? <div className="px-2"><p className={`truncate text-sm font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{normalizeDisplayName(profile)}</p><p className={`truncate text-[11px] ${isLightTheme ? "text-[#6A7A85]" : "text-[#91A49E]"}`}>{profile?.email}</p></div> : null}
            <button type="button" onClick={onSignOut} className={`mt-3 w-full rounded-[14px] border px-3 py-2.5 text-sm transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#DCE4ED] bg-white text-[#22312F]" : "border-[#243732] bg-[rgba(255,255,255,0.015)] text-[#D8DEDA]"}`}>{!leftCollapsed ? "Sair" : "X"}</button>
          </>
        )}
      </div>
    </div>
  </aside>;
}
