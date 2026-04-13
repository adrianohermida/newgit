import { useState } from "react";
import executeMarketAdsAction from "./executeMarketAdsAction";

export default function useMarketAdsIntegrationActions({ load, patchDashboardData, refreshDashboardSilently }) {
  const [integrationState, setIntegrationState] = useState({ loading: false, error: null, result: null });
  const [remoteSyncState, setRemoteSyncState] = useState({ loading: false, error: null, result: null });
  const [remoteImportState, setRemoteImportState] = useState({ loading: false, error: null, result: null });
  const [remoteAdSyncState, setRemoteAdSyncState] = useState({ loading: false, error: null, result: null });
  const [remoteAdImportState, setRemoteAdImportState] = useState({ loading: false, error: null, result: null });
  const [optimizationState, setOptimizationState] = useState({ loading: false, error: null, result: null });
  const [applyOptimizationState, setApplyOptimizationState] = useState({ loading: false, error: null, result: null });

  async function postAction(action, setter, errorMessage) {
    setter({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction(action);
      setter({ loading: false, error: null, result: payload.data || null });
      return payload;
    } catch (error) {
      setter({ loading: false, error: error.message || errorMessage, result: null });
      return null;
    }
  }

  async function inspectIntegrations() { await postAction("inspect_integrations", setIntegrationState, "Falha ao inspecionar integracoes."); }
  async function syncRemoteCampaigns() { await postAction("sync_remote_campaigns", setRemoteSyncState, "Falha ao sincronizar campanhas remotas."); }
  async function syncRemoteAds() { await postAction("sync_remote_ads", setRemoteAdSyncState, "Falha ao ler anuncios remotos."); }

  async function importRemoteCampaigns() {
    const payload = await postAction("import_remote_campaigns", setRemoteImportState, "Falha ao importar campanhas para a base local.");
    if (payload) await load();
  }

  async function importRemoteAds() {
    const payload = await postAction("import_remote_ads", setRemoteAdImportState, "Falha ao importar anuncios remotos.");
    if (payload) await load();
  }

  async function generateOptimizations() {
    await postAction("generate_optimizations", setOptimizationState, "Falha ao gerar plano de otimizacao.");
  }

  async function applyOptimizations() {
    const payload = await postAction("apply_optimizations", setApplyOptimizationState, "Falha ao aplicar recomendacoes nas campanhas locais.");
    if (payload?.data?.applied?.length) {
      patchDashboardData((current) => ({
        ...current,
        campaigns: (current.campaigns || []).map((campaign) => {
          const appliedItem = payload.data.applied.find((item) => item.campaignId === campaign.id && item.action === "updated");
          return appliedItem ? { ...campaign, status: appliedItem.status || campaign.status } : campaign;
        }),
      }));
    }
    if (payload) refreshDashboardSilently();
  }

  return {
    integrationState,
    remoteSyncState,
    remoteImportState,
    remoteAdSyncState,
    remoteAdImportState,
    optimizationState,
    applyOptimizationState,
    inspectIntegrations,
    syncRemoteCampaigns,
    importRemoteCampaigns,
    syncRemoteAds,
    importRemoteAds,
    generateOptimizations,
    applyOptimizations,
  };
}
