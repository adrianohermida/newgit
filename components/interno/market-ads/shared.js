export function Panel({ eyebrow, title, helper, children }) {
  return (
    <section className="rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(14,18,17,0.98),rgba(8,12,11,0.94))] p-6">
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A059]">{eyebrow}</p> : null}
      {title ? <h3 className="mt-3 text-2xl font-semibold text-[#F6F2E8]">{title}</h3> : null}
      {helper ? <p className="mt-2 text-sm leading-6 text-[#97ABA4]">{helper}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Tile({ label, value, helper }) {
  return (
    <article className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[#F8F4EB]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#8FA29B]">{helper}</p>
    </article>
  );
}

export function Tag({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-[#22342F] text-[#C7D0CA]",
    accent: "border-[#C5A059] text-[#F4E7C2]",
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
