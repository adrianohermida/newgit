import { listSkills } from "../../../lib/lawdesk/skill_registry.js";
import { hasExplicitBrowserLocalRuntimeOptIn, hasPersistedBrowserLocalRuntimeConfig, shouldAutoProbeBrowserLocalRuntime } from "../../../lib/lawdesk/browser-local-runtime";
import { resolvePreferredLawdeskProvider } from "../../../lib/lawdesk/providers.js";

export const MAX_THINKING = 20;
export const MAX_LOGS = 200;

export const QUICK_MISSIONS = [
  "Analise este processo e identifique os proximos passos",
  "Redija contestacao com base nas alegacoes do cliente",
  "Crie plano de execucao para audiencia agendada",
  "Resuma documentos e identifique riscos",
];

export const MODE_OPTIONS = [
  { value: "assisted", label: "Assistido" },
  { value: "auto", label: "Automatico" },
  { value: "manual", label: "Manual" },
];

export const FALLBACK_PROVIDER_OPTIONS = [
  { value: "gpt", label: "Nuvem principal", disabled: false },
  { value: "local", label: "LLM local", disabled: false },
  { value: "cloudflare", label: "Cloudflare Workers AI", disabled: false },
  { value: "custom", label: "Endpoint custom", disabled: false },
];

export const FALLBACK_SKILL_OPTIONS = listSkills().map((skill) => ({
  value: skill.id,
  label: `${skill.name} · ${skill.category}`,
  disabled: false,
}));

export function shouldHydrateLocalProviderForAiTask(selectedProvider = "", providers = []) {
  if (!Array.isArray(providers) || !providers.length) return false;
  const localOption = providers.find((item) => String(item?.value || item?.id || "").toLowerCase() === "local");
  if (!localOption) return false;
  const hasLocalBrowserConfig = hasPersistedBrowserLocalRuntimeConfig();
  const hasExplicitOptIn = hasExplicitBrowserLocalRuntimeOptIn();
  const canAutoProbe = shouldAutoProbeBrowserLocalRuntime();
  if (String(selectedProvider || "").toLowerCase() === "local") return localOption.disabled !== true && hasLocalBrowserConfig && hasExplicitOptIn && canAutoProbe;
  return canAutoProbe && hasLocalBrowserConfig && hasExplicitOptIn && localOption.disabled !== true;
}

export function resolveAiTaskProviderSelection({ currentProvider, defaultProvider, providers = [] }) {
  const preferred = resolvePreferredLawdeskProvider({ currentProvider, defaultProvider, providers });
  if (String(preferred || "").toLowerCase() !== "local") return preferred;
  if (hasPersistedBrowserLocalRuntimeConfig() && hasExplicitBrowserLocalRuntimeOptIn()) return preferred;
  return providers.find((item) => String(item?.value || "").toLowerCase() !== "local" && item?.disabled !== true)?.value || preferred;
}

export function normalizeAiTaskProviderSelection(provider, providers = []) {
  if (String(provider || "").toLowerCase() !== "local") return provider || "gpt";
  if (hasPersistedBrowserLocalRuntimeConfig() && hasExplicitBrowserLocalRuntimeOptIn()) return provider;
  return providers.find((item) => String(item?.value || "").toLowerCase() !== "local" && item?.disabled !== true)?.value || "gpt";
}
