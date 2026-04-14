export const BRIDGE_URL = "http://127.0.0.1:32123";
export const DEFAULT_SESSION_ID = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const PROVIDER_META = {
  local: { label: "AetherLab Local", color: "#16a34a", defaultModel: "aetherlab-legal-local-v1" },
  cloud: { label: "LLM Customizado", color: "#7c3aed", defaultModel: "aetherlab-legal-v1" },
  cloudflare: { label: "Cloudflare Workers AI", color: "#f97316", defaultModel: "@cf/meta/llama-3.1-8b-instruct" },
};

export const state = {
  provider: "local",
  sessionId: DEFAULT_SESSION_ID(),
  isLoading: false,
  isRecording: false,
  activeTab: "chat",
  currentAutomation: null,
  messages: [],
  bridgeOk: false,
  providerStatus: { local: null, cloud: null, cloudflare: null },
  settings: {
    runtimeUrl: "http://127.0.0.1:8000",
    runtimeModel: "aetherlab-legal-local-v1",
    appUrl: "http://localhost:3000",
    cloudBaseUrl: "",
    cloudModel: "aetherlab-legal-v1",
    cloudAuthToken: "",
    cfModel: "@cf/meta/llama-3.1-8b-instruct",
    cfAccountId: "",
    cfApiToken: "",
    autoSaveSessions: true,
  },
};
