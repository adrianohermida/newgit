import { Tag } from "../shared";

export default function RemoteCampaignImport({ result }) {
  if (!result) return null;
  return (
    <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Importacao conciliada</p>
        <Tag tone="accent">{result.summary}</Tag>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Tag tone="success">criadas {result.created || 0}</Tag>
        <Tag tone="warn">atualizadas {result.updated || 0}</Tag>
        <Tag tone="neutral">lidas {(result.remoteCampaigns || []).length}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(result.imported || []).map((item, index) => (
          <article key={`${item.remote?.id || index}-${item.action}`} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{item.campaign?.name || item.remote?.name || "Campanha remota"}</p>
              <Tag tone={item.action === "created" ? "success" : item.action === "updated" ? "warn" : "danger"}>{item.action}</Tag>
            </div>
            <p className="mt-1 text-[#8FA29B]">{item.remote?.provider || "Ads"} · {item.remote?.objective || "sem objetivo"}</p>
            {item.error ? <p className="mt-3 text-[#F8C5C5]">{item.error}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
