import type { Env } from '../env.d';
import { copilotController } from '../controllers/copilot.controller';
import { assertSecret } from '../utils/auth';

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Auth check (exemplo)
  const authError = assertSecret(req, env);
  if (authError) return authError;

  if (pathname.startsWith('/copilot/rooms/')) {
    return copilotController(req, env, pathname);
  }

  // Adicione outros controllers aqui

  return new Response('Not found', { status: 404 });
}
