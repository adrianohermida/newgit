import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const MODEL = "gte-small";

function getClean(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getExpectedSecret() {
  return (
    getClean(Deno.env.get("DOTOBOT_SUPABASE_EMBED_SECRET")) ||
    getClean(Deno.env.get("HMDAV_AI_SHARED_SECRET")) ||
    getClean(Deno.env.get("LAWDESK_AI_SHARED_SECRET"))
  );
}

function getBearerToken(headerValue: string | null) {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : trimmed || null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const expectedSecret = getExpectedSecret();
  if (expectedSecret) {
    const providedSecret =
      getClean(req.headers.get("x-dotobot-embed-secret")) ||
      getClean(req.headers.get("x-shared-secret")) ||
      getBearerToken(req.headers.get("authorization"));

    if (providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ ok: false, error: "Authentication error" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }
  }

  let body: { input?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return new Response(JSON.stringify({ ok: false, error: "input is required." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const modelName = MODEL;
  const session = new Supabase.ai.Session(modelName);
  const embedding = await session.run(input, {
    mean_pool: true,
    normalize: true,
  });

  const vector =
    Array.isArray(embedding) ? embedding :
    Array.isArray((embedding as { data?: unknown[] })?.data) ? (embedding as { data: number[][] }).data[0] :
    Array.isArray((embedding as { embedding?: unknown[] })?.embedding) ? (embedding as { embedding: number[] }).embedding :
    embedding;

  if (!Array.isArray(vector)) {
    return new Response(JSON.stringify({ ok: false, error: "Embedding invalido." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    model: modelName,
    embedding: vector,
  }), {
    headers: JSON_HEADERS,
  });
});
