export function Panel({ eyebrow, title, helper, children, className = "", contentClassName = "mt-6" }) {
  return (
    <section
      className={`rounded-[32px] border border-[#1B2C29] bg-[linear-gradient(180deg,rgba(10,15,14,0.96),rgba(7,11,10,0.92))] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.26)] md:px-6 md:py-6 ${className}`}
    >
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#B88943]">{eyebrow}</p> : null}
      {title ? <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#F6F1E8] md:text-2xl">{title}</h3> : null}
      {helper ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8CA099]">{helper}</p> : null}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export function PageSection({ label, title, description, aside, children }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.84fr_1.16fr] xl:items-start">
      <div className="space-y-3 xl:sticky xl:top-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#B88943]">{label}</p>
        <h2 className="max-w-sm text-2xl font-semibold tracking-[-0.04em] text-[#F5F1E6] md:text-3xl">{title}</h2>
        <p className="max-w-md text-sm leading-7 text-[#8EA29A]">{description}</p>
        {aside}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Tile({ label, value, helper, accent = false }) {
  return (
    <article className={`rounded-[26px] border px-5 py-5 ${accent ? "border-[#7E6033] bg-[linear-gradient(180deg,rgba(188,137,67,0.14),rgba(12,14,12,0.08))]" : "border-[#1E302C] bg-[rgba(255,255,255,0.02)]"}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#F8F4EB]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#8FA29B]">{helper}</p>
    </article>
  );
}

export function StatLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#172522] py-3 last:border-b-0 last:pb-0 first:pt-0">
      <span className="text-sm text-[#90A39D]">{label}</span>
      <span className="text-sm font-semibold text-[#F3EEE4]">{value}</span>
    </div>
  );
}

export function ActionButton({ children, tone = "ghost", className = "", ...props }) {
  const tones = {
    primary: "border-[#C09554] bg-[#C09554] text-[#07110E] hover:bg-[#d7ad68] hover:border-[#d7ad68]",
    ghost: "border-[#22342F] text-[#D8DED9] hover:border-[#C09554] hover:text-[#F3E4C5]",
    subtle: "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#D8DED9] hover:border-[#35524B] hover:bg-[rgba(255,255,255,0.06)]",
  };

  return (
    <button
      type="button"
      className={`rounded-full border px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, helper, className = "", ...props }) {
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7D8F89]">{label}</span>
      <input
        {...props}
        className="w-full rounded-[18px] border border-[#21332F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#F5F1E8] outline-none transition placeholder:text-[#667872] focus:border-[#C09554] focus:bg-[rgba(255,255,255,0.04)]"
      />
      {helper ? <span className="block text-xs leading-5 text-[#6F837D]">{helper}</span> : null}
    </label>
  );
}

export function SelectField({ label, helper, className = "", children, ...props }) {
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7D8F89]">{label}</span>
      <select
        {...props}
        className="w-full rounded-[18px] border border-[#21332F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none transition focus:border-[#C09554]"
      >
        {children}
      </select>
      {helper ? <span className="block text-xs leading-5 text-[#6F837D]">{helper}</span> : null}
    </label>
  );
}

export function TextAreaField({ label, helper, className = "", ...props }) {
  return (
    <label className={`block space-y-2 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7D8F89]">{label}</span>
      <textarea
        {...props}
        className="w-full rounded-[18px] border border-[#21332F] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm leading-6 text-[#F5F1E8] outline-none transition placeholder:text-[#667872] focus:border-[#C09554] focus:bg-[rgba(255,255,255,0.04)]"
      />
      {helper ? <span className="block text-xs leading-5 text-[#6F837D]">{helper}</span> : null}
    </label>
  );
}

export function Tag({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-[#22342F] text-[#C7D0CA]",
    accent: "border-[#7E6033] text-[#F4E7C2]",
    success: "border-[#35554B] text-[#B7F7C6]",
    warn: "border-[#6E5630] text-[#FDE68A]",
    danger: "border-[#5B2D2D] text-[#FECACA]",
  };

  return <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${tones[tone]}`}>{children}</span>;
}

export function toneFor(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("aprov")) return "success";
  if (normalized.includes("escalar") || normalized.includes("scale")) return "success";
  if (normalized.includes("crit") || normalized.includes("bloq")) return "danger";
  if (normalized.includes("revis") || normalized.includes("alert") || normalized.includes("atenc")) return "warn";
  if (normalized.includes("otimiz")) return "accent";
  if (normalized.includes("forte")) return "success";
  if (normalized.includes("estavel") || normalized.includes("media")) return "accent";
  return "accent";
}

export function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeById(items = [], nextItem, { prepend = false, limit = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!nextItem?.id) return list;

  const filtered = list.filter((item) => item?.id !== nextItem.id);
  const merged = prepend ? [nextItem, ...filtered] : [...filtered, nextItem];
  return Number.isFinite(limit) ? merged.slice(0, limit) : merged;
}
