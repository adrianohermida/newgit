import { useEffect, useState } from "react";

export function useDotobotAdminSession({ supabase, supaLoading }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;
    if (supaLoading || !supabase) return undefined;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!active) return;

      if (!session?.access_token) {
        setIsAdmin(false);
        setAuthChecked(true);
        return;
      }

      try {
        const res = await fetch("/api/admin-auth-config", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await res.json();
        if (!active) return;
        setIsAdmin(!!payload?.ok);
      } catch {
        if (!active) return;
        setIsAdmin(false);
      }

      if (active) setAuthChecked(true);
    }

    loadSession();
    return () => {
      active = false;
    };
  }, [supabase, supaLoading]);

  return { isAdmin, authChecked };
}

export async function handleExtensionActionIfNeeded({ extensionReady, intent, question, sendCommand }) {
  if (!extensionReady) return;
  if (["web_search", "local_file_access"].includes(intent)) {
    await sendCommand(intent, { query: question });
  }
}
