import { BRIDGE_URL, state } from "./state.js";
import { parseJsonResponse, safeFetch } from "./utils.js";

function normalizeLoopback(url) {
  return String(url || "").trim().replace(/^http:\/\/localhost:3000$/i, "http://127.0.0.1:3000");
}

function parseLines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function formatLines(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function parseApps(value) {
  return parseLines(value).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`JSON invalido em aplicativos locais: ${line}`);
    }
  }).filter((item) => item?.name && item?.path);
}

function formatApps(values) {
  return Array.isArray(values) ? values.map((item) => JSON.stringify(item)).join("\n") : "";
}

function parseSkills(value) {
  return parseLines(value).map((line) => {
    const [name, skillPath, ...rest] = line.split("|").map((item) => item.trim());
    if (!name || !skillPath) {
      throw new Error(`Skill invalida. Use: nome | caminho | descricao opcional -> ${line}`);
    }
    return {
      name,
      path: skillPath,
      description: rest.join(" | "),
      enabled: true,
    };
  });
}

function formatSkills(values) {
  return Array.isArray(values)
    ? values.map((item) => [item.name, item.path, item.description].filter(Boolean).join(" | ")).join("\n")
    : "";
}

export function fillSettingsInputs(el) {
  el.inputProviderLabel.value = state.settings.providerLabel;
  el.inputRuntimeUrl.value = state.settings.runtimeUrl;
  el.inputChatPath.value = state.settings.chatPath;
  el.inputExecutePath.value = state.settings.executePath;
  el.inputRuntimeModel.value = state.settings.runtimeModel;
  if (el.localModelList) {
    el.localModelList.innerHTML = Array.isArray(state.localModelCatalog)
      ? state.localModelCatalog.map((item) => `<option value="${item.replace(/"/g, "&quot;")}"></option>`).join("")
      : "";
  }
  el.inputAlwaysAllowTabs.checked = !!state.settings.alwaysAllowTabAccess;
  el.inputLocalRoots.value = formatLines(state.settings.localRoots);
  el.inputLocalApps.value = formatApps(state.settings.localApps);
  el.inputLocalSkillRoots.value = formatLines(state.settings.localSkillRoots);
  el.inputLocalSkills.value = formatSkills(state.settings.localSkills);
  el.inputAppUrl.value = state.settings.appUrl;
  el.inputCloudBaseUrl.value = state.settings.cloudBaseUrl;
  el.inputCloudAuthToken.value = state.settings.cloudAuthToken;
  el.inputCloudModel.value = state.settings.cloudModel;
  el.inputCfModel.value = state.settings.cfModel;
  el.inputCfAccountId.value = state.settings.cfAccountId;
  el.inputCfApiToken.value = state.settings.cfApiToken;
}

export function hydrateSettings(settings) {
  if (!settings) return;
  state.settings.providerLabel = settings.local?.providerLabel || state.settings.providerLabel;
  state.settings.runtimeUrl = settings.local?.runtimeUrl || state.settings.runtimeUrl;
  state.settings.chatPath = settings.local?.chatPath || state.settings.chatPath;
  state.settings.executePath = settings.local?.executePath || state.settings.executePath;
  state.settings.runtimeModel = settings.local?.runtimeModel || state.settings.runtimeModel;
  state.settings.alwaysAllowTabAccess = Boolean(settings.local?.alwaysAllowTabAccess ?? state.settings.alwaysAllowTabAccess);
  state.settings.trustedTabOrigins = Array.isArray(settings.local?.trustedTabOrigins) ? settings.local.trustedTabOrigins : state.settings.trustedTabOrigins;
  state.settings.localRoots = Array.isArray(settings.local?.roots) ? settings.local.roots : state.settings.localRoots;
  state.settings.localApps = Array.isArray(settings.local?.apps) ? settings.local.apps : state.settings.localApps;
  state.settings.localSkillRoots = Array.isArray(settings.local?.skillRoots) ? settings.local.skillRoots : state.settings.localSkillRoots;
  state.settings.localSkills = Array.isArray(settings.local?.skills) ? settings.local.skills : state.settings.localSkills;
  state.settings.appUrl = normalizeLoopback(settings.cloud?.appUrl || state.settings.appUrl);
  state.settings.cloudBaseUrl = settings.cloud?.baseUrl || state.settings.cloudBaseUrl;
  state.settings.cloudModel = settings.cloud?.model || state.settings.cloudModel;
  state.settings.cloudAuthToken = settings.cloud?.authToken || state.settings.cloudAuthToken;
  state.settings.cfModel = settings.cloudflare?.model || state.settings.cfModel;
  state.settings.cfAccountId = settings.cloudflare?.accountId || state.settings.cfAccountId;
  state.settings.cfApiToken = settings.cloudflare?.apiToken || state.settings.cfApiToken;
}

export async function loadSettings(el) {
  await new Promise((resolve) => {
    chrome.storage.local.get(["llm_settings", "llm_provider"], (result) => {
      if (result.llm_settings) state.settings = { ...state.settings, ...result.llm_settings, appUrl: normalizeLoopback(result.llm_settings.appUrl || state.settings.appUrl) };
      if (result.llm_provider) state.provider = result.llm_provider;
      resolve();
    });
  });
  fillSettingsInputs(el);
  await loadLocalModelCatalog(el).catch(() => {});
}

export async function pushBridgeSettings() {
  await safeFetch(`${BRIDGE_URL}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      settings: {
        local: { providerLabel: state.settings.providerLabel, runtimeUrl: state.settings.runtimeUrl, chatPath: state.settings.chatPath, executePath: state.settings.executePath, runtimeModel: state.settings.runtimeModel, alwaysAllowTabAccess: state.settings.alwaysAllowTabAccess, trustedTabOrigins: state.settings.trustedTabOrigins, roots: state.settings.localRoots, apps: state.settings.localApps, skillRoots: state.settings.localSkillRoots, skills: state.settings.localSkills },
        cloud: { appUrl: state.settings.appUrl, baseUrl: state.settings.cloudBaseUrl, model: state.settings.cloudModel, authToken: state.settings.cloudAuthToken },
        cloudflare: { model: state.settings.cfModel, accountId: state.settings.cfAccountId, apiToken: state.settings.cfApiToken },
      },
    }),
  }, 6000);
}

export async function saveSettings(el) {
  // parse structured fields with user-visible errors before mutating state
  let localApps = state.settings.localApps;
  let localSkills = state.settings.localSkills;

  try {
    localApps = parseApps(el.inputLocalApps.value);
  } catch (appsError) {
    const msg = `Aplicativos locais invalidos: ${appsError.message}`;
    if (el.testLocalResult) { el.testLocalResult.textContent = msg; el.testLocalResult.style.color = "#dc2626"; }
    throw new Error(msg);
  }

  try {
    localSkills = parseSkills(el.inputLocalSkills.value);
  } catch (skillsError) {
    const msg = `Skills invalidas: ${skillsError.message}`;
    if (el.testLocalResult) { el.testLocalResult.textContent = msg; el.testLocalResult.style.color = "#dc2626"; }
    throw new Error(msg);
  }

  state.provider = el.providerSelect.value || state.provider;
  state.settings = {
    ...state.settings,
    providerLabel: String(el.inputProviderLabel.value || state.settings.providerLabel).trim(),
    runtimeUrl: String(el.inputRuntimeUrl.value || state.settings.runtimeUrl).trim(),
    chatPath: String(el.inputChatPath.value || state.settings.chatPath).trim(),
    executePath: String(el.inputExecutePath.value || state.settings.executePath).trim(),
    runtimeModel: String(el.inputRuntimeModel.value || state.settings.runtimeModel).trim(),
    alwaysAllowTabAccess: !!el.inputAlwaysAllowTabs.checked,
    localRoots: parseLines(el.inputLocalRoots.value),
    localApps,
    localSkillRoots: parseLines(el.inputLocalSkillRoots.value),
    localSkills,
    appUrl: normalizeLoopback(el.inputAppUrl.value || state.settings.appUrl),
    cloudBaseUrl: String(el.inputCloudBaseUrl.value || state.settings.cloudBaseUrl).trim(),
    cloudAuthToken: String(el.inputCloudAuthToken.value || state.settings.cloudAuthToken).trim(),
    cloudModel: String(el.inputCloudModel.value || state.settings.cloudModel).trim(),
    cfModel: String(el.inputCfModel.value || state.settings.cfModel).trim(),
    cfAccountId: String(el.inputCfAccountId.value || state.settings.cfAccountId).trim(),
    cfApiToken: String(el.inputCfApiToken.value || state.settings.cfApiToken).trim(),
  };
  await new Promise((resolve) => chrome.storage.local.set({ llm_settings: state.settings, llm_provider: state.provider }, resolve));
  await pushBridgeSettings();
}

export async function loadSkillCatalog(el) {
  if (el.localSkillsResult) {
    el.localSkillsResult.textContent = "Carregando...";
    el.localSkillsResult.style.color = "#6b7280";
  }
  if (el.localSkillsDetail) el.localSkillsDetail.textContent = "";
  try {
    const response = await safeFetch(`${BRIDGE_URL}/settings/skills`, {}, 8000);
    const data = await parseJsonResponse(response);
    state.localSkillCatalog = Array.isArray(data.skills) ? data.skills : [];
    if (state.localSkillCatalog.length && !state.settings.localSkills.length) {
      state.settings.localSkills = state.localSkillCatalog.filter((item) => item.enabled !== false);
      fillSettingsInputs(el);
    }
    if (el.localSkillsResult) {
      el.localSkillsResult.textContent = `${state.localSkillCatalog.length} skills`;
      el.localSkillsResult.style.color = state.localSkillCatalog.length ? "#16a34a" : "#6b7280";
    }
    if (el.localSkillsDetail) {
      el.localSkillsDetail.textContent = data.roots?.length
        ? `Roots: ${data.roots.join(" | ")}`
        : "Nenhuma pasta de skills configurada.";
    }
    return data;
  } catch (error) {
    if (el.localSkillsResult) {
      el.localSkillsResult.textContent = "Falha ao listar";
      el.localSkillsResult.style.color = "#dc2626";
    }
    if (el.localSkillsDetail) el.localSkillsDetail.textContent = error.message || "Falha ao consultar skills.";
    throw error;
  }
}

export async function syncFromBridge(el) {
  const response = await safeFetch(`${BRIDGE_URL}/health`, {}, 3000);
  const data = await parseJsonResponse(response);
  if (data.settings) hydrateSettings(data.settings);
  fillSettingsInputs(el);
  return data;
}

export async function loadLocalModelCatalog(el) {
  if (el.localModelsResult) {
    el.localModelsResult.textContent = "Carregando...";
    el.localModelsResult.style.color = "#6b7280";
  }
  if (el.localModelsDetail) el.localModelsDetail.textContent = "";
  try {
    const response = await safeFetch(`${BRIDGE_URL}/settings/local-models`, {}, 8000);
    const data = await parseJsonResponse(response);
    state.localModelCatalog = Array.isArray(data.models) ? data.models : [];
    state.localModelSources = Array.isArray(data.sources) ? data.sources : [];
    fillSettingsInputs(el);
    if (state.localModelCatalog.length) {
      const configured = String(state.settings.runtimeModel || "").trim();
      const normalized = configured.replace(/:latest$/i, "");
      const suggested = state.localModelCatalog.find((item) => item === configured)
        || state.localModelCatalog.find((item) => item.replace(/:latest$/i, "") === normalized)
        || state.localModelCatalog[0];
      if (!configured || !state.localModelCatalog.includes(configured)) {
        state.settings.runtimeModel = suggested;
        el.inputRuntimeModel.value = suggested;
      }
      if (el.localModelsResult) {
        el.localModelsResult.textContent = `${state.localModelCatalog.length} modelos locais`;
        el.localModelsResult.style.color = "#16a34a";
      }
      if (el.localModelsDetail) {
        const activeSources = state.localModelSources
          .filter((item) => item?.ok && Number(item?.count || 0) > 0)
          .slice(0, 3)
          .map((item) => `${item.source || item.parser}: ${item.url}`)
          .join(" | ");
        el.localModelsDetail.textContent = [
          `Provider: ${data.providerLabel || state.settings.providerLabel}`,
          `Chat: ${state.settings.chatPath}`,
          `Execucao: ${state.settings.executePath}`,
          `Catalogo: ${data.catalogUrl || "desconhecido"}`,
          `Ativo: ${state.settings.runtimeModel}`,
          activeSources ? `Origens: ${activeSources}` : "",
        ].filter(Boolean).join(" | ");
      }
      return data;
    }
    if (el.localModelsResult) {
      el.localModelsResult.textContent = "Nenhum modelo encontrado";
      el.localModelsResult.style.color = "#dc2626";
    }
    if (el.localModelsDetail) el.localModelsDetail.textContent = data.error || "O runtime local nao publicou catalogo utilizavel.";
    return data;
  } catch (error) {
    if (el.localModelsResult) {
      el.localModelsResult.textContent = "Falha ao listar modelos";
      el.localModelsResult.style.color = "#dc2626";
    }
    state.localModelSources = [];
    if (el.localModelsDetail) el.localModelsDetail.textContent = error.message || "Falha ao consultar o runtime local.";
    throw error;
  }
}
