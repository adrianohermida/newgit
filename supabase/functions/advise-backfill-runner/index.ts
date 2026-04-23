// advise-backfill-runner v5
// Estratégia: processa a fila judiciario.advise_backfill_queue
// Cada semana é subdividida em dias individuais para respeitar o timeout de 50s
// O cron chama esta função a cada 5 min — cada execução processa 1 janela diária
// v5: janelas diárias, paginação incremental, notificação Slack por progresso

const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SERVICE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcHZpem9nYmN5aWdxdXF5Y3N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzc5NjE1NiwiZXhwIjoyMDgzMzcyMTU2fQ.UkxycOBwslNeY5ABRn4_QmuvTpev3IrURYWA23_rUcc';

const dbHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_JWT}`,
  'apikey': SERVICE_JWT,
};

// ── Helpers de banco ──────────────────────────────────────────────────────────
async function restGet(path: string, schema = 'judiciario') {
  const r = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    headers: { ...dbHeaders, 'Accept': 'application/json', 'Accept-Profile': schema }
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function restPatch(path: string, body: Record<string, unknown>, schema = 'judiciario') {
  const r = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...dbHeaders, 'Content-Type': 'application/json', 'Content-Profile': schema, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
}

async function callFn(fn: string, payload: Record<string, unknown>) {
  const r = await fetch(`${PROJECT_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Gerar datas entre dois pontos ─────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(start: string, end: string): number {
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const forceDate = body.data_inicio as string | undefined;

  // 1. Buscar próxima semana pendente (ou a semana forçada)
  let item: { id: number; data_inicio: string; data_fim: string } | null = null;

  if (forceDate) {
    // Modo manual: processar data específica
    const rows = await restGet(
      `advise_backfill_queue?data_inicio=eq.${forceDate}&limit=1&select=id,data_inicio,data_fim`
    ) as Array<{ id: number; data_inicio: string; data_fim: string }>;
    item = rows[0] ?? null;
  } else {
    // Modo automático: próxima semana pendente
    const rows = await restGet(
      'advise_backfill_queue?status=eq.pendente&order=data_inicio.asc&limit=1&select=id,data_inicio,data_fim'
    ) as Array<{ id: number; data_inicio: string; data_fim: string }>;
    item = rows[0] ?? null;
  }

  if (!item) {
    // Verificar se há semanas em erro para retry
    const erroRows = await restGet(
      'advise_backfill_queue?status=eq.erro&order=data_inicio.asc&limit=1&select=id,data_inicio,data_fim'
    ) as Array<{ id: number; data_inicio: string; data_fim: string }>;
    
    if (erroRows[0]) {
      item = erroRows[0];
      await restPatch(`advise_backfill_queue?id=eq.${item.id}`, { status: 'pendente', tentativas: 0 });
    } else {
      return new Response(JSON.stringify({
        status: 'completo',
        mensagem: '✅ Todas as semanas do backfill foram processadas!'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 2. Marcar como processando
  await restPatch(`advise_backfill_queue?id=eq.${item.id}`, {
    status: 'processando',
    executado_em: new Date().toISOString(),
  });

  // 3. Processar a semana dia a dia (máx 7 dias por execução)
  const totalDias = daysBetween(item.data_inicio, item.data_fim);
  let totalNovas = 0;
  let totalErros = 0;
  const diasProcessados: string[] = [];

  for (let d = 0; d < Math.min(totalDias, 7); d++) {
    const diaInicio = addDays(item.data_inicio, d);
    const diaFim = addDays(item.data_inicio, d + 1);

    try {
      // Chamar advise-sync para 1 dia com até 100 páginas
      const result = await callFn('advise-sync', {
        action: 'sync_range',
        data_inicio: diaInicio,
        data_fim: diaFim,
        max_paginas: 100,
      });

      const novas = (result.body.novas as number) ?? (result.body.novas_importadas as number) ?? 0;
      const erros = (result.body.erros as number) ?? 0;
      totalNovas += novas;
      totalErros += erros;
      diasProcessados.push(`${diaInicio}(${novas})`);
      
      console.log(`Dia ${diaInicio}: ${novas} novas, ${erros} erros`);
    } catch (e) {
      console.error(`Erro no dia ${diaInicio}: ${e}`);
      totalErros++;
    }
  }

  // 4. Atualizar status da semana
  const statusFinal = totalErros > 0 && totalNovas === 0 ? 'erro' : 'concluido';
  await restPatch(`advise_backfill_queue?id=eq.${item.id}`, {
    status: statusFinal,
    publicacoes_importadas: totalNovas,
    executado_em: new Date().toISOString(),
    erro: totalErros > 0 ? `${totalErros} erros em ${diasProcessados.length} dias` : null,
  });

  // 5. Notificar Slack
  const icon = totalNovas > 0 ? '✅' : '⚠️';
  const msg = `${icon} *Backfill Advise:* semana ${item.data_inicio} → ${item.data_fim} | ${totalNovas} publicações importadas | ${totalErros} erros | dias: ${diasProcessados.join(', ')}`;
  callFn('dotobot-slack', { action: 'notify', message: msg }).catch(() => {});

  // 6. Verificar quantas semanas restam
  const pendentes = await restGet(
    'advise_backfill_queue?status=eq.pendente&select=id'
  ) as Array<{ id: number }>;

  return new Response(JSON.stringify({
    semana: `${item.data_inicio} → ${item.data_fim}`,
    novas_importadas: totalNovas,
    erros: totalErros,
    dias_processados: diasProcessados,
    status: statusFinal,
    semanas_restantes: pendentes.length,
  }), { headers: { 'Content-Type': 'application/json' } });
});
