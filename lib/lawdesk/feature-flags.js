function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function buildFeatureFlags(env = {}) {
  return {
    chat: {
      enabled: parseBoolean(env.ENABLE_DOTOBOT_CHAT, true),
      skillsDetection: parseBoolean(env.ENABLE_SKILLS_DETECTION, true),
      hybridOrchestrator: parseBoolean(env.ENABLE_ORCHESTRATOR_HYBRID, false),
    },
    ui: {
      aiTaskFullscreenSidebar: parseBoolean(env.NEXT_PUBLIC_ENABLE_AI_TASK_FULLSCREEN_SIDEBAR, false),
    },
  };
}
