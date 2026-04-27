/**
 * orchestrator-engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Maestro central de sincronização. Avalia o estado de todas as filas,
 * decide quais Edge Functions precisam rodar, invoca-as com os parâmetros
 * corretos e registra a conclusão no sync_orchestrator.
 *
 * Pode ser chamado:
 *   - Via CRON (a cada 5 minutos) para execução autônoma
 *   - Via Dotobot: /dotobot orquestrador-status | orquestrador-run
 *   - Via HTTP diretamente para diagnóstico manual
 *
 * Actions:
 *   run       → Executa o ciclo completo de orquestração
 *   status    → Retorna estado atual de todos os jobs
 *   force     → Força execução de um job específico (ignora throttle)
 *   reset     → Reseta um job para idle (para reprocessamento)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_WEBHOOK = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";

// Mapeamento de job → Edge Function e parâmetros
const JOB_FUNCTION_MAP: Record<string, { fn: string; payload: (pendentes: number, batchSize: number) => Record<string, unknown> }> = {
  "processos:create_account": {
    fn: "processo-sync",
    payload: (_, bs) => ({ action: "push_freshsales", batch_size: bs }),
  },
  "publicacoes:sync_activity": {
    fn: "publicacoes-freshsales",
    payload: (_, bs) => ({ action: "sync", batch_size: bs }),
  },
  "movimentos:sync_activity": {
    fn: "datajud-andamentos-sync",
    payload: (_, bs) => ({ action: "sync_batch", batch_size: bs }),
  },
  "partes:create_contact": {
    fn: "publicacoes-partes",
    payload: (_, bs) => ({ action: "extrair_batch", batch_size: bs }),
  },
  "audiencias:sync_activity": {
    fn: "publicacoes-audiencias",
    payload: (_, bs) => ({ action: "extract_batch", batch_size: bs }),
  },
  "prazos:create_task": {
    fn: "publicacoes-prazos",
    payload: (_, bs) => ({ action: "calcular_batch", batch_size: bs }),
  },
  "datajud:fetch_movimentos": {
    fn: "datajud-worker",
    payload: (_, bs) => ({ action: "run", batch_size: bs }),
  },
  "advise:drain_publicacoes": {
    fn: "advise-drain-by-date",
    payload: (_, bs) => ({ action: "drain", batch_size: bs }),
  },
  "advise:backfill": {
    fn: "advise-backfill-runner",
    payload: (_, bs) => ({ action: "run", batch_size: bs }),
  },
};

async function invokeFunction(
  fnName: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    // Passar action e batch_size na query string (algumas funções leem de lá)
    const action = payload.action as string | undefined;
    const batchSize = payload.batch_size as number | undefined;
    let url = `${SUPABASE_URL}/functions/v1/${fnName}`;
    const params: string[] = [];
    if (action) params.push(`action=${encodeURIComponent(action)}`);
    if (batchSize !== undefined) params.push(`batch_size=${batchSize}`);
    if (params.length > 0) url += `?${params.join("&")}`;
    // Timeout de 25s para evitar que o orchestrator trave
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 200)}` };
      }
      return { ok: true, data };
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if ((fetchErr as Error).name === "AbortError") {
        // Timeout: função foi invocada mas demorou mais de 25s
        // Tratar como dispatched (não como erro crítico)
        return { ok: true, data: { dispatched: true, timeout: true } };
      }
      throw fetchErr;
    }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function notifySlack(message: string): Promise<void> {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    // Slack notification is best-effort
  }
}

async function actionRun(
  supabase: ReturnType<typeof createClient>,
  forceJob?: string
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const results: Array<Record<string, unknown>> = [];

  // 1. Obter jobs prontos para execução
  const { data: jobs, error: jobsError } = await supabase.rpc(
    "orchestrator_get_next_jobs",
    { p_max_jobs: forceJob ? 1 : 5 }
  );

  if (jobsError) {
    return { ok: false, error: jobsError.message };
  }

  if (!jobs || jobs.length === 0) {
    return {
      ok: true,
      message: "Nenhum job pronto para execução (rate limit ou throttle ativo)",
      jobs_executados: 0,
    };
  }

  // 2. Filtrar por job específico se force
  const jobsToRun = forceJob
    ? jobs.filter((j: { entidade: string; acao: string }) => `${j.entidade}:${j.acao}` === forceJob)
    : jobs;

  // 3. Executar cada job
  for (const job of jobsToRun) {
    const jobKey = `${job.entidade}:${job.acao}`;
    const fnConfig = JOB_FUNCTION_MAP[jobKey];

    if (!fnConfig) {
      results.push({ job: jobKey, status: "skip", reason: "sem mapeamento de função" });
      continue;
    }

    // Marcar como running
    const { data: jobId } = await supabase.rpc("orchestrator_mark_running", {
      p_entidade: job.entidade,
      p_acao: job.acao,
      p_pendentes: job.pendentes,
    });

    // Invocar a Edge Function
    const payload = fnConfig.payload(job.pendentes, job.batch_size);
    const result = await invokeFunction(fnConfig.fn, payload);

    // Extrair métricas do resultado (suporte a múltiplos campos de resposta)
    const data = result.data as Record<string, number> ?? {};
    const processados = data?.processados ?? data?.sucesso ?? data?.total ?? 0;
    const erros = data?.erros ?? data?.erro ?? 0;

    // Registrar conclusão
    await supabase.rpc("orchestrator_mark_done", {
      p_job_id: jobId,
      p_processados: processados,
      p_erros: erros,
      p_detalhe: {
        fn_name: fnConfig.fn,
        payload,
        result: result.ok ? "ok" : "error",
        error: result.error ?? null,
        duracao_ms: Date.now() - startTime,
      },
    });

    results.push({
      job: jobKey,
      fn: fnConfig.fn,
      status: result.ok ? "ok" : "error",
      pendentes: job.pendentes,
      processados,
      erros,
      error: result.error ?? null,
    });
  }

  // 4. Notificar Slack se algum job completou o ciclo diário
  const ciclosCompletos = results.filter((r) => r.status === "ok" && r.pendentes === 0);
  if (ciclosCompletos.length > 0) {
    const msg = ciclosCompletos
      .map((r) => `✅ *${r.job}* — ciclo diário concluído (0 pendentes)`)
      .join("\n");
    await notifySlack(`🎯 *Orquestrador — Ciclos Completos*\n${msg}`);
  }

  return {
    ok: true,
    jobs_executados: results.length,
    duracao_ms: Date.now() - startTime,
    resultados: results,
  };
}

async function actionStatus(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, unknown>> {
  const { data: jobs } = await supabase
    .from("vw_orchestrator_status")
    .select("*");

  const { data: pendencias } = await supabase.rpc("orchestrator_check_pendencias");

  const { data: rateLimit } = await supabase
    .from("vw_fs_rate_limit_status")
    .select("*")
    .single();

  // Snapshot de saúde
  const { data: health } = await supabase.rpc("orchestrator_health_snapshot");

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    rate_limit: rateLimit,
    jobs: jobs ?? [],
    pendencias: pendencias ?? [],
    saude: health ?? [],
  };
}

async function actionForce(
  supabase: ReturnType<typeof createClient>,
  entidade: string,
  acao: string
): Promise<Record<string, unknown>> {
  // Reset throttle para forçar execução imediata
  await supabase
    .from("sync_orchestrator")
    .update({ status: "idle", proximo_run: new Date().toISOString() })
    .eq("entidade", entidade)
    .eq("acao", acao);

  return actionRun(supabase, `${entidade}:${acao}`);
}

async function actionReset(
  supabase: ReturnType<typeof createClient>,
  entidade: string,
  acao: string
): Promise<Record<string, unknown>> {
  const { error } = await supabase
    .from("sync_orchestrator")
    .update({
      status: "idle",
      proximo_run: new Date().toISOString(),
      processados: 0,
      erros: 0,
      ciclo_diario_ok: false,
    })
    .eq("entidade", entidade)
    .eq("acao", acao);

  return {
    ok: !error,
    message: error ? error.message : `Job ${entidade}:${acao} resetado para idle`,
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

  const action = body.action ?? "run";
  let result: Record<string, unknown>;

  try {
    switch (action) {
      case "run":
        result = await actionRun(supabase);
        break;
      case "status":
        result = await actionStatus(supabase);
        break;
      case "force":
        result = await actionForce(supabase, body.entidade ?? "", body.acao ?? "");
        break;
      case "reset":
        result = await actionReset(supabase, body.entidade ?? "", body.acao ?? "");
        break;
      case "debug":
        result = {
          ok: true,
          supabase_url: SUPABASE_URL,
          service_key_prefix: SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY.substring(0, 30) + "..." : "UNDEFINED",
          anon_key_prefix: Deno.env.get("SUPABASE_ANON_KEY") ? Deno.env.get("SUPABASE_ANON_KEY")!.substring(0, 30) + "..." : "UNDEFINED",
          all_env_keys: Object.keys(Deno.env.toObject()).filter(k => k.includes("SUPABASE") || k.includes("JWT")),
          test_url: `${SUPABASE_URL}/functions/v1/publicacoes-freshsales`,
        };
        break;
      case "debug":
        result = {
          ok: true,
          supabase_url: SUPABASE_URL,
          service_key_prefix: SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY.substring(0, 30) + "..." : "UNDEFINED",
          anon_key_prefix: Deno.env.get("SUPABASE_ANON_KEY") ? Deno.env.get("SUPABASE_ANON_KEY")!.substring(0, 30) + "..." : "UNDEFINED",
          all_env_keys: Object.keys(Deno.env.toObject()).filter(k => k.includes("SUPABASE") || k.includes("JWT")),
          test_url: `${SUPABASE_URL}/functions/v1/publicacoes-freshsales`,
        };
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
