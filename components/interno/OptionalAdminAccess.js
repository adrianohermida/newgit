import { useMemo } from "react";
import { useAdminSession } from "../../lib/admin/useAdminSession";

const GUEST_PROFILE = {
  full_name: "Modo Setup",
  email: "setup@local",
  role: "setup",
  is_active: true,
};

export default function OptionalAdminAccess({ children }) {
  const session = useAdminSession();

  const payload = useMemo(() => {
    if (session.authorized && session.profile) {
      return {
        profile: session.profile,
        accessMode: "admin",
        session,
      };
    }

    return {
      profile: GUEST_PROFILE,
      accessMode: "guest",
      session,
    };
  }, [session]);

  return children(payload);
}
