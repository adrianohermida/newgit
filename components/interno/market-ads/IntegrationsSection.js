import { Panel, Tag, money, toneFor } from "./shared";

export default function IntegrationsSection({
  data,
  integrationState,
  remoteSyncState,
  remoteImportState,
  remoteAdSyncState,
  remoteAdImportState,
  inspectIntegrations,
  syncRemoteCampaigns,
  importRemoteCampaigns,
  syncRemoteAds,
  importRemoteAds,
}) {
  return (
    <Panel eyebrow="Integracoes externas" title="Google Ads e Meta Ads" helper="Diagnostico de prontidao para leitura real das plataformas antes da sincronizacao operacional.">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={inspectIntegrations} disabled={integrationState.loading} className="rounded-full border border-[#C5A059] px-5 py-3 text-sm font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E] disabled:opacity-50">
          {integrationState.loading ? "Inspecionando..." : "Inspecionar integracoes"}
        </button>
        <button type="button" onClick={syncRemoteCampaigns} disabled={remoteSyncState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
          {remoteSyncState.loading ? "Sincronizando campanhas..." : "Ler campanhas remotas"}
        </button>
        <button type="button" onClick={importRemoteCampaigns} disabled={remoteImportState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
          {remoteImportState.loading ? "Importando para a base..." : "Importar para campanhas locais"}
        </button>
        <button type="button" onClick={syncRemoteAds} disabled={remoteAdSyncState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
          {remoteAdSyncState.loading ? "Lendo anuncios..." : "Ler anuncios remotos"}
        </button>
        <button type="button" onClick={importRemoteAds} disabled={remoteAdImportState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
          {remoteAdImportState.loading ? "Importando anuncios..." : "Importar anuncios locais"}
        </button>
        <Tag tone="accent">{(integrationState.result || data.integrations)?.summary || "Sem leitura ainda"}</Tag>
      </div>
      {integrationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{integrationState.error}</p> : null}
      {remoteSyncState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteSyncState.error}</p> : null}
      {remoteImportState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteImportState.error}</p> : null}
      {remoteAdSyncState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteAdSyncState.error}</p> : null}
      {remoteAdImportState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteAdImportState.error}</p> : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {((integrationState.result || data.integrations)?.providers || []).map((item) => (
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

      <RemoteCampaignRead result={remoteSyncState.result} />
      <RemoteCampaignImport result={remoteImportState.result} />
      <RemoteAdsRead result={remoteAdSyncState.result} />
      <RemoteAdsImport result={remoteAdImportState.result} />
    </Panel>
  );
}

function RemoteCampaignRead({ result }) {
  if (!result) return null;
  return (
    <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Leitura remota</p>
        <Tag tone="accent">{result.summary}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(result.remoteCampaigns || []).map((item) => (
          <article key={item.id} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
              <Tag tone={toneFor(item.status)}>{item.provider}</Tag>
            </div>
            <p className="mt-1 text-[#8FA29B]">{item.objective}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag tone="neutral">{item.status}</Tag>
              <Tag tone="accent">budget {money(item.budget || 0)}</Tag>
              {item.cpc !== null && item.cpc !== undefined ? <Tag tone="neutral">cpc {money(item.cpc)}</Tag> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function RemoteCampaignImport({ result }) {
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

function RemoteAdsRead({ result }) {
  if (!result) return null;
  return (
    <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Leitura remota de anuncios</p>
        <Tag tone="accent">{result.summary}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(result.remoteItems || []).map((item) => (
          <article key={item.id} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
              <Tag tone={toneFor(item.status)}>{item.provider}</Tag>
            </div>
            <p className="mt-1 text-[#8FA29B]">{item.remoteCampaignName}</p>
            <p className="mt-2 text-[#8FA29B]">{item.headline}</p>
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

function RemoteAdsImport({ result }) {
  if (!result) return null;
  return (
    <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Importacao conciliada de anuncios</p>
        <Tag tone="accent">{result.summary}</Tag>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Tag tone="success">criados {result.created || 0}</Tag>
        <Tag tone="warn">atualizados {result.updated || 0}</Tag>
        <Tag tone="neutral">lidos {(result.remoteItems || []).length}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(result.imported || []).map((item, index) => (
          <article key={`${item.remote?.id || index}-${item.action}`} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#F5F1E8]">{item.adItem?.name || item.remote?.name || "Anuncio remoto"}</p>
              <Tag tone={item.action === "created" ? "success" : item.action === "updated" ? "warn" : "danger"}>{item.action}</Tag>
            </div>
            <p className="mt-1 text-[#8FA29B]">{item.remote?.remoteCampaignName || item.remote?.provider || "Ads"}</p>
            {item.error ? <p className="mt-3 text-[#F8C5C5]">{item.error}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
