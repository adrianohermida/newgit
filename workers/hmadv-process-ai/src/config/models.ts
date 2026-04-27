import type { Env } from '../env.d';

export function getDefaultChatModel(env: Env): string {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

export function resolveChatModel(env: Env, requestedModel?: string | null): string {
  const normalized = String(requestedModel || '').trim().toLowerCase();
  if (!normalized) {
    return getDefaultChatModel(env);
  }
  const aliases: Record<string, string> = {
    'aetherlab-legal-v1': env.AETHERLAB_LEGAL_MODEL || getDefaultChatModel(env),
    'aetherlab-legal-ptbr-v1': env.AETHERLAB_LEGAL_MODEL || getDefaultChatModel(env),
    'aetherlab-legal': env.AETHERLAB_LEGAL_MODEL || getDefaultChatModel(env),
  };
  return aliases[normalized] || String(requestedModel).trim();
}
