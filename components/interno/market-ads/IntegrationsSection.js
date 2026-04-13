import { Panel, StatLine } from "./shared";
import IntegrationActionBar from "./integrations/IntegrationActionBar";
import IntegrationProviderGrid from "./integrations/IntegrationProviderGrid";
import RemoteAdsImport from "./integrations/RemoteAdsImport";
import RemoteAdsRead from "./integrations/RemoteAdsRead";
import RemoteCampaignImport from "./integrations/RemoteCampaignImport";
import RemoteCampaignRead from "./integrations/RemoteCampaignRead";

export default function IntegrationsSection(props) {
  const providers = (props.integrationState.result || props.data.integrations)?.providers || [];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
      <Panel eyebrow="Integracoes externas" title="Prontidao de conexoes" helper="Valide acesso, leitura e importacao antes de transformar leitura remota em operacao local.">
        <IntegrationProviderGrid providers={providers} />
        <div className="mt-5 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-4">
          <StatLine label="Resumo atual" value={(props.integrationState.result || props.data.integrations)?.summary || "Sem leitura ainda"} />
          <StatLine label="Campanhas remotas" value={`${props.remoteSyncState.result?.campaigns?.length || 0} lidas`} />
          <StatLine label="Anuncios remotos" value={`${props.remoteAdSyncState.result?.adItems?.length || 0} lidos`} />
        </div>
      </Panel>

      <Panel eyebrow="Acionamento" title="Inspecionar, ler e importar" helper="A interface de conexao precisa deixar claro o proximo passo operacional em cada plataforma.">
        <IntegrationActionBar {...props} />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <RemoteCampaignRead result={props.remoteSyncState.result} />
          <RemoteCampaignImport result={props.remoteImportState.result} />
          <RemoteAdsRead result={props.remoteAdSyncState.result} />
          <RemoteAdsImport result={props.remoteAdImportState.result} />
        </div>
      </Panel>
    </div>
  );
}
