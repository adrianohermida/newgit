import { ActionButton, Tag } from "../shared";

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
        <ActionButton tone="primary" onClick={inspectIntegrations} disabled={integrationState.loading}>
          {integrationState.loading ? "Inspecionando..." : "Inspecionar integracoes"}
        </ActionButton>
        <ActionButton tone="ghost" onClick={syncRemoteCampaigns} disabled={remoteSyncState.loading}>
          {remoteSyncState.loading ? "Sincronizando campanhas..." : "Ler campanhas remotas"}
        </ActionButton>
        <ActionButton tone="ghost" onClick={importRemoteCampaigns} disabled={remoteImportState.loading}>
          {remoteImportState.loading ? "Importando para a base..." : "Importar para campanhas locais"}
        </ActionButton>
        <ActionButton tone="ghost" onClick={syncRemoteAds} disabled={remoteAdSyncState.loading}>
          {remoteAdSyncState.loading ? "Lendo anuncios..." : "Ler anuncios remotos"}
        </ActionButton>
        <ActionButton tone="ghost" onClick={importRemoteAds} disabled={remoteAdImportState.loading}>
          {remoteAdImportState.loading ? "Importando anuncios..." : "Importar anuncios locais"}
        </ActionButton>
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
