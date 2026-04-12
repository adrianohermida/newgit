import { buildSupabaseLocalBootstrap } from "./supabase-local-bootstrap.js";

function normalizeTone(ok, degraded = false) {
  if (ok) return "success";
  if (degraded) return "accent";
  return "danger";
}

export function buildOfflineHealthSnapshot({ localStackSummary = null, ragHealth = null } = {}) {
  const obsidian = ragHealth?.report?.obsidian || {};
  const extension = localStackSummary?.extensionHealth || {};
  const localProvider = localStackSummary?.localProvider || {};
  const supabaseBootstrap = buildSupabaseLocalBootstrap({ localStackSummary, ragHealth });

  const obsidianOk = Boolean(obsidian.ok && obsidian.vaultPathConfigured);
  const extensionOk = Boolean(extension.ok);
  const localRuntimeOk = Boolean(localProvider.available && localProvider.reachable !== false);
  const offlineMode = Boolean(localStackSummary?.offlineMode);
  const remoteDisabled = offlineMode;

  return {
    offlineMode,
    items: [
      {
        id: "runtime",
        label: "Runtime local",
        value: localRuntimeOk ? localProvider.runtimeLabel || "Online" : "Pendente",
        tone: normalizeTone(localRuntimeOk, Boolean(localProvider.configured)),
        detail: localProvider.diagnosticsError || localProvider.transportEndpoint || localProvider.baseUrl || null,
      },
      {
        id: "obsidian",
        label: "Obsidian",
        value: obsidianOk ? "Conectado" : "Pendente",
        tone: normalizeTone(obsidianOk, Boolean(obsidian.vaultPathConfigured)),
        detail: obsidian.memoryDir || obsidian.vaultPath || null,
      },
      {
        id: "extension",
        label: "Extensão local",
        value: extensionOk ? "Online" : "Pendente",
        tone: normalizeTone(extensionOk, Boolean(localStackSummary?.extensionBaseUrl)),
        detail: extension.error || extension.endpoint || null,
      },
      {
        id: "supabase",
        label: "Persistência",
        value: supabaseBootstrap.label,
        tone: supabaseBootstrap.tone,
        detail: supabaseBootstrap.baseUrlPreview || supabaseBootstrap.detail || null,
      },
      {
        id: "network",
        label: "Rede externa",
        value: remoteDisabled ? "Bloqueada" : "Permitida",
        tone: normalizeTone(remoteDisabled, false),
        detail: remoteDisabled ? "Modo offline isola cloud, web e URLs remotas." : "Cloud e web ainda podem ser usados.",
      },
    ],
  };
}
