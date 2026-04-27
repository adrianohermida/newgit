import type { Env, Json } from '../env.d';
import { nowIso } from '../utils/date';

export function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO_V2.getByName(roomName);
}

export async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return { ok: true, room: await stub.getState() };
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return { ok: true, items };
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await req.json()) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return { ok: false, error: 'message_text_required' };
    }
    return { ok: true, room: await stub.appendMessage(message) };
  }

  return { ok: false, error: 'not_implemented' };
}
