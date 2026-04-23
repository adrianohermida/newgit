/**
 * publicacoes-audiencias — Sprint 3
 * Extrai datas e tipos de audiências do texto das publicações do Advise
 * e persiste na tabela judiciario.audiencias, criando também activity no Freshsales.
 *
 * Ações disponíveis:
 *   action=extract_batch   — Processa lote de publicações sem audiência extraída (padrão)
 *   action=status          — Retorna contagens e progresso
 *   action=extract_one     — Extrai audiência de uma publicação específica (publicacao_id)
 *   action=sync_fs         — Sincroniza audiências sem freshsales_activity_id com Freshsales
 *
 * Padrões de regex suportados:
 *   - "Designo audiência [tipo] para o dia DD/MM/AAAA, às HH:MMh"
 *   - "audiência designada para DD/MM/AAAA às HH:MM"
 *   - "PAUTA: DD/MM/AAAA HH:MM"
 *   - "data da audiência: DD/MM/AAAA"
 *   - "realização de audiência no dia DD/MM/AAAA"
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN = Deno.env.get('FRESHSALES_DOMAIN') ?? 'hermidamaia.myfreshworks.com';
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY')!;
const SLACK_NOTIFY_URL = `${SUPABASE_URL}/functions/v1/dotobot-slack`;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'judiciario' },
});

// ─── Padrões de regex para extração de audiências ────────────────────────────

interface AudienciaExtraida {
  tipo: string;
  data_audiencia: string; // ISO 8601
  hora: string | null;
  local: string | null;
  modalidade: string | null; // PRESENCIAL | VIRTUAL | TELEPRESENCIAL
  descricao: string;
}

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03',
  abril: '04', maio: '05', junho: '06', julho: '07',
  agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

function parseDateBR(dateStr: string, timeStr?: string | null): string | null {
  try {
    // DD/MM/AAAA ou DD.MM.AAAA
    const m1 = dateStr.match(/(\d{2})[\/\.](\d{2})[\/\.](\d{4})/);
    if (m1) {
      const [, d, mo, y] = m1;
      const time = timeStr ? `T${timeStr.replace('h', ':00').replace(/(\d{2}):(\d{2}).*/, '$1:$2:00')}` : 'T00:00:00';
      return `${y}-${mo}-${d}${time}-04:00`;
    }
    // DD de mês de AAAA
    const m2 = dateStr.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
    if (m2) {
      const [, d, mesNome, y] = m2;
      const mo = MESES[mesNome];
      if (mo) return `${y}-${mo}-${d.padStart(2, '0')}T00:00:00-04:00`;
    }
    return null;
  } catch {
    return null;
  }
}

function extractAudiencias(conteudo: string): AudienciaExtraida[] {
  const resultados: AudienciaExtraida[] = [];
  const texto = conteudo;

  // Padrão 1: "Designo audiência [tipo] para o dia DD/MM/AAAA, às HH:MMh"
  const p1 = /Designo\s+audi[e\u00ea]ncia\s+(.+?)\s+para\s+o\s+dia\s+(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})[,\s]+[\u00e0a]s?\s+(\d{2}:\d{2}h?)/gi;
  let m: RegExpExecArray | null;
  while ((m = p1.exec(texto)) !== null) {
    const tipo = m[1].trim().replace(/\s+/g, ' ');
    const dataISO = parseDateBR(m[2], m[3]);
    if (!dataISO) continue;
    const modalidade = /presencial/i.test(texto.slice(m.index, m.index + 300)) ? 'PRESENCIAL'
      : /virtual|telepresencial|videoconfer/i.test(texto.slice(m.index, m.index + 300)) ? 'VIRTUAL' : null;
    const localMatch = texto.slice(m.index, m.index + 500).match(/situada?\s+(?:na|no|em)\s+([^.]+)\./i);
    resultados.push({
      tipo: tipo || 'audiência',
      data_audiencia: dataISO,
      hora: m[3].replace('h', ':00'),
      local: localMatch ? localMatch[1].trim() : null,
      modalidade,
      descricao: `Audiência ${tipo} designada para ${m[2]} às ${m[3]}`,
    });
  }

  // Padrão 2: "audiência designada para DD/MM/AAAA às HH:MM"
  const p2 = /audi[eê]ncia\s+designada\s+para\s+(\d{2}[\/\.]\d{2}[\/\.]\d{4})\s+[àa]s?\s+(\d{2}:\d{2})/gi;
  while ((m = p2.exec(texto)) !== null) {
    const dataISO = parseDateBR(m[1], m[2]);
    if (!dataISO) continue;
    resultados.push({
      tipo: 'audiência',
      data_audiencia: dataISO,
      hora: m[2],
      local: null,
      modalidade: null,
      descricao: `Audiência designada para ${m[1]} às ${m[2]}`,
    });
  }

  // Padrão 3: "PAUTA: DD/MM/AAAA HH:MM" ou "PAUTA DD/MM/AAAA"
  const p3 = /PAUTA[:\s]+(\d{2}[\/\.]\d{2}[\/\.]\d{4})(?:\s+(\d{2}:\d{2}))?/gi;
  while ((m = p3.exec(texto)) !== null) {
    const dataISO = parseDateBR(m[1], m[2]);
    if (!dataISO) continue;
    resultados.push({
      tipo: 'pauta',
      data_audiencia: dataISO,
      hora: m[2] ?? null,
      local: null,
      modalidade: null,
      descricao: `Pauta: ${m[1]}${m[2] ? ' às ' + m[2] : ''}`,
    });
  }

  // Padrão 4: "realização de audiência no dia DD/MM/AAAA"
  const p4 = /realiza[çc][ãa]o\s+de\s+audi[eê]ncia\s+(?:no\s+dia\s+)?(\d{2}[\/\.]\d{2}[\/\.]\d{4})(?:[,\s]+[àa]s?\s+(\d{2}:\d{2}))?/gi;
  while ((m = p4.exec(texto)) !== null) {
    const dataISO = parseDateBR(m[1], m[2]);
    if (!dataISO) continue;
    resultados.push({
      tipo: 'audiência',
      data_audiencia: dataISO,
      hora: m[2] ?? null,
      local: null,
      modalidade: null,
      descricao: `Realização de audiência em ${m[1]}${m[2] ? ' às ' + m[2] : ''}`,
    });
  }

  // Padrão 5: "data da audiência: DD/MM/AAAA"
  const p5 = /data\s+da\s+audi[eê]ncia[:\s]+(\d{2}[\/\.]\d{2}[\/\.]\d{4})/gi;
  while ((m = p5.exec(texto)) !== null) {
    const dataISO = parseDateBR(m[1]);
    if (!dataISO) continue;
    resultados.push({
      tipo: 'audiência',
      data_audiencia: dataISO,
      hora: null,
      local: null,
      modalidade: null,
      descricao: `Data da audiência: ${m[1]}`,
    });
  }

  // Deduplicar por data_audiencia
  const seen = new Set<string>();
  return resultados.filter(r => {
    const key = r.data_audiencia.slice(0, 16);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Freshsales: criar activity de audiência ─────────────────────────────────

async function createFsAudienciaActivity(
  accountId: string,
  audiencia: AudienciaExtraida,
  processoNumero: string,
): Promise<string | null> {
  const url = `https://${FS_DOMAIN}/crm/sales/api/activities`;
  const body = {
    activity: {
      title: `🏛️ Audiência: ${audiencia.tipo} — ${processoNumero}`,
      note: `${audiencia.descricao}${audiencia.modalidade ? ` (${audiencia.modalidade})` : ''}${audiencia.local ? `\nLocal: ${audiencia.local}` : ''}`,
      activity_type: { id: 2 }, // Meeting/Reunião
      start_date: audiencia.data_audiencia,
      end_date: audiencia.data_audiencia,
      targetable_type: 'SalesAccount',
      targetable_id: Number(accountId),
    },
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token token=${FS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error('FS activity error:', err.slice(0, 200));
      return null;
    }
    const data = await resp.json();
    return String(data?.activity?.id ?? '');
  } catch (e) {
    console.error('FS activity exception:', e);
    return null;
  }
}

// ─── Notificação Slack ────────────────────────────────────────────────────────

async function notifySlack(msg: string): Promise<void> {
  try {
    await fetch(SLACK_NOTIFY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'notify', message: msg }),
    });
  } catch { /* silencioso */ }
}

// ─── Ações ────────────────────────────────────────────────────────────────────

async function actionStatus() {
  const { count: totalPub } = await db.from('publicacoes').select('*', { count: 'exact', head: true });
  const { count: pubComAudiencia } = await db.from('publicacoes')
    .select('*', { count: 'exact', head: true })
    .not('freshsales_task_id', 'is', null); // reutilizando campo para marcar extração
  const { count: totalAudiencias } = await db.from('audiencias').select('*', { count: 'exact', head: true });
  const { count: audienciasSemFS } = await db.from('audiencias')
    .select('*', { count: 'exact', head: true })
    .is('freshsales_activity_id', null);
  return {
    publicacoes_total: totalPub ?? 0,
    audiencias_extraidas: totalAudiencias ?? 0,
    audiencias_sem_freshsales: audienciasSemFS ?? 0,
  };
}

async function actionExtractBatch(batchSize = 50): Promise<Record<string, unknown>> {
  // Buscar publicações que ainda não foram processadas para audiências
  // Usamos uma tabela de controle via coluna metadata ou verificamos pela origem
  const { data: publicacoes, error } = await db.from('publicacoes')
    .select('id, processo_id, conteudo, numero_processo_api')
    .not('conteudo', 'is', null)
    .not('processo_id', 'is', null)
    .ilike('conteudo', '%audiência%')
    .order('data_publicacao', { ascending: false })
    .limit(batchSize);

  if (error) throw new Error(`Erro ao buscar publicações: ${error.message}`);
  if (!publicacoes?.length) return { ok: true, processadas: 0, audiencias_inseridas: 0 };

  // Verificar quais publicações já têm audiências extraídas
  const pubIds = publicacoes.map(p => p.id);
  const { data: jaExtraidas } = await db.from('audiencias')
    .select('origem_id')
    .eq('origem', 'publicacao')
    .in('origem_id', pubIds.map(String));

  const jaExtraidasSet = new Set((jaExtraidas ?? []).map(a => a.origem_id));
  const pendentes = publicacoes.filter(p => !jaExtraidasSet.has(String(p.id)));

  if (!pendentes.length) return { ok: true, processadas: 0, audiencias_inseridas: 0, message: 'Nenhuma publicação nova com audiência' };

  let audienciasInseridas = 0;
  let erros = 0;
  const detalhes: Record<string, unknown>[] = [];

  for (const pub of pendentes) {
    const audiencias = extractAudiencias(pub.conteudo ?? '');
    if (!audiencias.length) continue;

    for (const aud of audiencias) {
      const { error: insertErr } = await db.from('audiencias').upsert({
        processo_id: pub.processo_id,
        origem: 'publicacao',
        origem_id: String(pub.id),
        tipo: aud.tipo,
        data_audiencia: aud.data_audiencia,
        descricao: aud.descricao,
        local: aud.local,
        situacao: 'agendada',
        metadata: {
          hora: aud.hora,
          modalidade: aud.modalidade,
          numero_processo: pub.numero_processo_api,
        },
      }, { onConflict: 'processo_id,origem,origem_id' });

      if (insertErr) {
        erros++;
        detalhes.push({ pub_id: pub.id, erro: insertErr.message });
      } else {
        audienciasInseridas++;
        detalhes.push({ pub_id: pub.id, tipo: aud.tipo, data: aud.data_audiencia });
      }
    }
  }

  if (audienciasInseridas > 0) {
    await notifySlack(
      `🏛️ *Audiências extraídas:* ${audienciasInseridas} novas audiências identificadas em ${pendentes.length} publicações processadas.`
    );
  }

  return {
    ok: erros === 0,
    processadas: pendentes.length,
    audiencias_inseridas: audienciasInseridas,
    erros,
    detalhes: detalhes.slice(0, 10),
  };
}

async function actionExtractOne(publicacaoId: string): Promise<Record<string, unknown>> {
  const { data: pub, error } = await db.from('publicacoes')
    .select('id, processo_id, conteudo, numero_processo_api')
    .eq('id', publicacaoId)
    .single();

  if (error || !pub) throw new Error(`Publicação não encontrada: ${publicacaoId}`);

  const audiencias = extractAudiencias(pub.conteudo ?? '');
  return {
    publicacao_id: pub.id,
    numero_processo: pub.numero_processo_api,
    audiencias_encontradas: audiencias.length,
    audiencias,
  };
}

async function actionSyncFS(batchSize = 20): Promise<Record<string, unknown>> {
  // Buscar audiências sem activity no Freshsales
  const { data: audiencias, error } = await db.from('audiencias')
    .select('id, processo_id, tipo, data_audiencia, descricao, local, metadata')
    .is('freshsales_activity_id', null)
    .not('processo_id', 'is', null)
    .order('data_audiencia', { ascending: true })
    .limit(batchSize);

  if (error) throw new Error(`Erro ao buscar audiências: ${error.message}`);
  if (!audiencias?.length) return { ok: true, sincronizadas: 0 };

  // Buscar account_id_freshsales dos processos
  const processoIds = [...new Set(audiencias.map(a => a.processo_id))];
  const { data: processos } = await db.from('processos')
    .select('id, account_id_freshsales, numero_cnj, numero_processo')
    .in('id', processoIds);

  const processoMap = new Map((processos ?? []).map(p => [p.id, p]));

  let sincronizadas = 0;
  let erros = 0;

  for (const aud of audiencias) {
    const processo = processoMap.get(aud.processo_id);
    if (!processo?.account_id_freshsales) continue;

    const fsId = await createFsAudienciaActivity(
      processo.account_id_freshsales,
      {
        tipo: aud.tipo,
        data_audiencia: aud.data_audiencia,
        hora: aud.metadata?.hora ?? null,
        local: aud.local,
        modalidade: aud.metadata?.modalidade ?? null,
        descricao: aud.descricao,
      },
      processo.numero_cnj ?? processo.numero_processo ?? '',
    );

    if (fsId) {
      await db.from('audiencias').update({ freshsales_activity_id: fsId }).eq('id', aud.id);
      sincronizadas++;
    } else {
      erros++;
    }

    // Respeitar limite de 1000 req/hora do Freshsales
    await new Promise(r => setTimeout(r, 200));
  }

  if (sincronizadas > 0) {
    await notifySlack(
      `📅 *Audiências → Freshsales:* ${sincronizadas} activities de audiência criadas no CRM.`
    );
  }

  return { ok: erros === 0, sincronizadas, erros };
}

// ─── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === 'POST' && req.headers.get('content-type')?.includes('json')) {
      body = await req.json().catch(() => ({}));
    }
    const action = String(body.action ?? url.searchParams.get('action') ?? 'extract_batch');

    let result: Record<string, unknown>;

    switch (action) {
      case 'status':
        result = await actionStatus();
        break;
      case 'extract_batch': {
        const batchSize = Math.max(1, Math.min(Number(body.batch_size ?? 50), 100));
        result = await actionExtractBatch(batchSize);
        break;
      }
      case 'extract_one': {
        const pubId = String(body.publicacao_id ?? url.searchParams.get('publicacao_id') ?? '');
        if (!pubId) throw new Error('publicacao_id obrigatório');
        result = await actionExtractOne(pubId);
        break;
      }
      case 'sync_fs': {
        const batchSize = Math.max(1, Math.min(Number(body.batch_size ?? 20), 50));
        result = await actionSyncFS(batchSize);
        break;
      }
      default:
        result = { ok: false, erro: `Ação desconhecida: ${action}` };
    }

    return new Response(JSON.stringify({ ok: true, action, ...result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
