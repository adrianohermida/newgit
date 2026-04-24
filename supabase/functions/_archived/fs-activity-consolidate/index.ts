// fs-activity-consolidate v3
const FS_DOMAIN = (Deno.env.get('FRESHSALES_DOMAIN') ?? 'hmadv-org.myfreshworks.com')
  .replace(/\.freshsales\.io$/, '.myfreshworks.com');
const FS_API_KEY = (Deno.env.get('FRESHSALES_API_KEY') ?? '').trim()
  .replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
const BASE = `https://${FS_DOMAIN}/crm/sales/api`;
const hdr = () => ({
  'Authorization': `Token token=${FS_API_KEY}`,
  'Content-Type': 'application/json',
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fsGet(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: hdr(), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`FS GET ${path} => ${r.status}: ${await r.text()}`);
  return r.json();
}
async function fsPut(path: string, body: unknown) {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'PUT', headers: hdr(), body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const txt = await r.text();
  return { status: r.status, ok: r.ok, body: txt.slice(0, 500) };
}
async function fsDelete(path: string) {
  const r = await fetch(`${BASE}/${path}`, { method: 'DELETE', headers: hdr(), signal: AbortSignal.timeout(15000) });
  const txt = await r.text();
  return { status: r.status, ok: r.ok, body: txt.slice(0, 200) };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'diagnose';

  try {
    // ── DIAGNOSE: lista todos os tipos + contagem real ──────────────────────
    if (action === 'diagnose') {
      const typesData = await fsGet('selector/sales_activity_types') as Record<string,unknown>;
      const types = (typesData.sales_activity_types ?? []) as Array<Record<string,unknown>>;

      const analysis: Array<Record<string,unknown>> = [];
      for (const t of types) {
        try {
          const res = await fsGet(`sales_activities?sales_activity_type_id=${t.id}&per_page=1`) as Record<string,unknown>;
          const meta = res.meta as Record<string,unknown> ?? {};
          const items = (res.sales_activities ?? []) as Array<Record<string,unknown>>;
          analysis.push({
            id: t.id,
            name: t.name,
            is_default: t.is_default,
            total: Number(meta.total_count ?? items.length),
          });
        } catch(e) {
          analysis.push({ id: t.id, name: t.name, is_default: t.is_default, error: String(e) });
        }
        await sleep(120);
      }
      // Ordenar por total desc
      analysis.sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0));
      return new Response(JSON.stringify({ types: analysis, domain: FS_DOMAIN, api_key_ok: FS_API_KEY.length > 5 }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── GET_ACTIVITY: inspeciona uma activity específica ────────────────────
    if (action === 'get_activity') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'id obrigatório' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const data = await fsGet(`sales_activities/${id}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── LIST_ACTIVITIES: lista activities de um tipo ────────────────────────
    if (action === 'list_activities') {
      const typeId = url.searchParams.get('type_id');
      if (!typeId) return new Response(JSON.stringify({ error: 'type_id obrigatório' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const page = url.searchParams.get('page') ?? '1';
      const data = await fsGet(`sales_activities?sales_activity_type_id=${typeId}&page=${page}&per_page=50`);
      return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── CONSOLIDATE: migra activities de um tipo para outro ─────────────────
    if (action === 'consolidate') {
      const body = await req.json() as Record<string,unknown>;
      const keepId = String(body.keep_type_id ?? '');
      const removeId = String(body.remove_type_id ?? '');
      const dryRun = body.dry_run !== false;
      if (!keepId || !removeId) return new Response(JSON.stringify({ error: 'keep_type_id e remove_type_id obrigatórios' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      let page = 1;
      const toMigrate: Array<Record<string,unknown>> = [];
      while (true) {
        const data = await fsGet(`sales_activities?sales_activity_type_id=${removeId}&page=${page}&per_page=100`) as Record<string,unknown>;
        const items = (data.sales_activities ?? []) as Array<Record<string,unknown>>;
        toMigrate.push(...items);
        const meta = data.meta as Record<string,unknown> ?? {};
        if (!meta.total_pages || page >= Number(meta.total_pages)) break;
        page++;
        if (page > 100) break;
      }

      if (dryRun) {
        return new Response(JSON.stringify({
          dry_run: true,
          activities_to_migrate: toMigrate.length,
          from_type_id: removeId,
          to_type_id: keepId,
          sample: toMigrate.slice(0, 5).map(a => ({
            id: a.id, title: a.title,
            notes: String(a.notes ?? '').slice(0, 120),
            created_at: a.created_at,
          })),
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
      }

      const results = { migrated: 0, errors: 0, details: [] as unknown[] };
      for (const act of toMigrate) {
        const r = await fsPut(`sales_activities/${act.id}`, {
          sales_activity: { sales_activity_type_id: Number(keepId) }
        });
        if (r.ok) results.migrated++;
        else { results.errors++; results.details.push({ id: act.id, error: r.body }); }
        await sleep(250);
      }
      return new Response(JSON.stringify({
        dry_run: false, migrated: results.migrated, errors: results.errors,
        error_details: results.details.slice(0, 10),
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── DELETE_TYPE: remove o tipo deprecado ────────────────────────────────
    if (action === 'delete_type') {
      const body = await req.json() as Record<string,unknown>;
      const typeId = String(body.type_id ?? '');
      if (!typeId) return new Response(JSON.stringify({ error: 'type_id obrigatório' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const r = await fsDelete(`sales_activity_types/${typeId}`);
      return new Response(JSON.stringify({ type_id: typeId, ...r }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
