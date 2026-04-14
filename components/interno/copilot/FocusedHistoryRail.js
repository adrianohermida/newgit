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
    <div className={`mt-auto border-t px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.96)]" : "border-[#1C2623] bg-[rgba(8,10,9,0.96)]"}`}>
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
