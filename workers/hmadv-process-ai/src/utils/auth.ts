import type { Env } from '../env.d';
import { json } from './http';

export function bearer(req: Request): string {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

export function getSharedSecret(env: Env): string {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

export function assertSecret(req: Request, env: Env) {
  const expectedSecret = getSharedSecret(env);
  if (!expectedSecret) return null;
  const sharedSecret =
    req.headers.get('x-hmadv-secret')?.trim() ||
    req.headers.get('x-shared-secret')?.trim() ||
    req.headers.get('x-dotobot-embed-secret')?.trim() ||
    bearer(req);
  return sharedSecret === expectedSecret
    ? null
    : json({ ok: false, error: 'unauthorized' }, 401);
}
