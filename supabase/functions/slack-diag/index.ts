Deno.serve(async (req) => {
  const botToken = Deno.env.get("SLACK_BOT_TOKEN") || "";
  const accessToken = Deno.env.get("SLACK_ACCESS_TOKEN") || "";
  const userToken = Deno.env.get("SLACK_USER_TOKEN") || "";
  
  const results: any = {};
  
  // Testar cada token
  for (const [name, token] of [["BOT", botToken], ["ACCESS", accessToken], ["USER", userToken]]) {
    if (!token) {
      results[name] = { error: "token vazio" };
      continue;
    }
    
    try {
      // Testar auth.test
      const r = await fetch("https://slack.com/api/auth.test", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json();
      results[name] = {
        ok: d.ok,
        user: d.user,
        team: d.team,
        error: d.error,
        token_prefix: token.substring(0, 15) + "..."
      };
      
      // Se ok, tentar listar canais
      if (d.ok) {
        const r2 = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=50", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const d2 = await r2.json();
        results[name].channels_count = d2.channels?.length || 0;
        results[name].channels = d2.channels?.map((c: any) => ({ id: c.id, name: c.name })) || [];
        results[name].channels_error = d2.error;
      }
    } catch (e: any) {
      results[name] = { error: e.message };
    }
  }
  
  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
