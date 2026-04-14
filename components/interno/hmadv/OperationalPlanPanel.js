export default function OperationalPlanPanel({
  isLightTheme = false,
  steps = [],
  onStepClick,
  getStepState,
  disabledResolver,
  renderBadge,
}) {
  if (!steps.length) return null;

  const toneClass = isLightTheme
    ? "rounded-[22px] border border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] p-4 text-sm text-[#1f2937]"
    : "border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-sm";

  return (
    <div className={toneClass}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
        Plano operacional
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => {
          const state = getStepState ? getStepState(step, index) : null;
          const disabled = disabledResolver ? disabledResolver(step) : false;
          return (
            <button
              key={`${step.title}-${index}`}
              type="button"
              onClick={() => onStepClick?.(step)}
              disabled={disabled}
              className={`rounded-[18px] border p-3 text-left hover:border-[#C5A059] disabled:opacity-50 ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>
                  Passo {index + 1}
                </p>
                {state && renderBadge ? renderBadge(state) : null}
              </div>
              <p className="mt-2 font-semibold">{step.title}</p>
              <p className={`mt-2 text-xs ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{step.detail}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
