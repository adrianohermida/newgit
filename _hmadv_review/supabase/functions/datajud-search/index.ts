import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseDataJudPayload } from '../_shared/datajud/adapters/registry.ts';
import type { CanonicalProcesso } from '../_shared/datajud/adapters/types.ts';

/**
 * datajud-search v34
 *
 * Mantem o comportamento atual de consulta/persistencia, e adiciona:
 *   1. parser canonico via registry de adapters
 *   2. defaultAdapter como fallback seguro
 *   3. persistencia tolerante aos campos novos do P1
 *   4. metadata de parser na resposta para auditoria operacional
 *   5. resolucao imediata de movimento_tpu_id quando o estoque local ja existir
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DATAJUD_API_KEY = Deno.env.get('DATAJUD_API_KEY')!;
const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br';

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'judiciario' },
});

const TRIBUNAL_MAP: Record<string, string> = {
  '801': 'tjac', '802': 'tjal', '803': 'tjam', '804': 'tjap', '805': 'tjba',
  '806': 'tjce', '807': 'tjdft', '808': 'tjes', '809': 'tjgo', '810': 'tjma',
  '811': 'tjmg', '812': 'tjms', '813': 'tjmt', '814': 'tjpa', '815': 'tjpb',
  '816': 'tjpe', '817': 'tjpi', '818': 'tjpr', '819': 'tjrj', '820': 'tjrn',
  '821': 'tjro', '822': 'tjrr', '823': 'tjrs', '824': 'tjsc', '825': 'tjse',
  '826': 'tjsp', '827': 'tjto',
  '401': 'trf1', '402': 'trf2', '403': 'trf3', '404': 'trf4', '405': 'trf5', '406': 'trf6',
  '501': 'trt1', '502': 'trt2', '503': 'trt3', '504': 'trt4', '505': 'trt5',
  '506': 'trt6', '507': 'trt7', '508': 'trt8', '509': 'trt9', '510': 'trt10',
  '511': 'trt11', '512': 'trt12', '513': 'trt13', '514': 'trt14', '515': 'trt15',
  '516': 'trt16', '517': 'trt17', '518': 'trt18', '519': 'trt19', '520': 'trt20',
  '521': 'trt21', '522': 'trt22', '523': 'trt23', '524': 'trt24',
  '601': 'tre-ac', '602': 'tre-al', '603': 'tre-am', '604': 'tre-ap', '605': 'tre-ba',
  '606': 'tre-ce', '607': 'tre-df', '608': 'tre-es', '609': 'tre-go', '610': 'tre-ma',
  '611': 'tre-mg', '612': 'tre-ms', '613': 'tre-mt', '614': 'tre-pa', '615': 'tre-pb',
  '616': 'tre-pe', '617': 'tre-pi', '618': 'tre-pr', '619': 'tre-rj', '620': 'tre-rn',
  '621': 'tre-ro', '622': 'tre-rr', '623': 'tre-rs', '624': 'tre-sc', '625': 'tre-se',
  '626': 'tre-sp', '627': 'tre-to',
  '913': 'tjmmg', '923': 'tjmrs', '926': 'tjmsp',
  '100': 'stf', '200': 'stj', '300': 'tst',
};

function validarChecksum(digits: string): boolean {
  if (digits.length !== 20) return false;
  const seq = digits.slice(0, 7);
  const check = digits.slice(7, 9);
  const ano = digits.slice(9, 13);
  const seg = digits.slice(13, 14);
  const trib = digits.slice(14, 16);
  const orig = digits.slice(16, 20);

  const resto = orig + ano + seg + trib + seq;
  const dv = resto.split('').reduce((acc, d, i) => acc + parseInt(d, 10) * ((i % 8) + 2), 0);
  const calculado = 11 - (dv % 11);
  const checkDigit = (calculado === 10 || calculado === 11 || calculado === 0) ? 0 : calculado;
  return check === String(checkDigit).padStart(2, '0');
}

function parseCNJ(numero: string): {
  numeroLimpo: string;
  ramo: string;
  tribunal: string;
  chave: string;
  checksumValido: boolean;
} {
  const clean = numero.replace(/\D/g, '');
  if (clean.length !== 20) throw new Error('Numero CNJ invalido (esperado 20 digitos)');
  const ramo = clean.slice(13, 14);
  const tribunal = clean.slice(14, 16);
  return {
    numeroLimpo: clean,
    ramo,
    tribunal,
    chave: ramo + tribunal,
    checksumValido: validarChecksum(clean),
  };
}

function resolveEndpoint(chave: string): string {
  const alias = TRIBUNAL_MAP[chave];
  if (!alias) throw new Error(`Tribunal nao mapeado: chave=${chave}`);
  return `${DATAJUD_BASE}/api_publica_${alias}/_search`;
}

function toGrauNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function upsertProcessoWithFallback(upsertData: Record<string, unknown>): Promise<{ id: string } | null> {
  const attempted = { ...upsertData };
  const first = await db
    .from('processos')
    .upsert(attempted, { onConflict: 'numero_cnj', ignoreDuplicates: false })
    .select('id')
    .single();

  if (!first.error) return first.data ?? null;

  if (!/parser_tribunal_schema|parser_grau|parser_sistema/i.test(first.error.message ?? '')) {
    console.error(JSON.stringify({ ev: 'processo_upsert_erro', erro: first.error.message }));
    return null;
  }

  delete attempted.parser_tribunal_schema;
  delete attempted.parser_grau;
  delete attempted.parser_sistema;

  const retry = await db
    .from('processos')
    .upsert(attempted, { onConflict: 'numero_cnj', ignoreDuplicates: false })
    .select('id')
    .single();

  if (retry.error) {
    console.error(JSON.stringify({ ev: 'processo_upsert_erro_retry', erro: retry.error.message }));
    return null;
  }

  return retry.data ?? null;
}

async function carregarMapaTpuMovimento(codigos: Array<number | null | undefined>): Promise<Map<number, string>> {
  const unicos = [...new Set(codigos.filter((codigo): codigo is number => Number.isFinite(codigo as number)))];
  if (unicos.length === 0) return new Map<number, string>();

  const { data, error } = await db
    .from('tpu_movimento')
    .select('id,codigo_cnj')
    .in('codigo_cnj', unicos);

  if (error) {
    console.error(JSON.stringify({ ev: 'tpu_lookup_erro', erro: error.message, total_codigos: unicos.length }));
    return new Map<number, string>();
  }

  return new Map<number, string>((data ?? [])
    .filter((item) => Number.isFinite(Number(item.codigo_cnj)) && item.id)
    .map((item) => [Number(item.codigo_cnj), String(item.id)]));
}

async function upsertMovimentoWithFallback(payload: Record<string, unknown>): Promise<void> {
  const attempted = { ...payload };
  const first = await db.from('movimentos').upsert(
    attempted,
    { onConflict: 'processo_id,codigo,data_movimento', ignoreDuplicates: true },
  );

  if (!first.error) return;

  if (!/tpu_status|tpu_resolvido_em/i.test(first.error.message ?? '')) {
    throw first.error;
  }

  delete attempted.tpu_status;
  delete attempted.tpu_resolvido_em;

  const retry = await db.from('movimentos').upsert(
    attempted,
    { onConflict: 'processo_id,codigo,data_movimento', ignoreDuplicates: true },
  );

  if (retry.error) throw retry.error;
}

async function persistirProcesso(hit: CanonicalProcesso, tenantId?: string): Promise<string | null> {
  const cnj = hit.numero_cnj?.replace(/\D/g, '') ?? hit.numero_processo?.replace(/\D/g, '') ?? '';
  if (!cnj) return null;

  const poloAtivo = hit.partes?.filter((p) => ['ATIVO', 'Ativo', 'ativo'].includes(String(p.tipo ?? p.polo ?? '')))
    .map((p) => p.nome).filter(Boolean).join('; ') || null;
  const poloPassivo = hit.partes?.filter((p) => ['PASSIVO', 'Passivo', 'passivo'].includes(String(p.tipo ?? p.polo ?? '')))
    .map((p) => p.nome).filter(Boolean).join('; ') || null;

  const assuntosTexto = hit.assuntos?.map((a) => a.nome).filter(Boolean).join('; ') || null;

  const upsertData: Record<string, unknown> = {
    numero_cnj: cnj,
    numero_processo: hit.numero_processo ?? cnj,
    classe: hit.classe_nome ?? null,
    classe_codigo: hit.classe_codigo ?? null,
    area: hit.area ?? null,
    assunto: assuntosTexto,
    assunto_principal: hit.assunto_principal_nome ?? null,
    orgao_julgador: hit.orgao_julgador_nome ?? null,
    orgao_julgador_codigo: hit.orgao_julgador_codigo ?? null,
    tribunal: hit.tribunal ?? null,
    grau: toGrauNumber(hit.grau),
    sistema: hit.sistema ?? null,
    sistema_codigo: null,
    polo_ativo: poloAtivo,
    polo_passivo: poloPassivo,
    data_ajuizamento: hit.data_ajuizamento ?? null,
    data_distribuicao: hit.data_distribuicao ?? null,
    data_ultima_movimentacao: hit.data_ultima_movimentacao ?? null,
    valor_causa: hit.valor_causa ?? null,
    segredo_justica: hit.segredo_justica ?? null,
    fonte_criacao: 'datajud',
    dados_incompletos: false,
    parser_tribunal_schema: hit.parser_tribunal_schema ?? null,
    parser_grau: hit.parser_grau ?? null,
    parser_sistema: hit.parser_sistema ?? null,
    updated_at: new Date().toISOString(),
  };
  if (tenantId) upsertData.tenant_id = tenantId;

  const proc = await upsertProcessoWithFallback(upsertData);
  const processoId = proc?.id;
  if (!processoId) return null;

  const mapaTpu = await carregarMapaTpuMovimento((hit.movimentos ?? []).map((mov) => mov.codigo ?? null));

  for (const mov of hit.movimentos ?? []) {
    if (!mov.codigo && !mov.descricao) continue;
    try {
      const codigoMov = typeof mov.codigo === 'number' ? mov.codigo : (mov.codigo ? Number(mov.codigo) : null);
      const movimentoTpuId = Number.isFinite(codigoMov as number) ? mapaTpu.get(Number(codigoMov)) ?? null : null;
      await upsertMovimentoWithFallback({
        processo_id: processoId,
        codigo: mov.codigo ?? null,
        descricao: mov.descricao ?? '',
        data_movimento: mov.data_movimento ?? new Date().toISOString(),
        movimento_tpu_id: movimentoTpuId,
        tpu_status: movimentoTpuId ? 'resolvido' : 'pendente',
        tpu_resolvido_em: new Date().toISOString(),
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });
    } catch {
      // nao bloqueia a persistencia do processo
    }
  }

  return processoId;
}

async function dispararEnriquecimento(processoId: string): Promise<void> {
  try {
    const tpuUrl = `${SUPABASE_URL}/functions/v1/tpu-sync?action=enriquecer_processo&processo_id=${processoId}`;
    await fetch(tpuUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // fire-and-forget
  }
}

serve(async (req) => {
  try {
    const body = await req.json();
    const numeroProcesso = body.numeroProcesso as string;
    const persistir = body.persistir !== false;
    const tenantId = body.tenantId as string | undefined;

    if (!numeroProcesso) throw new Error('numeroProcesso nao informado');
    if (!DATAJUD_API_KEY) throw new Error('DATAJUD_API_KEY nao configurada');

    const parsed = parseCNJ(numeroProcesso);
    const endpoint = resolveEndpoint(parsed.chave);
    const payload = { query: { match: { numeroProcesso: parsed.numeroLimpo } } };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${DATAJUD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const hits = (data?.hits?.hits ?? []) as Array<{ _source: Record<string, unknown> }>;

    let processoId: string | null = null;
    let parserInfo: string | null = null;

    if (persistir && hits.length > 0) {
      const canonical = parseDataJudPayload({
        numeroProcesso,
        tribunal: typeof hits[0]._source.tribunal === 'string' ? hits[0]._source.tribunal : parsed.chave,
        grau: typeof hits[0]._source.grau === 'string' ? hits[0]._source.grau : null,
        sistema: typeof hits[0]._source.sistema === 'object'
          ? String((hits[0]._source.sistema as { codigo?: number })?.codigo ?? '')
          : null,
        payload: hits[0]._source,
      });
      parserInfo = canonical.parser_tribunal_schema ?? null;
      processoId = await persistirProcesso(canonical, tenantId);
      if (processoId) void dispararEnriquecimento(processoId);
    }

    return new Response(JSON.stringify({
      endpoint,
      checksumValido: parsed.checksumValido,
      persistido: processoId !== null,
      processo_id: processoId,
      parser: parserInfo,
      resultado: data,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ erro: String(err) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
