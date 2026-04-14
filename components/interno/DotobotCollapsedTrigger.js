export default function DotobotCollapsedTrigger({ isCollapsed, isCompactViewport, onOpen }) {
  if (!isCollapsed) return null;

  return (
    <button
      type="button"
      className={`fixed z-[75] border border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[11px] font-semibold uppercase text-[#07110E] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:brightness-105 ${isCompactViewport ? "bottom-24 right-3 rounded-[18px] px-4 py-3 tracking-[0.18em]" : "bottom-24 right-4 rounded-[18px] px-4 py-3 tracking-[0.18em]"}`}
      onClick={onOpen}
      title="Abrir Copilot (Ctrl + .)"
    >
      Abrir copilot
    </button>
  );
}
