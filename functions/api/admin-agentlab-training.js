import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgentLabTrainingCenter, runAgentLabTrainingScenario } from "../lib/agentlab-training.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const training = await getAgentLabTrainingCenter(env);
    return new Response(
      JSON.stringify({
        ok: true,
        generated_at: new Date().toISOString(),
        profile: {
          id: auth.profile.id,
          email: auth.profile.email,
          role: auth.profile.role,
        },
        training,
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar o Training Center." }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runAgentLabTrainingScenario(env, {
      scenarioId: body?.scenarioId,
      agentRef: body?.agentRef,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        generated_at: new Date().toISOString(),
        result,
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao executar treino." }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
