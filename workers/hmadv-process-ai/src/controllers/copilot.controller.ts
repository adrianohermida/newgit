import type { Env } from '../env.d';
import { handleCopilotRoomRequest } from '../services/copilot.service';
import { json } from '../utils/http';

export async function copilotController(req: Request, env: Env, pathname: string) {
  const result = await handleCopilotRoomRequest(req, env, pathname);
  if (result.error) {
    return json({ ok: false, error: result.error }, 400);
  }
  return json(result, 200);
}
