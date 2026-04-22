export default function ChatUiShellFrame({ children, isLightTheme }) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-[30px] border ${
        isLightTheme
          ? "border-[#D9E3EC] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,249,252,0.96))] shadow-[0_22px_60px_rgba(148,163,184,0.16)]"
          : "border-[#1F2C28] bg-[linear-gradient(180deg,rgba(9,12,11,0.99),rgba(10,14,12,0.97))] shadow-[0_24px_64px_rgba(0,0,0,0.28)]"
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 ${isLightTheme ? "bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.10),transparent_28%)]" : "bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_24%)]"}`} />
      <div className="relative flex h-full min-h-0 flex-col">{children}</div>
    </div>
  );
}
