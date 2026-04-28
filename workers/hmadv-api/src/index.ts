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

    // Endpoint padrão
    return new Response("Hello from HMADV API Worker!", {
      headers: { "content-type": "text/plain" },
    });
  },
};
