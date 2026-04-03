import { createFreshchatJwt, resolveFreshchatIdentity } from "../lib/freshchat-web.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const identity = await resolveFreshchatIdentity(request, env, body);

    if (identity.error) {
      return new Response(JSON.stringify({ ok: false, error: identity.error }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const jwt = await createFreshchatJwt(env, identity);

    return new Response(
      JSON.stringify({
        ok: true,
        token: jwt.token,
        mode: jwt.mode,
        identity: {
          referenceId: jwt.payload.reference_id,
          firstName: jwt.payload.first_name || "",
          lastName: jwt.payload.last_name || "",
          email: jwt.payload.email || "",
          phoneNumber: jwt.payload.phone_number || "",
        },
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao gerar JWT do Freshchat.",
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
