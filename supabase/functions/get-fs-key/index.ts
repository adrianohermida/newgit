Deno.serve(async (req) => {
  const key = Deno.env.get("FRESHSALES_API_KEY") ?? "";
  return new Response(JSON.stringify({ key }), {
    headers: { "Content-Type": "application/json" }
  });
});
