// Proxy handler para /remarcar -> /api/remarcar
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/api/remarcar";
  return fetch(url.toString(), context.request);
}
