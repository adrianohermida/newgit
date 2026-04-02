function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getSupabaseContext(env) {
  const supabaseUrl = cleanEnvValue(env.SUPABASE_URL) || cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) || null;
  const supabaseKey = cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) || null;
  return { supabaseUrl, supabaseKey };
}

async function supabaseRequest(env, path, init = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseContext(env);
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Configuracao do Supabase incompleta para dispatcher CRM.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

function isMissingSourceError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function formatDateLabel(data, hora = "12:00") {
  if (!data) return "Sem data";
  return new Date(`${data}T${hora}:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

async function loadStoredTemplate(env, channel, templateName) {
  try {
    const rows = await supabaseRequest(
      env,
      `agentlab_message_templates?select=*&channel=eq.${encodeURIComponent(channel)}&template_name=eq.${encodeURIComponent(templateName)}&enabled=is.true&limit=1`
    );
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    if (isMissingSourceError(error)) {
      return null;
    }
    throw error;
  }
}

function buildEmailTemplate(templateName, context, storedTemplate = null) {
  const agendamento = context.agendamento || {};
  const zoomLink = context.zoom?.zoom_join_url || agendamento.zoom_join_url || null;
  const dataFormatada = formatDateLabel(agendamento.data, agendamento.hora || "12:00");

  if (storedTemplate?.body_html || storedTemplate?.subject) {
    return {
      subject: storedTemplate.subject || `Atualizacao do seu atendimento - ${templateName}`,
      html: (storedTemplate.body_html || "<div>Template sem conteudo.</div>")
        .replace(/\{\{nome\}\}/g, agendamento.nome || "cliente")
        .replace(/\{\{data\}\}/g, dataFormatada)
        .replace(/\{\{hora\}\}/g, agendamento.hora || "")
        .replace(/\{\{zoom_link\}\}/g, zoomLink || ""),
    };
  }

  const templates = {
    confirmacao_agendamento: {
      subject: "Seu agendamento foi recebido - Hermida Maia Advocacia",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
          <h2 style="color:#C5A059;margin-top:0">Agendamento recebido</h2>
          <p>Olá, <strong>${agendamento.nome || "cliente"}</strong>.</p>
          <p>Recebemos seu agendamento para ${dataFormatada}, às ${agendamento.hora || "horário a confirmar"}.</p>
          ${zoomLink ? `<p>Sala virtual: <a href="${zoomLink}" style="color:#C5A059">${zoomLink}</a></p>` : ""}
          <p>Em breve enviaremos as próximas orientações.</p>
        </div>
      `,
    },
    lembrete_consulta: {
      subject: "Lembrete da sua consulta - Hermida Maia Advocacia",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
          <h2 style="color:#C5A059;margin-top:0">Lembrete de consulta</h2>
          <p>Olá, <strong>${agendamento.nome || "cliente"}</strong>.</p>
          <p>Este é um lembrete da sua consulta em ${dataFormatada}, às ${agendamento.hora || "horário a confirmar"}.</p>
          ${zoomLink ? `<p>Link da reunião: <a href="${zoomLink}" style="color:#C5A059">${zoomLink}</a></p>` : ""}
        </div>
      `,
    },
    pos_consulta_proposta: {
      subject: "Próximos passos da sua consulta - Hermida Maia Advocacia",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
          <h2 style="color:#C5A059;margin-top:0">Próximos passos</h2>
          <p>Olá, <strong>${agendamento.nome || "cliente"}</strong>.</p>
          <p>Obrigado pela consulta. Estamos organizando os próximos passos do seu atendimento jurídico-comercial.</p>
        </div>
      `,
    },
    no_show_recuperacao: {
      subject: "Vamos remarcar sua consulta?",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
          <h2 style="color:#C5A059;margin-top:0">Remarcação disponível</h2>
          <p>Olá, <strong>${agendamento.nome || "cliente"}</strong>.</p>
          <p>Não identificamos sua presença na consulta agendada. Se ainda fizer sentido, podemos remarcar seu horário.</p>
        </div>
      `,
    },
    envio_contrato: {
      subject: "Envio de contrato - Hermida Maia Advocacia",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
          <h2 style="color:#C5A059;margin-top:0">Contrato em preparação</h2>
          <p>Olá, <strong>${agendamento.nome || "cliente"}</strong>.</p>
          <p>Estamos preparando a etapa contratual do seu atendimento.</p>
        </div>
      `,
    },
  };

  return templates[templateName] || {
    subject: `Atualização do seu atendimento - ${templateName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
        <h2 style="color:#C5A059;margin-top:0">Atualização do atendimento</h2>
        <p>Olá, <strong>${agendamento.nome || "cliente"}</strong>.</p>
        <p>Houve uma atualização no seu atendimento. Nossa equipe pode entrar em contato em seguida.</p>
      </div>
    `,
  };
}

function buildWhatsappTemplate(templateName, context, storedTemplate = null) {
  const agendamento = context.agendamento || {};
  const zoomLink = context.zoom?.zoom_join_url || agendamento.zoom_join_url || null;
  const dataFormatada = formatDateLabel(agendamento.data, agendamento.hora || "12:00");

  if (storedTemplate?.body_text) {
    return (storedTemplate.body_text || "")
      .replace(/\{\{nome\}\}/g, agendamento.nome || "cliente")
      .replace(/\{\{data\}\}/g, dataFormatada)
      .replace(/\{\{hora\}\}/g, agendamento.hora || "")
      .replace(/\{\{zoom_link\}\}/g, zoomLink || "");
  }

  const templates = {
    confirmacao_agendamento: `Ola, {{nome}}. Seu agendamento foi recebido para {{data}}, as {{hora}}. ${zoomLink ? `Link da sala: ${zoomLink}` : ""}`.trim(),
    lembrete_consulta: `Lembrete da sua consulta em {{data}}, as {{hora}}. ${zoomLink ? `Link: ${zoomLink}` : ""}`.trim(),
    pos_consulta_proposta: "Obrigado pela consulta. Estamos organizando os proximos passos do seu atendimento.",
    no_show_recuperacao: "Nao identificamos sua presenca na consulta agendada. Se quiser, podemos remarcar seu horario.",
    envio_contrato: "Estamos preparando a etapa contratual do seu atendimento. Em breve enviaremos as instrucoes.",
  };

  return (templates[templateName] || "Houve uma atualizacao no seu atendimento. Nossa equipe pode entrar em contato em seguida.")
    .replace(/\{\{nome\}\}/g, agendamento.nome || "cliente")
    .replace(/\{\{data\}\}/g, dataFormatada)
    .replace(/\{\{hora\}\}/g, agendamento.hora || "")
    .replace(/\{\{zoom_link\}\}/g, zoomLink || "");
}

async function sendOperationalEmail(env, templateName, context) {
  const recipient = context.agendamento?.email;
  const apiKey = cleanEnvValue(env.RESEND_API_KEY);
  if (!recipient || !apiKey) {
    return {
      ok: false,
      status: "skipped",
      detail: "Email ou RESEND_API_KEY ausente para dispatch de e-mail.",
    };
  }

  const storedTemplate = await loadStoredTemplate(env, "email", templateName);
  const template = buildEmailTemplate(templateName, context, storedTemplate);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Hermida Maia Advocacia <contato@hermidamaia.adv.br>",
      to: [recipient],
      reply_to: "suporte@hermidamaia.adv.br",
      subject: template.subject,
      html: template.html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: "failed",
      detail: payload.message || payload.name || `Resend ${response.status}`,
      payload,
    };
  }

  return {
    ok: true,
    status: "sent",
    detail: "E-mail operacional enviado com sucesso.",
    payload,
  };
}

function normalizeWhatsappNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

async function sendWhatsappViaMeta(env, dispatchRun) {
  const apiToken = cleanEnvValue(env.WHATSAPP_CLOUD_API_TOKEN);
  const phoneNumberId = cleanEnvValue(env.WHATSAPP_PHONE_NUMBER_ID);
  const apiVersion = cleanEnvValue(env.WHATSAPP_CLOUD_API_VERSION) || "v20.0";
  const provider = cleanEnvValue(env.WHATSAPP_PROVIDER) || "meta";

  if (provider !== "meta") {
    throw new Error(`Provider WhatsApp nao suportado neste runtime: ${provider}`);
  }

  if (!apiToken || !phoneNumberId) {
    throw new Error("Credenciais do WhatsApp Cloud API ausentes.");
  }

  const to = normalizeWhatsappNumber(dispatchRun.recipient_ref || dispatchRun.payload?.telefone);
  if (!to) {
    throw new Error("Telefone do destinatario ausente para envio de WhatsApp.");
  }

  const messageBody = String(dispatchRun.payload?.message_preview || "").trim();
  if (!messageBody) {
    throw new Error("Mensagem do WhatsApp vazia para envio.");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: messageBody,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `WhatsApp Cloud API ${response.status}`);
  }

  return {
    ok: true,
    status: "sent",
    detail: "Mensagem enviada via WhatsApp Cloud API.",
    payload,
  };
}

async function persistDispatchRuns(env, runs) {
  if (!runs.length) return { persisted: false, warnings: [] };

  try {
    await supabaseRequest(env, "agentlab_crm_dispatch_runs", {
      method: "POST",
      body: JSON.stringify(runs),
      headers: { Prefer: "return=representation" },
    });
    return { persisted: true, warnings: [] };
  } catch (error) {
    if (isMissingSourceError(error)) {
      return {
        persisted: false,
        warnings: ["A tabela agentlab_crm_dispatch_runs ainda nao existe. Os dispatches foram executados, mas nao persistidos."],
      };
    }
    throw error;
  }
}

function generateRunId() {
  return crypto.randomUUID();
}

export async function dispatchCrmAutomation(env, automationRuns = [], context = {}) {
  const dispatchRuns = [];
  const warnings = [];

  for (const run of automationRuns) {
    if (run.execution_mode === "manual") {
      continue;
    }

    if (run.email_template && run.execution_mode === "auto") {
      const emailResult = await sendOperationalEmail(env, run.email_template, context);
      dispatchRuns.push({
        id: generateRunId(),
        automation_run_id: run.id,
        channel: "email",
        template_name: run.email_template,
        recipient_ref: context.agendamento?.email || null,
        status: emailResult.status,
        detail: emailResult.detail || null,
        payload: emailResult.payload || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!emailResult.ok) {
        warnings.push(`email:${run.email_template}: ${emailResult.detail}`);
      }
    }

    if (run.whatsapp_template) {
      const phone = context.agendamento?.telefone || null;
      const storedWhatsappTemplate = await loadStoredTemplate(env, "whatsapp", run.whatsapp_template);
      const messagePreview = buildWhatsappTemplate(run.whatsapp_template, context, storedWhatsappTemplate);
      const status = !phone ? "skipped" : run.execution_mode === "auto" ? "approved" : "pending_approval";
      dispatchRuns.push({
        id: generateRunId(),
        automation_run_id: run.id,
        channel: "whatsapp",
        template_name: run.whatsapp_template,
        recipient_ref: phone,
        status,
        detail: phone
          ? run.execution_mode === "auto"
            ? "Mensagem aprovada automaticamente para fila operacional de WhatsApp."
            : "Mensagem aguardando aprovacao operacional no WhatsApp."
          : "Telefone ausente para enfileirar WhatsApp.",
        payload: {
          agendamento_id: context.agendamento?.id || null,
          telefone: phone,
          template_name: run.whatsapp_template,
          message_preview: messagePreview,
          approval_mode: run.execution_mode === "auto" ? "automatic" : "manual",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!phone) {
        warnings.push(`whatsapp:${run.whatsapp_template}: telefone ausente para fila.`);
      }
    }
  }

  const persistence = await persistDispatchRuns(env, dispatchRuns);
  warnings.push(...persistence.warnings);

  return {
    dispatchRuns,
    warnings,
    persisted: persistence.persisted,
  };
}

export async function executeDispatchRun(env, dispatchRun) {
  if (!dispatchRun || !dispatchRun.id) {
    throw new Error("Dispatch invalido para execucao.");
  }

  if (dispatchRun.channel !== "whatsapp") {
    throw new Error(`Canal ${dispatchRun.channel} ainda nao suporta envio manual.`);
  }

  return sendWhatsappViaMeta(env, dispatchRun);
}
