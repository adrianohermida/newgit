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
      ok: true,
      data,
      metadata: {
        duration_ms: duration,
        contract_version: CHAT_CONTRACT_VERSION,
      },
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    const isTimeout = error?.message?.includes("Timeout") || error?.name === "AbortError";
    const isNetworkError = error?.message?.includes("fetch") || error?.message?.includes("connection");
    const statusCode = isTimeout || isNetworkError ? 504 : 500;
    const errorType = isTimeout ? "timeout" : isNetworkError ? "network" : "internal";
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao executar chat administrativo Dotobot.",
        errorType,
        timestamp: new Date().toISOString(),
      }),
      {
        status: statusCode,
        headers: JSON_HEADERS,
      }
    );
  }
// Fim do arquivo
