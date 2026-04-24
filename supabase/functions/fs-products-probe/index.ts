import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const FS_API_KEY = Deno.env.get("FRESHSALES_API_KEY") || "";
  const FS_DOMAIN = Deno.env.get("FRESHSALES_DOMAIN") || "hmadv-org";
  
  const body = await req.json().catch(() => ({}));
  const action = body.action || "list";
  
  if (action === "list") {
    const resp = await fetch(`https://${FS_DOMAIN}.myfreshworks.com/crm/sales/api/products?per_page=100`, {
      headers: { "Authorization": `Token token=${FS_API_KEY}` }
    });
    const data = await resp.json();
    return new Response(JSON.stringify({ 
      status: resp.status, 
      products: data.products?.map((p: any) => ({ id: p.id, name: p.name, unit_price: p.unit_price })) 
    }), { headers: { "Content-Type": "application/json" } });
  }
  
  if (action === "create") {
    const products = body.products || [];
    const results = [];
    for (const p of products) {
      const resp = await fetch(`https://${FS_DOMAIN}.myfreshworks.com/crm/sales/api/products`, {
        method: "POST",
        headers: { 
          "Authorization": `Token token=${FS_API_KEY}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ 
          product: { 
            name: p.name, 
            description: p.description, 
            unit_price: 1.0 
          } 
        })
      });
      const data = await resp.json();
      results.push({ 
        name: p.name, 
        status: resp.status, 
        id: data.product?.id, 
        error: data.errors 
      });
      await new Promise(r => setTimeout(r, 1500));
    }
    return new Response(JSON.stringify({ results }), { 
      headers: { "Content-Type": "application/json" } 
    });
  }
  
  return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
});
