export default function InternoModuleHeader({ description, isLightTheme, title }) {
  return (
    <header className={`mb-6 shrink-0 border-b pb-5 px-4 pt-5 md:px-6 md:pt-6 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.14))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))]"}`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">Operacao interna</p>
          <h2 className={`text-3xl font-semibold tracking-[-0.035em] md:text-[38px] ${isLightTheme ? "text-[#152421]" : "text-[#F8F4EB]"}`}>{title}</h2>
          {description ? <p className={`mt-3 max-w-3xl text-sm leading-7 ${isLightTheme ? "text-[#60716E]" : "text-[#99ADA6]"}`}>{description}</p> : null}
        </div>
      </div>
    </header>
  );
}
