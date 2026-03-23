var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../.wrangler/tmp/bundle-lUhVO9/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// lib/google-auth.js
async function getGoogleAccessToken(env) {
  const fallbackAccessToken = env.GOOGLE_ACCESS_TOKEN;
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=" + encodeURIComponent(env.GOOGLE_CLIENT_ID) + "&client_secret=" + encodeURIComponent(env.GOOGLE_CLIENT_SECRET) + "&refresh_token=" + encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN) + "&grant_type=refresh_token"
      });
      if (tokenResp.ok) {
        const tokenData = await tokenResp.json();
        if (tokenData?.access_token) {
          return { accessToken: tokenData.access_token, source: "refresh_token" };
        }
      }
      const errBody = await tokenResp.json().catch(() => ({}));
      if (fallbackAccessToken) {
        console.warn("Google OAuth refresh falhou; usando GOOGLE_ACCESS_TOKEN como fallback.", errBody);
        return {
          accessToken: fallbackAccessToken,
          source: "access_token_fallback",
          warning: errBody.error_description || errBody.error || `HTTP ${tokenResp.status}`
        };
      }
      throw new Error(errBody.error_description || errBody.error || `HTTP ${tokenResp.status}`);
    } catch (error) {
      if (fallbackAccessToken) {
        console.warn("Google OAuth refresh lan\xE7ou exce\xE7\xE3o; usando GOOGLE_ACCESS_TOKEN como fallback.", error.message);
        return {
          accessToken: fallbackAccessToken,
          source: "access_token_fallback",
          warning: error.message
        };
      }
      throw error;
    }
  }
  if (fallbackAccessToken) {
    return { accessToken: fallbackAccessToken, source: "access_token_only" };
  }
  throw new Error("Credenciais do Google n\xE3o configuradas.");
}
__name(getGoogleAccessToken, "getGoogleAccessToken");

// lib/slot-policy.js
var MINIMUM_LEAD_HOURS = 72;
function getMinimumBookingDate() {
  return new Date(Date.now() + MINIMUM_LEAD_HOURS * 60 * 60 * 1e3);
}
__name(getMinimumBookingDate, "getMinimumBookingDate");
function isSlotBookable(slotStart) {
  if (!(slotStart instanceof Date) || Number.isNaN(slotStart.getTime())) {
    return false;
  }
  return slotStart.getTime() >= getMinimumBookingDate().getTime();
}
__name(isSlotBookable, "isSlotBookable");

// api/agendar.js
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
__name(uuidv4, "uuidv4");
async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { nome, email, telefone, observacoes, area, data, hora } = body;
  const camposFaltando = [];
  if (!nome) camposFaltando.push("Nome");
  if (!email) camposFaltando.push("E-mail");
  if (!telefone) camposFaltando.push("Telefone");
  if (!area) camposFaltando.push("\xC1rea de interesse");
  if (!data) camposFaltando.push("Data");
  if (!hora) camposFaltando.push("Hora");
  if (camposFaltando.length > 0) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Por favor, preencha os seguintes campos obrigat\xF3rios: ${camposFaltando.join(", ")}.`
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const slotStart = `${data}T${hora}:00-03:00`;
  const slotEndHour = String(Number(hora.split(":")[0]) + 1).padStart(2, "0");
  const slotEnd = `${data}T${slotEndHour}:${hora.split(":")[1]}:00-03:00`;
  const slotStartDate = new Date(slotStart);
  if (!isSlotBookable(slotStartDate)) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Agendamentos devem respeitar antecedencia minima de ${MINIMUM_LEAD_HOURS} horas.`,
      stage: "minimum_lead_time",
      minimumLeadHours: MINIMUM_LEAD_HOURS
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  let accessToken;
  let authMeta;
  try {
    authMeta = await getGoogleAccessToken(env);
    accessToken = authMeta.accessToken;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao obter access token do Google.", detail: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const freebusyResp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin: slotStart,
      timeMax: slotEnd,
      timeZone: "America/Sao_Paulo",
      items: [{ id: "primary" }]
    })
  });
  if (!freebusyResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao consultar disponibilidade." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const freebusy = await freebusyResp.json();
  const isBusy = freebusy.calendars["primary"].busy.length > 0;
  if (isBusy) {
    return new Response(JSON.stringify({ ok: false, error: "Hor\xE1rio j\xE1 est\xE1 ocupado. Escolha outro." }), { status: 409, headers: { "Content-Type": "application/json" } });
  }
  const agendamentoId = uuidv4();
  const tokenConfirmacao = uuidv4();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const insertResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos`, {
    method: "POST",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      id: agendamentoId,
      nome,
      email,
      telefone,
      area,
      data,
      hora,
      observacoes: observacoes || null,
      status: "pendente",
      token_confirmacao: tokenConfirmacao,
      created_at: nowIso,
      updated_at: nowIso
    })
  });
  if (!insertResp.ok) {
    const errorDetail = await insertResp.text().catch(() => "");
    console.error("Supabase insert error:", errorDetail || insertResp.status);
    return new Response(JSON.stringify({
      ok: false,
      error: "Erro ao salvar agendamento.",
      detail: errorDetail || `HTTP ${insertResp.status}`,
      stage: "supabase_insert"
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const eventResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary: `Consulta Jur\xEDdica - ${area}`,
      description: `Cliente: ${nome} (${email})
Telefone: ${telefone}
Observa\xE7\xF5es: ${observacoes}`,
      start: { dateTime: slotStart, timeZone: "America/Sao_Paulo" },
      end: { dateTime: slotEnd, timeZone: "America/Sao_Paulo" },
      attendees: [{ email }]
    })
  });
  if (!eventResp.ok) {
    const errorDetail = await eventResp.text().catch(() => "");
    console.error("Google Calendar create event error:", errorDetail || eventResp.status);
    const rollbackResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
      method: "DELETE",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      }
    });
    if (!rollbackResp.ok) {
      const rollbackDetail = await rollbackResp.text().catch(() => "");
      console.error("Supabase rollback error:", rollbackDetail || rollbackResp.status);
    }
    return new Response(JSON.stringify({
      ok: false,
      error: "Erro ao criar evento no Google Calendar.",
      detail: errorDetail || `HTTP ${eventResp.status}`,
      stage: "google_calendar_create",
      rollbackOk: rollbackResp.ok
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const eventData = await eventResp.json();
  const googleEventId = eventData.id || null;
  if (googleEventId) {
    const updateResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ google_event_id: googleEventId, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
    });
    if (!updateResp.ok) {
      const updateDetail = await updateResp.text().catch(() => "");
      console.error("Supabase update google_event_id error:", updateDetail || updateResp.status);
      const deleteEventResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });
      if (!deleteEventResp.ok) {
        const deleteEventDetail = await deleteEventResp.text().catch(() => "");
        console.error("Google Calendar rollback error:", deleteEventDetail || deleteEventResp.status);
      }
      const rollbackResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
        method: "DELETE",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      });
      if (!rollbackResp.ok) {
        const rollbackDetail = await rollbackResp.text().catch(() => "");
        console.error("Supabase rollback after update failure error:", rollbackDetail || rollbackResp.status);
      }
      return new Response(JSON.stringify({
        ok: false,
        error: "Evento criado no Google Calendar, mas falha ao atualizar o Supabase.",
        detail: updateDetail || `HTTP ${updateResp.status}`,
        stage: "supabase_update_google_event_id",
        eventId: googleEventId,
        agendamentoId,
        googleRollbackOk: deleteEventResp.ok,
        supabaseRollbackOk: rollbackResp.ok
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  const siteUrl = env.SITE_URL || "https://hermidamaia.adv.br";
  const linkConfirmacao = `${siteUrl}/api/confirmar?token=${tokenConfirmacao}`;
  const dataFormatada = (/* @__PURE__ */ new Date(`${data}T${hora}:00-03:00`)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo"
  });
  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Pedido de Agendamento Recebido</h2>
  <p>Ol\xE1, <strong>${nome}</strong>!</p>
  <p>Recebemos seu pedido de consulta jur\xEDdica. Confirme pelo link abaixo para garantir o hor\xE1rio.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">\xC1rea</td><td style="padding:8px">${area}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Data</td><td style="padding:8px">${dataFormatada}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Hor\xE1rio</td><td style="padding:8px">${hora}</td></tr>
  </table>
  <a href="${linkConfirmacao}" style="display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0">
    Confirmar Agendamento
  </a>
  <p style="font-size:12px;color:#888;margin-top:24px">
    O link expira em 24 horas. Se n\xE3o foi voc\xEA, ignore este e-mail.
  </p>
</div>`;
  const emailSuporteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Novo Agendamento \u2014 ${area}</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px;font-weight:bold">Nome</td><td style="padding:6px">${nome}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">E-mail</td><td style="padding:6px">${email}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Telefone</td><td style="padding:6px">${telefone}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Data</td><td style="padding:6px">${data}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Hora</td><td style="padding:6px">${hora}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Observa\xE7\xF5es</td><td style="padding:6px">${observacoes || "\u2014"}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Token</td><td style="padding:6px;font-size:12px">${tokenConfirmacao}</td></tr>
  </table>
</div>`;
  async function enviarEmail(to, subject, html) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Hermida Maia Advocacia <contato@hermidamaia.com.br>",
          to: [to],
          subject,
          html
        })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error(`Resend error para ${to}:`, err.message || err.name || resp.status);
      }
    } catch (e) {
      console.error(`Resend exception para ${to}:`, e.message);
    }
  }
  __name(enviarEmail, "enviarEmail");
  await Promise.all([
    enviarEmail(email, "Confirme seu agendamento", emailClienteHtml),
    enviarEmail("contato@hermidamaia.com.br", "Novo agendamento recebido", emailSuporteHtml)
  ]);
  return new Response(JSON.stringify({
    ok: true,
    eventId: eventData.id,
    agendamentoId,
    authSource: authMeta?.source,
    warning: authMeta?.warning || void 0
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequestPost, "onRequestPost");

// api/confirmar.js
async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return new Response("Token de confirma\xE7\xE3o ausente.", { status: 400 });
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) {
    return new Response("Token de confirma\xE7\xE3o inv\xE1lido.", { status: 400 });
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?token_confirmacao=eq.${token}`, {
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    }
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error("Confirmar: erro ao consultar agendamento no Supabase:", detail || resp.status);
    return new Response("Erro ao consultar agendamento.", { status: 500 });
  }
  const agendamentos = await resp.json();
  if (!agendamentos.length) {
    return new Response("Token inv\xE1lido ou agendamento n\xE3o encontrado.", { status: 404 });
  }
  const agendamento = agendamentos[0];
  if (agendamento.status === "confirmado") {
    const confirmedLabel = agendamento.confirmed_at ? new Date(agendamento.confirmed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
    const htmlJaConfirmado = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>J\xE1 Confirmado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:16px}.meta{font-size:13px;color:#aaa;margin-top:12px}</style></head><body><div class="card"><div class="icon">\u2139\uFE0F</div><div class="title">Agendamento j\xE1 confirmado</div><p>Este agendamento j\xE1 foi confirmado anteriormente.</p>${confirmedLabel ? `<p class="meta">Confirmado em ${confirmedLabel}</p>` : ""}<a class="btn" href="https://hermidamaia.adv.br">Voltar ao site</a></div></body></html>`;
    return new Response(htmlJaConfirmado, { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
  const criadoEm = new Date(agendamento.created_at);
  const agora = /* @__PURE__ */ new Date();
  const expirado = agora - criadoEm > 24 * 60 * 60 * 1e3;
  if (expirado) {
    const htmlExpirado = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Link Expirado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:16px}</style></head><body><div class="card"><div class="icon">\u23F0</div><div class="title">Link expirado</div><p>Este link de confirma\xE7\xE3o expirou (v\xE1lido por 24h). Fa\xE7a um novo agendamento.</p><a class="btn" href="https://hermidamaia.adv.br/agendamento">Agendar novamente</a></div></body></html>`;
    return new Response(htmlExpirado, { status: 410, headers: { "Content-Type": "text/html; charset=UTF-8" } });
  }
  const confirmedAt = (/* @__PURE__ */ new Date()).toISOString();
  const updateResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamento.id}`, {
    method: "PATCH",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ status: "confirmado", confirmed_at: confirmedAt, updated_at: confirmedAt })
  });
  if (!updateResp.ok) {
    const detail = await updateResp.text().catch(() => "");
    console.error("Confirmar: erro ao atualizar status no Supabase:", detail || updateResp.status);
    return new Response("Erro ao confirmar agendamento.", { status: 500 });
  }
  const updatedRows = await updateResp.json().catch(() => []);
  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    console.error("Confirmar: atualiza\xE7\xE3o sem linhas retornadas para o token:", token);
    return new Response("Erro ao confirmar agendamento.", { status: 500 });
  }
  const agendamentoConfirmado = updatedRows[0];
  const dataFormatada = (/* @__PURE__ */ new Date(`${agendamento.data}T12:00:00-03:00`)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo"
  });
  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Consulta Confirmada!</h2>
  <p>Ol\xE1, <strong>${agendamento.nome}</strong>!</p>
  <p>Sua consulta jur\xEDdica foi confirmada com sucesso. Aguardamos voc\xEA no dia e hor\xE1rio abaixo.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">\xC1rea</td><td style="padding:8px">${agendamento.area}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Data</td><td style="padding:8px">${dataFormatada}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Hor\xE1rio</td><td style="padding:8px">${agendamento.hora}</td></tr>
  </table>
  <p style="font-size:13px;color:#aaa">Em caso de d\xFAvidas, acesse <a href="https://hermidamaia.adv.br" style="color:#C5A059">hermidamaia.adv.br</a> ou entre em contato conosco.</p>
</div>`;
  const emailEscritorioHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Agendamento Confirmado pelo Cliente \u2014 ${agendamento.area}</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px;font-weight:bold">Nome</td><td style="padding:6px">${agendamento.nome}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">E-mail</td><td style="padding:6px">${agendamento.email}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Telefone</td><td style="padding:6px">${agendamento.telefone}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">\xC1rea</td><td style="padding:6px">${agendamento.area}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Data</td><td style="padding:6px">${agendamento.data}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Hora</td><td style="padding:6px">${agendamento.hora}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Observa\xE7\xF5es</td><td style="padding:6px">${agendamento.observacoes || "\u2014"}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Google Event ID</td><td style="padding:6px;font-size:12px">${agendamento.google_event_id || "\u2014"}</td></tr>
  </table>
</div>`;
  async function enviarEmail(to, subject, html) {
    try {
      const resp2 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Hermida Maia Advocacia <contato@hermidamaia.com.br>",
          to: [to],
          subject,
          html
        })
      });
      if (!resp2.ok) {
        const err = await resp2.json().catch(() => ({}));
        console.error(`Resend error para ${to}:`, err.message || err.name || resp2.status);
      }
    } catch (e) {
      console.error(`Resend exception para ${to}:`, e.message);
    }
  }
  __name(enviarEmail, "enviarEmail");
  await Promise.all([
    enviarEmail(agendamentoConfirmado.email, "Sua consulta est\xE1 confirmada - Hermida Maia Advocacia", emailClienteHtml),
    enviarEmail("contato@hermidamaia.com.br", `Agendamento confirmado \u2014 ${agendamentoConfirmado.nome}`, emailEscritorioHtml)
  ]);
  const htmlSucesso = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agendamento Confirmado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.sub{color:#F4F1EA;opacity:.8;margin-bottom:24px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none}</style></head><body><div class="card"><div class="icon">\u2705</div><div class="title">Agendamento Confirmado!</div><p class="sub">Sua consulta est\xE1 agendada. Entraremos em contato para mais detalhes.</p><a class="btn" href="https://hermidamaia.adv.br">Voltar ao site</a></div></body></html>`;
  return new Response(htmlSucesso, { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
__name(onRequestGet, "onRequestGet");

// api/freshdesk-ticket.js
var JSON_HEADERS = { "Content-Type": "application/json" };
async function onRequestPost2(context) {
  const { request, env } = context;
  try {
    const { name, email, subject, description, priority = 1, status = 2, custom_fields = {} } = await request.json();
    if (!name || !email || !subject || !description) {
      return new Response(JSON.stringify({ ok: false, error: "Campos obrigat\xF3rios ausentes." }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }
    const res = await fetch(`${env.FRESHDESK_DOMAIN}/api/v2/tickets`, {
      method: "POST",
      headers: {
        Authorization: env.FRESHDESK_BASIC_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name,
        email,
        subject,
        description,
        priority,
        status,
        custom_fields
      })
    });
    const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => "") }));
    if (!res.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: typeof body === "object" ? body.description || body.message || "Erro ao criar ticket no Freshdesk." : "Erro ao criar ticket no Freshdesk.",
        detail: body
      }), {
        status: 500,
        headers: JSON_HEADERS
      });
    }
    return new Response(JSON.stringify({ ok: true, ticket: body }), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Erro ao processar ticket." }), {
      status: 500,
      headers: JSON_HEADERS
    });
  }
}
__name(onRequestPost2, "onRequestPost");

// api/slots.js
async function onRequestGet2(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const data = url.searchParams.get("data");
  if (!data) {
    return new Response(JSON.stringify({ ok: false, error: "Data n\xE3o informada." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  let accessToken;
  let authMeta;
  try {
    authMeta = await getGoogleAccessToken(env);
    accessToken = authMeta.accessToken;
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Erro ao obter access token do Google.", detail: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const horariosPossiveis = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  const dateStart = `${data}T00:00:00-03:00`;
  const dateEnd = `${data}T23:59:59-03:00`;
  const eventsResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${dateStart}&timeMax=${dateEnd}&singleEvents=true&orderBy=startTime`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  if (!eventsResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao consultar eventos." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const eventsData = await eventsResp.json();
  const SLOT_DURATION_MINUTES = 60;
  function buildSlotInterval(horario) {
    const start = /* @__PURE__ */ new Date(`${data}T${horario}:00-03:00`);
    const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1e3);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end };
  }
  __name(buildSlotInterval, "buildSlotInterval");
  function hasOverlap(intervalA, intervalB) {
    return intervalA.start < intervalB.end && intervalB.start < intervalA.end;
  }
  __name(hasOverlap, "hasOverlap");
  const eventosOcupados = (eventsData.items || []).map((ev) => {
    if (!ev.start?.dateTime || !ev.end?.dateTime) {
      return null;
    }
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end };
  }).filter(Boolean);
  const disponiveis = horariosPossiveis.filter((horario) => {
    const slotInterval = buildSlotInterval(horario);
    if (!slotInterval) return false;
    if (!isSlotBookable(slotInterval.start)) return false;
    return !eventosOcupados.some((evento) => hasOverlap(slotInterval, evento));
  });
  return new Response(
    JSON.stringify({ ok: true, slots: disponiveis, minimumLeadHours: MINIMUM_LEAD_HOURS }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}
__name(onRequestGet2, "onRequestGet");

// api/slots-month.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
__name(onRequestOptions, "onRequestOptions");
async function onRequestGet3(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const mes = url.searchParams.get("mes");
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return new Response(JSON.stringify({ ok: false, error: 'Par\xE2metro "mes" inv\xE1lido. Use o formato YYYY-MM.' }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
  let accessToken;
  let authMeta;
  try {
    authMeta = await getGoogleAccessToken(env);
    accessToken = authMeta.accessToken;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao autenticar com Google Calendar.", detail: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
  const [ano, numMes] = mes.split("-").map(Number);
  const inicio = `${mes}-01T00:00:00-03:00`;
  const ultimoDia = new Date(ano, numMes, 0).getDate();
  const fim = `${mes}-${String(ultimoDia).padStart(2, "0")}T23:59:59-03:00`;
  const eventsResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(inicio)}&timeMax=${encodeURIComponent(fim)}&singleEvents=true&orderBy=startTime&maxResults=250`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
  if (!eventsResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao consultar eventos do Google Calendar." }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
  const eventsData = await eventsResp.json();
  const SLOT_DURATION_MINUTES = 60;
  const horariosPossiveis = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  function buildSlotInterval(dia, horario) {
    const [hh, mm] = horario.split(":").map(Number);
    const start = /* @__PURE__ */ new Date(`${dia}T${horario}:00-03:00`);
    const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1e3);
    if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end };
  }
  __name(buildSlotInterval, "buildSlotInterval");
  function hasOverlap(intervalA, intervalB) {
    return intervalA.start < intervalB.end && intervalB.start < intervalA.end;
  }
  __name(hasOverlap, "hasOverlap");
  const eventosOcupados = (eventsData.items || []).map((ev) => {
    if (!ev.start?.dateTime || !ev.end?.dateTime) {
      return null;
    }
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end };
  }).filter(Boolean);
  const slotsPorDia = {};
  for (let d = 1; d <= ultimoDia; d++) {
    const dia = `${mes}-${String(d).padStart(2, "0")}`;
    const diaSemana = new Date(ano, numMes - 1, d).getDay();
    if (diaSemana === 0 || diaSemana === 6) continue;
    slotsPorDia[dia] = horariosPossiveis.filter((horario) => {
      const slotInterval = buildSlotInterval(dia, horario);
      if (!slotInterval) return false;
      if (!isSlotBookable(slotInterval.start)) return false;
      return !eventosOcupados.some((evento) => hasOverlap(slotInterval, evento));
    });
  }
  return new Response(JSON.stringify({
    ok: true,
    slots: slotsPorDia,
    minimumLeadHours: MINIMUM_LEAD_HOURS,
    authSource: authMeta?.source,
    warning: authMeta?.warning || void 0
  }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
__name(onRequestGet3, "onRequestGet");

// api/slots2.js
async function onRequestGet4(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const data = url.searchParams.get("data");
  if (!data) {
    return new Response(JSON.stringify({ ok: false, error: "Data n\xE3o informada." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  let accessToken = env.GOOGLE_ACCESS_TOKEN;
  try {
    const params = "client_id=" + encodeURIComponent(env.GOOGLE_CLIENT_ID) + "&client_secret=" + encodeURIComponent(env.GOOGLE_CLIENT_SECRET) + "&refresh_token=" + encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN) + "&grant_type=refresh_token";
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    if (!tokenResp.ok) throw new Error("Erro ao obter access token do Google");
    const tokenData = await tokenResp.json();
    accessToken = tokenData.access_token;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao obter access token do Google." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const horariosPossiveis = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  const dateStart = `${data}T00:00:00-03:00`;
  const dateEnd = `${data}T23:59:59-03:00`;
  const eventsResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${dateStart}&timeMax=${dateEnd}&singleEvents=true&orderBy=startTime`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  if (!eventsResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Erro ao consultar eventos." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const eventsData = await eventsResp.json();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const ocupados = (eventsData.items || []).map((ev) => {
    const start = ev.start.dateTime || ev.start.date;
    if (!start) return null;
    return fmt.format(new Date(start));
  }).filter(Boolean);
  const disponiveis = horariosPossiveis.filter((h) => !ocupados.includes(h));
  return new Response(JSON.stringify({ ok: true, slots: disponiveis }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequestGet4, "onRequestGet");

// _middleware.js
var VARS_POR_ROTA = {
  "/api/slots": {
    required: [],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"]
    ]
  },
  "/api/slots-month": {
    required: [],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"]
    ]
  },
  "/api/agendar": {
    required: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "RESEND_API_KEY"
    ],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"]
    ]
  },
  "/api/confirmar": {
    required: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "RESEND_API_KEY"
    ],
    oneOf: []
  },
  "/api/freshdesk-ticket": {
    required: [
      "FRESHDESK_DOMAIN",
      "FRESHDESK_BASIC_TOKEN"
    ],
    oneOf: []
  }
};
async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return next();
  }
  const routeConfig = VARS_POR_ROTA[url.pathname] || { required: [], oneOf: [] };
  const ausentes = routeConfig.required.filter((v) => !env[v]);
  const oneOfSatisfied = routeConfig.oneOf.length === 0 || routeConfig.oneOf.some(
    (group) => group.every((variable) => !!env[variable])
  );
  if (ausentes.length > 0 || !oneOfSatisfied) {
    const alternativas = !oneOfSatisfied ? routeConfig.oneOf.map((group) => group.join(" + ")) : [];
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Configura\xE7\xE3o incompleta no servidor. Vari\xE1veis de ambiente ausentes.",
        ausentes,
        alternativas,
        route: url.pathname
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  return next();
}
__name(onRequest, "onRequest");

// index.js
async function onRequest2(context) {
  return context.next();
}
__name(onRequest2, "onRequest");

// ../.wrangler/tmp/pages-D7t8tN/functionsRoutes-0.1282197748708228.mjs
var routes = [
  {
    routePath: "/api/agendar",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/confirmar",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/freshdesk-ticket",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/slots",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/slots-month",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/slots-month",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/slots2",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest],
    modules: [onRequest2]
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-lUhVO9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-lUhVO9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.9616893601554554.mjs.map
