import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN')!;

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });

const DOMAIN_MAP: Record<string, string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};

function fsDomain(): string {
  const d = (FS_DOMAIN_RAW ?? '').trim();
  if (d.includes('myfreshworks.com')) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, '.myfreshworks.com');
}

function authHdr(): string {
  const k = (FS_API_KEY ?? '').trim()
    .replace(/^Token token=/i, '')
    .replace(/^Bearer /i, '')
    .trim();
  return `Token token=${k}`;
}

async function fsGet(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
    headers: {
      Authorization: authHdr(),
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`FS GET ${path} ${r.status} ${JSON.stringify(data)}`);
  return data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fsPut(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: authHdr(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

function cnj20toFmt(c: string): string {
  return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14, 16)}.${c.slice(16)}`;
}

type Parte = { nome: string; polo: string };

type EventoMaisRecente = {
  data: string | null;
  descricao: string | null;
  status: string | null;
};

function nomesPolo(partes: Parte[], polo: 'ativo' | 'passivo'): string {
  const nomes = partes
    .filter((p) => String(p.polo).toLowerCase() === polo)
    .map((p) => String(p.nome).trim())
    .filter(Boolean);
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes[0]} e outros`;
}

function fmtDataBr(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}

function inferirInstancia(processo: Record<string, unknown>): string | null {
  const instancia = String(processo.instancia ?? '').trim();
  if (instancia) return instancia;
  const grau = String(processo.grau ?? '').trim();
  if (grau === '1' || grau === '2' || grau === '3') return grau;
  return null;
}

function inferirNumeroJuizo(processo: Record<string, unknown>): string | null {
  const codigo = String(processo.orgao_julgador_codigo ?? '').trim();
  if (codigo) return codigo;
  const vara = String(processo.orgao_julgador ?? '').trim();
  if (!vara) return null;
  const m = vara.match(/\b(\d{1,6})\b/);
  return m?.[1] ?? null;
}

function inferirSegredoJustica(processo: Record<string, unknown>, pub: Record<string, unknown> | null): string | null {
  const raw = processo.segredo_justica;
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não';
  const txt = String(raw ?? '').trim().toLowerCase();
  if (['sim', 's', 'true', '1'].includes(txt)) return 'Sim';
  if (['não', 'nao', 'n', 'false', '0'].includes(txt)) return 'Não';
  const conteudo = String(pub?.conteudo ?? '');
  if (/segredo de justi[cç]a/i.test(conteudo)) return 'Sim';
  return null;
}

function inferirAreaProcessual(processo: Record<string, unknown>): string | null {
  const explicita = String(processo.area ?? '').trim();
  if (explicita) return explicita;

  const tribunal = String(processo.tribunal ?? '').trim().toUpperCase();
  if (tribunal.startsWith('TRT')) return 'Trabalhista';
  if (tribunal.startsWith('TRE')) return 'Eleitoral';
  if (tribunal.startsWith('TRF')) return 'Federal';
  if (tribunal.startsWith('TJM')) return 'Militar';

  const texto = `${String(processo.classe ?? '')} ${String(processo.assunto_principal ?? processo.assunto ?? '')}`.toUpperCase();
  if (/\bCRIMINAL\b|\bPENAL\b|\bCRIME\b/.test(texto)) return 'Criminal';
  if (/\bTRABALH/.test(texto)) return 'Trabalhista';
  if (/\bELEITORAL\b/.test(texto)) return 'Eleitoral';
  if (/\bMILITAR\b/.test(texto)) return 'Militar';
  if (/\bC[IÍ]VEL\b|\bCIVIL\b|\bFAZENDA\b|\bEXECUÇÃO FISCAL\b|\bFAM[IÍ]LIA\b/.test(texto)) return 'Cível';
  if (tribunal.startsWith('TJ')) return 'Cível';
  return null;
}

function inferirSistemaProcessual(processo: Record<string, unknown>): string | null {
  const explicito = String(processo.sistema ?? processo.parser_sistema ?? '').trim();
  if (explicito) return explicito;
  const texto = JSON.stringify(processo ?? {});
  if (/"saj"/i.test(texto)) return 'SAJ';
  if (/"pje"/i.test(texto)) return 'PJE';
  if (/"projudi"/i.test(texto)) return 'PROJUDI';
  if (/"eproc"/i.test(texto)) return 'EPROC';
  return null;
}

function dataDisponibilizacao(pub: Record<string, unknown> | null): string | null {
  if (!pub) return null;
  const raw = (pub.raw_payload ?? {}) as Record<string, unknown>;
  const value = raw.dataHoraMovimento ?? raw.dataDisponibilizacao ?? raw.dataDisponibilizacaoPublicacao ?? pub.data_publicacao ?? null;
  return value ? String(value) : null;
}

function inferirStatusPorPublicacao(conteudo: string | null | undefined): string | null {
  const t = String(conteudo ?? '').toUpperCase();
  if (!t) return null;
  if (/\bSUSPENS[AO]\b/.test(t) || /\bPROCESSO SUSPENSO\b/.test(t)) return 'Suspenso';
  if (/\bBAIXAD[OA]\b/.test(t) || /\bARQUIVAD[OA]\b/.test(t) || /\bEXTINT[OA]\b/.test(t)) return 'Baixado';
  if (/\bATIVO\b/.test(t) || /\bINTIME-SE\b/.test(t) || /\bVISTOS\b/.test(t) || /\bDECIS[ÃA]O\b/.test(t)) return 'Ativo';
  return null;
}

function eventoMaisRecente(
  processo: Record<string, unknown>,
  mov: Record<string, unknown> | null,
  pub: Record<string, unknown> | null,
): EventoMaisRecente {
  const movData = mov?.data_movimento ? new Date(String(mov.data_movimento)).getTime() : -1;
  const pubData = pub?.data_publicacao ? new Date(String(pub.data_publicacao)).getTime() : -1;
  const statusPub = inferirStatusPorPublicacao(pub?.conteudo ? String(pub.conteudo) : null);

  if (pubData >= movData && pubData > 0) {
    const dataBr = fmtDataBr(String(pub?.data_publicacao ?? ''));
    return {
      data: String(pub?.data_publicacao ?? ''),
      descricao: dataBr ? `Publicação disponibilizada em ${dataBr}` : 'Publicação disponibilizada',
      status: statusPub ?? (String(processo.status_atual_processo ?? '') || null),
    };
  }

  if (movData > 0) {
    return {
      data: String(mov?.data_movimento ?? ''),
      descricao: mov?.descricao ? String(mov.descricao) : null,
      status: String(processo.status_atual_processo ?? '') || statusPub,
    };
  }

  return {
    data: String(processo.data_ultima_movimentacao ?? '') || null,
    descricao: null,
    status: statusPub ?? (String(processo.status_atual_processo ?? '') || null),
  };
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts) await sleep(600 * i);
    }
  }
  throw lastError;
}

async function resolveProcesso(input: {
  processo_id?: string | null;
  numeroProcesso?: string | null;
  account_id?: string | null;
}) {
  let processo = null as Record<string, unknown> | null;
  const processoId = input.processo_id ?? null;
  const numero = (input.numeroProcesso ?? '').replace(/[^0-9]/g, '');

  if (processoId) {
    const { data } = await db.from('processos').select('*').eq('id', processoId).maybeSingle();
    processo = (data as Record<string, unknown> | null) ?? null;
  }

  if (!processo && numero.length === 20) {
    const { data } = await db.from('processos')
      .select('*')
      .or(`numero_cnj.eq.${numero},numero_processo.eq.${numero}`)
      .limit(1)
      .maybeSingle();
    processo = (data as Record<string, unknown> | null) ?? null;
  }

  if (!processo) throw new Error('processo alvo nao localizado');
  return processo;
}

async function repairAccount(processo: Record<string, unknown>, accountId: string) {
  const processoId = String(processo.id);
  if (!accountId) throw new Error('account_id_freshsales ausente no processo');

  const cnj20 = String(processo.numero_cnj ?? processo.numero_processo ?? '').replace(/[^0-9]/g, '');
  const cnjFmt = cnj20.length === 20 ? cnj20toFmt(cnj20) : String(processo.numero_processo ?? processo.numero_cnj ?? '');

  const [{ data: partes }, { data: mov }, { data: pub }] = await Promise.all([
    db.from('partes').select('nome,polo').eq('processo_id', processoId),
    db.from('movimentos')
      .select('descricao,data_movimento')
      .eq('processo_id', processoId)
      .order('data_movimento', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('publicacoes')
      .select('data_publicacao,nome_diario,conteudo,prazo_data,raw_payload')
      .eq('processo_id', processoId)
      .order('data_publicacao', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ativo = nomesPolo((partes ?? []) as Parte[], 'ativo') || String(processo.polo_ativo ?? '');
  const passivo = nomesPolo((partes ?? []) as Parte[], 'passivo') || String(processo.polo_passivo ?? '');
  const titulo = ativo && passivo ? `${cnjFmt} (${ativo} x ${passivo})` : cnjFmt;
  const eventoAtual = eventoMaisRecente(
    processo,
    mov as Record<string, unknown> | null,
    pub as Record<string, unknown> | null,
  );
  const current = await withRetry(() => fsGet(`sales_accounts/${accountId}`));
  const currentSa = (current.sales_account ?? {}) as Record<string, unknown>;
  const currentTags = Array.isArray(currentSa.tags) ? currentSa.tags.map((t) => String(t)) : [];
  const tags = Array.from(new Set([...currentTags, 'datajud']));
  const numeroJuizo = inferirNumeroJuizo(processo);
  const segredoJustica = inferirSegredoJustica(processo, pub as Record<string, unknown> | null);
  const area = inferirAreaProcessual(processo);
  const sistema = inferirSistemaProcessual(processo);

  const custom: Record<string, unknown> = { cf_processo: cnjFmt };
  const std: Record<string, unknown> = {};
  const set = (target: Record<string, unknown>, key: string, value: unknown) => {
    if (value != null && value !== '') target[key] = value;
  };

  set(std, 'website', processo.link_externo_processo);
  set(std, 'city', processo.comarca);
  set(std, 'annual_revenue', processo.valor_causa);

  set(custom, 'cf_tribunal', String(processo.tribunal ?? '').toUpperCase() || null);
  set(custom, 'cf_vara', processo.orgao_julgador);
  set(custom, 'cf_numero_do_juizo', numeroJuizo);
  set(custom, 'cf_classe', processo.classe);
  set(custom, 'cf_assunto', processo.assunto_principal ?? processo.assunto);
  set(custom, 'cf_instancia', inferirInstancia(processo));
  set(custom, 'cf_polo_ativo', ativo);
  set(custom, 'cf_parte_adversa', passivo);
  set(custom, 'cf_status', eventoAtual.status ?? processo.status_atual_processo);
  set(custom, 'cf_data_de_distribuio', processo.data_ajuizamento);
  set(custom, 'cf_data_ultimo_movimento', eventoAtual.data);
  set(custom, 'cf_descricao_ultimo_movimento', eventoAtual.descricao);
  set(custom, 'cf_area', area);
  set(custom, 'cf_sistema', sistema);
  if (segredoJustica != null) set(custom, 'cf_segredo_de_justica', segredoJustica);
  set(custom, 'cf_DJ', pub?.nome_diario ?? null);
  set(custom, 'cf_publicacao_em', pub?.data_publicacao ?? null);
  set(custom, 'cf_contedo_publicacao', pub?.conteudo ? String(pub.conteudo).slice(0, 65000) : null);
  set(custom, 'cf_prazo_fim', pub?.prazo_data ?? null);

  const payload = {
    sales_account: {
      name: titulo,
      tags,
      ...std,
      custom_field: custom,
      custom_fields: custom,
    },
  };

  const put = await withRetry(() => fsPut(`sales_accounts/${accountId}`, payload));
  const inspect = await withRetry(() => fsGet(`sales_accounts/${accountId}`));
  const sa = (inspect.sales_account ?? {}) as Record<string, unknown>;
  const cf = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string, unknown>;

  return {
    ok: put.status === 200 || put.status === 201,
    put_status: put.status,
    put_data: put.data,
    sent: { title: titulo, standard: std, custom },
    inspect: {
      name: sa.name ?? null,
      website: sa.website ?? null,
      city: sa.city ?? null,
      annual_revenue: sa.annual_revenue ?? null,
      tags: sa.tags ?? [],
      cf_processo: cf.cf_processo ?? null,
      cf_tribunal: cf.cf_tribunal ?? null,
      cf_vara: cf.cf_vara ?? null,
      cf_numero_do_juizo: cf.cf_numero_do_juizo ?? null,
      cf_classe: cf.cf_classe ?? null,
      cf_assunto: cf.cf_assunto ?? null,
      cf_polo_ativo: cf.cf_polo_ativo ?? null,
      cf_parte_adversa: cf.cf_parte_adversa ?? null,
      cf_data_de_distribuio: cf.cf_data_de_distribuio ?? null,
      cf_data_ultimo_movimento: cf.cf_data_ultimo_movimento ?? null,
      cf_descricao_ultimo_movimento: cf.cf_descricao_ultimo_movimento ?? null,
      cf_DJ: cf.cf_DJ ?? null,
      cf_publicacao_em: cf.cf_publicacao_em ?? null,
      cf_contedo_publicacao: cf.cf_contedo_publicacao ?? null,
      cf_prazo_fim: cf.cf_prazo_fim ?? null,
      cf_area: cf.cf_area ?? null,
      cf_sistema: cf.cf_sistema ?? null,
      cf_segredo_de_justica: cf.cf_segredo_de_justica ?? null,
      disponibilizacao_publicacao: dataDisponibilizacao(pub as Record<string, unknown> | null),
    },
  };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const action = String(body.action ?? url.searchParams.get('action') ?? 'repair');

    if (action === 'inspect_activity') {
      const activityId = String(body.activity_id ?? url.searchParams.get('activity_id') ?? '').trim();
      if (!activityId) {
        return new Response(JSON.stringify({ ok: false, erro: 'activity_id ausente' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const inspect = await withRetry(() => fsGet(`sales_activities/${activityId}`));
      return new Response(JSON.stringify({
        ok: true,
        action: 'inspect_activity',
        activity_id: activityId,
        inspect,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'reset_publicacao_activity') {
      const publicacaoId = String(body.publicacao_id ?? url.searchParams.get('publicacao_id') ?? '').trim();
      if (!publicacaoId) {
        return new Response(JSON.stringify({ ok: false, erro: 'publicacao_id ausente' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const { data, error } = await db.from('publicacoes')
        .update({ freshsales_activity_id: null })
        .eq('id', publicacaoId)
        .select('id,processo_id,freshsales_activity_id');
      if (error) {
        return new Response(JSON.stringify({ ok: false, erro: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        action: 'reset_publicacao_activity',
        publicacao_id: publicacaoId,
        result: data ?? [],
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── FIX ACTIVITIES: marcar activities de publicação pendentes como concluídas ──
    if (action === 'fix_activities') {
      const batchSize = Math.max(1, Math.min(Number(body.batch_size ?? url.searchParams.get('batch_size') ?? 20), 50));
      const cursor    = Number(body.cursor ?? url.searchParams.get('cursor') ?? 0);

      // Buscar publicações com activity_id registrada mas sem completed_date
      const { data: pubs } = await db.from('publicacoes')
        .select('id,freshsales_activity_id,data_publicacao,numero_processo_api')
        .not('freshsales_activity_id', 'is', null)
        .not('freshsales_activity_id', 'eq', 'LEILAO_IGNORADO')
        .order('data_publicacao', { ascending: false })
        .range(cursor, cursor + batchSize - 1);

      let corrigidas = 0;
      let erros = 0;
      const det: unknown[] = [];

      for (const pub of pubs ?? []) {
        const actId = String(pub.freshsales_activity_id ?? '');
        if (!actId || actId === 'LEILAO_IGNORADO') continue;
        const dtPub = pub.data_publicacao ? new Date(String(pub.data_publicacao)) : new Date();
        try {
          const { status } = await fsPut(`sales_activities/${actId}`, {
            sales_activity: {
              completed_date: dtPub.toISOString(),
              end_date: `${dtPub.toISOString().split('T')[0]}T18:00:00-03:00`,
            },
          });
          if (status === 200 || status === 201) {
            corrigidas++;
            det.push({ pub_id: pub.id, activity_id: actId, status: 'ok' });
          } else {
            erros++;
            det.push({ pub_id: pub.id, activity_id: actId, status: `http_${status}` });
          }
        } catch (e) {
          erros++;
          det.push({ pub_id: pub.id, activity_id: actId, status: 'erro', erro: String(e) });
        }
        await sleep(120); // rate limit: ~8 req/s
      }

      return new Response(JSON.stringify({
        ok: erros === 0,
        action: 'fix_activities',
        cursor,
        batch_size: batchSize,
        corrigidas,
        erros,
        proximo_cursor: cursor + batchSize,
        detalhes: det,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'batch') {
      const limit = Math.max(1, Math.min(Number(body.limit ?? url.searchParams.get('limit') ?? 10), 50));
      const offset = Math.max(0, Number(body.offset ?? url.searchParams.get('offset') ?? 0));

      const { data: processos } = await db.from('processos')
        .select('id,numero_cnj,numero_processo,account_id_freshsales')
        .not('account_id_freshsales', 'is', null)
        .order('updated_at', { ascending: true })
        .range(offset, offset + limit - 1);

      const results: Record<string, unknown>[] = [];
      let ok = 0;
      let erro = 0;

      for (const item of processos ?? []) {
        try {
          const processo = await resolveProcesso({ processo_id: String(item.id) });
          const result = await repairAccount(processo, String(item.account_id_freshsales ?? ''));
          results.push({
            processo_id: item.id,
            numero_cnj: item.numero_cnj ?? item.numero_processo ?? null,
            account_id: item.account_id_freshsales ?? null,
            ok: result.ok,
            city: (result.inspect as Record<string, unknown>).city ?? null,
            cf_classe: (result.inspect as Record<string, unknown>).cf_classe ?? null,
            cf_numero_do_juizo: (result.inspect as Record<string, unknown>).cf_numero_do_juizo ?? null,
          });
          if (result.ok) ok++; else erro++;
        } catch (e) {
          erro++;
          results.push({
            processo_id: item.id,
            numero_cnj: item.numero_cnj ?? item.numero_processo ?? null,
            account_id: item.account_id_freshsales ?? null,
            ok: false,
            erro: String(e),
          });
        }
      }

      // Notificar Slack sobre o resultado do batch repair
      if (ok > 0 || erro > 0) {
        const icon = erro === 0 ? '\u2705' : '\u26a0\ufe0f';
        const msg = `${icon} *Batch Repair Accounts:* ${ok} corrigidos, ${erro} erros (lote ${offset}\u2013${offset + results.length})`;
        fetch(`${SUPABASE_URL}/functions/v1/dotobot-slack`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SVC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'notify', message: msg }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({
        ok: erro === 0,
        action: 'batch',
        limit,
        offset,
        total: results.length,
        ok_count: ok,
        erro_count: erro,
        results,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const processo = await resolveProcesso({
      processo_id: String(body.processo_id ?? url.searchParams.get('processo_id') ?? '') || null,
      numeroProcesso: String(body.numeroProcesso ?? url.searchParams.get('numeroProcesso') ?? '') || null,
      account_id: String(body.account_id ?? url.searchParams.get('account_id') ?? '') || null,
    });
    const accountId = String(body.account_id ?? url.searchParams.get('account_id') ?? processo.account_id_freshsales ?? '');
    const result = await repairAccount(processo, accountId);

    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
