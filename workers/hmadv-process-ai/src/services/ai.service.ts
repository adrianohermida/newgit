import type { Env, Json } from '../env.d';

export async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    throw buildAiFailure(error);
  }
}

export function buildAiFailure(error: unknown) {
  const detail = getErrorMessage(error);
  const normalized = detail.toLowerCase();
  if (normalized.includes('daily free allocation') || normalized.includes('4006') || normalized.includes('quota')) {
    return {
      status: 429,
      code: 'cloudflare_ai_quota_exceeded',
      detail,
    };
  }
  return {
    status: 502,
    code: 'cloudflare_ai_failed',
    detail,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}
