import { getCleanEnvValue, getSupabaseServerKey, inspectSupabaseKey } from './env.js';
import { getGoogleAccessToken } from './google-auth.js';
import { MINIMUM_LEAD_HOURS, isSlotBookable } from './slot-policy.js';

export const SUPPORT_EMAIL = 'suporte@hermidamaia.adv.br';
export const LAWYER_EMAIL = 'adrianohermida@gmail.com';
export const FROM_EMAIL = 'Hermida Maia Advocacia <contato@hermidamaia.adv.br>';
export const REPLY_TO_EMAIL = SUPPORT_EMAIL;
export const INTERNAL_RECIPIENTS = [SUPPORT_EMAIL, LAWYER_EMAIL];
export const SLOT_DURATION_MINUTES = 60;

export function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function getSiteUrl(env) {
  return getCleanEnvValue(env.SITE_URL) || 'https://hermidamaia.adv.br';
}

export function formatAgendamentoDate(data, hora = '12:00') {
  return new Date(`${data}T${hora}:00-03:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

export function buildSlotBounds(data, hora) {
  const start = new Date(`${data}T${hora}:00-03:00`);
  const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
  return { start, end };
}

export function buildActionLinks(siteUrl, row) {
  return {
    cliente: {
      confirmar: `${siteUrl}/confirmar?token=${row.token_confirmacao}`,
      cancelar: `${siteUrl}/cancelar?token=${row.token_cancelamento}`,
      remarcar: `${siteUrl}/remarcar?token=${row.token_remarcacao}`,
    },
    advogado: {
      confirmar: `${siteUrl}/confirmar?token=${row.admin_token_confirmacao}`,
      cancelar: `${siteUrl}/cancelar?token=${row.admin_token_cancelamento}`,
      remarcar: `${siteUrl}/remarcar?token=${row.admin_token_remarcacao}`,
    },
  };
}

export function getSupabaseContext(env) {
  const supabaseUrl = getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = getSupabaseServerKey(env);
  const supabaseKeyMeta = inspectSupabaseKey(supabaseKey);

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      response: jsonResponse(500, {
        ok: false,
        error: 'Configuracao incompleta do sistema de agendamento.',
        stage: 'supabase_config',
      }),
    };
  }

  if (supabaseKeyMeta.format === 'malformed_jwt') {
    return {
      ok: false,
      response: jsonResponse(500, {
        ok: false,
        error: 'Chave do Supabase com formato invalido no ambiente.',
        stage: 'supabase_config',
        detail: `Formato detectado: ${supabaseKeyMeta.format} (dots=${supabaseKeyMeta.dotCount})`,
      }),
    };
  }

  return { ok: true, supabaseUrl, supabaseKey };
}

export async function sendTransactionalEmail(env, to, subject, html) {
  try {
    const recipients = Array.isArray(to) ? to : [to];
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipients,
        reply_to: REPLY_TO_EMAIL,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error(`Resend error para ${recipients.join(', ')}:`, err.message || err.name || resp.status);
    }
  } catch (error) {
    console.error(`Resend exception para ${Array.isArray(to) ? to.join(', ') : to}:`, error.message);
  }
}

export async function fetchAgendamentoByToken(supabaseUrl, supabaseKey, token, mappings) {
  const orClause = mappings.map(({ field }) => `${field}.eq.${token}`).join(',');
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/agendamentos?or=(${encodeURIComponent(orClause)})&select=*`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  const rows = await resp.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const matched = mappings.find(({ field }) => row[field] === token) || null;
  return {
    row,
    actor: matched?.actor || 'desconhecido',
    field: matched?.field || null,
  };
}

export async function patchAgendamento(supabaseUrl, supabaseKey, id, patch) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function ensureSlotAvailable(env, data, hora, currentEventId = null) {
  const { accessToken, source, warning } = await getGoogleAccessToken(env);
  const { start, end } = buildSlotBounds(data, hora);

  if (!isSlotBookable(start)) {
    return {
      ok: false,
      response: jsonResponse(400, {
        ok: false,
        error: `Agendamentos devem respeitar antecedencia minima de ${MINIMUM_LEAD_HOURS} horas.`,
        stage: 'minimum_lead_time',
        minimumLeadHours: MINIMUM_LEAD_HOURS,
      }),
    };
  }

  const freebusyResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: 'America/Sao_Paulo',
      items: [{ id: 'primary' }],
    }),
  });

  if (!freebusyResp.ok) {
    const detail = await freebusyResp.text().catch(() => '');
    return {
      ok: false,
      response: jsonResponse(500, {
        ok: false,
        error: 'Erro ao consultar disponibilidade.',
        detail: detail || `HTTP ${freebusyResp.status}`,
      }),
    };
  }

  const freebusy = await freebusyResp.json();
  const busyItems = freebusy?.calendars?.primary?.busy || [];
  const currentStartIso = `${data}T${hora}:00-03:00`;
  const hasBlockingBusy = busyItems.some((item) => {
    if (!currentEventId) {
      return true;
    }
    return item.start !== currentStartIso;
  });

  if (busyItems.length > 0 && hasBlockingBusy) {
    return {
      ok: false,
      response: jsonResponse(409, {
        ok: false,
        error: 'Horário já está ocupado. Escolha outro.',
      }),
    };
  }

  return { ok: true, accessToken, authSource: source, warning };
}

export async function deleteGoogleEvent(accessToken, googleEventId) {
  if (!googleEventId) return { ok: true };

  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok && resp.status !== 404) {
    const detail = await resp.text().catch(() => '');
    return { ok: false, detail: detail || `HTTP ${resp.status}` };
  }

  return { ok: true };
}

export async function upsertGoogleEvent(accessToken, agendamento, data, hora) {
  const { end } = buildSlotBounds(data, hora);
  const endHour = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  const payload = {
    summary: `Consulta Jurídica - ${agendamento.area}`,
    description: `Cliente: ${agendamento.nome} (${agendamento.email})\nTelefone: ${agendamento.telefone}\nObservações: ${agendamento.observacoes || '—'}`,
    start: { dateTime: `${data}T${hora}:00-03:00`, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: `${data}T${endHour}:00-03:00`, timeZone: 'America/Sao_Paulo' },
    attendees: [{ email: agendamento.email }],
  };

  if (agendamento.google_event_id) {
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(agendamento.google_event_id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(detail || `HTTP ${resp.status}`);
    }

    return await resp.json();
  }

  const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  return await resp.json();
}
