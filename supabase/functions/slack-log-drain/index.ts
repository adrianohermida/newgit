/**
 * slack-log-drain
 * ─────────────────────────────────────────────────────────────────────────────
 * Monitora logs de erro das edge functions do Supabase e posta alertas
 * automáticos no Slack. Pode ser chamado via cron ou manualmente.
 *
 * Funciona como alternativa ao Log Drain nativo (disponível apenas no Pro+).
 * Usa a Analytics API do Supabase para buscar logs recentes de erro.
 *
 * Ações:
 *   POST { action: "check" }  → Verifica erros das últimas 10 minutos
 *   POST { action: "status" } → Retorna status sem postar no Slack
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const SLACK_NOTIFY_CHANNEL = Deno.env.get("SLACK_NOTIFY_CHANNEL") || "C09E59J77EU";
const SUPABASE_ACCESS_TOKEN = Deno.env.get("MGMT_ACCESS_TOKEN") || "";
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";

// Funções monitoradas (nome → function_id)
const MONITORED_FUNCTIONS: Record<string, string> = {
  "cida-slack": "7b25d82d-2adb-4457-8b3f-92f534f14bb4",
  "dotobot-slack": "473095cf-91ea-4c95-a271-84bcfa5fde93",
};

// Tabela de deduplicação (evitar repostar o mesmo erro)
const DEDUP_TABLE = "log_drain_seen";

async function getSeenIds(supabaseUrl: string, svcKey: string): Promise<Set<string>> {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // últimos 30min
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${DEDUP_TABLE}?created_at=gt.${cutoff}&select=log_id`,
      { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } }
    );
    if (res.ok) {
      const rows: { log_id: string }[] = await res.json();
      return new Set(rows.map(r => r.log_id));
    }
  } catch (_) {}
  return new Set();
}

async function markSeen(supabaseUrl: string, svcKey: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/${DEDUP_TABLE}`, {
      method: "POST",
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(ids.map(id => ({ log_id: id }))),
    });
  } catch (_) {}
}

async function fetchRecentErrors(functionId: string, windowMinutes = 10): Promise<any[]> {
  if (!PROJECT_REF) return [];
  const now = Date.now();
  const from = now - windowMinutes * 60 * 1000;
  const to = now;

  try {
    const query = encodeURIComponent(
      `SELECT id, timestamp, event_message, event_type, level, execution_id ` +
      `FROM edge_logs ` +
      `WHERE function_id = '${functionId}' ` +
      `AND (level = 'error' OR event_type = 'BootFailure') ` +
      `AND timestamp >= ${from * 1000} ` +
      `AND timestamp <= ${to * 1000} ` +
      `ORDER BY timestamp DESC LIMIT 20`
    );

    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all?sql=${query}`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      return data?.result || [];
    }
  } catch (e: any) {
    console.error("[log-drain] fetchRecentErrors erro:", e?.message);
  }
  return [];
}

async function postSlackAlert(errors: Array<{ funcName: string; logs: any[] }>): Promise<void> {
  if (!SLACK_BOT_TOKEN) return;

  const lines: string[] = [
    `🚨 *Log Drain — Erros detectados* (${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})`,
    "",
  ];

  for (const { funcName, logs } of errors) {
    lines.push(`*${funcName}* — ${logs.length} erro(s):`);
    for (const log of logs.slice(0, 3)) {
      const ts = new Date(log.timestamp / 1000).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const msg = String(log.event_message || "").slice(0, 120);
      const type = log.event_type === "BootFailure" ? "💥 BOOT" : "❌ ERROR";
      lines.push(`  ${type} [${ts}] \`${msg}\``);
    }
    if (logs.length > 3) lines.push(`  _...e mais ${logs.length - 3} erros_`);
    lines.push("");
  }

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: SLACK_NOTIFY_CHANNEL,
      text: lines.join("\n"),
      unfurl_links: false,
    }),
  });
}

Deno.serve(async (req: Request) => {
  const body = await req.json().catch(() => ({ action: "check" }));
  const action = String(body?.action || "check");

  if (action === "status") {
    return new Response(JSON.stringify({
      ok: true,
      project_ref: PROJECT_REF,
      monitored: Object.keys(MONITORED_FUNCTIONS),
      channel: SLACK_NOTIFY_CHANNEL,
    }), { headers: { "Content-Type": "application/json" } });
  }

  // action === "check"
  const windowMinutes = Number(body?.window_minutes || 10);
  const seenIds = await getSeenIds(SUPABASE_URL, SVC_KEY);
  const newErrors: Array<{ funcName: string; logs: any[] }> = [];
  const newIds: string[] = [];

  for (const [funcName, funcId] of Object.entries(MONITORED_FUNCTIONS)) {
    const logs = await fetchRecentErrors(funcId, windowMinutes);
    const unseen = logs.filter(l => !seenIds.has(l.id));
    if (unseen.length > 0) {
      newErrors.push({ funcName, logs: unseen });
      newIds.push(...unseen.map((l: any) => l.id));
    }
  }

  if (newErrors.length > 0) {
    await postSlackAlert(newErrors);
    await markSeen(SUPABASE_URL, SVC_KEY, newIds);
  }

  return new Response(JSON.stringify({
    ok: true,
    checked: Object.keys(MONITORED_FUNCTIONS),
    new_errors: newErrors.reduce((acc, e) => acc + e.logs.length, 0),
    alerted: newErrors.length > 0,
  }), { headers: { "Content-Type": "application/json" } });
});
