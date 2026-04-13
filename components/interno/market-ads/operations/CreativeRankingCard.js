import { Tag } from "../shared";

export default function CreativeRankingCard({ ranking, generateFromWinner }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Criativos vencedores</p>
        <Tag tone="accent">{ranking?.summary || "Sem ranking ainda"}</Tag>
      </div>
      <div className="mt-4 space-y-3">
        {(ranking?.leaders || []).map((item) => (
          <div key={`${item.source}-${item.id}`} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{item.headline}</p>
              <div className="flex flex-wrap gap-2">
                <Tag tone={item.source === "local" ? "success" : "accent"}>{item.source}</Tag>
                <Tag tone="neutral">score {item.score}</Tag>
              </div>
            </div>
            <p className="mt-1 text-[#8FA29B]">{item.platform}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
              {item.source === "local" ? <Tag tone="neutral">cliques {item.clicks || 0}</Tag> : null}
              {item.source === "local" ? <Tag tone="neutral">conv {item.conversions || 0}</Tag> : null}
            </div>
            <p className="mt-3 text-[#8FA29B]">{item.recommendation}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => generateFromWinner(item)}
                className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Gerar variacoes
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
