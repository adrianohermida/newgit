import { useEffect, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import {
  applyBrowserLocalOfflinePolicy,
  getBrowserLocalRuntimeConfig,
  hasExplicitBrowserLocalRuntimeOptIn,
  hydrateBrowserLocalProviderOptions,
  persistBrowserLocalRuntimeConfig,
  probeBrowserLocalStackSummary,
} from "../../../lib/lawdesk/browser-local-runtime";
import {
  resolveAiTaskProviderSelection,
  shouldHydrateLocalProviderForAiTask,
} from "./aiTaskModuleConfig";

export default function useAiTaskProviderCatalog(props) {
  const { fallbackProviderOptions, fallbackSkillOptions, provider, setProvider } = props;
  const [providerCatalog, setProviderCatalog] = useState(fallbackProviderOptions);
  const [skillCatalog, setSkillCatalog] = useState(fallbackSkillOptions);
  const [localStackSummary, setLocalStackSummary] = useState(null);
  const [refreshingLocalStack, setRefreshingLocalStack] = useState(false);
  const [localRuntimeConfigOpen, setLocalRuntimeConfigOpen] = useState(false);
  const [localRuntimeDraft, setLocalRuntimeDraft] = useState(() => getBrowserLocalRuntimeConfig());

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-lawdesk-providers?include_health=1", { method: "GET" })
      .then((payload) => {
        if (!active) return;
        const providers = Array.isArray(payload?.data?.providers) ? payload.data.providers : [];
        const defaultProvider = typeof payload?.data?.defaultProvider === "string" ? payload.data.defaultProvider : "gpt";
        if (!providers.length) return;
        const mappedProviders = providers.map((item) => ({
          value: item.id,
          label: `${item.label}${item.model ? ` · ${item.model}` : ""}${item.status ? ` · ${item.status}` : ""}`,
          disabled: !item.available,
          configured: Boolean(item.configured),
          displayLabel: item.label,
          model: item.model || null,
          status: item.status || null,
          transport: item.transport || null,
          runtimeMode: item.details?.probe?.mode || null,
          host: item.details?.config?.host || null,
          endpoint: item.details?.probe?.endpoint || item.details?.config?.baseUrl || null,
          reason: item.reason || null,
        }));
        setProviderCatalog(mappedProviders);
        setProvider((current) => resolveAiTaskProviderSelection({ currentProvider: current, defaultProvider, providers: mappedProviders }));
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [setProvider]);

  useEffect(() => {
    if (!shouldHydrateLocalProviderForAiTask(provider, providerCatalog)) return undefined;
    let active = true;
    hydrateBrowserLocalProviderOptions(providerCatalog)
      .then((hydratedProviders) => {
        if (!active || !Array.isArray(hydratedProviders) || !hydratedProviders.length) return;
        const governedProviders = applyBrowserLocalOfflinePolicy(hydratedProviders, localStackSummary);
        if (JSON.stringify(providerCatalog) === JSON.stringify(governedProviders)) return;
        setProviderCatalog(governedProviders);
        setProvider((current) => resolveAiTaskProviderSelection({ currentProvider: current, defaultProvider: localStackSummary?.offlineMode ? "local" : "gpt", providers: governedProviders }));
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [localStackSummary, provider, providerCatalog, setProvider]);

  useEffect(() => {
    if (!shouldHydrateLocalProviderForAiTask(provider, providerCatalog)) return undefined;
    let active = true;
    probeBrowserLocalStackSummary()
      .then((summary) => {
        if (!active) return;
        setLocalStackSummary(summary);
        setProviderCatalog((current) => applyBrowserLocalOfflinePolicy(current, summary));
      })
      .catch(() => {
        if (active) setLocalStackSummary(null);
      });
    return () => {
      active = false;
    };
  }, [provider, providerCatalog]);

  useEffect(() => {
    const runtimeSkills = Array.isArray(localStackSummary?.capabilities?.skillList) ? localStackSummary.capabilities.skillList : [];
    if (!runtimeSkills.length) return;
    setSkillCatalog(runtimeSkills.map((skill) => ({
      value: skill.id,
      label: `${skill.name} · ${skill.category}${skill.offline_ready ? " · offline" : ""}`,
      disabled: skill.available === false,
    })));
  }, [localStackSummary]);

  useEffect(() => {
    setLocalRuntimeDraft(getBrowserLocalRuntimeConfig());
  }, [localStackSummary]);

  useEffect(() => {
    if (!localStackSummary?.offlineMode || !hasExplicitBrowserLocalRuntimeOptIn()) return;
    setProvider((current) => (current === "local" ? current : "local"));
  }, [localStackSummary?.offlineMode, setProvider]);

  useEffect(() => {
    const currentOption = providerCatalog.find((item) => item.value === provider);
    if (!currentOption?.disabled) return;
    setProvider(providerCatalog.find((item) => !item.disabled)?.value || "gpt");
  }, [provider, providerCatalog, setProvider]);

  async function refreshLocalStackStatus() {
    setRefreshingLocalStack(true);
    try {
      const summary = await probeBrowserLocalStackSummary();
      setLocalStackSummary(summary);
      const hydratedProviders = await hydrateBrowserLocalProviderOptions(providerCatalog);
      const governedProviders = applyBrowserLocalOfflinePolicy(hydratedProviders, summary);
      setProviderCatalog(governedProviders);
      setProvider((current) => resolveAiTaskProviderSelection({ currentProvider: current, defaultProvider: summary?.offlineMode ? "local" : "gpt", providers: governedProviders }));
    } catch {
      setLocalStackSummary(null);
    } finally {
      setRefreshingLocalStack(false);
    }
  }

  async function handleSaveLocalRuntimeConfig() {
    persistBrowserLocalRuntimeConfig(localRuntimeDraft);
    setLocalRuntimeConfigOpen(false);
    await refreshLocalStackStatus();
  }

  return {
    handleSaveLocalRuntimeConfig,
    localRuntimeConfigOpen,
    localRuntimeDraft,
    localStackReady: Boolean(localStackSummary?.ok && localStackSummary?.localProvider?.available),
    localStackSummary,
    providerCatalog,
    refreshingLocalStack,
    refreshLocalStackStatus,
    setLocalRuntimeConfigOpen,
    setLocalRuntimeDraft,
    skillCatalog,
  };
}
