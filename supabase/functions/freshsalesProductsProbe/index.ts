import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const FS_API_KEY = Deno.env.get("FRESHSALES_API_KEY") || "";
const FS_DOMAIN = "hmadv-org.myfreshworks.com";

Deno.serve(async () => {
  const headers = {
    "Authorization": `Token token=${FS_API_KEY}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  
  const prodResp = await fetch(`https://${FS_DOMAIN}/crm/sales/api/products`, { headers });
  const prodData = await prodResp.json();
  
  const pipeResp = await fetch(`https://${FS_DOMAIN}/crm/sales/api/deal_pipelines`, { headers });
  const pipeData = await pipeResp.json();
  
  return new Response(JSON.stringify({ 
    products: prodData, 
    pipelines: pipeData,
    api_key_present: !!FS_API_KEY,
    api_key_prefix: FS_API_KEY ? FS_API_KEY.substring(0, 8) + "..." : ""
  }), { headers: { "Content-Type": "application/json" } });
});
