/**
 * freshdesk-ticket-process  v1
 *
 * Agente de IA para suporte ao cliente via Freshdesk.
 * Processa tickets recebidos e:
 *   1. Classifica a intenção do cliente (andamento processual, débito financeiro,
 *      agendamento, informação geral, outro)
 *   2. Busca dados relevantes no Supabase (processos, publicações, financeiro, agendamentos)
 *   3. Gera resposta personalizada via LLM (gpt-4.1-mini)
 *   4. Responde ao ticket no Freshdesk com a resposta gerada
 *   5. Atualiza o campo cf_processo_cnj se detectar CNJ na mensagem
 *   6. Notifica o Slack (canal SLACK_NOTIFY_CHANNEL) sobre o processamento
 *
 * Modos de operação:
 *   POST { ticket_id: number }         → processa ticket específico
 *   POST { action: "batch_pending" }   → processa tickets sem resposta (últimas 24h)
 *
 * Webhook Freshdesk: configurar em Admin → Automações → Criação de Ticket
 *   URL: https://sspvizogbcyigquqycsz.supabase.co/functions/v1/freshdesk-ticket-process
 *   Payload: {"ticket_id": "{{ticket.id}}"}
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FD_DOMAIN = "https://hmdesk.freshdesk.com";
const FD_API_KEY = Deno.env.get("FRESHDESK_API_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("AI_GATEWAY_API_KEY") || "";
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || Deno.env.get("SLACK_ACCESS_TOKEN") || "";
const SLACK_CHANNEL = Deno.env.get("SLACK_NOTIFY_CHANNEL") || "";

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const dbJud = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "judiciario" } });

// ─── Regex CNJ ────────────────────────────────────────────────────────────────
const CNJ_REGEX = /\b(\d{7}[-.]?\d{2}[-.]?\d{4}[-.]?\d{1}[-.]?\d{2}[-.]?\d{4})\b/g;

function normalizeCnj(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 20) return raw;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function extractCnj(text: string): string | null {
  const matches = [...text.matchAll(CNJ_REGEX)];
  if (!matches.length) return null;
  return normalizeCnj(matches[0][1]);
}

// ─── Freshdesk Helpers ────────────────────────────────────────────────────────
function fdHeaders() {
  const token = btoa(`${FD_API_KEY}:X`);
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

async function fdGetTicket(ticketId: number): Promise<Record<string, unknown> | null> {
  const resp = await fetch(
    `${FD_DOMAIN}/api/v2/tickets/${ticketId}?include=conversations,requester`,
    { headers: fdHeaders() }
  );
  if (!resp.ok) return null;
  return await resp.json();
}

async function fdReplyTicket(ticketId: number, body: string): Promise<boolean> {
  const resp = await fetch(`${FD_DOMAIN}/api/v2/tickets/${ticketId}/reply`, {
    method: "POST",
    headers: fdHeaders(),
    body: JSON.stringify({ body }),
  });
  return resp.ok || resp.status === 201;
}

async function fdUpdateTicket(ticketId: number, updates: Record<string, unknown>): Promise<void> {
  await fetch(`${FD_DOMAIN}/api/v2/tickets/${ticketId}`, {
    method: "PUT",
    headers: fdHeaders(),
    body: JSON.stringify(updates),
  });
}

async function fdAddNote(ticketId: number, body: string, isPrivate = true): Promise<void> {
  await fetch(`${FD_DOMAIN}/api/v2/tickets/${ticketId}/notes`, {
    method: "POST",
    headers: fdHeaders(),
    body: JSON.stringify({ body, private: isPrivate }),
  });
}

// ─── Buscar contexto do cliente no Supabase ───────────────────────────────────
async function getClientContext(
  email: string | null,
  cnj: string | null
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {};

  if (email) {
    // Buscar contato no Freshdesk/Supabase
    const { data: contact } = await db
      .from("freshdesk_contacts")
      .select("fd_contact_id, name, phone, mobile, freshsales_contact_id")
      .eq("email", email)
      .single();

    if (contact) {
      context.contact = contact;

      // Buscar agendamentos futuros
      const { data: agendamentos } = await db
        .from("agendamentos")
        .select("id, data, hora, area, status, zoom_join_url, google_event_id")
        .eq("email", email)
        .gte("data", new Date().toISOString().split("T")[0])
        .order("data", { ascending: true })
        .limit(3);

      if (agendamentos?.length) context.agendamentos_futuros = agendamentos;

      // Buscar agendamentos passados recentes
      const { data: agendamentosPassados } = await db
        .from("agendamentos")
        .select("id, data, hora, area, status")
        .eq("email", email)
        .lt("data", new Date().toISOString().split("T")[0])
        .order("data", { ascending: false })
        .limit(2);

      if (agendamentosPassados?.length) context.agendamentos_recentes = agendamentosPassados;
    }
  }

  if (cnj) {
    // Buscar processo pelo CNJ
    const { data: processo } = await dbJud
      .from("processos")
      .select("id, numero_cnj, polo_ativo, polo_passivo, status, instancia, tipo_processo, data_distribuicao, freshsales_account_id")
      .eq("numero_cnj", cnj)
      .single();

    if (processo) {
      context.processo = processo;

      // Buscar últimas publicações do processo
      const { data: publicacoes } = await dbJud
        .from("publicacoes")
        .select("data_publicacao, ai_tipo_ato, ai_resumo, ai_urgencia, ai_prazo_dias")
        .eq("processo_id", processo.id)
        .order("data_publicacao", { ascending: false })
        .limit(3);

      if (publicacoes?.length) context.publicacoes_recentes = publicacoes;

      // Buscar prazos pendentes
      const { data: prazos } = await dbJud
        .from("prazo_calculado")
        .select("tipo_prazo, data_prazo, status")
        .eq("processo_id", processo.id)
        .eq("status", "pendente")
        .gte("data_prazo", new Date().toISOString().split("T")[0])
        .order("data_prazo", { ascending: true })
        .limit(3);

      if (prazos?.length) context.prazos_pendentes = prazos;
    }
  }

  // Buscar informações financeiras se tiver e-mail
  if (email) {
    const { data: deals } = await db
      .from("freshsales_deals")
      .select("deal_name, amount, deal_stage, close_date, currency")
      .eq("contact_email", email)
      .order("close_date", { ascending: false })
      .limit(3);

    if (deals?.length) context.financeiro = deals;
  }

  return context;
}

// ─── Classificar intenção via LLM ─────────────────────────────────────────────
type Intencao = "andamento_processual" | "debito_financeiro" | "agendamento" | "informacao_geral" | "outro";

async function classificarIntencao(assunto: string, corpo: string): Promise<Intencao> {
  if (!OPENAI_KEY) {
    // Classificação por palavras-chave como fallback
    const texto = `${assunto} ${corpo}`.toLowerCase();
    if (/processo|cnj|andamento|publicação|audiência|prazo|sentença|decisão|despacho/.test(texto)) return "andamento_processual";
    if (/boleto|fatura|pagamento|débito|honorário|cobrança|mensalidade|vencimento/.test(texto)) return "debito_financeiro";
    if (/agendar|agendamento|consulta|reunião|horário|disponibilidade|marcar/.test(texto)) return "agendamento";
    return "informacao_geral";
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `Classifique a intenção do cliente em um escritório de advocacia.
Retorne APENAS uma das seguintes categorias (sem explicação):
- andamento_processual: perguntas sobre processos, publicações, audiências, prazos, decisões
- debito_financeiro: perguntas sobre boletos, faturas, pagamentos, honorários, cobranças
- agendamento: solicitações de consulta, reunião, agendamento, horários disponíveis
- informacao_geral: dúvidas gerais sobre serviços, documentos, informações do escritório
- outro: qualquer outra solicitação`,
        },
        {
          role: "user",
          content: `Assunto: ${assunto}\nMensagem: ${corpo.substring(0, 500)}`,
        },
      ],
      temperature: 0,
      max_tokens: 20,
    }),
  });

  if (!resp.ok) return "informacao_geral";
  const data = await resp.json();
  const resposta = (data?.choices?.[0]?.message?.content || "").trim().toLowerCase();

  if (resposta.includes("andamento")) return "andamento_processual";
  if (resposta.includes("debito") || resposta.includes("financeiro")) return "debito_financeiro";
  if (resposta.includes("agendamento")) return "agendamento";
  if (resposta.includes("informacao") || resposta.includes("geral")) return "informacao_geral";
  return "outro";
}

// ─── Gerar resposta via LLM ───────────────────────────────────────────────────
async function gerarResposta(
  nomeCliente: string,
  intencao: Intencao,
  assunto: string,
  mensagem: string,
  contexto: Record<string, unknown>
): Promise<string> {
  const assinatura = `
<br><br>
<p>Atenciosamente,</p>
<p><strong>Hermida Maia Advocacia</strong><br>
Dr. Adriano Menezes Hermida Maia<br>
OAB 8894AM | 476963SP | 107048RS | 75394DF<br>
<em>Esta é uma resposta automática gerada pelo sistema de suporte ao cliente.</em></p>`;

  if (!OPENAI_KEY) {
    // Resposta padrão sem IA
    const respostas: Record<Intencao, string> = {
      andamento_processual: `<p>Prezado(a) ${nomeCliente},</p><p>Recebemos sua mensagem sobre o andamento processual. Nossa equipe irá verificar as informações e retornará em breve com as atualizações necessárias.</p>${assinatura}`,
      debito_financeiro: `<p>Prezado(a) ${nomeCliente},</p><p>Recebemos sua mensagem sobre questões financeiras. Nossa equipe irá verificar sua situação e entrará em contato em breve.</p>${assinatura}`,
      agendamento: `<p>Prezado(a) ${nomeCliente},</p><p>Recebemos sua solicitação de agendamento. Para agendar uma consulta, acesse nosso sistema de agendamento online ou aguarde o contato de nossa equipe.</p>${assinatura}`,
      informacao_geral: `<p>Prezado(a) ${nomeCliente},</p><p>Recebemos sua mensagem. Nossa equipe irá analisá-la e retornará em breve com as informações solicitadas.</p>${assinatura}`,
      outro: `<p>Prezado(a) ${nomeCliente},</p><p>Recebemos sua mensagem. Nossa equipe irá analisá-la e retornará em breve.</p>${assinatura}`,
    };
    return respostas[intencao];
  }

  // Construir contexto para o LLM
  const contextoParts: string[] = [];

  if (contexto.processo) {
    const p = contexto.processo as Record<string, unknown>;
    contextoParts.push(`PROCESSO: ${p.numero_cnj} | Status: ${p.status} | Instância: ${p.instancia} | Tipo: ${p.tipo_processo}`);
    if (p.polo_ativo) contextoParts.push(`Polo Ativo: ${p.polo_ativo}`);
    if (p.polo_passivo) contextoParts.push(`Polo Passivo: ${p.polo_passivo}`);
  }

  if (contexto.publicacoes_recentes) {
    const pubs = contexto.publicacoes_recentes as Array<Record<string, unknown>>;
    contextoParts.push(`ÚLTIMAS PUBLICAÇÕES:\n${pubs.map(p =>
      `- ${p.data_publicacao?.toString().split("T")[0]} | ${p.ai_tipo_ato}: ${p.ai_resumo}`
    ).join("\n")}`);
  }

  if (contexto.prazos_pendentes) {
    const prazos = contexto.prazos_pendentes as Array<Record<string, unknown>>;
    contextoParts.push(`PRAZOS PENDENTES:\n${prazos.map(p =>
      `- ${p.tipo_prazo}: ${p.data_prazo}`
    ).join("\n")}`);
  }

  if (contexto.agendamentos_futuros) {
    const ags = contexto.agendamentos_futuros as Array<Record<string, unknown>>;
    contextoParts.push(`AGENDAMENTOS FUTUROS:\n${ags.map(a =>
      `- ${a.data} às ${a.hora} | ${a.area} | Status: ${a.status}${a.zoom_join_url ? ` | Zoom: ${a.zoom_join_url}` : ""}`
    ).join("\n")}`);
  }

  if (contexto.financeiro) {
    const deals = contexto.financeiro as Array<Record<string, unknown>>;
    contextoParts.push(`FINANCEIRO:\n${deals.map(d =>
      `- ${d.deal_name}: ${d.currency || "BRL"} ${d.amount} | Fase: ${d.deal_stage} | Vencimento: ${d.close_date}`
    ).join("\n")}`);
  }

  const systemPrompt = `Você é o assistente de suporte ao cliente do escritório Hermida Maia Advocacia, do Dr. Adriano Menezes Hermida Maia (OAB 8894AM).

INSTRUÇÕES:
- Responda em português brasileiro, de forma profissional, empática e objetiva
- Use HTML básico para formatação (p, br, strong, ul, li)
- Forneça informações precisas baseadas nos dados do contexto
- Se não tiver informação suficiente, informe que a equipe retornará em breve
- Não invente dados processuais, financeiros ou de agendamento
- Seja conciso mas completo
- Intenção identificada: ${intencao}

DADOS DISPONÍVEIS:
${contextoParts.join("\n\n") || "Nenhum dado adicional encontrado para este cliente."}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Cliente: ${nomeCliente}\nAssunto: ${assunto}\nMensagem: ${mensagem.substring(0, 1000)}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 1000,
    }),
  });

  if (!resp.ok) {
    return `<p>Prezado(a) ${nomeCliente},</p><p>Recebemos sua mensagem e nossa equipe irá analisá-la em breve.</p>${assinatura}`;
  }

  const data = await resp.json();
  const resposta = data?.choices?.[0]?.message?.content || "";
  return `${resposta}${assinatura}`;
}

// ─── Notificar Slack ──────────────────────────────────────────────────────────
async function notificarSlack(
  ticketId: number,
  nomeCliente: string,
  email: string,
  intencao: Intencao,
  cnj: string | null,
  respondido: boolean
): Promise<void> {
  if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL) return;

  const intencaoEmoji: Record<Intencao, string> = {
    andamento_processual: "⚖️",
    debito_financeiro: "💰",
    agendamento: "📅",
    informacao_geral: "ℹ️",
    outro: "📬",
  };

  const emoji = intencaoEmoji[intencao] || "📬";
  const status = respondido ? "✅ Respondido automaticamente" : "⚠️ Aguardando resposta manual";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *Novo Ticket Freshdesk #${ticketId}*\n*Cliente:* ${nomeCliente} (${email})\n*Intenção:* ${intencao.replace(/_/g, " ")}\n${cnj ? `*CNJ:* \`${cnj}\`` : ""}\n*Status:* ${status}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Ver Ticket" },
          url: `${FD_DOMAIN}/a/tickets/${ticketId}`,
          style: "primary",
        },
      ],
    },
  ];

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel: SLACK_CHANNEL, text: `${emoji} Ticket #${ticketId} - ${nomeCliente}`, blocks }),
  });
}

// ─── Processar ticket individual ──────────────────────────────────────────────
async function processTicket(ticketId: number): Promise<Record<string, unknown>> {
  // 1. Buscar ticket no Freshdesk
  const ticket = await fdGetTicket(ticketId);
  if (!ticket) {
    return { ok: false, error: `Ticket ${ticketId} não encontrado no Freshdesk` };
  }

  const assunto = String(ticket.subject || "");
  const descricao = String(ticket.description_text || ticket.description || "");
  const requester = ticket.requester as Record<string, unknown> | null;
  const nomeCliente = String(requester?.name || ticket.name || "Cliente");
  const email = String(requester?.email || ticket.email || "");
  const customFields = ticket.custom_fields as Record<string, unknown> | null;
  const cnj_existente = String(customFields?.cf_processo_cnj || "");

  // 2. Verificar se já foi processado (tem nota privada de IA)
  const conversations = ticket.conversations as Array<Record<string, unknown>> || [];
  const jaProcessado = conversations.some(c =>
    c.private === true && String(c.body || "").includes("freshdesk-ticket-process")
  );

  if (jaProcessado) {
    return { ok: true, ticket_id: ticketId, status: "already_processed" };
  }

  // 3. Detectar CNJ no assunto e descrição
  const textoCompleto = `${assunto} ${descricao}`;
  const cnj = cnj_existente || extractCnj(textoCompleto);

  // 4. Atualizar cf_processo_cnj se detectado e não existia
  if (cnj && !cnj_existente) {
    await fdUpdateTicket(ticketId, { custom_fields: { cf_processo_cnj: cnj } });

    // Atualizar também no Supabase
    await db
      .from("freshdesk_tickets")
      .update({ process_cnj: cnj, updated_at: new Date().toISOString() })
      .eq("fd_ticket_id", ticketId);
  }

  // 5. Classificar intenção
  const intencao = await classificarIntencao(assunto, descricao);

  // 6. Buscar contexto do cliente
  const contexto = await getClientContext(email || null, cnj || null);

  // 7. Gerar resposta
  const resposta = await gerarResposta(nomeCliente, intencao, assunto, descricao, contexto);

  // 8. Adicionar nota privada com metadados do processamento
  const notaPrivada = `[freshdesk-ticket-process v1]
Processado em: ${new Date().toISOString()}
Intenção: ${intencao}
CNJ detectado: ${cnj || "nenhum"}
Contexto: ${JSON.stringify(Object.keys(contexto))}`;

  await fdAddNote(ticketId, notaPrivada, true);

  // 9. Responder ao ticket (apenas se tiver conteúdo relevante)
  let respondido = false;
  if (intencao !== "outro" && resposta.length > 100) {
    respondido = await fdReplyTicket(ticketId, resposta);
  }

  // 10. Notificar Slack
  await notificarSlack(ticketId, nomeCliente, email, intencao, cnj || null, respondido);

  // 11. Salvar log no Supabase
  await db.from("freshdesk_tickets").upsert({
    fd_ticket_id: ticketId,
    subject: assunto,
    requester_email: email,
    requester_name: nomeCliente,
    process_cnj: cnj || null,
    ai_intencao: intencao,
    ai_respondido: respondido,
    ai_processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "fd_ticket_id" });

  return {
    ok: true,
    ticket_id: ticketId,
    intencao,
    cnj: cnj || null,
    respondido,
    contexto_keys: Object.keys(contexto),
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const action = String(body.action || "");

  // ── Modo batch: processar tickets pendentes das últimas 24h ────────────────
  if (action === "batch_pending") {
    const { data: tickets, error } = await db
      .from("freshdesk_tickets")
      .select("fd_ticket_id")
      .is("ai_processed_at", null)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const t of (tickets || [])) {
      const result = await processTicket(t.fd_ticket_id);
      results.push(result);
      await new Promise(r => setTimeout(r, 800)); // Rate limiting
    }

    return new Response(
      JSON.stringify({ ok: true, action: "batch_pending", processed: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Modo individual ────────────────────────────────────────────────────────
  const ticketId = Number(body.ticket_id || body.id || 0);
  if (!ticketId) {
    return new Response(JSON.stringify({ error: "ticket_id é obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await processTicket(ticketId);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
