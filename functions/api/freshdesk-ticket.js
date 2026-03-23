const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { name, email, subject, description, priority = 1, status = 2, custom_fields = {} } = await request.json();
    if (!name || !email || !subject || !description) {
      return new Response(JSON.stringify({ ok: false, error: 'Campos obrigatórios ausentes.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const res = await fetch(`${env.FRESHDESK_DOMAIN}/api/v2/tickets`, {
      method: 'POST',
      headers: {
        Authorization: env.FRESHDESK_BASIC_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        subject,
        description,
        priority,
        status,
        custom_fields,
      }),
    });

    const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
    if (!res.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: typeof body === 'object' ? body.description || body.message || 'Erro ao criar ticket no Freshdesk.' : 'Erro ao criar ticket no Freshdesk.',
        detail: body,
      }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ ok: true, ticket: body }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || 'Erro ao processar ticket.' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
