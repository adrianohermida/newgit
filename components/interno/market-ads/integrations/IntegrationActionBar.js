import { Tag } from "../shared";

export default function IntegrationActionBar({
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
    <>
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
    </>
  );
}
