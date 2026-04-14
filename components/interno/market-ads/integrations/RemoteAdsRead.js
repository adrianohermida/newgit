import { useInternalTheme } from "../../InternalThemeProvider";
import { Tag, money, toneFor } from "../shared";

export default function RemoteAdsRead({ result }) {
  const { isLightTheme } = useInternalTheme();
  if (!result) return null;
  return (
    <div className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F7F2E8]"}`}>Leitura remota de anuncios</p>
        <Tag tone="accent">{result.summary}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(result.remoteItems || []).map((item) => (
          <article key={item.id} className={`rounded-[18px] border px-3 py-3 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#1D2B27] text-[#C7D0CA]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{item.name}</p>
              <Tag tone={toneFor(item.status)}>{item.provider}</Tag>
            </div>
            <p className={`mt-1 ${isLightTheme ? "text-[#7B8B98]" : "text-[#8FA29B]"}`}>{item.remoteCampaignName}</p>
            <p className={`mt-2 ${isLightTheme ? "text-[#7B8B98]" : "text-[#8FA29B]"}`}>{item.headline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag tone="neutral">imp {item.impressions || 0}</Tag>
              <Tag tone="neutral">cliques {item.clicks || 0}</Tag>
              <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
              <Tag tone="neutral">cpc {money(item.cpc || 0)}</Tag>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
