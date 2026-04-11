import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
<<<<<<< HEAD
const TPU_GATEWAY_BASE = 'https://gateway.cloud.pje.jus.br/tpu/api/v1/publico/consulta/detalhada';
=======
>>>>>>> codex/hmadv-tpu-fase53

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'judiciario' },
});

type JsonMap = Record<string, unknown>;

function log(level: 'info' | 'warn' | 'error', message: string, extra: JsonMap = {}) {
  console[level](JSON.stringify({ ts: new Date().toISOString(), msg: message, ...extra }));
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

<<<<<<< HEAD
function flagToBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().toUpperCase();
  if (text === 'S' || text === 'Y' || text === 'TRUE') return true;
  if (text === 'N' || text === 'FALSE') return false;
  return null;
}

function deriveBusinessSignals(nome: unknown, glossario: unknown, complementos: unknown) {
  const haystack = [
    String(nome ?? ''),
    String(glossario ?? ''),
    JSON.stringify(complementos ?? []),
  ].join(' ').toLowerCase();

  return {
    audiencia: haystack.includes('audi') || haystack.includes('sessao de julgamento'),
    publicacao: haystack.includes('publica'),
    conclusao: haystack.includes('conclus'),
    remessa: haystack.includes('remessa'),
    decisao: haystack.includes('decis'),
    despacho: haystack.includes('despach'),
    relevante_freshsales:
      haystack.includes('publica') ||
      haystack.includes('audi') ||
      haystack.includes('decis') ||
      haystack.includes('despach') ||
      haystack.includes('conclus') ||
      haystack.includes('remessa'),
  };
}

=======
>>>>>>> codex/hmadv-tpu-fase53
async function countRows(
  table: string,
  query: (builder: any) => any,
): Promise<number> {
  const builder = query(db.from(table).select('*', { count: 'exact', head: true }));
  const { count, error } = await builder;
  if (error) {
    log('warn', 'count_rows_error', { table, error: error.message });
    return 0;
  }
  return Number(count ?? 0);
}

async function safeSelect<T = any>(
  table: string,
  query: (builder: any) => any,
): Promise<T[]> {
  const builder = query(db.from(table).select('*'));
  const { data, error } = await builder;
  if (error) {
    log('warn', 'safe_select_error', { table, error: error.message });
    return [];
  }
  return (data ?? []) as T[];
}

async function findTpuMovimentoByCodigo(codigoCnj: number) {
  const { data, error } = await db
    .from('tpu_movimento')
<<<<<<< HEAD
    .select('id,codigo_cnj,nome,descricao,tipo,gera_prazo,glossario,visibilidade_externa,flg_eletronico,monocratico,colegiado,presidente_vice,movimento_template,complementos_detalhados,gateway_synced_at')
=======
    .select('id,codigo_cnj,nome,descricao,tipo,gera_prazo')
>>>>>>> codex/hmadv-tpu-fase53
    .eq('codigo_cnj', codigoCnj)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro consultando tpu_movimento codigo=${codigoCnj}: ${error.message}`);
  }

  return data ?? null;
}

<<<<<<< HEAD
async function fetchGatewayDetailed(kind: 'movimentos' | 'classes' | 'assuntos' | 'documentos', codigoCnj: number) {
  const url = `${TPU_GATEWAY_BASE}/${kind}?codigo=${codigoCnj}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`gateway_fetch_failed:${kind}:${codigoCnj}:${res.status}:${await res.text()}`);
  }
  return await res.json();
}

function normalizeGatewayItem(payload: any) {
  if (Array.isArray(payload)) return payload[0] ?? null;
  if (payload && Array.isArray(payload.data)) return payload.data[0] ?? null;
  return payload ?? null;
}

async function upsertGatewayMovimento(payload: any) {
  payload = normalizeGatewayItem(payload);
  if (!payload) throw new Error('gateway_payload_empty:movimento');
  const row = {
    codigo_cnj: toNumber(payload.id ?? payload.cod_item),
    codigo_pai_cnj: toNumber(payload.cod_item_pai),
    nome: payload.nome ?? payload.movimento ?? null,
    descricao: payload.descricao_glossario ?? payload.glossario ?? null,
    glossario: payload.glossario ?? null,
    ativa: String(payload.situacao ?? 'A').toUpperCase() !== 'I',
    versao_cnj: null,
    visibilidade_externa: flagToBool(payload.visibilidadeExterna),
    flg_eletronico: flagToBool(payload.flgEletronico),
    monocratico: flagToBool(payload.monocratico),
    colegiado: flagToBool(payload.colegiado),
    presidente_vice: flagToBool(payload.presidenteVice),
    sigiloso: flagToBool(payload.sigiloso),
    dispositivo_legal: payload.dispositivoLegal ?? null,
    artigo: payload.artigo ?? null,
    movimento_template: payload.movimento ?? null,
    complementos_detalhados: payload.complementos ?? [],
    gateway_payload: payload,
    gateway_synced_at: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    importado_em: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('tpu_movimento')
    .upsert(row, { onConflict: 'codigo_cnj' })
    .select('id,codigo_cnj,nome,glossario,visibilidade_externa,flg_eletronico,monocratico,colegiado,presidente_vice,movimento_template,complementos_detalhados,gateway_synced_at')
    .maybeSingle();

  if (error) {
    throw new Error(`gateway_upsert_movimento_failed:${error.message}`);
  }
  if (data?.id && row.codigo_cnj) {
    await resolverMovimentosPendentesPorCodigo(row.codigo_cnj, String(data.id));
  }
  return data;
}

async function upsertGatewayClasse(payload: any) {
  payload = normalizeGatewayItem(payload);
  if (!payload) throw new Error('gateway_payload_empty:classe');
  const row = {
    codigo_cnj: toNumber(payload.cod_item),
    codigo_pai_cnj: toNumber(payload.cod_item_pai),
    nome: payload.nome ?? null,
    descricao: payload.descricao_glossario ?? null,
    glossario: payload.descricao_glossario ?? null,
    sigla: payload.sigla ?? null,
    ativa: String(payload.situacao ?? 'A').toUpperCase() !== 'I',
    sigiloso: flagToBool(payload.sigiloso),
    dispositivo_legal: payload.norma ?? null,
    artigo: payload.artigo ?? null,
    versao_cnj: null,
    gateway_payload: payload,
    gateway_synced_at: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    importado_em: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('tpu_classe')
    .upsert(row, { onConflict: 'codigo_cnj' })
    .select('id,codigo_cnj,nome,gateway_synced_at')
    .maybeSingle();

  if (error) throw new Error(`gateway_upsert_classe_failed:${error.message}`);
  return data;
}

async function upsertGatewayAssunto(payload: any) {
  payload = normalizeGatewayItem(payload);
  if (!payload) throw new Error('gateway_payload_empty:assunto');
  const row = {
    codigo_cnj: toNumber(payload.cod_item),
    nome: payload.nome ?? null,
    descricao: payload.descricao_glossario ?? null,
    glossario: payload.descricao_glossario ?? null,
    ativa: String(payload.situacao ?? 'A').toUpperCase() !== 'I',
    sigiloso: flagToBool(payload.sigiloso),
    versao_cnj: null,
    codigo_pai_cnj: toNumber(payload.cod_item_pai),
    gateway_payload: payload,
    gateway_synced_at: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    importado_em: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('tpu_assunto')
    .upsert(row, { onConflict: 'codigo_cnj' })
    .select('id,codigo_cnj,nome,gateway_synced_at')
    .maybeSingle();

  if (error) throw new Error(`gateway_upsert_assunto_failed:${error.message}`);
  return data;
}

async function upsertGatewayDocumento(payload: any) {
  payload = normalizeGatewayItem(payload);
  if (!payload) throw new Error('gateway_payload_empty:documento');
  const row = {
    codigo_cnj: toNumber(payload.cod_item),
    nome: payload.nome ?? null,
    descricao: payload.descricao_documento ?? payload.descricao_glossario ?? null,
    glossario: payload.descricao_glossario ?? null,
    ativa: String(payload.situacao ?? 'A').toUpperCase() !== 'I',
    versao_cnj: null,
    codigo_pai_cnj: toNumber(payload.cod_item_pai),
    gateway_payload: payload,
    gateway_synced_at: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    importado_em: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('tpu_documento')
    .upsert(row, { onConflict: 'codigo_cnj' })
    .select('id,codigo_cnj,nome,gateway_synced_at')
    .maybeSingle();

  if (error) throw new Error(`gateway_upsert_documento_failed:${error.message}`);
  return data;
}

async function resolverMovimentoDetalhado(codigoCnj: number) {
  const rawPayload = await fetchGatewayDetailed('movimentos', codigoCnj);
  const payload = normalizeGatewayItem(rawPayload);
  if (!payload) throw new Error('gateway_payload_empty:resolver_movimento_detalhado');
  const saved = await upsertGatewayMovimento(payload);
  await registrarLogSync({
    fonte: 'gateway_tpu',
    tipo_tpu: 'movimento',
    total_registros: 1,
    atualizados: 1,
    status: 'ok',
  });
  return {
    ok: true,
    codigo_cnj: codigoCnj,
    fonte: 'gateway_tpu',
    saved,
    complementos: payload.complementos ?? [],
    signals: deriveBusinessSignals(payload.nome, payload.glossario, payload.complementos ?? []),
  };
}

async function syncGatewayEntity(kind: 'movimentos' | 'classes' | 'assuntos' | 'documentos', codigoCnj: number) {
  const payload = await fetchGatewayDetailed(kind, codigoCnj);
  let saved: unknown;
  if (kind === 'movimentos') saved = await upsertGatewayMovimento(payload);
  if (kind === 'classes') saved = await upsertGatewayClasse(payload);
  if (kind === 'assuntos') saved = await upsertGatewayAssunto(payload);
  if (kind === 'documentos') saved = await upsertGatewayDocumento(payload);

  await registrarLogSync({
    fonte: 'gateway_tpu',
    tipo_tpu: kind.slice(0, -1),
    total_registros: 1,
    atualizados: 1,
    status: 'ok',
  });

  return {
    ok: true,
    kind,
    codigo_cnj: codigoCnj,
    fonte: 'gateway_tpu',
    saved,
  };
}

async function syncGatewayMovimentos(limite: number, codigoCnj?: number | null) {
  if (codigoCnj) {
    return syncGatewayEntity('movimentos', codigoCnj);
  }
  const { data, error } = await db
    .from('movimentos')
    .select('codigo')
    .is('movimento_tpu_id', null)
    .not('codigo', 'is', null)
    .limit(limite);
  if (error) throw new Error(`sync_gateway_movimentos_load_failed:${error.message}`);

  const codigos = [...new Set((data ?? []).map((row: any) => toNumber(row.codigo)).filter(Boolean))] as number[];
  const results: unknown[] = [];
  for (const codigo of codigos) {
    try {
      results.push(await syncGatewayEntity('movimentos', codigo));
    } catch (e) {
      results.push({ ok: false, codigo_cnj: codigo, error: String(e) });
    }
  }
  return { ok: true, total: codigos.length, results };
}

=======
>>>>>>> codex/hmadv-tpu-fase53
async function findComplementosByCodigo(codigoCnj: number) {
  const complementosMov = await safeSelect('tpu_complemento_movimento', (q) =>
    q.eq('cod_movimento', codigoCnj)
      .order('seq_compl_mov', { ascending: true })
  );
  const procedimentos = await safeSelect('tpu_procedimento_complemento', (q) =>
    q.eq('cod_movimento', codigoCnj)
      .order('seq_procedimento_complemento', { ascending: true })
  );

  const seqComplementos = [...new Set(complementosMov.map((row: any) => toNumber(row.seq_complemento)).filter(Boolean))] as number[];
  const seqTipos = [...new Set(procedimentos.map((row: any) => toNumber(row.seq_tipo_complemento)).filter(Boolean))] as number[];

  const complementos = seqComplementos.length
    ? await safeSelect('tpu_complemento', (q) => q.in('seq_complemento', seqComplementos))
    : [];
  const tiposFromComplemento = complementos.map((row: any) => toNumber(row.seq_tipo_complemento)).filter(Boolean) as number[];
  const tipos = [...new Set([...seqTipos, ...tiposFromComplemento])] as number[];
  const tiposComplemento = tipos.length
    ? await safeSelect('tpu_tipo_complemento', (q) => q.in('seq_tipo_complemento', tipos))
    : [];
  const tabelados = seqComplementos.length
    ? await safeSelect('tpu_complemento_tabelado', (q) => q.in('seq_complemento', seqComplementos))
    : [];

  const complementosPorSeq = new Map<number, any>();
  for (const row of complementos) {
    const seq = toNumber((row as any).seq_complemento);
    if (seq) complementosPorSeq.set(seq, row);
  }

  const tiposPorSeq = new Map<number, any>();
  for (const row of tiposComplemento) {
    const seq = toNumber((row as any).seq_tipo_complemento);
    if (seq) tiposPorSeq.set(seq, row);
  }

  const tabeladosPorComplemento = new Map<number, string[]>();
  for (const row of tabelados) {
    const seq = toNumber((row as any).seq_complemento);
    if (!seq) continue;
    const current = tabeladosPorComplemento.get(seq) ?? [];
    current.push(String((row as any).valor_tabelado ?? ''));
    tabeladosPorComplemento.set(seq, current);
  }

  return {
    complemento_movimento: complementosMov.map((row: any) => {
      const seq = toNumber(row.seq_complemento);
      const complemento = seq ? complementosPorSeq.get(seq) : null;
      const tipoSeq = toNumber(complemento?.seq_tipo_complemento);
      const tipo = tipoSeq ? tiposPorSeq.get(tipoSeq) : null;
      return {
        seq_compl_mov: toNumber(row.seq_compl_mov),
        seq_complemento: seq,
        cod_movimento: toNumber(row.cod_movimento),
        data_inclusao: row.data_inclusao ?? null,
        usuario_inclusao: row.usuario_inclusao ?? null,
        complemento: complemento ? {
          descricao: complemento.descricao ?? null,
          observacao: complemento.observacao ?? null,
        } : null,
        tipo_complemento: tipo ? {
          descricao: tipo.descricao ?? null,
          observacao: tipo.observacao ?? null,
        } : null,
        valores_tabelados: seq ? (tabeladosPorComplemento.get(seq) ?? []) : [],
      };
    }),
    procedimento_complementos: procedimentos.map((row: any) => {
      const seqTipo = toNumber(row.seq_tipo_complemento);
      const tipo = seqTipo ? tiposPorSeq.get(seqTipo) : null;
      return {
        seq_procedimento_complemento: toNumber(row.seq_procedimento_complemento),
        seq_tipo_complemento: seqTipo,
        valor: row.valor ?? null,
        data_inclusao: row.data_inclusao ?? null,
        usuario_inclusao: row.usuario_inclusao ?? null,
        tipo_complemento: tipo ? {
          descricao: tipo.descricao ?? null,
          observacao: tipo.observacao ?? null,
        } : null,
      };
    }),
  };
}

async function marcarMovimento(
  movimentoId: string,
  patch: {
    movimento_tpu_id?: string | null;
    tpu_status: string;
    tpu_resolvido_em?: string | null;
  },
) {
  const { error } = await db
    .from('movimentos')
    .update(patch)
    .eq('id', movimentoId);

  if (error) {
    throw new Error(`Erro atualizando movimento ${movimentoId}: ${error.message}`);
  }
}

<<<<<<< HEAD
async function resolverMovimentosPendentesPorCodigo(codigoCnj: number, movimentoTpuId: string) {
  const { error } = await db
    .from('movimentos')
    .update({
      movimento_tpu_id: movimentoTpuId,
      tpu_status: 'resolvido',
      tpu_resolvido_em: new Date().toISOString(),
    })
    .eq('codigo', codigoCnj)
    .is('movimento_tpu_id', null);

  if (error) {
    log('warn', 'resolver_movimentos_pendentes_por_codigo_error', {
      codigo_cnj: codigoCnj,
      movimento_tpu_id: movimentoTpuId,
      error: error.message,
    });
  }
}

=======
>>>>>>> codex/hmadv-tpu-fase53
async function registrarLogSync(entry: {
  fonte: string;
  tipo_tpu: string;
  versao_cnj?: number | null;
  total_registros?: number;
  inseridos?: number;
  atualizados?: number;
  erros?: number;
  status: string;
  erro?: string | null;
}) {
  const { error } = await db.from('tpu_sync_log').insert({
    fonte: entry.fonte,
    tipo_tpu: entry.tipo_tpu,
    versao_cnj: entry.versao_cnj ?? null,
    total_registros: entry.total_registros ?? 0,
    inseridos: entry.inseridos ?? 0,
    atualizados: entry.atualizados ?? 0,
    erros: entry.erros ?? 0,
    status: entry.status,
    erro: entry.erro ?? null,
    iniciado_em: new Date().toISOString(),
    concluido_em: new Date().toISOString(),
  });

  if (error) {
    log('warn', 'tpu_sync_log_error', { error: error.message, entry });
  }
}

async function status() {
  const [movimentosPendentes, movimentosResolvidos, tpuMovimentos, tpuClasses, tpuAssuntos, tpuDocumentos, tpuTiposComplemento, tpuComplementos, tpuComplementoMovimento, tpuProcedimentoComplemento, tpuTemporariedade] = await Promise.all([
    countRows('movimentos', (q) => q.is('movimento_tpu_id', null).not('codigo', 'is', null)),
    countRows('movimentos', (q) => q.not('movimento_tpu_id', 'is', null)),
    countRows('tpu_movimento', (q) => q),
    countRows('tpu_classe', (q) => q),
    countRows('tpu_assunto', (q) => q),
    countRows('tpu_documento', (q) => q),
    countRows('tpu_tipo_complemento', (q) => q),
    countRows('tpu_complemento', (q) => q),
    countRows('tpu_complemento_movimento', (q) => q),
    countRows('tpu_procedimento_complemento', (q) => q),
    countRows('tpu_temporariedade', (q) => q),
  ]);

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    tpu: {
      movimentos: tpuMovimentos,
      classes: tpuClasses,
      assuntos: tpuAssuntos,
      documentos: tpuDocumentos,
      tipos_complemento: tpuTiposComplemento,
      complementos: tpuComplementos,
      complemento_movimento: tpuComplementoMovimento,
      procedimento_complemento: tpuProcedimentoComplemento,
      temporariedade: tpuTemporariedade,
    },
    backlog: {
      movimentos_pendentes: movimentosPendentes,
      movimentos_resolvidos: movimentosResolvidos,
    },
    suporte_online: {
<<<<<<< HEAD
      gateway: true,
      sgt: false,
      observacao: 'A function resolve pelo estoque local e ja pode complementar pelo Gateway TPU detalhado.',
=======
      gateway: false,
      sgt: false,
      observacao: 'Nesta fase a function resolve pelo estoque TPU local ja carregado no banco.',
>>>>>>> codex/hmadv-tpu-fase53
    },
  };
}

async function resolverMovimento(codigoCnj: number) {
  const inicio = Date.now();
  const movimento = await findTpuMovimentoByCodigo(codigoCnj);
  const complementos = movimento ? await findComplementosByCodigo(codigoCnj) : {
    complemento_movimento: [],
    procedimento_complementos: [],
  };
  const payload = {
    ok: Boolean(movimento),
    codigo_cnj: codigoCnj,
    movimento_tpu: movimento,
    complementos,
<<<<<<< HEAD
    signals: deriveBusinessSignals(
      movimento?.nome,
      (movimento as any)?.glossario,
      complementos,
    ),
=======
>>>>>>> codex/hmadv-tpu-fase53
    fonte: movimento ? 'local_db' : 'nao_encontrado',
    duracao_ms: Date.now() - inicio,
  };

  await registrarLogSync({
    fonte: movimento ? 'local_db' : 'nao_encontrado',
    tipo_tpu: 'movimento',
    total_registros: 1,
    atualizados: movimento ? 1 : 0,
    erros: movimento ? 0 : 1,
    status: movimento ? 'ok' : 'pendente',
    erro: movimento ? null : 'codigo_nao_encontrado_no_estoque_tpu_local',
  });

  return payload;
}

async function resolverLoteMovimentos(limite: number, processoId?: string | null) {
  const inicio = new Date().toISOString();
  let query = db
    .from('movimentos')
    .select('id,processo_id,codigo,descricao,movimento_tpu_id,tpu_status')
    .is('movimento_tpu_id', null)
    .not('codigo', 'is', null)
    .order('data_movimento', { ascending: false })
    .limit(limite);

  if (processoId) {
    query = query.eq('processo_id', processoId);
  }

  const { data: movimentos, error } = await query;
  if (error) {
    throw new Error(`Erro carregando lote de movimentos: ${error.message}`);
  }

  let resolvidos = 0;
  let pendentes = 0;
  let erros = 0;
  const amostra: JsonMap[] = [];

  for (const movimento of movimentos ?? []) {
    const codigo = toNumber(movimento.codigo);
    if (!codigo) {
      try {
        await marcarMovimento(movimento.id, {
          tpu_status: 'codigo_invalido',
          tpu_resolvido_em: new Date().toISOString(),
        });
        pendentes += 1;
      } catch (e) {
        erros += 1;
        log('warn', 'resolver_lote_codigo_invalido', {
          movimento_id: movimento.id,
          erro: String(e),
        });
      }
      continue;
    }

    try {
      const tpu = await findTpuMovimentoByCodigo(codigo);
      if (tpu?.id) {
        await marcarMovimento(movimento.id, {
          movimento_tpu_id: String(tpu.id),
          tpu_status: 'resolvido',
          tpu_resolvido_em: new Date().toISOString(),
        });
        resolvidos += 1;
        if (amostra.length < 20) {
          amostra.push({
            movimento_id: movimento.id,
            processo_id: movimento.processo_id,
            codigo,
            nome_tpu: tpu.nome,
            fonte: 'local_db',
          });
        }
      } else {
        await marcarMovimento(movimento.id, {
          tpu_status: 'pendente',
          tpu_resolvido_em: new Date().toISOString(),
        });
        pendentes += 1;
        if (amostra.length < 20) {
          amostra.push({
            movimento_id: movimento.id,
            processo_id: movimento.processo_id,
            codigo,
            fonte: 'nao_encontrado',
          });
        }
      }
    } catch (e) {
      erros += 1;
      log('warn', 'resolver_lote_movimento_error', {
        movimento_id: movimento.id,
        codigo,
        erro: String(e),
      });
    }
  }

  await registrarLogSync({
    fonte: 'local_db',
    tipo_tpu: 'movimento',
    total_registros: movimentos?.length ?? 0,
    atualizados: resolvidos,
    erros,
    status: erros > 0 ? 'parcial' : 'ok',
    erro: erros > 0 ? 'erros_no_lote_de_resolucao' : null,
  });

  return {
    ok: true,
    inicio,
    fim: new Date().toISOString(),
    processo_id: processoId ?? null,
    total_analisado: movimentos?.length ?? 0,
    resolvidos,
    pendentes,
    erros,
    amostra,
  };
}

async function enriquecerProcesso(processoId: string) {
  return resolverLoteMovimentos(500, processoId);
}

async function syncPlaceholder(tipo: 'movimento' | 'classe' | 'assunto' | 'all') {
  await registrarLogSync({
    fonte: 'placeholder',
    tipo_tpu: tipo,
    total_registros: 0,
    atualizados: 0,
    erros: 0,
    status: 'pendente',
    erro: 'sync_online_ainda_nao_implementado_nesta_fase',
  });

  return {
    ok: false,
    tipo,
    status: 'pendente',
    observacao: 'Use carga anual por arquivo local e resolucao local de movimentos nesta fase.',
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';

  try {
    switch (action) {
      case 'status':
        return response(await status());

      case 'resolver_movimento': {
        const codigo = toNumber(url.searchParams.get('codigo_cnj'));
        if (!codigo) {
          return response({ ok: false, error: 'codigo_cnj obrigatorio' }, 400);
        }
        return response(await resolverMovimento(codigo));
      }

<<<<<<< HEAD
      case 'resolver_movimento_detalhado': {
        const codigo = toNumber(url.searchParams.get('codigo_cnj'));
        if (!codigo) {
          return response({ ok: false, error: 'codigo_cnj obrigatorio' }, 400);
        }
        return response(await resolverMovimentoDetalhado(codigo));
      }

=======
>>>>>>> codex/hmadv-tpu-fase53
      case 'resolver_lote_movimentos': {
        const limite = Math.max(1, Number(url.searchParams.get('limite') ?? '200'));
        return response(await resolverLoteMovimentos(limite));
      }

      case 'enriquecer_processo': {
        const processoId = String(url.searchParams.get('processo_id') ?? '').trim();
        if (!processoId) {
          return response({ ok: false, error: 'processo_id obrigatorio' }, 400);
        }
        return response(await enriquecerProcesso(processoId));
      }

      case 'sync_movimentos':
        return response(await syncPlaceholder('movimento'));

<<<<<<< HEAD
      case 'sync_movimentos_gateway': {
        const limite = Math.max(1, Number(url.searchParams.get('limite') ?? '50'));
        const codigo = toNumber(url.searchParams.get('codigo_cnj'));
        return response(await syncGatewayMovimentos(limite, codigo));
      }

      case 'sync_classes':
        return response(await syncPlaceholder('classe'));

      case 'sync_classes_gateway': {
        const codigo = toNumber(url.searchParams.get('codigo_cnj'));
        if (!codigo) return response({ ok: false, error: 'codigo_cnj obrigatorio' }, 400);
        return response(await syncGatewayEntity('classes', codigo));
      }

      case 'sync_assuntos':
        return response(await syncPlaceholder('assunto'));

      case 'sync_assuntos_gateway': {
        const codigo = toNumber(url.searchParams.get('codigo_cnj'));
        if (!codigo) return response({ ok: false, error: 'codigo_cnj obrigatorio' }, 400);
        return response(await syncGatewayEntity('assuntos', codigo));
      }

      case 'sync_documentos_gateway': {
        const codigo = toNumber(url.searchParams.get('codigo_cnj'));
        if (!codigo) return response({ ok: false, error: 'codigo_cnj obrigatorio' }, 400);
        return response(await syncGatewayEntity('documentos', codigo));
      }

=======
      case 'sync_classes':
        return response(await syncPlaceholder('classe'));

      case 'sync_assuntos':
        return response(await syncPlaceholder('assunto'));

>>>>>>> codex/hmadv-tpu-fase53
      case 'sync_all':
        return response(await syncPlaceholder('all'));

      default:
        return response({ ok: false, error: `action desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    log('error', 'tpu_sync_fatal', { action, erro: String(e) });
    return response({ ok: false, action, error: String(e) }, 500);
  }
});
