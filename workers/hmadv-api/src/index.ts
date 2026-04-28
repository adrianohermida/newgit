    // Endpoint de agendamento (POST)
    if (url.pathname === "/api/agendar" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {}
      // Aqui você pode validar e processar o agendamento real
      return new Response(
        JSON.stringify({ ok: true, message: "Agendamento recebido! (mock)", recebido: body }),
        { headers: { "content-type": "application/json" }, status: 200 }
      );
    }
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);


    // Endpoint de teste para autenticação
    if (url.pathname === "/api/admin-auth-config") {
      return new Response(
        JSON.stringify({ ok: true, message: "Configuração pública de autenticação (mock)!" }),
        { headers: { "content-type": "application/json" }, status: 200 }
      );
    }

    // Endpoint realista para configuração pública do Freshchat
    if (url.pathname === "/api/public-chat-config") {
      // Exemplo realista de resposta (ajuste os campos conforme necessário)
      return new Response(
        JSON.stringify({
          ok: true,
          widgetHost: "wchat.freshchat.com",
          token: "demo-public-token-123456",
          enableWebMessenger: true,
          scriptUrl: "https://wchat.freshchat.com/js/widget.js",
          baseUrl: "https://api.freshchat.com/v2",
          brand: "Hermida Maia",
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      );
    }

    // Endpoint padrão
    return new Response("Hello from HMADV API Worker!", {
      headers: { "content-type": "text/plain" },
    });
  },
};
