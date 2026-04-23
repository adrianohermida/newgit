/**
 * dotobot-slack — Central de Comandos e Notificações do Pipeline HMADV no Slack
 *
 * Funcionalidades:
 * 1. Recebe comandos slash do Slack (/dotobot) e aciona edge functions
 * 2. Envia notificações ricas (publicações, andamentos, audiências, status)
 * 3. Painel de status do pipeline com métricas em tempo real
 * 4. Relatório de pendências de desenvolvimento
 *
 * Comandos disponíveis:
 *   /dotobot status         — Painel completo do pipeline
 *   /dotobot publicacoes    — Últimas publicações recebidas
 *   /dotobot andamentos     — Últimos andamentos do DataJud
 *   /dotobot audiencias     — Próximas audiências
 *   /dotobot pendencias     — Pendências de desenvolvimento
 *   /dotobot fix-activities — Corrigir activities pendentes (lote 50)
 *   /dotobot drain-advise   — Acionar drenagem do Advise agora
 *   /dotobot datajud        — Processar fila DataJud agora
 *   /dotobot help           — Ajuda com os comandos
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") || "";
const SLACK_CHANNEL = Deno.env.get("SLACK_NOTIFY_CHANNEL") || "C09E59J77EU";
const SLACK_USER_TOKEN = Deno.env.get("SLACK_USER_TOKEN") || "";
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const SELF_URL = `${SUPABASE_URL}/functions/v1`;

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: "judiciario" } });
const dbPublic = createClient(SUPABASE_URL, SVC_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function slackToken(): string {
  return SLACK_USER_TOKEN || SLACK_BOT_TOKEN;
}

async function postSlack(channel: string, text: string, blocks?: unknown[]): Promise<void> {
  const payload: Record<string, unknown> = { channel, text, unfurl_links: false };
  if (blocks) payload.blocks = blocks;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${slackToken()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
}

async function postSlackEphemeral(channel: string, user: string, text: string, blocks?: unknown[]): Promise<void> {
  const payload: Record<string, unknown> = { channel, user, text };
  if (blocks) payload.blocks = blocks;
  await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${slackToken()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
}

function divider() {
  return { type: "divider" };
}

function section(text: string) {
  return { type: "section", text: { type: "mrkdwn", text } };
}

function header(text: string) {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

function context(elements: string[]) {
  return {
    type: "context",
    elements: elements.map((e) => ({ type: "mrkdwn", text: e })),
  };
}

function actions(btns: Array<{ text: string; value: string; style?: string }>) {
  return {
    type: "actions",
    elements: btns.map((b) => ({
      type: "button",
      text: { type: "plain_text", text: b.text, emoji: true },
      value: b.value,
      action_id: `action_${b.value.replace(/[^a-z0-9]/gi, "_")}`,
      ...(b.style ? { style: b.style } : {}),
    })),
  };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function invokeFunction(name: string, body: unknown): Promise<unknown> {
  const r = await fetch(`${SELF_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SVC_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });
  return r.json().catch(() => ({ error: "timeout ou resposta inválida" }));
}

// ── Handlers de Comandos ──────────────────────────────────────────────────────

async function handleStatus(channel: string, userId: string): Promise<void> {
  // Coletar métricas em paralelo
  const [
    pubTotal,
    pubSemActivity,
    pubUltimas,
    queuePendente,
    queueErro,
    processos,
    movimentos,
    audiencias,
  ] = await Promise.all([
    db.from("publicacoes").select("id", { count: "exact", head: true }),
    db.from("publicacoes").select("id", { count: "exact", head: true }).is("freshsales_activity_id", null),
    db.from("publicacoes").select("id,data_publicacao,numero_processo_api").order("data_publicacao", { ascending: false }).limit(1),
    db.from("monitoramento_queue").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    db.from("monitoramento_queue").select("id", { count: "exact", head: true }).eq("status", "erro"),
    db.from("processos").select("id", { count: "exact", head: true }),
    db.from("movimentos").select("id", { count: "exact", head: true }),
    db.from("audiencias").select("id", { count: "exact", head: true }),
  ]);

  const totalPub = pubTotal.count ?? 0;
  const semActivity = pubSemActivity.count ?? 0;
  const comActivity = totalPub - semActivity;
  const pctActivity = totalPub > 0 ? Math.round((comActivity / totalPub) * 100) : 0;
  const ultimaPub = pubUltimas.data?.[0];
  const qPend = queuePendente.count ?? 0;
  const qErro = queueErro.count ?? 0;
  const totalProc = processos.count ?? 0;
  const totalMov = movimentos.count ?? 0;
  const totalAud = audiencias.count ?? 0;

  const statusEmoji = pctActivity >= 90 ? "🟢" : pctActivity >= 60 ? "🟡" : "🔴";
  const queueEmoji = qPend === 0 ? "✅" : qPend < 100 ? "🟡" : "🔴";

  const blocks = [
    header("📊 Pipeline HMADV — Status em Tempo Real"),
    divider(),
    section(
      `*📋 Publicações Advise*\n` +
      `• Total no banco: *${totalPub.toLocaleString("pt-BR")}*\n` +
      `• Com activity no Freshsales: *${comActivity.toLocaleString("pt-BR")}* (${pctActivity}%) ${statusEmoji}\n` +
      `• Sem activity (pendentes): *${semActivity.toLocaleString("pt-BR")}*\n` +
      `• Última publicação: *${ultimaPub ? `${fmtDate(ultimaPub.data_publicacao)} — ${ultimaPub.numero_processo_api || "s/nº"}` : "—"}*`
    ),
    divider(),
    section(
      `*⚙️ Fila DataJud (monitoramento_queue)*\n` +
      `• Pendentes: *${qPend.toLocaleString("pt-BR")}* ${queueEmoji}\n` +
      `• Com erro: *${qErro.toLocaleString("pt-BR")}* ${qErro > 0 ? "⚠️" : "✅"}`
    ),
    divider(),
    section(
      `*🗂️ Banco de Dados Supabase*\n` +
      `• Processos: *${totalProc.toLocaleString("pt-BR")}*\n` +
      `• Movimentos: *${totalMov.toLocaleString("pt-BR")}*\n` +
      `• Audiências: *${totalAud.toLocaleString("pt-BR")}*`
    ),
    divider(),
    actions([
      { text: "🔄 Drenar Advise", value: "drain_advise" },
      { text: "⚡ Processar DataJud", value: "run_datajud" },
      { text: "🔧 Fix Activities", value: "fix_activities", style: "primary" },
    ]),
    context([`_Atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(channel, `📊 Status do Pipeline HMADV`, blocks);
}

async function handlePublicacoes(channel: string): Promise<void> {
  const { data: pubs } = await db
    .from("publicacoes")
    .select("id,data_publicacao,numero_processo_api,conteudo,freshsales_activity_id,account_id_freshsales")
    .order("data_publicacao", { ascending: false })
    .limit(5);

  if (!pubs || pubs.length === 0) {
    await postSlack(channel, "Nenhuma publicação encontrada.");
    return;
  }

  const blocks: unknown[] = [header("📰 Últimas 5 Publicações — Advise")];

  for (const pub of pubs) {
    const conteudo = String(pub.conteudo || "").substring(0, 200).replace(/\n/g, " ");
    const fsLink = pub.account_id_freshsales
      ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${pub.account_id_freshsales}|Ver no Freshsales>`
      : "_Sem vínculo no Freshsales_";
    const actStatus = pub.freshsales_activity_id ? "✅ Activity criada" : "⚠️ Sem activity";

    blocks.push(divider());
    blocks.push(
      section(
        `*${fmtDate(pub.data_publicacao)}* — \`${pub.numero_processo_api || "s/nº"}\`\n` +
        `${conteudo}...\n` +
        `${actStatus} | ${fsLink}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(context([`_Exibindo as 5 publicações mais recentes do banco Supabase_`]));

  await postSlack(channel, "📰 Últimas publicações do Advise", blocks);
}

async function handleAndamentos(channel: string): Promise<void> {
  const { data: movs } = await db
    .from("movimentos")
    .select("id,data_movimento,descricao,numero_cnj,processo_id")
    .order("data_movimento", { ascending: false })
    .limit(5);

  if (!movs || movs.length === 0) {
    await postSlack(channel, "Nenhum andamento encontrado.");
    return;
  }

  const blocks: unknown[] = [header("⚖️ Últimos 5 Andamentos — DataJud")];

  for (const mov of movs) {
    const descricao = String(mov.descricao || "").substring(0, 200);
    blocks.push(divider());
    blocks.push(
      section(
        `*${fmtDate(mov.data_movimento)}* — \`${mov.numero_cnj || "s/nº"}\`\n` +
        `${descricao}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(context([`_Exibindo os 5 andamentos mais recentes do DataJud_`]));

  await postSlack(channel, "⚖️ Últimos andamentos DataJud", blocks);
}

async function handleAudiencias(channel: string): Promise<void> {
  const hoje = new Date().toISOString().split("T")[0];
  const { data: auds } = await db
    .from("audiencias")
    .select("id,data_audiencia,tipo,descricao,numero_cnj,processo_id,local")
    .gte("data_audiencia", hoje)
    .order("data_audiencia", { ascending: true })
    .limit(10);

  if (!auds || auds.length === 0) {
    await postSlack(channel, "✅ Nenhuma audiência futura encontrada no banco.");
    return;
  }

  const blocks: unknown[] = [header("📅 Próximas Audiências")];

  for (const aud of auds) {
    const tipo = String(aud.tipo || "Audiência").toUpperCase();
    const local = aud.local ? `📍 ${aud.local}` : "";
    const descricao = String(aud.descricao || "").substring(0, 150);

    blocks.push(divider());
    blocks.push(
      section(
        `*${fmtDate(aud.data_audiencia)}* — *${tipo}*\n` +
        `\`${aud.numero_cnj || "s/nº"}\`\n` +
        `${descricao}\n${local}`
      )
    );
  }

  blocks.push(divider());
  blocks.push(context([`_${auds.length} audiência(s) futuras encontradas_`]));

  await postSlack(channel, `📅 ${auds.length} audiência(s) próxima(s)`, blocks);
}

async function handlePendencias(channel: string): Promise<void> {
  const blocks = [
    header("🚧 Pendências de Desenvolvimento — Pipeline HMADV"),
    divider(),
    section(
      `*✅ Concluído*\n` +
      `• Ingestão de publicações Advise (cron a cada 15 min)\n` +
      `• Edge function \`publicacoes-freshsales\` (activities com completed_date)\n` +
      `• Edge function \`datajud-worker\` (movimentos e audiências)\n` +
      `• Edge function \`fs-account-repair\` (fix_activities + batch)\n` +
      `• Edge function \`fs-account-enricher\` (regras de negócio centralizadas)\n` +
      `• Edge function \`slack-notify\` (notificações via SLACK_USER_TOKEN)\n` +
      `• Edge function \`dotobot-slack\` (comandos slash + painel)\n` +
      `• Canal #dotobot configurado (ID: C09E59J77EU)\n` +
      `• Secret SLACK_NOTIFY_CHANNEL configurado`
    ),
    divider(),
    section(
      `*⚠️ Em Andamento / Pendente*\n` +
      `• *2.771 activities pendentes* no Freshsales precisam de \`fix_activities\`\n` +
      `  → Rate limit: 1.000 req/hora → lotes de 50 a cada 5 min\n` +
      `• *Ingestão de contacts* pode não ter terminado (~21.700 de 27.134)\n` +
      `  → Token OAuth de contacts expira a cada ~4h\n` +
      `• *Campos órfãos* nos Accounts do Freshsales (status, instância, fase)\n` +
      `  → Usar \`fs-account-repair\` com \`action=batch\`\n` +
      `• *Notificações automáticas* nas edge functions (publicações, andamentos, audiências)\n` +
      `  → Integrar chamada ao \`slack-notify\` em cada função\n` +
      `• *Cron job de status diário* (resumo às 8h todo dia útil)\n` +
      `• *Audiências extraídas* de publicações via regex (hmadv-hearing-utils.js)\n` +
      `  → Salvar na tabela \`audiencias\` e enviar ao Freshsales`
    ),
    divider(),
    section(
      `*🔴 Bloqueios Conhecidos*\n` +
      `• \`SLACK_BOT_TOKEN\` sem scope \`chat:write\` → usando \`SLACK_USER_TOKEN\`\n` +
      `• \`SLACK_ACCESS_TOKEN\` inválido (token OAuth expirado)\n` +
      `• \`publicacoes-freshsales\` com \`verify_jwt=true\` → não pode ser chamada por cron diretamente`
    ),
    divider(),
    section(
      `*📌 Próximos Sprints*\n` +
      `• Sprint: Correção em massa de activities (fix_activities via cron)\n` +
      `• Sprint: Enriquecimento em massa de Accounts (batch repair)\n` +
      `• Sprint: Extração de audiências de publicações\n` +
      `• Sprint: Ingestão completa de contacts (retomar)\n` +
      `• Sprint: Notificações automáticas integradas nas edge functions`
    ),
    divider(),
    actions([
      { text: "🔧 Fix Activities Agora", value: "fix_activities", style: "primary" },
      { text: "🔄 Drenar Advise", value: "drain_advise" },
      { text: "📊 Ver Status", value: "status" },
    ]),
    context([`_Relatório gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(channel, "🚧 Pendências do Pipeline HMADV", blocks);
}

async function handleFixActivities(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `🔧 <@${userId}> acionou *fix_activities* — processando lote de 50...`);

  try {
    const result = await invokeFunction("fs-account-repair", {
      action: "fix_activities",
      batch_size: 50,
      cursor: 0,
    }) as Record<string, unknown>;

    const corrigidas = result.corrigidas ?? 0;
    const erros = result.erros ?? 0;
    const proximoCursor = result.proximo_cursor ?? 50;

    const emoji = erros === 0 ? "✅" : "⚠️";
    await postSlack(
      channel,
      `${emoji} *fix_activities* concluído\n• Corrigidas: *${corrigidas}*\n• Erros: *${erros}*\n• Próximo cursor: ${proximoCursor}`,
      [
        section(
          `${emoji} *fix_activities* — Lote Processado\n` +
          `• Activities corrigidas: *${corrigidas}*\n` +
          `• Erros: *${erros}*\n` +
          `• Próximo cursor para continuar: \`${proximoCursor}\``
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao executar fix_activities: ${String(e)}`);
  }
}

async function handleDrainAdvise(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `🔄 <@${userId}> acionou *drain-advise* — drenando publicações...`);

  try {
    const result = await invokeFunction("advise-drain-by-date", {}) as Record<string, unknown>;
    const inseridas = result.inseridas ?? result.total ?? 0;
    const ignoradas = result.ignoradas ?? 0;

    await postSlack(
      channel,
      `✅ *drain-advise* concluído`,
      [
        section(
          `✅ *Drenagem Advise* — Concluída\n` +
          `• Publicações inseridas: *${inseridas}*\n` +
          `• Já existentes (ignoradas): *${ignoradas}*`
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao drenar Advise: ${String(e)}`);
  }
}

async function handleDatajud(channel: string, userId: string): Promise<void> {
  await postSlack(channel, `⚡ <@${userId}> acionou *datajud-worker* — processando fila...`);

  try {
    const result = await invokeFunction("datajud-worker", { batch_size: 10 }) as Record<string, unknown>;
    const processados = result.processados ?? result.total ?? 0;
    const erros = result.erros ?? 0;

    await postSlack(
      channel,
      `✅ *datajud-worker* concluído`,
      [
        section(
          `✅ *DataJud Worker* — Concluído\n` +
          `• Processos consultados: *${processados}*\n` +
          `• Erros: *${erros}*`
        ),
        context([`_Acionado por <@${userId}> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
      ]
    );
  } catch (e: unknown) {
    await postSlack(channel, `❌ Erro ao processar DataJud: ${String(e)}`);
  }
}

async function handleHelp(channel: string): Promise<void> {
  const blocks = [
    header("🤖 DotoBot — Comandos Disponíveis"),
    divider(),
    section(
      `*Painel e Status*\n` +
      `• \`/dotobot status\` — Painel completo do pipeline em tempo real\n` +
      `• \`/dotobot pendencias\` — Relatório de pendências de desenvolvimento`
    ),
    divider(),
    section(
      `*Consultas*\n` +
      `• \`/dotobot publicacoes\` — Últimas 5 publicações recebidas do Advise\n` +
      `• \`/dotobot andamentos\` — Últimos 5 andamentos do DataJud\n` +
      `• \`/dotobot audiencias\` — Próximas audiências agendadas`
    ),
    divider(),
    section(
      `*Acionamento Manual de Edge Functions*\n` +
      `• \`/dotobot fix-activities\` — Corrigir 50 activities pendentes no Freshsales\n` +
      `• \`/dotobot drain-advise\` — Drenar publicações do Advise agora\n` +
      `• \`/dotobot datajud\` — Processar fila DataJud agora\n` +
      `• \`/dotobot help\` — Esta ajuda`
    ),
    divider(),
    context([
      `_Pipeline HMADV — Hermida Maia Advocacia_`,
      `_Supabase: sspvizogbcyigquqycsz | Freshsales: hmadv-org_`,
    ]),
  ];

  await postSlack(channel, "🤖 DotoBot — Ajuda", blocks);
}

// ── Notificações Automáticas (chamadas por outras edge functions) ──────────────

async function handleNotifyPublicacao(body: Record<string, unknown>): Promise<Response> {
  const { numero_processo, data_publicacao, conteudo, account_id, activity_id } = body;

  const fsLink = account_id
    ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${account_id}|Ver no Freshsales>`
    : "_Processo não vinculado_";

  const conteudoTrunc = String(conteudo || "").substring(0, 300).replace(/\n/g, " ");
  const temNome = String(conteudo || "").toLowerCase().includes("adriano menezes hermida maia");

  const blocks = [
    header("📰 Nova Publicação Recebida"),
    section(
      `*Processo:* \`${numero_processo || "s/nº"}\`\n` +
      `*Data:* ${fmtDate(String(data_publicacao || ""))}\n` +
      `*Menção ao Dr. Adriano:* ${temNome ? "✅ Sim" : "❌ Não"}\n\n` +
      `${conteudoTrunc}...`
    ),
    section(`*Freshsales:* ${fsLink} | Activity: ${activity_id ? `✅ \`${activity_id}\`` : "⚠️ Não criada"}`),
    context([`_Recebido via Advise em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
  ];

  await postSlack(SLACK_CHANNEL, `📰 Nova publicação: ${numero_processo || "s/nº"}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleNotifyAndamento(body: Record<string, unknown>): Promise<Response> {
  const { numero_cnj, data_movimento, descricao, account_id } = body;

  const fsLink = account_id
    ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${account_id}|Ver no Freshsales>`
    : "_Processo não vinculado_";

  const blocks = [
    header("⚖️ Novo Andamento — DataJud"),
    section(
      `*Processo:* \`${numero_cnj || "s/nº"}\`\n` +
      `*Data:* ${fmtDate(String(data_movimento || ""))}\n` +
      `*Descrição:* ${String(descricao || "").substring(0, 300)}`
    ),
    section(`*Freshsales:* ${fsLink}`),
    context([`_Recebido via DataJud em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
  ];

  await postSlack(SLACK_CHANNEL, `⚖️ Novo andamento: ${numero_cnj || "s/nº"}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleNotifyAudiencia(body: Record<string, unknown>): Promise<Response> {
  const { numero_cnj, data_audiencia, tipo, descricao, local, account_id } = body;

  const fsLink = account_id
    ? `<https://hmadv-org.myfreshworks.com/crm/sales/accounts/${account_id}|Ver no Freshsales>`
    : "_Processo não vinculado_";

  const blocks = [
    header("📅 Nova Audiência Agendada"),
    section(
      `*Processo:* \`${numero_cnj || "s/nº"}\`\n` +
      `*Data:* *${fmtDate(String(data_audiencia || ""))}*\n` +
      `*Tipo:* ${String(tipo || "Audiência").toUpperCase()}\n` +
      `*Local:* ${local || "Não informado"}\n` +
      `*Descrição:* ${String(descricao || "").substring(0, 200)}`
    ),
    section(`*Freshsales:* ${fsLink}`),
    context([`_Extraída de publicação em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}_`]),
  ];

  await postSlack(SLACK_CHANNEL, `📅 Audiência em ${fmtDate(String(data_audiencia || ""))}: ${numero_cnj || "s/nº"}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

async function handleNotifyCronStatus(body: Record<string, unknown>): Promise<Response> {
  const { job, status, inseridas, erros, duracao_ms, detalhes } = body;

  const emoji = status === "ok" ? "✅" : status === "aviso" ? "⚠️" : "❌";
  const jobName = String(job || "cron");

  const blocks = [
    section(
      `${emoji} *Cron: ${jobName}*\n` +
      (inseridas !== undefined ? `• Inseridas/Processadas: *${inseridas}*\n` : "") +
      (erros !== undefined ? `• Erros: *${erros}*\n` : "") +
      (duracao_ms !== undefined ? `• Duração: ${duracao_ms}ms\n` : "") +
      (detalhes ? `• Detalhes: ${String(detalhes).substring(0, 200)}` : "")
    ),
    context([`_${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (AM)_`]),
  ];

  await postSlack(SLACK_CHANNEL, `${emoji} Cron ${jobName}`, blocks);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}

// ── Roteador Principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const contentType = req.headers.get("content-type") || "";

  // Notificações automáticas via POST JSON (chamadas por outras edge functions)
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "notify_publicacao") return handleNotifyPublicacao(body);
    if (action === "notify_andamento") return handleNotifyAndamento(body);
    if (action === "notify_audiencia") return handleNotifyAudiencia(body);
    if (action === "notify_cron_status") return handleNotifyCronStatus(body);

    // Comandos diretos via JSON (para testes)
    if (action === "status") {
      await handleStatus(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "pendencias") {
      await handlePendencias(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "publicacoes") {
      await handlePublicacoes(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "andamentos") {
      await handleAndamentos(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "audiencias") {
      await handleAudiencias(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "fix_activities") {
      await handleFixActivities(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "drain_advise") {
      await handleDrainAdvise(body.channel as string || SLACK_CHANNEL, "system");
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }
    if (action === "help") {
      await handleHelp(body.channel as string || SLACK_CHANNEL);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida", action }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Comandos Slash do Slack (application/x-www-form-urlencoded)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formText = await req.text();
    const params = new URLSearchParams(formText);
    const command = params.get("command") || "";
    const text = (params.get("text") || "").trim().toLowerCase();
    const channelId = params.get("channel_id") || SLACK_CHANNEL;
    const userId = params.get("user_id") || "unknown";
    const responseUrl = params.get("response_url") || "";

    // Resposta imediata ao Slack (obrigatório em <3s)
    const ack = new Response(
      JSON.stringify({ response_type: "ephemeral", text: `⏳ Processando \`${text || "status"}\`...` }),
      { headers: { "Content-Type": "application/json" } }
    );

    // Processar em background
    const cmd = text || "status";
    EdgeRuntime.waitUntil((async () => {
      try {
        if (cmd === "status") await handleStatus(channelId, userId);
        else if (cmd === "publicacoes") await handlePublicacoes(channelId);
        else if (cmd === "andamentos") await handleAndamentos(channelId);
        else if (cmd === "audiencias") await handleAudiencias(channelId);
        else if (cmd === "pendencias") await handlePendencias(channelId);
        else if (cmd === "fix-activities" || cmd === "fix_activities") await handleFixActivities(channelId, userId);
        else if (cmd === "drain-advise" || cmd === "drain_advise") await handleDrainAdvise(channelId, userId);
        else if (cmd === "datajud") await handleDatajud(channelId, userId);
        else await handleHelp(channelId);
      } catch (e) {
        await postSlack(channelId, `❌ Erro ao processar comando \`${cmd}\`: ${String(e)}`);
      }
    })());

    return ack;
  }

  return new Response(JSON.stringify({ ok: true, message: "DotoBot Slack — Pipeline HMADV" }), {
    headers: { "Content-Type": "application/json" },
  });
});
