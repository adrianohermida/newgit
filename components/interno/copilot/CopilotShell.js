import { useInternalTheme } from "../InternalThemeProvider";

export default function CopilotShell({ children }) {
  const { isLightTheme } = useInternalTheme();
  const pageTone = isLightTheme
    ? "bg-[linear-gradient(180deg,#EEF3F8,#E6EDF5)] text-[#152421]"
    : "bg-[linear-gradient(180deg,#050706,#0A0F0D)] text-[#F5F1E8]";
  const panelTone = isLightTheme
    ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.82)]"
    : "border-[#1C2623] bg-[rgba(7,9,8,0.88)]";

  return (
    <div className={`flex min-h-screen flex-col ${pageTone}`}>
      <main className="min-h-0 flex-1 p-0">
        <div className={`flex h-screen min-h-0 w-full overflow-hidden border shadow-[0_24px_80px_rgba(0,0,0,0.18)] ${panelTone}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
