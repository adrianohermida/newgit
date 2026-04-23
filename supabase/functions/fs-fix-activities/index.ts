import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_BASE = 'https://hmadv-org.myfreshworks.com/crm/sales/api';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SVC_KEY, {
  db: { schema: 'judiciario' }
});

async function fsPut(path: string, body: unknown): Promise<{status:number}> {
  const r = await fetch(`${FS_BASE}/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Token token=${FS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: r.status };
}

Deno.serve(async (req: Request) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const batchSize = Number(body.batchSize ?? 50);
  const offset = Number(body.offset ?? 0);

  // Buscar publicações com activity_id para marcar como concluídas
  const { data: pubs } = await db.from('publicacoes')
    .select('id, freshsales_activity_id, data_publicacao')
    .not('freshsales_activity_id', 'is', null)
    .not('freshsales_activity_id', 'eq', 'LEILAO_IGNORADO')
    .order('data_publicacao', { ascending: false })
    .range(offset, offset + batchSize - 1);

  if (!pubs?.length) {
    return new Response(JSON.stringify({ ok: true, processados: 0, msg: 'Nenhuma activity para corrigir' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let ok = 0, erro = 0;
  for (const pub of pubs) {
    const actId = String(pub.freshsales_activity_id);
    const dtPub = pub.data_publicacao ? new Date(String(pub.data_publicacao)) : new Date();
    
    try {
      const { status } = await fsPut(`sales_activities/${actId}`, {
        sales_activity: {
          completed_date: dtPub.toISOString(),
          end_date: dtPub.toISOString(),
        }
      });
      if (status === 200 || status === 201) ok++;
      else erro++;
    } catch {
      erro++;
    }
  }

  // Notificar Slack apenas quando há progresso significativo (a cada 500 activities)
  const totalOffset = offset + ok;
  if (ok > 0 && (totalOffset % 500 < batchSize || ok === pubs.length)) {
    const icon = erro === 0 ? '\u2705' : '\u26a0\ufe0f';
    const msg = `${icon} *Fix Activities:* ${ok} marcadas conclu\u00eddas, ${erro} erros (offset ${offset}\u2013${offset + pubs.length})`;
    fetch(`${SUPABASE_URL}/functions/v1/dotobot-slack`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'notify', message: msg }),
    }).catch(() => {});
  }
  return new Response(JSON.stringify({
    ok: true,
    processados: pubs.length,
    marcadas_concluidas: ok,
    erros: erro,
    proximo_offset: offset + batchSize,
  }), { headers: { 'Content-Type': 'application/json' } });
});
