/**
 * dotobot-agent v2 — Supabase Edge Function
 * LLM: Cloudflare Workers AI (llama-3.1-8b-instruct)
 * Fallback: OpenAI GPT-4o-mini (se CF_ACCOUNT_ID não disponível)
 * Tools: Freshsales CRM + Supabase judiciario
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id, x-hmadv-key",
};

const FS_BASE = "https://hmadv-org.myfreshworks.com/crm/sales/api";

// ── Freshsales helpers ─────────────────────────────────────────────
async function fsGet(path, apiKey) {
  const res = await fetch(`${FS_BASE}${path}`, {
    headers: { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" }
  });
  if (!res.ok) throw new Error(`FS GET ${path} → ${res.status}`);
  return res.json();
}
async function fsPost(path, body, apiKey) {
  const res = await fetch(`${FS_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`FS POST ${path} → ${res.status}: ${e}`); }
  return res.json();
}
async function fsPatch(path, body, apiKey) {
  const res = await fetch(`${FS_BASE}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Token token=${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`FS PATCH ${path} → ${res.status}: ${e}`); }
  return res.json();
}

// ── Cloudflare Workers AI ──────────────────────────────────────────
async function callCloudflareLLM(messages, tools) {
  const accountId = Deno.env.get("CF_ACCOUNT_ID") || Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const cfToken = Deno.env.get("CLOUDFLARE_WORKER_API_TOKEN");

  if (!accountId || !cfToken) return null; // fallback para OpenAI

  // Cloudflare Workers AI — modelo Llama 3.1 com suporte a tool calling
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`;

  // Converter tools para formato Cloudflare
  const cfTools = tools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages,
      tools: cfTools,
      max_tokens: 1024,
      temperature: 0.4,
      stream: false
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[CF AI] Erro ${res.status}: ${err}`);
    return null;
  }

  const data = await res.json();
  return data.result; // { response: string, tool_calls?: [...] }
}

// ── OpenAI fallback ────────────────────────────────────────────────
async function callOpenAI(messages, tools) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      tools: tools.map(t => ({ type: "function", function: t })),
      tool_choice: "auto",
      max_tokens: 1000,
      temperature: 0.4
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) return null;

  // Normalizar para formato unificado
  if (choice.finish_reason === "tool_calls") {
    return {
      tool_calls: choice.message.tool_calls.map(tc => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
        id: tc.id
      })),
      _openai_message: choice.message // para manter no histórico
    };
  }
  return { response: choice.message.content };
}

// ── Tool definitions ───────────────────────────────────────────────
const TOOLS = [
  {
    name: "buscar_base_conhecimento",
    description: "Busca informações na base de conhecimento do escritório Hermida Maia Advocacia. Use para responder dúvidas sobre serviços, áreas jurídicas, processos e procedimentos do escritório.",
    parameters: { type: "object", properties: { consulta: { type: "string", description: "O que pesquisar" } }, required: ["consulta"] }
  },
  {
    name: "criar_contato_freshsales",
    description: "Cria ou atualiza um contato no CRM Freshsales com dados do cliente. Use quando tiver nome, email e/ou telefone do cliente.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo" },
        email: { type: "string", description: "Email" },
        telefone: { type: "string", description: "Telefone com DDD" },
        estado: { type: "string", description: "Estado (UF)" },
        cidade: { type: "string", description: "Cidade" }
      },
      required: ["email"]
    }
  },
  {
    name: "buscar_contato_freshsales",
    description: "Busca um contato existente no CRM pelo email.",
    parameters: { type: "object", properties: { email: { type: "string" } }, required: ["email"] }
  },
  {
    name: "criar_ticket_suporte",
    description: "Abre um ticket de suporte ou atendimento no Freshsales para acompanhamento interno.",
    parameters: {
      type: "object",
      properties: {
        assunto: { type: "string" },
        descricao: { type: "string" },
        email: { type: "string" },
        prioridade: { type: "number", description: "1=baixa, 2=normal, 3=alta, 4=urgente" }
      },
      required: ["assunto", "descricao", "email"]
    }
  },
  {
    name: "criar_agendamento",
    description: "Cria um agendamento/consulta no Freshsales. Use quando o cliente quiser marcar horário.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Ex: Consulta Jurídica - João Silva" },
        inicio: { type: "string", description: "Data e hora de início ISO 8601" },
        fim: { type: "string", description: "Data e hora de fim ISO 8601" },
        email_participante: { type: "string" },
        descricao: { type: "string" }
      },
      required: ["titulo", "inicio", "fim", "email_participante"]
    }
  },
  {
    name: "consultar_processo_judicial",
    description: "Consulta informações de um processo judicial pelo número CNJ. Requer autenticação prévia do cliente.",
    parameters: {
      type: "object",
      properties: {
        numero_cnj: { type: "string", description: "Número do processo no formato CNJ" }
      },
      required: ["numero_cnj"]
    }
  },
  {
    name: "listar_agendamentos_freshsales",
    description: "Lista os próximos agendamentos/reuniões do dia ou semana no Freshsales.",
    parameters: {
      type: "object",
      properties: {
        periodo: { type: "string", description: "hoje | semana | proximo", enum: ["hoje", "semana", "proximo"] }
      },
      required: ["periodo"]
    }
  }
];

// ── Executores de tools ────────────────────────────────────────────
async function executarTool(nome, params, supabase, fsKey, supabaseUrl) {
  console.log(`[tool] ${nome}`, JSON.stringify(params));

  switch (nome) {
    case "buscar_base_conhecimento": {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/dotobot-rag`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
          },
          body: JSON.stringify({ query: params.consulta || params.query, agent_ref: "dotobot", top_k: 4 })
        });
        const d = await r.json();
        const ctx = d.context;
        if (!ctx?.knowledge && !ctx?.workflows) return "Base de conhecimento ainda não populada para este tópico. Oriente o cliente a entrar em contato diretamente.";
        return [ctx.knowledge, ctx.workflows].filter(Boolean).join("\n\n");
      } catch (e) {
        return "Erro ao consultar base de conhecimento: " + e.message;
      }
    }

    case "criar_contato_freshsales": {
      try {
        const partes = (params.nome || "").split(" ");
        const payload = {
          contact: {
            first_name: partes[0] || "",
            last_name: partes.slice(1).join(" ") || "",
            email: params.email,
            mobile_number: params.telefone,
            state: params.estado,
            city: params.cidade,
            medium: "chat"
          }
        };
        const busca = await fsGet(`/contacts/search?q[email]=${encodeURIComponent(params.email)}&include=email`, fsKey).catch(() => null);
        if (busca?.contacts?.length > 0) {
          const id = busca.contacts[0].id;
          await fsPatch(`/contacts/${id}`, payload, fsKey);
          return `✅ Contato atualizado no CRM. ID: ${id}`;
        }
        const criado = await fsPost("/contacts", payload, fsKey);
        return `✅ Contato criado no CRM. ID: ${criado?.contact?.id}`;
      } catch (e) { return `❌ Erro ao criar contato: ${e.message}`; }
    }

    case "buscar_contato_freshsales": {
      try {
        const r = await fsGet(`/contacts/search?q[email]=${encodeURIComponent(params.email)}&include=email`, fsKey);
        if (r?.contacts?.length > 0) {
          const c = r.contacts[0];
          return `Contato encontrado: ${c.first_name} ${c.last_name} | Email: ${c.email} | ID: ${c.id}`;
        }
        return "Contato não encontrado no CRM.";
      } catch (e) { return `Erro: ${e.message}`; }
    }

    case "criar_ticket_suporte": {
      try {
        const r = await fsPost("/helpdesk/tickets", {
          helpdesk_ticket: {
            subject: params.assunto,
            description: params.descricao,
            email: params.email,
            priority: params.prioridade || 2,
            status: 1
          }
        }, fsKey);
        return `✅ Ticket criado. ID: ${r?.helpdesk_ticket?.id || "N/A"}. Nossa equipe entrará em contato em breve.`;
      } catch (e) { return `❌ Erro ao criar ticket: ${e.message}`; }
    }

    case "criar_agendamento": {
      try {
        const r = await fsPost("/appointments", {
          appointment: {
            title: params.titulo,
            from_date: params.inicio,
            end_date: params.fim,
            attendees: [{ email: params.email_participante, is_mandatory: true }],
            description: params.descricao || "",
            location: "Online / Videoconferência"
          }
        }, fsKey);
        return `✅ Consulta agendada com sucesso! ID: ${r?.appointment?.id}. Uma confirmação será enviada ao email ${params.email_participante}.`;
      } catch (e) { return `❌ Erro ao agendar: ${e.message}`; }
    }

    case "consultar_processo_judicial": {
      const { data, error } = await supabase
        .schema("judiciario")
        .from("processos")
        .select("numero_cnj, classe, assunto, tribunal, vara, situacao, data_distribuicao")
        .eq("numero_cnj", params.numero_cnj)
        .single();
      if (error || !data) return `Processo ${params.numero_cnj} não localizado na base.`;
      return `📋 Processo ${data.numero_cnj}:\n• Classe: ${data.classe}\n• Assunto: ${data.assunto}\n• Tribunal: ${data.tribunal}\n• Vara: ${data.vara}\n• Situação: ${data.situacao}\n• Distribuído: ${data.data_distribuicao}`;
    }

    case "listar_agendamentos_freshsales": {
      try {
        const hoje = new Date().toISOString().split("T")[0];
        const fim = new Date();
        if (params.periodo === "semana") fim.setDate(fim.getDate() + 7);
        else if (params.periodo === "proximo") fim.setDate(fim.getDate() + 30);
        else fim.setDate(fim.getDate() + 1);

        const r = await fsGet(`/appointments?filter=upcoming&from_date=${hoje}&to_date=${fim.toISOString().split("T")[0]}&per_page=10`, fsKey);
        const appts = r?.appointments || [];
        if (appts.length === 0) return "Nenhum agendamento encontrado para o período.";
        return appts.map(a => `📅 ${a.title} — ${new Date(a.from_date).toLocaleString("pt-BR")} (ID: ${a.id})`).join("\n");
      } catch (e) { return `Erro ao listar agendamentos: ${e.message}`; }
    }

    default:
      return `Ferramenta "${nome}" não reconhecida.`;
  }
}

// ── Handler principal ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const fsKey = Deno.env.get("FRESHSALES_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Aceitar autenticação via HMADV shared secret (para widget público)
    const sharedSecret = Deno.env.get("HMDAV_AI_SHARED_SECRET");
    const requestSecret = req.headers.get("x-hmadv-key");
    const authHeader = req.headers.get("authorization") || "";
    const isServiceRole = authHeader.includes(supabaseKey);
    const isSharedSecret = sharedSecret && requestSecret === sharedSecret;
    // verify_jwt=true mas aceitamos também o shared secret
    // A autenticação JWT padrão do Supabase continua válida

    const body = await req.json();
    const {
      message,
      session_id,
      channel = "webchat",
      mode = "assisted",
      contact_info = {},
      agent_ref = "dotobot",
      provider = "auto"  // auto | cloudflare | openai
    } = body;

    if (!message?.trim() || !session_id) {
      return Response.json({ error: "message e session_id são obrigatórios" }, { status: 400, headers: corsHeaders });
    }

    // Criar task run
    const taskRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from("dotobot_task_runs").insert({
      id: taskRunId, mission: message, mode,
      provider: provider === "cloudflare" ? "cloudflare" : "gpt",
      status: "running",
      route: "/functions/v1/dotobot-agent",
      actor_profile: { agent_ref, channel, contact_info }
    });

    // Carregar sessão e histórico
    const { data: sessionData } = await supabase
      .from("agentlab_agent_sessions")
      .select("messages")
      .eq("session_id", session_id)
      .single();
    const history = sessionData?.messages || [];

    // Carregar perfil do agente
    const { data: profile } = await supabase
      .from("agentlab_agent_profiles")
      .select("persona_prompt, response_policy")
      .eq("agent_ref", agent_ref)
      .single();

    const systemPrompt = (profile?.persona_prompt || 
      "Você é Maia, assistente virtual do escritório Hermida Maia Advocacia. Seja calorosa, empática e profissional. Responda em português (BR). Use o nome do cliente assim que souber. Respostas curtas (máx 3 frases). Ofereça agendamento proativamente quando detectar problema jurídico.") +
      "\n\nFERRAMENTAS DISPONÍVEIS: Você pode criar contatos, tickets, agendamentos e consultar processos no CRM. Use as ferramentas quando necessário para ajudar o cliente de forma efetiva.";

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-20),
      { role: "user", content: message }
    ];

    // ── Loop de agentic tool calling ──────────────────────────────
    let finalResponse = "";
    let iterations = 0;
    const MAX_ITER = 5;
    let usedProvider = "none";

    while (iterations < MAX_ITER) {
      iterations++;

      // Tentar Cloudflare Workers AI primeiro (se provider != openai)
      let result = null;
      if (provider !== "openai") {
        result = await callCloudflareLLM(messages, TOOLS);
        if (result) usedProvider = "cloudflare";
      }

      // Fallback para OpenAI
      if (!result) {
        result = await callOpenAI(messages, TOOLS);
        if (result) usedProvider = "openai";
      }

      if (!result) {
        finalResponse = "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em instantes.";
        break;
      }

      // Tool calls (Cloudflare format)
      if (result.tool_calls && result.tool_calls.length > 0) {
        // Adicionar mensagem do assistente ao histórico de conversa
        if (result._openai_message) {
          messages.push(result._openai_message);
        } else {
          messages.push({ role: "assistant", content: "", tool_calls: result.tool_calls.map(tc => ({ id: tc.id || `tc_${Date.now()}`, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })) });
        }

        // Executar cada tool
        for (const tc of result.tool_calls) {
          const toolResult = await executarTool(
            tc.name,
            tc.arguments || {},
            supabase, fsKey, supabaseUrl
          );
          messages.push({
            role: "tool",
            tool_call_id: tc.id || `tc_${Date.now()}`,
            content: toolResult
          });
        }
        continue; // próxima iteração com resultados das tools
      }

      // Resposta final de texto
      finalResponse = result.response || "";
      break;
    }

    if (!finalResponse) {
      finalResponse = "Posso ajudá-lo(a) com informações sobre o escritório, agendamentos ou dúvidas jurídicas. Como posso auxiliar?";
    }

    // Salvar histórico da sessão
    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: finalResponse }
    ];
    await supabase.from("agentlab_agent_sessions").upsert({
      session_id, agent_ref, channel,
      messages: updatedHistory.slice(-40),
      last_message: finalResponse,
      updated_at: new Date().toISOString()
    }, { onConflict: "session_id" });

    // Atualizar task run
    await supabase.from("dotobot_task_runs").update({
      status: "completed",
      provider: usedProvider,
      result: { response: finalResponse, iterations, provider: usedProvider },
      updated_at: new Date().toISOString()
    }).eq("id", taskRunId);

    return Response.json({
      response: finalResponse,
      session_id,
      task_run_id: taskRunId,
      provider: usedProvider,
      iterations
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[dotobot-agent] Error:", err);
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
