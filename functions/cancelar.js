// Proxy handler para /cancelar -> /api/cancelar
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/api/cancelar";
  return fetch(url.toString(), context.request);
}
