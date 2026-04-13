import { Panel } from "./shared";
import IntegrationActionBar from "./integrations/IntegrationActionBar";
import IntegrationProviderGrid from "./integrations/IntegrationProviderGrid";
import RemoteAdsImport from "./integrations/RemoteAdsImport";
import RemoteAdsRead from "./integrations/RemoteAdsRead";
import RemoteCampaignImport from "./integrations/RemoteCampaignImport";
import RemoteCampaignRead from "./integrations/RemoteCampaignRead";

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
  const providers = (integrationState.result || data.integrations)?.providers || [];

  return (
    <Panel eyebrow="Integracoes externas" title="Google Ads e Meta Ads" helper="Diagnostico de prontidao para leitura real das plataformas antes da sincronizacao operacional.">
      <IntegrationActionBar
        data={data}
        integrationState={integrationState}
        remoteSyncState={remoteSyncState}
        remoteImportState={remoteImportState}
        remoteAdSyncState={remoteAdSyncState}
        remoteAdImportState={remoteAdImportState}
        inspectIntegrations={inspectIntegrations}
        syncRemoteCampaigns={syncRemoteCampaigns}
        importRemoteCampaigns={importRemoteCampaigns}
        syncRemoteAds={syncRemoteAds}
        importRemoteAds={importRemoteAds}
      />
      <IntegrationProviderGrid providers={providers} />
      <RemoteCampaignRead result={remoteSyncState.result} />
      <RemoteCampaignImport result={remoteImportState.result} />
      <RemoteAdsRead result={remoteAdSyncState.result} />
      <RemoteAdsImport result={remoteAdImportState.result} />
    </Panel>
  );
}
