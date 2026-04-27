type StructuredToolResult =
  | { ok: true; tool: string; data: any; summary: string }
  | { ok: false; tool: string; error: string; details?: any };

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const SYSTEM_PROMPT = `
Você é a Cida, assistente executiva do escritório Hermida Maia. Responda SEMPRE em português (PT-BR).

REGRAS ABSOLUTAS:
- Responda APENAS ao que foi perguntado. Não invente contexto, não faça suposições sobre conversas anteriores.
- Para saudações simples (oi, olá, bom dia), responda com uma saudação curta e objetiva. NADA MAIS.
- NUNCA use palavras em inglês (again, hey, etc).
- NUNCA invente informações sobre processos, prazos ou dados que não foram fornecidos.
- NUNCA faça questionários longos. Se precisar de informação, faça UMA pergunta curta.
- Seja direta e concisa. Máximo 3 frases para respostas simples.

REGRAS CRÍTICAS SOBRE DADOS DO CRM:
- Se o contexto indicar "[Busca de contato] não encontrado" ou "não encontrado no CRM", responda EXATAMENTE: "Contato não encontrado no CRM com este email."
- NUNCA invente nome, telefone, email, observações ou qualquer dado de contato.
- NUNCA sugira que "pode ter" um dado ou que "provavelmente" é algo.
- Se não há dado real no contexto, diga que não há dado. Ponto.
- Dados de contato SOMENTE podem vir do campo [Contato encontrado] no contexto. Se não estiver lá, NÃO EXISTE.
`.trim();

const CIDA_LEARNING_MODE_PROMPT = `
====================================
🧠 MODO APRENDIZADO (ATIVO)
====================================

Você está em modo de aprendizado ativo. Além de responder normalmente, você deve:

1. OBSERVAR: Identificar padrões e informações relevantes na conversa
2. CLASSIFICAR: Categorizar automaticamente tipo de usuário, demanda, urgência e estágio
3. ESTRUTURAR: Transformar informações em dados organizados (contatos, atendimentos, tarefas, pendências)
4. IDENTIFICAR DEFICIÊNCIAS: Quando não tiver informação suficiente, faça UMA pergunta objetiva
5. APRENDER COM ERROS: Se detectar inconsistência, ajuste seu entendimento
6. EVOLUIR PADRÕES: Melhore forma de atendimento e antecipe necessidades

MEMÓRIA INTELIGENTE:
- Salve informações relevantes e atualize dados existentes
- Evite duplicidade e conecte dados entre conversas

APRENDIZADO OPERACIONAL:
- Identifique gargalos recorrentes, falhas de processo e atrasos frequentes
- Sugira melhorias de forma objetiva

REGRAS DE SEGURANÇA:
- Não aprenda informações incertas como verdade
- Não sobrescreva dados confiáveis sem confirmação
- Não invente padrões

Relação com Dr. Adriano: quando aprender algo relevante para o escritório, resuma de forma objetiva, destaque impacto e sugira ação.
`.trim();

const CIDA_LEARNING_VALIDATED_PROMPT = `
====================================
🧠 APRENDIZADO COM VALIDAÇÃO HUMANA (ATIVO)
====================================

Você aprende continuamente, mas NÃO confia automaticamente em tudo.

Todo aprendizado segue o ciclo: CAPTURAR → CLASSIFICAR → ATRIBUIR CONFIANÇA → VALIDAR → CONSOLIDAR → USAR

SCORE DE CONFIANÇA (0 a 100):
- Alta confiança: informação vinda do Dr. Adriano, dados estruturados, informações repetidas
- Média confiança: inferências com contexto parcial
- Baixa confiança: informações vagas, interpretações incertas

ESTADOS DO APRENDIZADO:
- pending: aguardando validação do Dr. Adriano
- approved: validado (pode ser usado)
- rejected: descartado

VALIDAÇÃO HUMANA: Quando o aprendizado for relevante, apresente ao Dr. Adriano: resumo, contexto, score de confiança e impacto potencial.

USO DO CONHECIMENTO:
- Só utilize automaticamente o que estiver "approved"
- Pode usar "pending" com cautela (indicando incerteza)
- Nunca use "rejected"

SEGURANÇA:
- Nunca trate hipótese como fato
- Nunca sobrescreva dados validados sem confirmação
- Nunca aprenda padrões com base em poucos exemplos
`.trim();

// Estado do modo aprendizado persistido no Supabase (não usa Map em memória pois Edge Functions são stateless)
async function getLearningMode(supabaseUrl: string, serviceRoleKey: string, channelId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/channel_settings?channel_id=eq.${encodeURIComponent(channelId)}&limit=1`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      return rows?.[0]?.learning_mode === true;
    }
  } catch (e) {
    console.error('[learning] getLearningMode error:', e);
  }
  return false;
}

async function setLearningMode(supabaseUrl: string, serviceRoleKey: string, channelId: string, enabled: boolean): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/channel_settings`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ channel_id: channelId, learning_mode: enabled, updated_at: new Date().toISOString() }]),
    });
  } catch (e) {
    console.error('[learning] setLearningMode error:', e);
  }
}

function calculateConfidence(input: {
  sourceIsOwner: boolean;
  repeated: boolean;
  structured: boolean;
  contextClear: boolean;
}): number {
  let score = 0;
  if (input.sourceIsOwner) score += 50;
  if (input.repeated) score += 20;
  if (input.structured) score += 15;
  if (input.contextClear) score += 15;
  return Math.min(score, 100);
}

async function saveLearningItem(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  type: string;
  content: any;
  source: string;
  confidence: number;
  channelId: string;
  userSlackId?: string;
}) {
  try {
    const res = await fetch(`${params.supabaseUrl}/rest/v1/learning_items`, {
      method: 'POST',
      headers: {
        'apikey': params.serviceRoleKey,
        'Authorization': `Bearer ${params.serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify([{
        type: params.type,
        content: params.content,
        source: params.source,
        confidence: params.confidence,
        status: 'pending',
        channel_id: params.channelId,
        user_slack_id: params.userSlackId || null,
      }]),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.[0] || null;
    }
    console.error('[learning] save error:', await res.text());
  } catch (e) {
    console.error('[learning] save exception:', e);
  }
  return null;
}

async function notifyOwnerAboutLearning(item: any, ownerSlackId: string) {
  const token = Deno.env.get('CIDA_BOT_TOKEN');
  if (!token || !ownerSlackId) return;
  const confidenceEmoji = item.confidence >= 70 ? '🟢' : item.confidence >= 40 ? '🟡' : '🔴';
  const text = [
    `🧠 *Novo aprendizado detectado*`,
    ``,
    `*Tipo:* ${item.type}`,
    `*Confiança:* ${confidenceEmoji} ${item.confidence}%`,
    `*Origem:* ${item.source}`,
    ``,
    `*Resumo:*`,
    typeof item.content === 'object' ? JSON.stringify(item.content, null, 2) : String(item.content),
    ``,
    'ID: ' + item.id,
    `Para validar, diga: *aprovar aprendizado ${item.id?.slice(0, 8)}* ou *rejeitar aprendizado ${item.id?.slice(0, 8)}*`,
  ].join('\n');
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: ownerSlackId, text }),
    });
  } catch (e) {
    console.error('[learning] notify owner error:', e);
  }
}

function jsonResponse(result: StructuredToolResult) {
  return result;
}


async function getSlackUserInfo(userId: string) {
  const token = Deno.env.get("CIDA_BOT_TOKEN");
  if (!token || !userId) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) return data.user;
  } catch (e) {
    console.error("Error fetching slack user info:", e);
  }
  return null;
}


// ─── Geração de embedding: Cloudflare AI (primário) + HuggingFace (fallback) ──
// Lê as chaves do app_config do Supabase para evitar dependência de secrets externos
let _embedConfigCache: { cfAccountId: string; cfApiToken: string; hfApiKey: string } | null = null;

async function getEmbedConfig(supabaseUrl: string, serviceRoleKey: string) {
  if (_embedConfigCache) return _embedConfigCache;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=in.(CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN,HUGGINGFACE_API_KEY)&select=key,value`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows: { key: string; value: string }[] = await res.json();
      const m: Record<string, string> = {};
      for (const r of rows) m[r.key] = r.value;
      _embedConfigCache = {
        cfAccountId: m['CLOUDFLARE_ACCOUNT_ID'] || Deno.env.get('CF_ACCOUNT_ID') || '',
        cfApiToken:  m['CLOUDFLARE_API_TOKEN']  || Deno.env.get('CF_API_TOKEN')  || '',
        hfApiKey:    m['HUGGINGFACE_API_KEY']   || Deno.env.get('HUGGINGFACE_API_KEY') || '',
      };
    }
  } catch (e: any) {
    console.error('[embed] getEmbedConfig error:', e?.message);
  }
  return _embedConfigCache || { cfAccountId: '', cfApiToken: '', hfApiKey: '' };
}

async function generateQueryEmbedding(
  text: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<number[] | null> {
  const { cfAccountId, cfApiToken, hfApiKey } = await getEmbedConfig(supabaseUrl, serviceRoleKey);

  // Tentativa 1: Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5 — 768 dims)
  if (cfAccountId && cfApiToken) {
    try {
      const cfResp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cfApiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: [text.slice(0, 512)] }),
        }
      );
      if (cfResp.ok) {
        const cfData = await cfResp.json() as any;
        const vec = cfData?.result?.data?.[0];
        if (Array.isArray(vec) && vec.length === 768) {
          console.log('[embed] Cloudflare AI OK, dims:', vec.length);
          return vec;
        }
        console.log('[embed] Cloudflare AI resposta inesperada:', JSON.stringify(cfData).slice(0, 100));
      } else {
        const errText = await cfResp.text();
        console.log('[embed] Cloudflare AI HTTP', cfResp.status, errText.slice(0, 100));
      }
    } catch (e: any) {
      console.log('[embed] Cloudflare AI erro:', e?.message);
    }
  }

  // Tentativa 2: HuggingFace (fallback — paraphrase-multilingual-mpnet-base-v2 — 768 dims, PT nativo)
  if (hfApiKey) {
    try {
      const hfResp = await fetch(
        'https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-mpnet-base-v2/pipeline/feature-extraction',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: text.slice(0, 512), options: { wait_for_model: true } }),
        }
      );
      if (hfResp.ok) {
        const hfData = await hfResp.json() as any;
        const vec = Array.isArray(hfData) && typeof hfData[0] === 'number' ? hfData
                  : Array.isArray(hfData) && Array.isArray(hfData[0]) ? hfData[0]
                  : null;
        if (vec && vec.length === 768) {
          console.log('[embed] HuggingFace OK, dims:', vec.length);
          return vec;
        }
        console.log('[embed] HuggingFace resposta inesperada, dims:', Array.isArray(hfData) ? hfData.length : 'N/A');
      } else {
        const errText = await hfResp.text();
        console.log('[embed] HuggingFace HTTP', hfResp.status, errText.slice(0, 100));
      }
    } catch (e: any) {
      console.log('[embed] HuggingFace erro:', e?.message);
    }
  }

  console.log('[embed] Ambos os providers falharam — usando busca textual como fallback');
  return null;
}

function toolsFactory(supabase: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const { supabaseUrl, serviceRoleKey } = supabase;

  const supabaseFetch = async (path: string, method: string, body?: any) => {
    const res = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // ignore parse errors
    }

    if (!res.ok) {
      return {
        ok: false as const,
        status: res.status,
        raw: text,
        data,
      };
    }

    return { ok: true as const, status: res.status, data };
  };

  // ── Helper para chamar workspace-ops ──────────────────────────────────────
  const wopsSecret = Deno.env.get('CIDA_WOPS_SECRET') || serviceRoleKey;
  const callWorkspaceOps = async (operation: string, params: Record<string, any>) => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/workspace-ops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${wopsSecret}`,
          'x-hmadv-secret': wopsSecret,
        },
        body: JSON.stringify({ operation, params }),
      });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return { ok: res.ok, data };
    } catch (e: any) {
      return { ok: false, data: { error: e?.message } };
    }
  };

  return {
    async buscar_conhecimento(query: string): Promise<StructuredToolResult> {
      try {
        console.log('[tool] buscar_conhecimento input:', query);
        // Gerar embedding da query (Cloudflare primário, HuggingFace fallback)
        const queryEmbedding = await generateQueryEmbedding(query, supabaseUrl, serviceRoleKey);
        const rpcBody: any = { query };
        if (queryEmbedding) {
          rpcBody.query_embedding = queryEmbedding;
          console.log('[tool] buscar_conhecimento usando busca vetorial (768 dims)');
        } else {
          console.log('[tool] buscar_conhecimento usando busca textual (fallback)');
        }
        const rpcResult = await supabaseFetch('/rest/v1/rpc/buscar_conhecimento', 'POST', rpcBody);

        if (!rpcResult.ok) {
          return jsonResponse({
            ok: false,
            tool: 'buscar_conhecimento',
            error: 'Falha ao buscar conhecimento (RPC).',
            details: rpcResult,
          });
        }

        const data = rpcResult.data;
        const summary =
          typeof data === 'string'
            ? data
            : Array.isArray(data)
              ? String(data?.[0]?.content ?? data?.[0]?.texto ?? JSON.stringify(data?.[0] ?? data))
              : String(data?.content ?? data?.texto ?? JSON.stringify(data));

        return jsonResponse({
          ok: true,
          tool: 'buscar_conhecimento',
          data,
          summary: `Conhecimento recuperado para: "${query}"`,
        });
      } catch (e: any) {
        return jsonResponse({
          ok: false,
          tool: 'buscar_conhecimento',
          error: 'Erro inesperado em buscar_conhecimento.',
          details: String(e?.message ?? e),
        });
      }
    },

    async consultar_contato(email: string): Promise<StructuredToolResult> {
      try {
        console.log('[tool] consultar_contato input:', email);
        // Buscar na tabela contacts_freshsales (sincronizada do Freshsales)
        const emailEnc = encodeURIComponent(email.toLowerCase().trim());
        const res = await supabaseFetch(
          `/rest/v1/contacts_freshsales?email=ilike.${emailEnc}&select=fs_id,first_name,last_name,display_name,email,mobile,phone,cf_tipo,cf_cpf,tag_list,lifecycle_stage_id&limit=1`,
          'GET'
        );
        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
          const c = res.data[0];
          const nome = c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'N/A';
          const tel = c.mobile || c.phone || 'N/A';
          return jsonResponse({
            ok: true, tool: 'consultar_contato',
            data: c,
            summary: `📋 Contato encontrado: ${nome} | Email: ${c.email || email} | Tel: ${tel} | Tipo: ${c.cf_tipo || 'N/A'} | ID: ${c.fs_id}`,
          });
        }
        // Fallback: buscar por display_name (ilike)
        const nomeQuery = email.includes('@') ? email.split('@')[0] : email;
        const nomeEnc = encodeURIComponent(nomeQuery);
        const res2 = await supabaseFetch(
          `/rest/v1/contacts_freshsales?display_name=ilike.*${nomeEnc}*&select=fs_id,first_name,last_name,display_name,email,mobile,phone,cf_tipo&limit=1`,
          'GET'
        );
        if (res2.ok && Array.isArray(res2.data) && res2.data.length > 0) {
          const c = res2.data[0];
          const nome = c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
          const tel = c.mobile || c.phone || 'N/A';
          return jsonResponse({
            ok: true, tool: 'consultar_contato',
            data: c,
            summary: `📋 Contato encontrado (por nome): ${nome} | Email: ${c.email || 'N/A'} | Tel: ${tel} | Tipo: ${c.cf_tipo || 'N/A'} | ID: ${c.fs_id}`,
          });
        }
        console.log('[tool] consultar_contato: não encontrado na tabela contacts_freshsales para:', email);
        return jsonResponse({ ok: false, tool: 'consultar_contato', error: `Contato com email ${email} não encontrado no CRM.` });
      } catch (e: any) {
        return jsonResponse({ ok: false, tool: 'consultar_contato', error: 'Erro inesperado em consultar_contato.', details: String(e?.message ?? e) });
      }
    },

    async criar_contato(data: {
      nome?: string;
      telefone?: string;
      email?: string;
      canal?: string;
      observacao?: string;
      origem?: string;
    }): Promise<StructuredToolResult> {
      try {
        console.log('[tool] criar_contato input:', data);
        if (data.email) {
          // Verificar se já existe
          const busca = await callWorkspaceOps('contact_lookup', { email: data.email });
          if (busca.ok && busca.data?.data?.id) {
            const id = busca.data.data.id;
            const partes = (data.nome || '').split(' ');
            await callWorkspaceOps('contact_update', {
              id,
              first_name: partes[0] || undefined,
              last_name: partes.slice(1).join(' ') || undefined,
              mobile_number: data.telefone,
            });
            return jsonResponse({ ok: true, tool: 'criar_contato', data: { id, updated: true }, summary: `Contato atualizado no CRM. ID: ${id}` });
          }
          // Criar novo via ticket (workspace-ops não tem create direto, usa ticket_create como lead)
          const ticket = await callWorkspaceOps('ticket_create', {
            subject: `Novo lead: ${data.nome || data.email}`,
            description: `Canal: ${data.canal || 'Slack'}\nOrigem: ${data.origem || 'Cida'}\nObservação: ${data.observacao || ''}`,
            email: data.email,
            priority: 2,
          });
          return jsonResponse({ ok: ticket.ok, tool: 'criar_contato', data: ticket.data, summary: ticket.ok ? `Lead registrado no Freshdesk. ID: ${ticket.data?.data?.id || 'N/A'}` : 'Erro ao registrar lead.' });
        }
        // Sem email: registrar como observação no canal
        console.log('[tool] criar_contato sem email — registrando como observação');
        return jsonResponse({ ok: true, tool: 'criar_contato', data: { canal: data.canal, observacao: data.observacao }, summary: 'Lead anotado (sem email para criar no CRM).' });
      } catch (e: any) {
        return jsonResponse({ ok: false, tool: 'criar_contato', error: 'Erro inesperado em criar_contato.', details: String(e?.message ?? e) });
      }
    },

    async consultar_processo(cnj: string): Promise<StructuredToolResult> {
      try {
        console.log('[tool] consultar_processo input:', cnj);
        // Busca real na tabela judiciario.processos via Supabase REST
        const res = await fetch(
          `${supabaseUrl}/rest/v1/processos?numero_cnj=eq.${encodeURIComponent(cnj)}&limit=1&select=numero_cnj,classe,assunto,tribunal,vara,situacao,data_distribuicao`,
          { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Accept-Profile': 'judiciario' } }
        );
        const rows = res.ok ? await res.json() : [];
        if (Array.isArray(rows) && rows.length > 0) {
          const p = rows[0];
          return jsonResponse({
            ok: true, tool: 'consultar_processo',
            data: p,
            summary: `📋 Processo ${p.numero_cnj}: ${p.classe} | ${p.tribunal} | ${p.situacao} | Distribuído: ${p.data_distribuicao}`,
          });
        }
        return jsonResponse({ ok: false, tool: 'consultar_processo', error: `Processo ${cnj} não localizado na base.` });
      } catch (e: any) {
        return jsonResponse({ ok: false, tool: 'consultar_processo', error: 'Erro inesperado em consultar_processo.', details: String(e?.message ?? e) });
      }
    },

    async criar_agendamento(data: {
      nome?: string;
      telefone?: string;
      email?: string;
      proposta?: string;
      data?: string;
      horario?: string;
      canal?: string;
      observacao?: string;
    }): Promise<StructuredToolResult> {
      try {
        console.log('[tool] criar_agendamento input:', data);
        if (data.email && data.data) {
          // Criar agendamento real no Freshsales
          const inicio = data.data + (data.horario ? `T${data.horario}:00` : 'T09:00:00');
          const fim = data.data + (data.horario ? `T${(parseInt(data.horario.split(':')[0]) + 1).toString().padStart(2,'0')}:${data.horario.split(':')[1] || '00'}:00` : 'T10:00:00');
          const r = await callWorkspaceOps('appointments_list', { filter: 'upcoming', per_page: 1 });
          // Usar ticket_create como fallback para registrar o agendamento
          const ticket = await callWorkspaceOps('ticket_create', {
            subject: `Agendamento: ${data.proposta || 'Consulta Jurídica'} — ${data.nome || data.email}`,
            description: `Data: ${data.data}\nHorário: ${data.horario || 'A confirmar'}\nCliente: ${data.nome || 'N/A'}\nEmail: ${data.email}\nObservação: ${data.observacao || ''}`,
            email: data.email,
            priority: 2,
          });
          return jsonResponse({ ok: ticket.ok, tool: 'criar_agendamento', data: { ...data, ticket_id: ticket.data?.data?.id }, summary: ticket.ok ? `✅ Agendamento registrado! Ticket #${ticket.data?.data?.id || 'N/A'}. Uma confirmação será enviada para ${data.email}.` : 'Erro ao registrar agendamento.' });
        }
        // Sem dados suficientes: retornar o que falta
        const faltando = [];
        if (!data.email) faltando.push('email do cliente');
        if (!data.data) faltando.push('data desejada');
        return jsonResponse({ ok: false, tool: 'criar_agendamento', error: `Para criar o agendamento, preciso de: ${faltando.join(', ')}.` });
      } catch (e: any) {
        return jsonResponse({ ok: false, tool: 'criar_agendamento', error: 'Erro inesperado em criar_agendamento.', details: String(e?.message ?? e) });
      }
    },
  };
}

function memoryFactory(supabase: {
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const { supabaseUrl, serviceRoleKey } = supabase;

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  type MessageRow = {
    channel: string;
    role: string;
    content: string;
    created_at?: string;
    id?: string;
  };

  const getMemory = async (channel: string): Promise<MessageRow[]> => {
    try {
      console.log('[memory] getMemory channel:', channel);

      const url =
        `${supabaseUrl}/rest/v1/messages` +
        `?channel=eq.${encodeURIComponent(channel)}` +
        `&select=role,content,created_at,channel` +
        `&order=created_at.desc.nullslast,id.desc.nullslast` +
        `&limit=20`;

      const res = await fetch(url, { headers, method: 'GET' });
      const text = await res.text();

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        throw new Error(`getMemory HTTP ${res.status}: ${text}`);
      }

      const rows = (Array.isArray(data) ? data : []) as MessageRow[];
      return rows.reverse();
    } catch (e: any) {
      console.log('[memory] getMemory error:', e?.message ?? e);
      return [];
    }
  };

  const saveMemory = async (channel: string, role: string, content: string) => {
    try {
      console.log('[memory] saveMemory:', {
        channel,
        role,
        contentPreview: content.slice(0, 80),
      });

      const res = await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ channel, role, content }]),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`saveMemory HTTP ${res.status}: ${text}`);
      }

      return { ok: true as const };
    } catch (e: any) {
      console.log('[memory] saveMemory error:', e?.message ?? e);
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  };

  return { getMemory, saveMemory };
}

function ragFactory(tools: { buscar_conhecimento: (query: string) => Promise<any> }) {
  const getKnowledge = async (query: string): Promise<string> => {
    console.log('[rag] getKnowledge query:', query);

    const result = await tools.buscar_conhecimento(query);
    if (!result?.ok) {
      console.log('[rag] getKnowledge failed:', result?.error);
      return '';
    }

    const data = result.data;

    if (typeof data === 'string') return data;

    if (Array.isArray(data)) {
      const parts: string[] = [];
      for (const item of data) {
        const candidate = item?.content ?? item?.texto ?? item?.chunk ?? item?.result ?? null;
        if (candidate) parts.push(String(candidate));
      }
      return parts.join('\n\n');
    }

    return result.summary || data?.content || data?.texto || (data ? JSON.stringify(data) : '');
  };

  return { getKnowledge };
}

type Intent =
  | { type: 'processo' }
  | { type: 'agendamento' }
  | { type: 'lead' }
  | { type: 'buscar_contato' }
  | { type: 'geral' };

function extractCNJ(text: string): string | null {
  const cleaned = text.trim();

  const m1 = cleaned.match(/\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/);
  if (m1?.[1]) return m1[1];

  const digits = cleaned.replace(/[^\d]/g, '');
  if (digits.length === 20) {
    const a = digits.slice(0, 7);
    const b = digits.slice(7, 9);
    const c = digits.slice(9, 13);
    const d = digits.slice(13, 14);
    const e = digits.slice(14, 16);
    const f = digits.slice(16, 20);
    return `${a}-${b}.${c}.${d}.${e}.${f}`;
  }

  return null;
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  const cnjPresent = extractCNJ(text) !== null;

  if (cnjPresent) return { type: 'processo' };
  if (/(processo|andamento|petição|decisão|sentença|audi[eê]ncia|movimenta)/i.test(t)) return { type: 'processo' };
  if (/(agendar|agendamento|hor[aá]rio|consulta|reuni[aã]o|marcar)/i.test(t)) return { type: 'agendamento' };
  // Buscar/abrir/ver detalhes de contato — deve chamar workspace-ops, não criar
  if (/(abr[ae]|ver|mostrar|detalhes|buscar|procurar|encontrar|pesquisar).*(contato|cliente|lead|pessoa)/i.test(t)) return { type: 'buscar_contato' };
  if (/(contato|cliente|lead|pessoa).*(abr[ae]|ver|mostrar|detalhes|buscar|procurar|encontrar|pesquisar)/i.test(t)) return { type: 'buscar_contato' };
  if (/(telefone|whats|e-?mail|ligar|mandar mensagem)/i.test(t)) return { type: 'lead' };
  return { type: 'geral' };
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM HUB — Roteamento inteligente entre provedores de IA
// Ordem: Cloudflare Workers AI (primário) → Ollama Cloud (fallback)
// Circuit breaker por provedor: pausa automaticamente provedores com falhas
// consecutivas para evitar latência desnecessária.
// ═══════════════════════════════════════════════════════════════════════════

interface LLMProvider {
  name: string;
  call: (messages: ChatMessage[]) => Promise<string>;
}

interface CircuitState {
  failures: number;
  openUntil: number; // timestamp ms — 0 = fechado (disponível)
}

// Estado do circuit breaker (em memória — reseta a cada cold start da Edge Function)
const _circuitState: Record<string, CircuitState> = {};
const CIRCUIT_THRESHOLD  = 3;      // falhas consecutivas para abrir o circuito
const CIRCUIT_TIMEOUT_MS = 60_000; // 60s de pausa após abertura

function isCircuitOpen(name: string): boolean {
  const s = _circuitState[name];
  if (!s) return false;
  if (s.openUntil > 0 && Date.now() < s.openUntil) {
    console.log(`[llm-hub] circuit OPEN para ${name} — pausa até ${new Date(s.openUntil).toISOString()}`);
    return true;
  }
  if (s.openUntil > 0 && Date.now() >= s.openUntil) {
    // Half-open: deixar uma tentativa passar
    s.openUntil = 0;
    console.log(`[llm-hub] circuit HALF-OPEN para ${name} — tentando recuperar`);
  }
  return false;
}

let _lastProviderUsed = 'unknown';
function recordSuccess(name: string) {
  _circuitState[name] = { failures: 0, openUntil: 0 };
  _lastProviderUsed = name;
}

function recordFailure(name: string) {
  const s = _circuitState[name] ?? { failures: 0, openUntil: 0 };
  s.failures += 1;
  if (s.failures >= CIRCUIT_THRESHOLD) {
    s.openUntil = Date.now() + CIRCUIT_TIMEOUT_MS;
    console.warn(`[llm-hub] circuit ABERTO para ${name} após ${s.failures} falhas`);
  }
  _circuitState[name] = s;
}

// Cache de configuração do app_config (evita query a cada chamada)
let _llmConfigCache: Record<string, string> | null = null;

async function getLLMConfig(supabaseUrl: string, serviceRoleKey: string): Promise<Record<string, string>> {
  if (_llmConfigCache) return _llmConfigCache;
  try {
    const keys = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'OLLAMA_API_KEY', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL'];
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=in.(${keys.join(',')})&select=key,value`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    if (res.ok) {
      const rows: { key: string; value: string }[] = await res.json();
      const m: Record<string, string> = {};
      for (const r of rows) m[r.key] = r.value;
      _llmConfigCache = m;
      return m;
    }
  } catch (e: any) {
    console.error('[llm-hub] getLLMConfig error:', e?.message);
  }
  return {};
}

function llmFactory(supabaseUrl?: string, serviceRoleKey?: string) {
  // ── Provedor 1: Cloudflare Workers AI ────────────────────────────────────
  const makeCloudflareProvider = (cfAccountId: string, cfApiToken: string): LLMProvider => ({
    name: 'cloudflare',
    call: async (messages: ChatMessage[]) => {
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccountId)}/ai/run/@cf/meta/llama-3.1-8b-instruct`;
      console.log('[llm-hub][cloudflare] chamando Cloudflare Workers AI, msgs:', messages.length);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000); // 12s timeout

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfApiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            repetition_penalty: 1.3,
            max_tokens: 512,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = JSON.parse(text);
        const output = data?.result?.response ?? data?.result?.output ?? data?.response ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);
        console.log('[llm-hub][cloudflare] ✓ resposta recebida, chars:', output.length);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  });

  // ── Provedor 2: Ollama Cloud ──────────────────────────────────────────────
  const makeOllamaProvider = (apiKey: string, baseUrl: string, model: string): LLMProvider => ({
    name: 'ollama',
    call: async (messages: ChatMessage[]) => {
      const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
      console.log(`[llm-hub][ollama] chamando Ollama Cloud, modelo: ${model}, msgs: ${messages.length}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000); // 20s timeout

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
            options: { temperature: 0.7, num_predict: 512 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = JSON.parse(text);
        const output = data?.message?.content ?? data?.response ?? '';
        if (!output) throw new Error(`resposta vazia: ${text.slice(0, 100)}`);
        console.log('[llm-hub][ollama] ✓ resposta recebida, chars:', output.length);
        return String(output);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    },
  });

  // ── Orquestrador principal ────────────────────────────────────────────────
  const runLLM = async (messages: ChatMessage[]): Promise<string> => {
    // Carregar configuração do app_config (com fallback para env vars)
    const cfg = supabaseUrl && serviceRoleKey
      ? await getLLMConfig(supabaseUrl, serviceRoleKey)
      : {};

    const cfAccountId = cfg['CLOUDFLARE_ACCOUNT_ID'] || Deno.env.get('CF_ACCOUNT_ID') || '';
    const cfApiToken  = cfg['CLOUDFLARE_API_TOKEN']  || Deno.env.get('CF_API_TOKEN')  || '';
    const ollamaKey   = cfg['OLLAMA_API_KEY']        || Deno.env.get('OLLAMA_API_KEY') || '';
    const ollamaBase  = cfg['OLLAMA_BASE_URL']       || Deno.env.get('OLLAMA_BASE_URL') || 'https://ollama.com';
    const ollamaModel = cfg['OLLAMA_MODEL']          || Deno.env.get('OLLAMA_MODEL')    || 'gemma3:4b';

    // Construir lista de provedores disponíveis (em ordem de prioridade)
    const providers: LLMProvider[] = [];
    if (cfAccountId && cfApiToken) providers.push(makeCloudflareProvider(cfAccountId, cfApiToken));
    if (ollamaKey)                  providers.push(makeOllamaProvider(ollamaKey, ollamaBase, ollamaModel));

    if (providers.length === 0) {
      throw new Error('[llm-hub] Nenhum provedor configurado (CF_ACCOUNT_ID/CF_API_TOKEN ou OLLAMA_API_KEY ausentes)');
    }

    const errors: string[] = [];

    for (const provider of providers) {
      if (isCircuitOpen(provider.name)) {
        errors.push(`${provider.name}: circuit aberto`);
        continue;
      }

      try {
        const result = await provider.call(messages);
        recordSuccess(provider.name);
        if (provider.name !== 'cloudflare') {
          console.log(`[llm-hub] ⚠️ usando fallback: ${provider.name}`);
        }
        return result;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        console.warn(`[llm-hub] ❌ ${provider.name} falhou: ${msg}`);
        recordFailure(provider.name);
        errors.push(`${provider.name}: ${msg}`);
      }
    }

    throw new Error(`[llm-hub] Todos os provedores falharam: ${errors.join(' | ')}`);
  };

  return { runLLM, get _lastProvider() { return _lastProviderUsed; } };
}

function orchestratorFactory(deps: {
  tools: ReturnType<typeof toolsFactory>;
  memory: ReturnType<typeof memoryFactory>;
  rag: ReturnType<typeof ragFactory>;
  llm: ReturnType<typeof llmFactory>;
  systemPrompt: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}) {
  const agent = async (inputText: string, channel: string, userId?: string) => {
    console.log('[agent] start:', { channel });

    // ── Detecção de comandos de modo aprendizado e diagnóstico ──
    const lowerInput = inputText.toLowerCase().trim();

    if (lowerInput === 'test_tools') {
      console.log('[diagnostico] Iniciando teste de tools (test_tools)');

      // Helper para chamar workspace-ops
      // Usa CIDA_WOPS_SECRET dedicado para comunicação interna entre edge functions
      const wopsSecret = Deno.env.get('CIDA_WOPS_SECRET') || deps.serviceRoleKey;
      const callWops = async (operation: string, params: Record<string, any> = {}) => {
        const t0 = Date.now();
        try {
          const res = await fetch(`${deps.supabaseUrl}/functions/v1/workspace-ops`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${wopsSecret}`,
              'x-hmadv-secret': wopsSecret,
            },
            body: JSON.stringify({ operation, params }),
          });
          const ms = Date.now() - t0;
          const text = await res.text();
          let data: any = null;
          try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
          return { ok: res.ok, status: res.status, ms, data };
        } catch(e: any) {
          return { ok: false, status: 0, ms: Date.now() - t0, data: { error: e.message } };
        }
      };

      // Helper para query Supabase REST diretamente
      const callSupa = async (path: string, extraHeaders: Record<string,string> = {}) => {
        const t0 = Date.now();
        try {
          const res = await fetch(`${deps.supabaseUrl}/rest/v1/${path}`, {
            headers: {
              'apikey': deps.serviceRoleKey,
              'Authorization': `Bearer ${deps.serviceRoleKey}`,
              ...extraHeaders,
            },
          });
          const ms = Date.now() - t0;
          const text = await res.text();
          let data: any = null;
          try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
          return { ok: res.ok, status: res.status, ms, data };
        } catch(e: any) {
          return { ok: false, status: 0, ms: Date.now() - t0, data: { error: e.message } };
        }
      };

      // Formatar campos de um objeto como lista de campos
      const fmtFields = (obj: any, fields: string[]): string => {
        if (!obj || typeof obj !== 'object') return '_sem dados_';
        return fields.map(f => `  • *${f}:* ${obj[f] ?? '_vazio_'}`).join('\n');
      };

      // Pegar amostra aleatória de um array
      const randomSample = (arr: any[]) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

      const relatorio: string[] = [];
      relatorio.push('🔍 *Diagnóstico Completo de Integrações — Cida (test_tools)*');
      relatorio.push(`_Executado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}_\n`);
      relatorio.push('---');

      // ═══════════════════════════════════════════════
      // MÓDULO 1: Base de Conhecimento (RAG / pgvector)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*📚 Módulo 1 — Base de Conhecimento (RAG / Supabase pgvector)*');
      try {
        const resRag = await deps.tools.buscar_conhecimento('contrato de honorários advocatícios');
        if (resRag.ok) {
          const items = Array.isArray(resRag.data) ? resRag.data : [];
          relatorio.push(`✅ OK (${items.length} resultado(s) retornado(s))`);
          if (items.length > 0) {
            const sample = items[0];
            relatorio.push(`> *Campos lidos:* ${Object.keys(sample).join(', ')}`);
            relatorio.push(`> *Amostra:* ${(sample.content || sample.texto || sample.chunk || JSON.stringify(sample)).slice(0, 180)}...`);
          } else {
            relatorio.push('> _Nenhum chunk retornado — base pode estar vazia ou embedding falhou_');
          }
        } else {
          relatorio.push(`❌ FALHA`);
          relatorio.push(`> _Erro:_ ${resRag.error}`);
          if (resRag.details) relatorio.push(`> _Detalhes:_ ${JSON.stringify(resRag.details).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 2: Contatos (Supabase contacts_freshsales)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*👤 Módulo 2 — Contatos (Supabase → contacts_freshsales, schema: judiciario)*');
      try {
        // contacts_freshsales está no schema 'judiciario', não no 'public'
        // Requer header Accept-Profile: judiciario
        const resC = await callSupa(
          'contacts_freshsales?select=fs_id,first_name,last_name,display_name,email,mobile,phone,cf_tipo,cf_cpf,tag_list,lifecycle_stage_id,owner_id,synced_at&limit=3&order=synced_at.desc.nullslast',
          { 'Accept-Profile': 'judiciario' }
        );
        if (resC.ok && Array.isArray(resC.data) && resC.data.length > 0) {
          const total = resC.data.length;
          const sample = randomSample(resC.data);
          relatorio.push(`✅ OK — ${total} contato(s) retornado(s) (${resC.ms}ms)`);
          relatorio.push(`> *Schema:* judiciario | *Campos:* fs_id, first_name, last_name, display_name, email, mobile, phone, cf_tipo, cf_cpf, tag_list, lifecycle_stage_id, owner_id, synced_at`);
          relatorio.push(`> *Amostra aleatória:*`);
          relatorio.push(fmtFields(sample, ['display_name', 'email', 'mobile', 'cf_tipo', 'cf_cpf', 'tag_list', 'lifecycle_stage_id', 'synced_at']));
        } else if (resC.ok) {
          relatorio.push(`⚠️ OK mas tabela vazia — sincronização (fs-contacts-sync) pode não ter rodado (${resC.ms}ms)`);
          relatorio.push(`> _Nota:_ tabela está no schema judiciario (Accept-Profile: judiciario)`);
        } else {
          relatorio.push(`❌ FALHA HTTP ${resC.status} (${resC.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ Tabela contacts_freshsales está no schema judiciario. Verificar se Accept-Profile: judiciario está sendo enviado`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resC.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 3: Processos (Supabase judiciario.processos)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*⚖️ Módulo 3 — Processos Judiciais (Supabase → public.processos)*');
      try {
        // processos está no schema public (não judiciario)
        // Campos reais: numero_cnj, numero_processo, titulo, classe, assunto, tribunal, comarca,
        // orgao_julgador, status, polo_ativo, polo_passivo, data_distribuicao, data_ultima_movimentacao
        const resP = await callSupa(
          'processos?select=numero_cnj,numero_processo,titulo,classe,assunto,tribunal,comarca,orgao_julgador,status,polo_ativo,polo_passivo,data_distribuicao,data_ultima_movimentacao,area&limit=3&order=data_distribuicao.desc.nullslast'
        );
        if (resP.ok && Array.isArray(resP.data) && resP.data.length > 0) {
          const sample = randomSample(resP.data);
          relatorio.push(`✅ OK — ${resP.data.length} processo(s) retornado(s) (${resP.ms}ms)`);
          relatorio.push(`> *Schema:* public | *Campos:* numero_cnj, numero_processo, titulo, classe, assunto, tribunal, comarca, orgao_julgador, status, polo_ativo, polo_passivo, data_distribuicao, data_ultima_movimentacao, area`);
          relatorio.push(`> *Amostra aleatória:*`);
          relatorio.push(fmtFields(sample, ['numero_cnj', 'titulo', 'tribunal', 'comarca', 'orgao_julgador', 'status', 'polo_ativo', 'data_distribuicao']));
        } else if (resP.ok) {
          relatorio.push(`⚠️ OK mas tabela vazia — nenhum processo cadastrado (${resP.ms}ms)`);
        } else {
          relatorio.push(`❌ FALHA HTTP ${resP.status} (${resP.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ Tabela processos sem permissão ou campos incorretos`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resP.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 4: Publicações (Supabase)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*📰 Módulo 4 — Publicações (Supabase → publicacoes)*');
      try {
        const resPub = await callSupa('publicacoes?select=*&limit=3&order=data_publicacao.desc.nullslast');
        if (resPub.ok && Array.isArray(resPub.data) && resPub.data.length > 0) {
          const sample = randomSample(resPub.data);
          const campos = Object.keys(sample);
          relatorio.push(`✅ OK — ${resPub.data.length} publicação(s) retornada(s) (${resPub.ms}ms)`);
          relatorio.push(`> *Campos disponíveis:* ${campos.join(', ')}`);
          relatorio.push(`> *Amostra aleatória:*`);
          const keyFields = campos.filter(f => ['id','numero_processo','tribunal','data_publicacao','tipo','conteudo','status'].includes(f));
          relatorio.push(fmtFields(sample, keyFields.length ? keyFields : campos.slice(0, 6)));
        } else if (resPub.ok) {
          relatorio.push(`⚠️ OK mas tabela vazia (${resPub.ms}ms)`);
          relatorio.push(`> _Tabela publicacoes existe mas não tem registros_`);
        } else {
          relatorio.push(`❌ FALHA HTTP ${resPub.status} (${resPub.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ Tabela publicacoes não encontrada no schema public`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resPub.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 5: Tarefas / Tasks (Freshsales via workspace-ops)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*✅ Módulo 5 — Tarefas / Tasks (Freshsales → workspace-ops/execute: tasks_list)*');
      try {
        const resT = await callWops('tasks_list', { limit: 5 });
        // workspace-ops retorna { ok: true, text: '...', data: [...] }
        const tasksData = resT.data?.data;
        const tasks = Array.isArray(tasksData) ? tasksData : [];
        if (resT.ok && tasks.length > 0) {
          const sample = randomSample(tasks);
          relatorio.push(`✅ OK — ${tasks.length} tarefa(s) retornada(s) (${resT.ms}ms)`);
          if (sample) {
            relatorio.push(`> *Campos disponíveis:* ${Object.keys(sample).join(', ')}`);
            relatorio.push(`> *Amostra aleatória:*`);
            relatorio.push(fmtFields(sample, ['id', 'title', 'description', 'due_date', 'status', 'owner_id', 'targetable_type', 'targetable_id']));
          }
        } else if (resT.ok) {
          const textPreview = resT.data?.result?.text || resT.data?.text || JSON.stringify(resT.data).slice(0, 150);
          // Verificar se é rate limit (texto contém indicação de limite)
          const isRateLimit = textPreview.toLowerCase().includes('rate') || textPreview.toLowerCase().includes('limit') || textPreview.toLowerCase().includes('429');
          if (isRateLimit) {
            relatorio.push(`⚠️ RATE LIMIT Freshsales (${resT.ms}ms) — aguarde alguns minutos e repita o test_tools`);
            relatorio.push(`> _Mensagem:_ ${textPreview.slice(0, 150)}`);
          } else {
            relatorio.push(`⚠️ OK mas nenhuma tarefa retornada (${resT.ms}ms)`);
            relatorio.push(`> _Texto retornado:_ ${textPreview}`);
          }
        } else {
          relatorio.push(`❌ FALHA HTTP ${resT.status} (${resT.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ FRESHSALES_API_KEY inválida, secret do workspace-ops incorreto, ou endpoint /tasks indisponível`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resT.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 6: Faturas / Deals (Freshsales via workspace-ops)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*💰 Módulo 6 — Faturas / Deals (Freshsales → workspace-ops/execute: daily_summary)*');
      try {
        const resD = await callWops('daily_summary');
        // daily_summary retorna { ok, text, data: { deals, accounts, appointments, tasks, tickets } }
        const dealsData = resD.data?.data?.deals;
        const deals = Array.isArray(dealsData) ? dealsData : [];
        if (resD.ok && deals.length > 0) {
          const sample = randomSample(deals);
          relatorio.push(`✅ OK — ${deals.length} deal(s) retornado(s) (${resD.ms}ms)`);
          if (sample) {
            relatorio.push(`> *Campos disponíveis:* ${Object.keys(sample).join(', ')}`);
            relatorio.push(`> *Amostra aleatória:*`);
            relatorio.push(fmtFields(sample, ['id', 'name', 'amount', 'stage_name', 'expected_close_date', 'owner_id', 'deal_stage_id']));
          }
        } else if (resD.ok) {
          const textPreview = resD.data?.result?.text || resD.data?.text || JSON.stringify(resD.data).slice(0, 150);
          const isRateLimit = textPreview.toLowerCase().includes('rate') || textPreview.toLowerCase().includes('limit') || textPreview.toLowerCase().includes('429');
          if (isRateLimit) {
            relatorio.push(`⚠️ RATE LIMIT Freshsales (${resD.ms}ms) — aguarde alguns minutos e repita o test_tools`);
            relatorio.push(`> _Mensagem:_ ${textPreview.slice(0, 150)}`);
          } else {
            relatorio.push(`⚠️ OK mas nenhum deal retornado (${resD.ms}ms)`);
            relatorio.push(`> _Texto retornado:_ ${textPreview}`);
          }
        } else {
          relatorio.push(`❌ FALHA HTTP ${resD.status} (${resD.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ FRESHSALES_API_KEY inválida, secret do workspace-ops incorreto, ou endpoint /deals indisponível`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resD.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 7: Audiências / Appointments (Freshsales via workspace-ops)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*📅 Módulo 7 — Audiências / Appointments (Freshsales → workspace-ops/execute: appointments_list)*');
      try {
        const resA = await callWops('appointments_list', { limit: 5 });
        // appointments_list retorna { ok, text, data: [...] }
        const apptsData = resA.data?.data;
        const appts = Array.isArray(apptsData) ? apptsData : [];
        if (resA.ok && appts.length > 0) {
          const sample = randomSample(appts);
          relatorio.push(`✅ OK — ${appts.length} agendamento(s) retornado(s) (${resA.ms}ms)`);
          if (sample) {
            relatorio.push(`> *Campos disponíveis:* ${Object.keys(sample).join(', ')}`);
            relatorio.push(`> *Amostra aleatória:*`);
            relatorio.push(fmtFields(sample, ['id', 'title', 'from_date', 'end_date', 'location', 'description', 'outcome', 'targetable_type', 'targetable_id']));
          }
        } else if (resA.ok) {
          const textPreview = resA.data?.result?.text || resA.data?.text || JSON.stringify(resA.data).slice(0, 150);
          const isRateLimit = textPreview.toLowerCase().includes('rate') || textPreview.toLowerCase().includes('limit') || textPreview.toLowerCase().includes('429');
          if (isRateLimit) {
            relatorio.push(`⚠️ RATE LIMIT Freshsales (${resA.ms}ms) — aguarde alguns minutos e repita o test_tools`);
            relatorio.push(`> _Mensagem:_ ${textPreview.slice(0, 150)}`);
          } else {
            relatorio.push(`⚠️ OK mas nenhum agendamento retornado (${resA.ms}ms)`);
            relatorio.push(`> _Texto retornado:_ ${textPreview}`);
          }
        } else {
          relatorio.push(`❌ FALHA HTTP ${resA.status} (${resA.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ FRESHSALES_API_KEY inválida, secret do workspace-ops incorreto, ou endpoint /appointments indisponível`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resA.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 8: Fila Freshdesk (tickets abertos)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*🎫 Módulo 8 — Fila Freshdesk (workspace-ops/execute: freshdesk_queue)*');
      try {
        const resFq = await callWops('freshdesk_queue', { limit: 5 });
        // freshdesk_queue retorna { ok, text, data: [...] }
        const ticketsData = resFq.data?.data;
        const tickets = Array.isArray(ticketsData) ? ticketsData : [];
        if (resFq.ok && tickets.length > 0) {
          const sample = randomSample(tickets);
          relatorio.push(`✅ OK — ${tickets.length} ticket(s) na fila (${resFq.ms}ms)`);
          if (sample) {
            relatorio.push(`> *Campos disponíveis:* ${Object.keys(sample).join(', ')}`);
            relatorio.push(`> *Amostra aleatória:*`);
            relatorio.push(fmtFields(sample, ['id', 'subject', 'status', 'priority', 'requester_id', 'email', 'created_at', 'updated_at']));
          }
        } else if (resFq.ok) {
          const textPreview = resFq.data?.result?.text || resFq.data?.text || JSON.stringify(resFq.data).slice(0, 150);
          const isRateLimit = textPreview.toLowerCase().includes('rate') || textPreview.toLowerCase().includes('limit') || textPreview.toLowerCase().includes('429');
          if (isRateLimit) {
            relatorio.push(`⚠️ RATE LIMIT Freshdesk (${resFq.ms}ms) — aguarde alguns minutos e repita o test_tools`);
            relatorio.push(`> _Mensagem:_ ${textPreview.slice(0, 150)}`);
          } else {
            relatorio.push(`⚠️ OK mas fila vazia (${resFq.ms}ms)`);
            relatorio.push(`> _Texto retornado:_ ${textPreview}`);
          }
        } else {
          relatorio.push(`❌ FALHA HTTP ${resFq.status} (${resFq.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ FRESHDESK_API_KEY inválida, domínio Freshdesk incorreto, ou secret do workspace-ops incorreto`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resFq.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // MÓDULO 9: Histórico de Conversa (Supabase messages)
      // ═══════════════════════════════════════════════
      relatorio.push('\n*💬 Módulo 9 — Histórico de Conversa (Supabase → messages)*');
      try {
        const resMem = await callSupa(`messages?select=id,channel,role,content,created_at&limit=3&order=created_at.desc.nullslast`);
        if (resMem.ok && Array.isArray(resMem.data) && resMem.data.length > 0) {
          const sample = randomSample(resMem.data);
          relatorio.push(`✅ OK — ${resMem.data.length} mensagem(ns) retornada(s) (${resMem.ms}ms)`);
          relatorio.push(`> *Campos disponíveis:* id, channel, role, content, created_at`);
          relatorio.push(`> *Amostra:* canal=${sample.channel} | role=${sample.role} | preview=${String(sample.content || '').slice(0, 80)}...`);
        } else if (resMem.ok) {
          relatorio.push(`⚠️ OK mas tabela vazia (${resMem.ms}ms)`);
        } else {
          relatorio.push(`❌ FALHA HTTP ${resMem.status} (${resMem.ms}ms)`);
          relatorio.push(`> _Onde quebrou:_ Tabela messages sem permissão ou não existe`);
          relatorio.push(`> _Detalhes:_ ${JSON.stringify(resMem.data).slice(0, 200)}`);
        }
      } catch(e: any) { relatorio.push(`❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // TESTES CRUD — WRITE / UPDATE / DELETE
      // ═══════════════════════════════════════════════
      relatorio.push('\n---');
      relatorio.push('*🛠️ TESTES CRUD — WRITE / UPDATE / DELETE*');
      relatorio.push('_Cada operação cria, atualiza e remove um registro de teste. Não afeta dados reais._\n');

      // ── CRUD A: Task (criar → atualizar → deletar)
      relatorio.push('*🗒️ CRUD A — Tasks (Freshsales)*');
      let taskTestId: string | null = null;
      try {
        // CREATE
        const tCreate = await callWops('task_create', {
          title: '[TEST_TOOLS] Tarefa de diagnóstico',
          description: 'Criada automaticamente pelo test_tools da Cida. Pode ser removida.',
          due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        });
        if (tCreate.ok && tCreate.data?.result?.data?.id) {
          taskTestId = String(tCreate.data.result.data.id);
          relatorio.push(`  ✅ CREATE: tarefa criada — ID ${taskTestId} (${tCreate.ms}ms)`);

          // UPDATE
          const tUpdate = await callWops('task_update', {
            id: taskTestId,
            patch: { title: '[TEST_TOOLS] Tarefa atualizada', status: 'open' },
          });
          relatorio.push(tUpdate.ok
            ? `  ✅ UPDATE: tarefa atualizada (${tUpdate.ms}ms)`
            : `  ❌ UPDATE: ${JSON.stringify(tUpdate.data).slice(0, 100)}`);

          // DELETE
          const tDelete = await callWops('task_delete', { id: taskTestId });
          relatorio.push(tDelete.ok
            ? `  ✅ DELETE: tarefa removida (${tDelete.ms}ms)`
            : `  ❌ DELETE: ${JSON.stringify(tDelete.data).slice(0, 100)}`);
        } else {
          const errText = JSON.stringify(tCreate.data).slice(0, 200);
          const isRateLimit = errText.toLowerCase().includes('rate') || errText.toLowerCase().includes('limit') || errText.toLowerCase().includes('429');
          if (isRateLimit) {
            relatorio.push(`  ⚠️ CREATE: Freshsales rate limit (${tCreate.ms}ms) — aguarde e repita`);
          } else {
            relatorio.push(`  ❌ CREATE falhou (${tCreate.ms}ms): ${errText}`);
          }
        }
      } catch(e: any) {
        const isRateLimit = e.message?.toLowerCase().includes('rate') || e.message?.toLowerCase().includes('429');
        if (isRateLimit) {
          relatorio.push(`  ⚠️ CREATE: Freshsales rate limit — aguarde e repita`);
        } else {
          relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`);
        }
      }

      // ── CRUD B: Ticket Freshdesk (criar)
      relatorio.push('\n*🎫 CRUD B — Tickets Freshdesk*');
      try {
        const fdCreate = await callWops('ticket_create', {
          email: 'teste.diagnostico@hermidamaia.adv.br',
          subject: '[TEST_TOOLS] Ticket de diagnóstico da Cida',
          description: 'Ticket criado automaticamente pelo test_tools. Pode ser removido.',
          priority: 1,
          status: 2,
        });
        if (fdCreate.ok) {
          const ticketId = fdCreate.data?.result?.data?.id || fdCreate.data?.result?.data?.ticket?.id || 'n/d';
          relatorio.push(`  ✅ CREATE: ticket criado — ID ${ticketId} (${fdCreate.ms}ms)`);
          relatorio.push(`  _Nota: DELETE de tickets via API Freshdesk requer permissão admin_`);
        } else {
          relatorio.push(`  ❌ CREATE falhou (${fdCreate.ms}ms): ${JSON.stringify(fdCreate.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD C: Contact READ (busca por email real)
      relatorio.push('\n*👤 CRUD C — Contact Lookup (Freshsales)*');
      try {
        const cLookup = await callWops('contact_lookup', { email: 'adrianohermida@hotmail.com' });
        if (cLookup.ok) {
          const cData = cLookup.data?.result?.data;
          const cText = cLookup.data?.result?.text || '';
          if (cData?.id) {
            relatorio.push(`  ✅ READ: contato encontrado — ID ${cData.id} (${cLookup.ms}ms)`);
            relatorio.push(`  • *Nome:* ${cData.display_name || cData.first_name || 'n/d'}`);
            relatorio.push(`  • *Email:* ${cData.email || (Array.isArray(cData.emails) ? cData.emails[0] : 'n/d')}`);
            relatorio.push(`  • *Telefone:* ${cData.mobile_number || cData.work_number || 'n/d'}`);
            relatorio.push(`  • *Campos disponíveis:* ${Object.keys(cData).join(', ')}`);
          } else {
            relatorio.push(`  ⚠️ READ: contato não encontrado no Freshsales (${cLookup.ms}ms)`);
            relatorio.push(`  > _Texto:_ ${cText.slice(0, 100)}`);
          }
        } else {
          relatorio.push(`  ❌ READ falhou (${cLookup.ms}ms): ${JSON.stringify(cLookup.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD D: Deal READ (listar + ver detalhe)
      relatorio.push('\n*💰 CRUD D — Deals (Freshsales)*');
      try {
        const dSum = await callWops('daily_summary');
        const deals = Array.isArray(dSum.data?.result?.data?.deals) ? dSum.data.result.data.deals : [];
        if (dSum.ok && deals.length > 0) {
          const sample = deals[0] as any;
          relatorio.push(`  ✅ READ (list): ${deals.length} deal(s) (${dSum.ms}ms)`);
          relatorio.push(`  • *Deal amostra:* ${sample.name || 'n/d'} | ID: ${sample.id || 'n/d'} | Valor: ${sample.amount || 'n/d'} | Estágio: ${sample.stage_name || 'n/d'}`);

          // READ detalhe
          if (sample.id) {
            const dView = await callWops('deal_view', { id: String(sample.id) });
            if (dView.ok && dView.data?.result?.data?.id) {
              const d = dView.data.result.data;
              relatorio.push(`  ✅ READ (detalhe): deal ${d.id} (${dView.ms}ms)`);
              relatorio.push(`  • *Campos disponíveis:* ${Object.keys(d).join(', ')}`);
            } else {
              relatorio.push(`  ⚠️ READ (detalhe): ${JSON.stringify(dView.data).slice(0, 100)}`);
            }
          }
        } else if (dSum.ok) {
          relatorio.push(`  ⚠️ READ: nenhum deal no Freshsales (${dSum.ms}ms)`);
        } else {
          relatorio.push(`  ❌ READ falhou (${dSum.ms}ms): ${JSON.stringify(dSum.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD E: Appointments READ
      relatorio.push('\n*📅 CRUD E — Appointments / Audiências (Freshsales)*');
      try {
        const aList = await callWops('appointments_list', { limit: 3 });
        const appts = Array.isArray(aList.data?.result?.data) ? aList.data.result.data : [];
        if (aList.ok && appts.length > 0) {
          const sample = appts[0] as any;
          relatorio.push(`  ✅ READ: ${appts.length} appointment(s) (${aList.ms}ms)`);
          relatorio.push(`  • *Amostra:* ${sample.title || 'n/d'} | De: ${sample.from_date || 'n/d'} | Até: ${sample.end_date || 'n/d'}`);
          relatorio.push(`  • *Campos disponíveis:* ${Object.keys(sample).join(', ')}`);
        } else if (aList.ok) {
          const txt = aList.data?.result?.text || '';
          relatorio.push(`  ⚠️ READ: nenhum appointment (${aList.ms}ms) — ${txt.slice(0, 80)}`);
        } else {
          relatorio.push(`  ❌ READ falhou (${aList.ms}ms): ${JSON.stringify(aList.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD F: Publicações READ (Supabase)
      relatorio.push('\n*📰 CRUD F — Publicações (Supabase)*');
      try {
        const pubR = await callSupa(
          'publicacoes?select=id,numero_processo_api,data_publicacao,conteudo,ai_resumo,ai_tipo_ato,ai_urgencia,vara_descricao,nome_cliente,lido,tem_prazo,prazo_data&limit=3&order=data_publicacao.desc.nullslast'
        );
        if (pubR.ok && Array.isArray(pubR.data) && pubR.data.length > 0) {
          const s = randomSample(pubR.data);
          relatorio.push(`  ✅ READ: ${pubR.data.length} publicação(s) (${pubR.ms}ms)`);
          relatorio.push(`  • *ID:* ${s.id}`);
          relatorio.push(`  • *Número processo:* ${s.numero_processo_api || 'vazio'}`);
          relatorio.push(`  • *Data publicação:* ${s.data_publicacao || 'vazio'}`);
          relatorio.push(`  • *Vara:* ${s.vara_descricao || 'vazio'}`);
          relatorio.push(`  • *Cliente:* ${s.nome_cliente || 'vazio'}`);
          relatorio.push(`  • *Lido:* ${s.lido ?? 'vazio'} | *Tem prazo:* ${s.tem_prazo ?? 'vazio'} | *Prazo:* ${s.prazo_data || 'vazio'}`);
          relatorio.push(`  • *AI Resumo:* ${s.ai_resumo ? s.ai_resumo.slice(0, 80) + '...' : 'vazio'}`);
          relatorio.push(`  • *AI Tipo ato:* ${s.ai_tipo_ato || 'vazio'} | *Urgência:* ${s.ai_urgencia || 'vazio'}`);
        } else if (pubR.ok) {
          relatorio.push(`  ⚠️ READ: tabela vazia (${pubR.ms}ms)`);
        } else {
          relatorio.push(`  ❌ READ falhou (${pubR.ms}ms): ${JSON.stringify(pubR.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD G: Processos READ (Supabase)
      relatorio.push('\n*⚖️ CRUD G — Processos (Supabase)*');
      try {
        const procR = await callSupa(
          'processos?select=numero_cnj,titulo,tribunal,comarca,orgao_julgador,status,polo_ativo,polo_passivo,data_distribuicao,data_ultima_movimentacao,area,classe,assunto&limit=3&order=data_distribuicao.desc.nullslast'
        );
        if (procR.ok && Array.isArray(procR.data) && procR.data.length > 0) {
          const s = randomSample(procR.data);
          relatorio.push(`  ✅ READ: ${procR.data.length} processo(s) (${procR.ms}ms)`);
          relatorio.push(`  • *Número CNJ:* ${s.numero_cnj || 'vazio'}`);
          relatorio.push(`  • *Título:* ${String(s.titulo || 'vazio').slice(0, 60)}`);
          relatorio.push(`  • *Tribunal:* ${s.tribunal || 'vazio'} | *Comarca:* ${s.comarca || 'vazio'}`);
          relatorio.push(`  • *Órgão julgador:* ${s.orgao_julgador || 'vazio'}`);
          relatorio.push(`  • *Status:* ${s.status || 'vazio'} | *Área:* ${s.area || 'vazio'}`);
          relatorio.push(`  • *Polo ativo:* ${s.polo_ativo || 'vazio'}`);
          relatorio.push(`  • *Polo passivo:* ${s.polo_passivo || 'vazio'}`);
          relatorio.push(`  • *Distribuição:* ${s.data_distribuicao || 'vazio'} | *Últ. mov.:* ${s.data_ultima_movimentacao || 'vazio'}`);
        } else if (procR.ok) {
          relatorio.push(`  ⚠️ READ: tabela vazia (${procR.ms}ms)`);
        } else {
          relatorio.push(`  ❌ READ falhou (${procR.ms}ms): ${JSON.stringify(procR.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD H: Contatos READ (Supabase contacts_freshsales)
      relatorio.push('\n*👤 CRUD H — Contatos (Supabase contacts_freshsales)*');
      try {
        const cSupa = await callSupa(
          'contacts_freshsales?select=fs_id,display_name,first_name,last_name,email,mobile,phone,cf_tipo,cf_cpf,tag_list,lifecycle_stage_id,owner_id,synced_at&limit=3&order=synced_at.desc.nullslast',
          { 'Accept-Profile': 'judiciario' }
        );
        if (cSupa.ok && Array.isArray(cSupa.data) && cSupa.data.length > 0) {
          const s = randomSample(cSupa.data);
          relatorio.push(`  ✅ READ: ${cSupa.data.length} contato(s) (${cSupa.ms}ms)`);
          relatorio.push(`  • *Nome:* ${s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'vazio'}`);
          relatorio.push(`  • *Email:* ${s.email || 'vazio'}`);
          relatorio.push(`  • *Celular:* ${s.mobile || 'vazio'} | *Telefone:* ${s.phone || 'vazio'}`);
          relatorio.push(`  • *Tipo:* ${s.cf_tipo || 'vazio'} | *CPF:* ${s.cf_cpf || 'vazio'}`);
          relatorio.push(`  • *Tags:* ${s.tag_list || 'vazio'}`);
          relatorio.push(`  • *Sincronizado em:* ${s.synced_at || 'vazio'}`);
        } else if (cSupa.ok) {
          relatorio.push(`  ⚠️ READ: tabela vazia (${cSupa.ms}ms)`);
        } else {
          relatorio.push(`  ❌ READ falhou (${cSupa.ms}ms): ${JSON.stringify(cSupa.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD I: Tickets Freshdesk READ
      relatorio.push('\n*🎫 CRUD I — Tickets Freshdesk (fila)*');
      try {
        const fdQ = await callWops('freshdesk_queue', { limit: 3 });
        const fdTickets = Array.isArray(fdQ.data?.result?.data) ? fdQ.data.result.data : [];
        if (fdQ.ok && fdTickets.length > 0) {
          const s = fdTickets[0] as any;
          relatorio.push(`  ✅ READ: ${fdTickets.length} ticket(s) na fila (${fdQ.ms}ms)`);
          relatorio.push(`  • *ID:* ${s.id || 'n/d'} | *Assunto:* ${String(s.subject || 'n/d').slice(0, 60)}`);
          relatorio.push(`  • *Status:* ${s.status || 'n/d'} | *Prioridade:* ${s.priority || 'n/d'}`);
          relatorio.push(`  • *Campos disponíveis:* ${Object.keys(s).join(', ')}`);
        } else if (fdQ.ok) {
          const txt = fdQ.data?.result?.text || '';
          relatorio.push(`  ⚠️ READ: fila vazia (${fdQ.ms}ms) — ${txt.slice(0, 80)}`);
        } else {
          relatorio.push(`  ❌ READ falhou (${fdQ.ms}ms): ${JSON.stringify(fdQ.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ── CRUD J: Memória / Messages (Supabase)
      relatorio.push('\n*💬 CRUD J — Memória / Messages (Supabase)*');
      try {
        // READ
        const memR = await callSupa(
          `messages?select=id,channel,role,content,created_at&order=created_at.desc.nullslast&limit=3`
        );
        if (memR.ok && Array.isArray(memR.data) && memR.data.length > 0) {
          const s = memR.data[0];
          relatorio.push(`  ✅ READ: ${memR.data.length} mensagem(ns) (${memR.ms}ms)`);
          relatorio.push(`  • *Canal:* ${s.channel || 'n/d'} | *Role:* ${s.role || 'n/d'}`);
          relatorio.push(`  • *Preview:* ${String(s.content || '').slice(0, 80)}...`);
        } else if (memR.ok) {
          relatorio.push(`  ⚠️ READ: tabela vazia (${memR.ms}ms)`);
        } else {
          relatorio.push(`  ❌ READ falhou (${memR.ms}ms): ${JSON.stringify(memR.data).slice(0, 150)}`);
        }
      } catch(e: any) { relatorio.push(`  ❌ EXCEÇÃO: ${e.message}`); }

      // ═══════════════════════════════════════════════
      // RESUMO FINAL
      // ═══════════════════════════════════════════════
      relatorio.push('\n---');
      relatorio.push('🏁 *Fim do diagnóstico.*');
      relatorio.push('_Legenda: ✅ OK | ⚠️ OK sem dados | ❌ Falha_');
      relatorio.push('_Para corrigir falhas: verifique os secrets FRESHSALES_API_KEY, FRESHDESK_API_KEY, SUPABASE_SERVICE_ROLE_KEY no painel Supabase → Edge Functions → Secrets._');

      return { response: relatorio.join('\n') };
    }

    if (lowerInput.includes('ativar modo aprendizado')) {
      await setLearningMode(deps.supabaseUrl, deps.serviceRoleKey, channel, true);
      console.log('[learning] mode ACTIVATED for channel:', channel);
      return { response: '🧠 Modo aprendizado ativado! Agora vou observar, classificar e estruturar as informações desta conversa. Pode continuar normalmente.' };
    }
    if (lowerInput.includes('desativar modo aprendizado')) {
      await setLearningMode(deps.supabaseUrl, deps.serviceRoleKey, channel, false);
      console.log('[learning] mode DEACTIVATED for channel:', channel);
      return { response: '✅ Modo aprendizado desativado. Voltei ao modo normal, mantendo todo o conhecimento adquirido.' };
    }

    // ── Detecção de validação de aprendizado ──
    const approveMatch = lowerInput.match(/aprovar aprendizado ([a-f0-9-]{8,})/);
    const rejectMatch = lowerInput.match(/rejeitar aprendizado ([a-f0-9-]{8,})/);
    if (approveMatch || rejectMatch) {
      const itemIdPrefix = (approveMatch || rejectMatch)![1];
      const newStatus = approveMatch ? 'approved' : 'rejected';
      try {
        const searchRes = await fetch(
          `${deps.supabaseUrl}/rest/v1/learning_items?id=like.${encodeURIComponent(itemIdPrefix + '%')}&limit=1`,
          { headers: { 'apikey': deps.serviceRoleKey, 'Authorization': `Bearer ${deps.serviceRoleKey}` } }
        );
        const items = searchRes.ok ? await searchRes.json() : [];
        if (items.length > 0) {
          const item = items[0];
          await fetch(
            `${deps.supabaseUrl}/rest/v1/learning_items?id=eq.${item.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': deps.serviceRoleKey,
                'Authorization': `Bearer ${deps.serviceRoleKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ status: newStatus, validated_at: new Date().toISOString() }),
            }
          );
          const emoji = newStatus === 'approved' ? '✅' : '❌';
          return { response: `${emoji} Aprendizado ${newStatus === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso! ID: ${item.id.slice(0, 8)}` };
        } else {
          return { response: `⚠️ Não encontrei nenhum aprendizado com o ID ${itemIdPrefix}. Verifique o ID e tente novamente.` };
        }
      } catch (e) {
        console.error('[learning] validate error:', e);
        return { response: 'Ocorreu um erro ao validar o aprendizado. Tente novamente.' };
      }
    }

    const isLearningMode = await getLearningMode(deps.supabaseUrl, deps.serviceRoleKey, channel);

    const history = await deps.memory.getMemory(channel);

    
    let personaContext = "Usuário não identificado. Trate como cliente externo padrão.";
    
    if (userId) {
      const userInfo = await getSlackUserInfo(userId);
      console.log("[persona] slack user info:", JSON.stringify(userInfo));
      const email = userInfo?.profile?.email || '';
      const realName = userInfo?.real_name || userInfo?.name || 'Usuário';
      
      let isOwner = false;
      if (email === 'adrianohermida@gmail.com' || email.includes('adriano')) {
        isOwner = true;
      }
      
      // Buscar ou criar na tabela contacts
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      
      let contacts = null;
      let fetchErr = null;
      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/users?slack_id=eq.${encodeURIComponent(userId)}&limit=1`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        if (res.ok) {
          contacts = await res.json();
        } else {
          fetchErr = await res.text();
        }
      } catch(e) {
        fetchErr = String(e);
      }
      console.log("[persona] db fetch result:", JSON.stringify(contacts), "err:", fetchErr, "userId:", userId);
      
      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        const displayName = contact.name || realName;
        const role = contact.role || 'cliente';
        const isDbOwner = role === 'owner';
        const isInterno = role === 'interno';
        if (isDbOwner) {
          isOwner = true;
          personaContext = `USUÁRIO: ${displayName} (Dr. Adriano — dono do escritório Hermida Maia)\nPERMISSÕES: TOTAIS — sem restrições, sem triagem, sem perguntas desnecessárias. Responda diretamente o que for solicitado, com máxima objetividade.\nLINGUAGEM: Direta, concisa, profissional. Tuteia permitido.`;
        } else if (isInterno) {
          personaContext = `USUÁRIO: ${displayName} (equipe interna do escritório — role: interno)\nPERMISSÕES: Acesso amplo a processos, prazos, audiências e dados internos. Sem triagem de atendimento.\nLINGUAGEM: Profissional, direta, técnica quando necessário.`;
        } else {
          personaContext = `USUÁRIO: ${displayName} (cliente externo — Email: ${contact.email || email || 'N/A'})\nPERMISSÕES: Acesso restrito às informações do próprio cliente. Não forneça dados de outros clientes ou processos alheios.\nLINGUAGEM: Acessível, humanizada, empática. Explique termos jurídicos quando necessário.`;
        }
        
        // Atualizar last_interaction
        try {
          await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${contact.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ last_interaction: new Date().toISOString() })
          });
        } catch(e) {
          console.error("Error updating user:", e);
        }
      } else {
        // Criar novo
        const type = isOwner ? 'owner' : 'cliente';
        try {
          await fetch(`${supabaseUrl}/rest/v1/users`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify([{
              name: realName, email: email, slack_id: userId, role: type
            }])
          });
        } catch(e) {
          console.error("Error creating user:", e);
        }
        
        // Novo usuário: tentar identificar na tabela contacts_freshsales (sincronizada)
        let freshsalesContext = '';
        if (email && type === 'cliente') {
          try {
            const emailEnc = encodeURIComponent(email.toLowerCase().trim());
            const fsLookup = await fetch(
              `${supabaseUrl}/rest/v1/contacts_freshsales?email=ilike.${emailEnc}&select=fs_id,display_name,first_name,last_name,mobile,phone,cf_tipo,tag_list&limit=1`,
              { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
            );
            const fsRows = fsLookup.ok ? await fsLookup.json() : [];
            if (Array.isArray(fsRows) && fsRows.length > 0) {
              const c = fsRows[0];
              const nome = c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
              const tel = c.mobile || c.phone || 'N/A';
              freshsalesContext = `\nCRM: Contato encontrado — ${nome} | Tel: ${tel} | Tipo: ${c.cf_tipo || 'N/A'} | ID: ${c.fs_id}`;
              console.log('[persona] contacts_freshsales lookup ok:', c.fs_id, nome);
            } else {
              console.log('[persona] contacts_freshsales: não encontrado para', email);
            }
          } catch(e) { console.log('[persona] contacts_freshsales lookup error:', e); }
        }
        if (type === 'owner') {
          personaContext = `USUÁRIO: ${realName} (Dr. Adriano — dono do escritório Hermida Maia)\nPERMISSÕES: TOTAIS — sem restrições, sem triagem, sem perguntas desnecessárias. Responda diretamente o que for solicitado, com máxima objetividade.\nLINGUAGEM: Direta, concisa, profissional. Tuteia permitido.`;
        } else {
          personaContext = `USUÁRIO: ${realName} (cliente externo — Email: ${email || 'N/A'})${freshsalesContext}\nPERMISSÕES: Acesso restrito às informações do próprio cliente. Não forneça dados de outros clientes.\nLINGUAGEM: Acessível, humanizada, empática. Explique termos jurídicos quando necessário.\nEste é um novo contato — registrado automaticamente.`;
        }
      }
      
      // personaContext já inclui as permissões corretas por role (owner/interno/cliente)
    }

    console.log("[persona] final context:", personaContext);
    // ── Normalizar texto: remover formatação mrkdwn do Slack (<mailto:x|x> → x) ──
    const normalizedInput = inputText
      .replace(/<mailto:[^|>]+\|([^>]+)>/g, '$1')  // <mailto:email|email> → email
      .replace(/<([^|>]+)>/g, '$1');                 // <url> → url
    const intent = detectIntent(normalizedInput);
    const cnj = extractCNJ(normalizedInput);
    console.log('[agent] intent:', intent, 'cnj:', cnj);

    // ── Decidir se o RAG é necessário ──────────────────────────────────────
    const isOwnerContext = personaContext.includes('DR. ADRIANO') || personaContext.includes('owner');
    const isSimpleGreeting = /^(oi|olá|ola|hey|hi|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e aí|e ai|ok|okay|certo|entendi|obrigad|valeu|vlw|👋|😊|🙂)[\.\.!?\s]*$/i.test(inputText.trim());
    const isShortMessage = inputText.trim().length < 15;
    const isTemporalQuestion = /\b(que horas|horas são|hora é|que dia|dia é|hoje é|manhã|tarde|noite|período|horário|data de hoje|dia da semana|semana|mês|ano)\b/i.test(inputText);
    const skipRag = isSimpleGreeting || isTemporalQuestion
      || intent.type === 'buscar_contato'   // busca de contato não precisa de RAG
      || intent.type === 'processo'          // processo já tem pre-fetch real
      || (isOwnerContext && isShortMessage && intent.type === 'geral');

    // ── Pre-fetch de ferramentas determinísticas (sem LLM) ─────────────────
    // Executa ferramentas cujo trigger é certo antes do LLM para injetar contexto real
    const toolContext: string[] = [];
    if (intent.type === 'processo' && cnj) {
      const proc = await deps.tools.consultar_processo(cnj);
      if (proc.ok) {
        toolContext.push(`[Processo consultado] ${proc.summary || JSON.stringify(proc.data)}`);
      } else {
        toolContext.push(`[Processo ${cnj}] ${proc.error || 'Não localizado na base.'}`);
      }
      console.log('[tool-prefetch] consultar_processo:', proc.ok ? 'ok' : 'erro');
    }

    // Pre-fetch de contato: buscar dados reais ANTES do LLM para injetar na resposta
    if (intent.type === 'buscar_contato') {
      const emailMatch = normalizedInput.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const contato = await deps.tools.consultar_contato(emailMatch[0]);
        if (contato.ok) {
          toolContext.push(`[Contato encontrado] ${contato.summary}\n${JSON.stringify(contato.data, null, 2).slice(0, 600)}`);
        } else {
          toolContext.push(`[Busca de contato] ${contato.error}`);
        }
        console.log('[tool-prefetch] consultar_contato:', contato.ok ? 'ok' : contato.error);
      } else {
        // Sem email na mensagem — tentar busca por nome se houver
        const nomeMatch = normalizedInput.match(/(?:contato|cliente|pessoa)\s+(?:de\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
        if (nomeMatch) {
          toolContext.push(`[Busca de contato] Nenhum email na mensagem. Nome detectado: "${nomeMatch[1]}". Informe o email para buscar no CRM.`);
        } else {
          toolContext.push('[Busca de contato] Nenhum email encontrado na mensagem. Solicite o email ao usuário.');
        }
        console.log('[tool-prefetch] consultar_contato: sem email na mensagem');
      }
    }

    const knowledgeQuery = [
      normalizedInput,
      cnj ? `CNJ: ${cnj}` : '',
      `Intenção: ${intent.type}`,
    ].filter(Boolean).join('\n');
    const knowledgeText = skipRag ? '' : await deps.rag.getKnowledge(knowledgeQuery);
    if (skipRag) console.log('[rag] pulando RAG — mensagem simples ou saudação');

    // ── Reality Context Engine: injetar data/hora real (timezone Brasília) ──
    const _now = new Date();
    const _tzOffset = -3 * 60; // America/Sao_Paulo (UTC-3, sem DST)
    const _nowBrasilia = new Date(_now.getTime() + (_tzOffset - _now.getTimezoneOffset()) * 60000);
    const _weekdays = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
    const _months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const _hora = _nowBrasilia.getHours().toString().padStart(2,'0');
    const _min = _nowBrasilia.getMinutes().toString().padStart(2,'0');
    const _diaSemana = _weekdays[_nowBrasilia.getDay()];
    const _dia = _nowBrasilia.getDate();
    const _mes = _months[_nowBrasilia.getMonth()];
    const _ano = _nowBrasilia.getFullYear();
    const _periodo = _nowBrasilia.getHours() < 12 ? 'manhã' : _nowBrasilia.getHours() < 18 ? 'tarde' : 'noite';
    const realityContext = `CONTEXTO DE REALIDADE (use SEMPRE para perguntas sobre tempo):
- Horário atual: ${_hora}:${_min} (Brasília, UTC-3)
- Período: ${_periodo}
- Data: ${_diaSemana}, ${_dia} de ${_mes} de ${_ano}
NUNCA invente horário. Use SEMPRE os valores acima.`;
    console.log('[rce] reality context:', realityContext.split('\n')[1]); // log da hora para diagnóstico
    // Montar system prompt com modo aprendizado se ativo
    let activeSystemPrompt = deps.systemPrompt + "\n\n" + realityContext + "\n\nCONTEXTO DO USUÁRIO ATUAL:\n" + personaContext;
    if (isLearningMode) {
      activeSystemPrompt += "\n\n" + CIDA_LEARNING_MODE_PROMPT + "\n\n" + CIDA_LEARNING_VALIDATED_PROMPT;
    }

    // ── Montar mensagens com histórico individual (melhor para o LLM) ────────
    const messages: ChatMessage[] = [{ role: 'system', content: activeSystemPrompt }];

    // Histórico como mensagens individuais (últimas 6 para economizar tokens)
    const recentHistory = history.slice(-6);
    for (const m of recentHistory) {
      messages.push({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 400) });
    }

    // RAG comprimido (max 800 chars para economizar tokens)
    const ragCompressed = knowledgeText ? knowledgeText.slice(0, 800) : '';

    const assembledUser = [
      normalizedInput,
      cnj ? `[CNJ: ${cnj}]` : '',
      ragCompressed ? `[Base de conhecimento]\n${ragCompressed}` : '',
      toolContext.length ? `[Contexto]\n${toolContext.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    messages.push({ role: 'user', content: assembledUser });

    const llmAnswer = await deps.llm.runLLM(messages);

    // ── Loop de Tool Calling pós-LLM: executar ações reais se a resposta indicar necessidade ──
    // Detecta padrões na resposta do LLM e executa ferramentas reais em background
    const toolActions: string[] = [];
    const lowerAnswer = llmAnswer.toLowerCase();

    // Detectar intenção de BUSCAR contato (pre-fetch antes do LLM já foi feito, mas confirmar aqui)
    if (intent.type === 'buscar_contato') {
      const emailMatch = normalizedInput.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch && !toolContext.some(t => t.includes('Contato encontrado'))) {
        const contato = await deps.tools.consultar_contato(emailMatch[0]);
        if (contato.ok) toolActions.push(`✅ ${contato.summary}`);
        else toolActions.push(`⚠️ ${contato.error}`);
        console.log('[tool-calling] consultar_contato:', contato.ok ? 'ok' : contato.error);
      }
    }

    // Detectar intenção de criar contato/lead (o LLM pediu para registrar)
    if (intent.type === 'lead' && /email/i.test(normalizedInput)) {
      const emailMatch = normalizedInput.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const nomeMatch = inputText.match(/(?:sou|me chamo|meu nome é|chamo)\s+([A-Z][a-z]+(\s+[A-Z][a-z]+)*)/i);
        const lead = await deps.tools.criar_contato({
          email: emailMatch[0],
          nome: nomeMatch?.[1],
          canal: channel,
          origem: 'Slack',
          observacao: `Mensagem: "${inputText.slice(0, 140)}"`,
        });
        if (lead.ok) toolActions.push(`✅ ${lead.summary}`);
        console.log('[tool-calling] criar_contato:', lead.ok ? 'ok' : lead.error);
      }
    }

    // Detectar intenção de agendamento com dados suficientes
    if (intent.type === 'agendamento') {
      const emailMatch = normalizedInput.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      const dataMatch = normalizedInput.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
      if (emailMatch && dataMatch) {
        const dia = dataMatch[1].padStart(2,'0');
        const mes = dataMatch[2].padStart(2,'0');
        const ano = dataMatch[3] ? (dataMatch[3].length === 2 ? '20' + dataMatch[3] : dataMatch[3]) : new Date().getFullYear().toString();
        const ag = await deps.tools.criar_agendamento({
          email: emailMatch[0],
          data: `${ano}-${mes}-${dia}`,
          canal: channel,
          proposta: 'Consulta jurídica',
          observacao: `Mensagem: "${inputText.slice(0, 140)}"`,
        });
        if (ag.ok) toolActions.push(`✅ ${ag.summary}`);
        console.log('[tool-calling] criar_agendamento:', ag.ok ? 'ok' : ag.error);
      }
    }

    // ── Estimar tokens (aprox 4 chars = 1 token) ──────────────────────────────────
    const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0) + llmAnswer.length;
    const estimatedTokens = Math.round(totalChars / 4);
    const llmProviderUsed = (deps.llm as any)._lastProvider || 'ollama';

    await deps.memory.saveMemory(channel, 'user', inputText);
    await deps.memory.saveMemory(channel, 'assistant', llmAnswer);

       // ── Rodapé de status (modelo, memória, tokens) ────────────────────
    const providerLabel = llmProviderUsed === 'cloudflare' ? '☁️ Cloudflare AI' :
                          llmProviderUsed === 'ollama' ? '🦙 Ollama' :
                          llmProviderUsed === 'huggingface' ? '🤗 HuggingFace' : llmProviderUsed;
    const memCount = recentHistory.length + 1; // +1 pela mensagem atual
    const footer = `\n\n_${providerLabel} · 💬 ${memCount} msgs · ⚡ ~${estimatedTokens} tokens_`;
    // Incluir confirmações de ações reais executadas (se houver)
    const actionsBlock = toolActions.length > 0 ? '\n\n' + toolActions.join('\n') : '';
    const responseWithFooter = llmAnswer + actionsBlock + footer;

    // ── Captura de aprendizado em modo ativo ──
    if (isLearningMode) {
      const isOwnerForLearning = personaContext.includes('owner') || personaContext.includes('DR. ADRIANO');
      const confidence = calculateConfidence({
        sourceIsOwner: isOwnerForLearning,
        repeated: false,
        structured: intent.type !== 'geral',
        contextClear: inputText.length > 20,
      });

      const learningContent = {
        message: inputText.slice(0, 500),
        intent: intent.type,
        channel,
        response_preview: llmAnswer.slice(0, 200),
      };

      const savedItem = await saveLearningItem({
        supabaseUrl: deps.supabaseUrl,
        serviceRoleKey: deps.serviceRoleKey,
        type: intent.type || 'conversa',
        content: learningContent,
        source: isOwnerForLearning ? 'DrAdriano' : (userId || 'unknown'),
        confidence,
        channelId: channel,
        userSlackId: userId,
      });

      // Notificar o Dr. Adriano se confiança >= 70 e não for ele mesmo enviando
      if (savedItem && confidence >= 70 && userId) {
        const ownerSlackId = 'U01FHTM68AH';
        if (userId !== ownerSlackId) {
          EdgeRuntime.waitUntil(notifyOwnerAboutLearning(savedItem, ownerSlackId));
        }
      }

      console.log('[learning] item saved:', savedItem?.id, 'confidence:', confidence);
    }

    return { response: responseWithFooter };
  };

  return { agent };
}

const LOG_WEBHOOK = 'https://5000-ie9rpsm26pewf6nov5f4e-45bcaec2.us3.manus.computer/webhook';

async function logToWebhook(level: string, message: string, data?: any) {
  try {
    await fetch(LOG_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, data: data ? JSON.stringify(data) : undefined, timestamp: new Date().toISOString() }),
    });
  } catch (_) { /* ignore */ }
}

console.log('cida-agent edge function booting...');

async function postToSlack(channel: string, text: string, thread_ts?: string) {
  const token = Deno.env.get("CIDA_BOT_TOKEN");
  if (!token) {
    console.warn("CIDA_BOT_TOKEN not found, skipping Slack post");
    return;
  }
  
  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text, unfurl_links: false, ...(thread_ts ? { thread_ts } : {}) }),
    });
    
    const data = await response.json();
    if (!response.ok || data?.ok === false) {
      console.error("Slack API error:", data?.error || `Status ${response.status}`);
    } else {
      console.log('Message sent to Slack successfully', { channel });
    }
  } catch (e) {
    console.error("Error posting to Slack:", e);
  }
}

// ── Deduplicação de eventos Slack ─────────────────────────────────────────────
async function isEventAlreadyProcessed(supabaseUrl: string, serviceRoleKey: string, eventId: string): Promise<boolean> {
  if (!eventId) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/processed_events?event_id=eq.${encodeURIComponent(eventId)}&limit=1`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

async function markEventProcessed(supabaseUrl: string, serviceRoleKey: string, eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/processed_events`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event_id: eventId, processed_at: new Date().toISOString() }),
    });
  } catch { /* silencioso */ }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Deduplicação: ignorar retries do Slack ─────────────────────────────
    const retryNum = req.headers.get('X-Slack-Retry-Num');
    if (retryNum && parseInt(retryNum) > 0) {
      console.log('[handler] ignorando retry do Slack:', retryNum);
      return new Response('OK', { status: 200 });
    }

    const body = await req.json().catch(() => null);
    
    // Tratamento para url_verification do Slack
    if (body?.type === 'url_verification') {
      return new Response(body.challenge, { status: 200 });
    }

    let message = body?.message;
    let channel_id = body?.channel_id;
    let thread_ts = undefined;
    let user_id = undefined;
    let event_id: string | undefined = undefined;

    // Tratamento para eventos brutos do Slack
    if (body?.type === 'event_callback') {
      const event = body.event;
      if (!event) {
        return new Response(JSON.stringify({ error: 'Missing event in event_callback' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      
      // Ignora mensagens de bots para evitar loop
      if (event.bot_id || event.subtype === 'bot_message') {
        return new Response(JSON.stringify({ status: 'ignored bot message' }), { headers: { 'Content-Type': 'application/json' } });
      }

      const isMessage = event.type === 'message';
      const isMention = event.type === 'app_mention';
      
      if (isMessage || isMention) {
        message = event.text || '';
        channel_id = event.channel || '';
        thread_ts = event.thread_ts || event.ts;
        user_id = event.user;
        event_id = body.event_id || event.ts || undefined;
        
        message = message.replace(/<@[^>]+>/g, '').trim();
        
        if (!message) {
           return new Response(JSON.stringify({ status: 'ignored empty message' }), { headers: { 'Content-Type': 'application/json' } });
        }
      } else {
        return new Response(JSON.stringify({ status: 'ignored event type' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing/invalid body.message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!channel_id || typeof channel_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing/invalid body.channel_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Deduplicação por event_id no banco ────────────────────────────────
    if (event_id && body?.type === 'event_callback') {
      const alreadyProcessed = await isEventAlreadyProcessed(SUPABASE_URL, SERVICE_ROLE_KEY, event_id);
      if (alreadyProcessed) {
        console.log('[handler] evento já processado, ignorando:', event_id);
        return new Response('OK', { status: 200 });
      }
      // Marcar como processado imediatamente para evitar race condition
      await markEventProcessed(SUPABASE_URL, SERVICE_ROLE_KEY, event_id);
    }

    console.log('[handler] input ok:', {
      channel_id,
      messagePreview: message.slice(0, 80),
    });

    const tools = toolsFactory({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY });
    const memory = memoryFactory({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY });
    const rag = ragFactory(tools);
    const llm = llmFactory(SUPABASE_URL, SERVICE_ROLE_KEY);

    const orch = orchestratorFactory({
      tools,
      memory,
      rag,
      llm,
      systemPrompt: SYSTEM_PROMPT,
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
    });

    // ── Para eventos Slack: retornar 200 imediatamente e processar em background
    if (body?.type === 'event_callback') {
      EdgeRuntime.waitUntil((async () => {
        try {
          const result = await orch.agent(message, channel_id, user_id);
          await postToSlack(channel_id, result.response, thread_ts);
        } catch (e: any) {
          console.error('[handler] background error:', e?.message ?? e);
        }
      })());
      return new Response('OK', { status: 200 });
    }

    const result = await orch.agent(message, channel_id, user_id);

    return new Response(JSON.stringify({ response: result.response }), {
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    console.log('[handler] error:', e?.message ?? e);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: String(e?.message ?? e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
