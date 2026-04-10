export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }
  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 204 });
  }
  return new Response(
    JSON.stringify({ ok: false, error: "Método não permitido" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}
// MOCK: responde sempre com echo para teste de integração
export async function onRequestPost(context) {
  try {
    const { query } = await context.request.json();
    return new Response(
      JSON.stringify({ data: { result: `Echo: ${query}` } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response("Bad Request", { status: 400 });
  }
}
