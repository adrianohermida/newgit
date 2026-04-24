import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { authenticateRequest, executeAiAndPersist, jsonResponse } from "../_shared/aiRuntime.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const user = await authenticateRequest(supabase, req);
  if (!user?.id) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const execution = await executeAiAndPersist(supabase, user, body, {
      activityType: String(body.activity_type ?? "llm_invoke"),
    });

    return jsonResponse({
      success: true,
      data: execution.result.parsed,
      response: execution.result.text,
      provider: execution.result.provider,
      model: execution.result.model,
      workspace_id: execution.workspaceId,
      processo_id: execution.processoId,
      log_id: execution.log?.id ?? null,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: (error as Error).message }, 400);
  }
});