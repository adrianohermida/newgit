import { Tag, toneFor } from "../shared";

export default function IntegrationProviderGrid({ providers }) {
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      {providers.map((item) => (
        <article key={item.provider} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[#F7F2E8]">{item.provider}</p>
            <Tag tone={toneFor(item.status)}>{item.status}</Tag>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#8FA29B]">{item.summary}</p>
          {item.missing?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.missing.map((missing) => <Tag key={missing} tone="warn">{missing}</Tag>)}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
