// Proxy handler para /confirmar -> /api/confirmar
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/api/confirmar";
  return fetch(url.toString(), context.request);
}
