import Link from "next/link";
import { useInternalTheme } from "../InternalThemeProvider";

function ProfileBadge({ profile, isLightTheme }) {
  const label = profile?.full_name || profile?.email || "Equipe interna";
  const initials = label.slice(0, 2).toUpperCase();
  const tones = isLightTheme
    ? "border-[#D7DEE8] bg-white text-[#152421]"
    : "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#F5F1E8]";

  return (
    <div className={`flex items-center gap-3 rounded-[18px] border px-3 py-2 ${tones}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold ${tones}`}>
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className={`text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Workspace de conversa</p>
      </div>
    </div>
  );
}

export default function CopilotShell({ profile, children }) {
  const { isLightTheme, toggleTheme } = useInternalTheme();
  const pageTone = isLightTheme
    ? "bg-[linear-gradient(180deg,#EEF3F8,#E6EDF5)] text-[#152421]"
    : "bg-[linear-gradient(180deg,#050706,#0A0F0D)] text-[#F5F1E8]";
  const panelTone = isLightTheme
    ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.78)]"
    : "border-[#1C2623] bg-[rgba(7,9,8,0.82)]";

  return (
    <div className={`flex min-h-screen flex-col ${pageTone}`}>
      <header className={`border-b px-4 py-4 md:px-6 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#1C2623]"}`}>
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/interno"
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                isLightTheme
                  ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                  : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
              }`}
            >
              Voltar
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Interno Copilot</p>
              <h1 className="truncate text-xl font-semibold">Conversa principal com apoio contextual discreto</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                isLightTheme
                  ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                  : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
              }`}
            >
              {isLightTheme ? "Modo escuro" : "Modo claro"}
            </button>
            <ProfileBadge profile={profile} isLightTheme={isLightTheme} />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-3 py-3 md:px-4 md:py-4">
        <div className={`mx-auto flex h-full min-h-0 w-full max-w-[1680px] overflow-hidden rounded-[32px] border shadow-[0_24px_80px_rgba(0,0,0,0.18)] ${panelTone}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
