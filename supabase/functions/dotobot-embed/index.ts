import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const MODEL = "gte-small";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed." }), {
      status: 405,
      headers: JSON_HEADERS,
    });
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
