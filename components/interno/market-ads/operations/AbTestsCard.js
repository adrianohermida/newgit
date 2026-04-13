import { Tag, toneFor } from "../shared";

export default function AbTestsCard({ items, beginEditAbTest }) {
  return (
    <>
      {items.map((item) => (
        <article key={item.id} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[#F7F2E8]">{item.area}</p>
            <div className="flex flex-wrap gap-2">
              <Tag tone="success">{item.winner}</Tag>
              {item.status ? <Tag tone={toneFor(item.status)}>{item.status}</Tag> : null}
            </div>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{item.recommendation}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => beginEditAbTest(item)}
              className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Editar teste
            </button>
          </div>
        </article>
      ))}
    </>
  );
}
