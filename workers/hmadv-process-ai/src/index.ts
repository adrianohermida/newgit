import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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

async function runAi(env: Env, model: string, payload: Json) {
  try {
    return await env.AI.run(model, payload);
  } catch (error) {
    const failure = buildAiFailure(error);
    const wrapped = new Error(failure.detail);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}

function bearer(req: Request) {
  const raw = req.headers.get('authorization') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

function getSharedSecret(env: Env) {
  return (
    env.HMDAV_AI_SHARED_SECRET?.trim() ||
    env.HMADV_AI_SHARED_SECRET?.trim() ||
    env.LAWDESK_AI_SHARED_SECRET?.trim() ||
    ''
  );
}

function getDefaultChatModel(env: Env) {
  return env.CLOUDFLARE_WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
}

function resolveChatModel(env: Env, requestedModel?: string | null) {
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

function assertSecret(req: Request, env: Env) {
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

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isExecutePath(pathname: string) {
  return pathname === '/execute' || pathname === '/execute/' || pathname === '/v1/execute' || pathname === '/v1/execute/';
}

function isMessagesPath(pathname: string) {
  return pathname === '/v1/messages' || pathname === '/v1/messages/';
}

function isCopilotRoomPath(pathname: string) {
  return pathname.startsWith('/copilot/rooms/');
}

function getCopilotRoomStub(env: Env, pathname: string) {
  const roomName = pathname.replace('/copilot/rooms/', '').split('/')[0]?.trim();
  if (!roomName) {
    throw new Error('conversation_id_required');
  }
  return env.COPILOT_CONVERSATIONS_DO.getByName(roomName);
}

async function handleCopilotRoomRequest(req: Request, env: Env, pathname: string) {
  const url = new URL(req.url);
  const suffix = pathname.replace('/copilot/rooms/', '').split('/').slice(1).join('/');
  const stub = getCopilotRoomStub(env, pathname);

  if (req.method === 'GET' && (!suffix || suffix === '/')) {
    return json({ ok: true, room: await stub.getState() });
  }

  if (req.method === 'GET' && suffix === 'messages') {
    const limit = Number(url.searchParams.get('limit') || 100);
    const since = String(url.searchParams.get('since') || '').trim();
    const items = since
      ? await stub.listMessagesSince(since, limit)
      : await stub.listMessages(limit);
    return json({ ok: true, items });
  }

  if (req.method === 'POST' && suffix === 'messages') {
    const body = (await parseBody(req)) as Json | null;
    const message = {
      id: String(body?.id || crypto.randomUUID()),
      role: String(body?.role || 'assistant'),
      text: String(body?.text || '').trim(),
      created_at: String(body?.created_at || nowIso()),
      metadata: body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Json) : {},
    };
    if (!message.text) {
      return json({ ok: false, error: 'message_text_required' }, 400);
    }
    return json({ ok: true, room: await stub.appendMessage(message) }, 201);
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

import { buildActivityPrompt, buildProcessPrompt, CONVERSATION_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompts';
import { CopilotConversationRoomV2 } from './copilot-room';
import { runAi } from './ai';

async function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'unknown_error');
}

function buildAiFailure(error: unknown) {
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
    code: 'cloudflare