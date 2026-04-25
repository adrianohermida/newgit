/**
 * sync-health-monitor
 * ─────────────────────────────────────────────────────────────────────────────
 * Vigia de saneamento. Valida o estado de 100% de cobertura por entidade,
 * gera snapshots diários, envia alertas Slack quando há degradação e
 * detecta jobs travados (stuck) no orquestrador.
 *
 * Actions:
 *   snapshot  → Gera snapshot diário de saúde (chamado pelo CRON às 23:00)
 *   check     → Verifica saúde atual e retorna status sem persistir
 *   alert     → Força envio de alerta Slack com estado atual
 *   stuck     → Detecta e reseta jobs travados há mais de 30 minutos
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_WEBHOOK = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";

interface HealthRow {
  entidade: string;
  total: number;
  sincronizados: number;
  pendentes: number;
  pct_cobertura: number;
  status_saude: string;
}

const EMOJI_MAP: Record<string, string> = {
  healthy: "✅",
  warning: "⚠️",
  critical: "🔴",
  unknown: "❓",
};

async function sendSlack(blocks: unknown[], text: string): Promise<void> {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });
  } catch {
    // best-effort
  }
}

function buildHealthBlocks(health: HealthRow[], title: string): unknown[] {
  const rows = health.map((h) => {
    const emoji = EMOJI_MAP[h.status_saude] ?? "❓";
    const bar = buildProgressBar(h.pct_cobertura);
    return `${emoji} *${h.entidade}* — ${bar} ${h.pct_cobertura.toFixed(1)}% (${h.sincronizados.toLocaleString()}/${h.total.toLocaleString()}) — ${h.pendentes.toLocaleString()} pendentes`;
  });

  return [
    {
      type: "header",
      text: { type: "plain_text", text: title, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: rows.join("\n") },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}_`,
        },
      ],
    },
  ];
}

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

async function actionSnapshot(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  // Gerar snapshot de saúde
  const { data: health, error } = await supabase.rpc("orchestrator_health_snapshot");
  if (error) return { ok: false, error: error.message };

  const today = new Date().toISOString().split("T")[0];

  // Persistir snapshot
  for (const row of (health as HealthRow[])) {
    await supabase
      .from("sync_health_snapshot")
      .upsert({
        snapshot_date: today,
        entidade: row.entidade,
        total: row.total,
        sincronizados: row.sincronizados,
        pendentes: row.pendentes,
        pct_cobertura: row.pct_cobertura,
        status_saude: row.status_saude,
        detalhe: {},
      }, { onConflict: "snapshot_date,entidade" });
  }

  // Calcular saúde geral
  const totalPendentes = (health as HealthRow[]).reduce((a, b) => a + b.pendentes, 0);
  const criticals = (health as HealthRow[]).filter((h) => h.status_saude === "critical");
  const warnings = (health as HealthRow[]).filter((h) => h.status_saude === "warning");

  // Enviar alerta Slack diário
  const title = totalPendentes === 0
    ? "🎉 Saneamento Completo — 100% Sincronizado!"
    : `📊 Relatório Diário de Sincronização — ${today}`;

  const blocks = buildHealthBlocks(health as HealthRow[], title);

  // Adicionar resumo de pendências
  if (totalPendentes > 0) {
    (blocks as Array<Record<string, unknown>>).push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Total de pendências:* ${totalPendentes.toLocaleString()}`,
          criticals.length > 0 ? `🔴 *Crítico:* ${criticals.map((c) => c.entidade).join(", ")}` : null,
          warnings.length > 0 ? `⚠️ *Atenção:* ${warnings.map((w) => w.entidade).join(", ")}` : null,
        ].filter(Boolean).join("\n"),
      },
    });
  }

  await sendSlack(blocks, title);

  return {
    ok: true,
    snapshot_date: today,
    total_pendentes: totalPendentes,
    criticos: criticals.length,
    alertas: warnings.length,
    saude: health,
  };
}

async function actionCheck(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  const { data: health, error } = await supabase.rpc("orchestrator_health_snapshot");
  if (error) return { ok: false, error: error.message };

  const { data: pendencias } = await supabase.rpc("orchestrator_check_pendencias");
  const { data: jobs } = await supabase.from("vw_orchestrator_status").select("*");
  const { data: rateLimit } = await supabase.from("vw_fs_rate_limit_status").select("*").single();

  const totalPendentes = (health as HealthRow[]).reduce((a, b) => a + b.pendentes, 0);
  const pctGeral = (health as HealthRow[]).reduce((a, b) => a + b.pct_cobertura, 0) / (health as HealthRow[]).length;

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    resumo: {
      total_pendentes: totalPendentes,
      pct_cobertura_geral: pctGeral.toFixed(1),
      status_geral: totalPendentes === 0 ? "healthy" : totalPendentes < 500 ? "warning" : "critical",
    },
    saude_por_entidade: health,
    pendencias_detalhadas: pendencias,
    jobs_orquestrador: jobs,
    rate_limit: rateLimit,
  };
}

async function actionAlert(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  const { data: health } = await supabase.rpc("orchestrator_health_snapshot");
  const title = "📢 Alerta Manual — Estado de Sincronização";
  const blocks = buildHealthBlocks(health as HealthRow[], title);
  await sendSlack(blocks, title);
  return { ok: true, message: "Alerta enviado para o Slack", saude: health };
}

async function actionStuck(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  // Detectar jobs travados há mais de 30 minutos
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stuckJobs } = await supabase
    .from("sync_orchestrator")
    .select("id, entidade, acao, iniciado_em")
    .eq("status", "running")
    .lt("iniciado_em", thirtyMinAgo);

  if (!stuckJobs || stuckJobs.length === 0) {
    return { ok: true, message: "Nenhum job travado detectado", stuck_jobs: [] };
  }

  // Resetar jobs travados
  const ids = stuckJobs.map((j: { id: string }) => j.id);
  await supabase
    .from("sync_orchestrator")
    .update({ status: "idle", proximo_run: new Date().toISOString() })
    .in("id", ids);

  // Log de cada job resetado
  for (const job of stuckJobs) {
    await supabase.from("sync_orchestrator_log").insert({
      job_id: job.id,
      entidade: job.entidade,
      acao: job.acao,
      status: "reset_stuck",
      detalhe: { iniciado_em: job.iniciado_em, resetado_em: new Date().toISOString() },
    });
  }

  const msg = `⚠️ *Jobs Travados Resetados*\n${stuckJobs.map((j: { entidade: string; acao: string; iniciado_em: string }) => `• ${j.entidade}:${j.acao} (iniciado: ${j.iniciado_em})`).join("\n")}`;
  await sendSlack([{ type: "section", text: { type: "mrkdwn", text: msg } }], msg);

  return {
    ok: true,
    message: `${stuckJobs.length} job(s) travado(s) resetado(s)`,
    stuck_jobs: stuckJobs,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: Record<string, string> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action ?? "check";
  let result: Record<string, unknown>;

  try {
    switch (action) {
      case "snapshot":
        result = await actionSnapshot(supabase);
        break;
      case "check":
        result = await actionCheck(supabase);
        break;
      case "alert":
        result = await actionAlert(supabase);
        break;
      case "stuck":
        result = await actionStuck(supabase);
        break;
      default:
        result = { ok: false, error: `Ação desconhecida: ${action}` };
    }
  } catch (e) {
    result = { ok: false, error: String(e) };
  }

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    status: result.ok ? 200 : 500,
  });
});
