import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log("Edge Function DataJud Loaded");

serve(async (req) => {
  // 1. Tratamento de Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { numeroProcesso } = await req.json();
    
    // URL Específica do Tribunal (Pode ser dinâmica baseada no body se preferir)
    const url = "https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search";
    
    // Recupere a chave dos secrets do Supabase
    const apiKey = Deno.env.get("DATAJUD_API_KEY");
    
    if (!apiKey) throw new Error("DATAJUD_API_KEY não configurada.");

    console.log(`Consultando: ${numeroProcesso}`);

    const response = await fetch(url, {
        method: "POST",
        headers: { 
            "Authorization": `ApiKey ${apiKey}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({ 
            query: { 
                match: { 
                    numeroProcesso: numeroProcesso.replace(/\D/g, '') 
                } 
            } 
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro API DataJud (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // 2. Retorno com Headers CORS na resposta final
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});