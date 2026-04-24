import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const { numeroProcesso } = await req.json();

    const apiKey = Deno.env.get("DATAJUD_API_KEY"); // pega do secret

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key não configurada" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    const url = "https://api-publica.datajud.cnj.jus.br/api_publica_trf5/_search";
    const payload = JSON.stringify({
      query: { match: { numeroProcesso } }
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `ApiKey ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: payload
    });

    const data = await response.text();

    return new Response(data, {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
