/** Helpers de resposta JSON para o Worker hmadv-api */

export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

export const JSON_CACHE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, max-age=300',
};

export function jsonOk(data: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message, ...extra }),
    { status, headers: JSON_HEADERS }
  );
}

export function jsonNotFound(route: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: `Rota não encontrada: ${route}` }),
    { status: 404, headers: JSON_HEADERS }
  );
}

export function methodNotAllowed(method: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: `Método não permitido: ${method}` }),
    { status: 405, headers: JSON_HEADERS }
  );
}
