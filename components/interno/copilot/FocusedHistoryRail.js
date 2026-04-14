import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSupabaseBrowser } from "../../../lib/supabase";
import InternoUserAvatarMenu from "../layout/InternoUserAvatarMenu";
import FocusedConversationGroups from "./FocusedConversationGroups";
import FocusedHistoryRailHeader from "./FocusedHistoryRailHeader";

function FocusedSidebarUserMenu({ isLightTheme, profile }) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const menuItems = [
    { key: "dashboard", label: "Dashboard", action: () => router.push("/interno") },
    { key: "account", label: "Definicoes de conta", action: () => router.push("/interno/cadastro-inicial") },
    { key: "settings", label: "Configuracoes", action: () => router.push("/interno/setup-integracao") },
    {
      key: "signout",
      label: "Sair",
      action: async () => {
        if (supabase) await supabase.auth.signOut();
        router.replace("/interno/login");
      },
    },
  ];

  return (
    <div className={`mt-auto border-t px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))]" : "border-[#1C2623] bg-[linear-gradient(180deg,rgba(8,10,9,0.98),rgba(11,14,13,0.98))]"}`}>
      <div className="mb-3">
        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conta</p>
        <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Acesso, preferencias e navegação do workspace.</p>
      </div>
      <InternoUserAvatarMenu
        isLightTheme={isLightTheme}
        menuItems={menuItems}
        onClose={() => setOpen(false)}
        onToggle={() => setOpen((current) => !current)}
        open={open}
        profile={profile}
        userMenuRef={menuRef}
        variant="sidebar"
      />
    </div>
  );
}

export default function FocusedHistoryRail(props) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden">
      <FocusedHistoryRailHeader {...props} />
      <FocusedConversationGroups
        activeConversationId={props.activeConversationId}
        conversationProjectGroups={props.conversationProjectGroups}
        handleDrop={props.handleDrop}
        isLightTheme={props.isLightTheme}
        onConcatConversation={props.handleConcatConversation}
        onSelectConversation={props.selectConversation}
        renderConversationMenu={props.renderConversationMenu}
      />
      <FocusedSidebarUserMenu isLightTheme={props.isLightTheme} profile={props.profile} />
    </aside>
  );
}
