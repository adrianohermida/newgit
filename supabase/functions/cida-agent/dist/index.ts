import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const body = await req.json();

    const input = body.message;
    const channel = body.channel_id || "default";

    const response = await agent(input, channel);

    return new Response(JSON.stringify({ response }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ERROR:", err);
    return new Response("Erro interno", { status: 500 });
  }
});