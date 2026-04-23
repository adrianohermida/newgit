import { asArray, asRecord, normalizeGrau, pickFirst, toBool, toIsoDate, toNumber, toText } from './helpers.ts';
import type { CanonicalMovimento, CanonicalParte, CanonicalProcesso, DataJudAdapter } from './types.ts';

function inferArea(input: {
  tribunal?: string | null;
  classeNome?: string | null;
  assuntoNome?: string | null;
  payload: unknown;
}): string | null {
  const explicita = toText(pickFirst(input.payload, [
    'area',
    'dadosBasicos.area',
    'areaProcessual',
    'dadosBasicos.areaProcessual',
    'natureza',
    'dadosBasicos.natureza',
  ]));
  if (explicita) return explicita;

  const tribunal = String(input.tribunal ?? '').toUpperCase();
  if (tribunal.startsWith('TRT')) return 'Trabalhista';
  if (tribunal.startsWith('TRE')) return 'Eleitoral';
  if (tribunal.startsWith('TRF')) return 'Federal';
  if (tribunal.startsWith('TJM')) return 'Militar';

  const text = `${input.classeNome ?? ''} ${input.assuntoNome ?? ''}`.toUpperCase();
  if (/\bCRIMINAL\b|\bPENAL\b|\bCRIME\b/.test(text)) return 'Criminal';
  if (/\bTRABALH/.test(text)) return 'Trabalhista';
  if (/\bELEITORAL\b/.test(text)) return 'Eleitoral';
  if (/\bMILITAR\b/.test(text)) return 'Militar';
  if (/\bC[IÍ]VEL\b|\bCIVIL\b|\bFAZENDA\b|\bEXECUÇÃO FISCAL\b|\bFAM[IÍ]LIA\b/.test(text)) return 'Cível';
  if (tribunal.startsWith('TJ')) return 'Cível';
  return null;
}

function parsePartes(payload: unknown): CanonicalParte[] {
  const rawPartes = asArray(
    pickFirst(payload, ['partes', 'dadosBasicos.partes', 'processo.partes']),
  );
  return rawPartes.map((item) => {
    const rec = asRecord(item) ?? {};
    const tipo = toText(rec.tipo) ?? toText(rec.polo) ?? toText(rec.tipoParte);
    return {
      nome: toText(rec.nome) ?? toText(rec.nomeParte) ?? toText(rec.parte),
      tipo,
      polo: tipo,
      raw: item,
    };
  }).filter((p) => p.nome);
}

function parseMovimentos(payload: unknown): CanonicalMovimento[] {
  const rawMovs = asArray(
    pickFirst(payload, ['movimentos', 'dadosBasicos.movimentos', 'processo.movimentos']),
  );
  return rawMovs.map((item) => {
    const rec = asRecord(item) ?? {};
    const movimentoNacional = asRecord(rec.movimentoNacional);
    return {
      codigo: toNumber(rec.codigo) ?? toNumber(rec.codigoNacional) ?? toNumber(movimentoNacional?.codigo),
      descricao: toText(rec.nome) ?? toText(rec.descricao) ?? toText(movimentoNacional?.nome),
      data_movimento: toIsoDate(rec.dataHora) ?? toIsoDate(rec.data) ?? toIsoDate(rec.dataMovimento),
      complemento: toText(rec.complemento),
      raw: item,
    };
  }).filter((m) => m.codigo || m.descricao || m.data_movimento);
}

function parseAssuntos(payload: unknown): Array<{ codigo?: number | null; nome?: string | null }> {
  const rawAssuntos = asArray(
    pickFirst(payload, ['assuntos', 'dadosBasicos.assuntos', 'processo.assuntos']),
  );
  return rawAssuntos.map((item) => {
    const rec = asRecord(item) ?? {};
    return {
      codigo: toNumber(rec.codigo),
      nome: toText(rec.nome) ?? toText(rec.descricao),
    };
  }).filter((a) => a.codigo || a.nome);
}

export const defaultAdapter: DataJudAdapter = {
  key: 'default',
  match: () => true,
  parse: (input): CanonicalProcesso => {
    const payload = input.payload;
    const classe = asRecord(pickFirst(payload, [
      'classe',
      'classeProcessual',
      'dadosBasicos.classe',
      'dadosBasicos.classeProcessual',
    ]));
    const orgao = asRecord(pickFirst(payload, [
      'orgaoJulgador',
      'dadosBasicos.orgaoJulgador',
      'processo.orgaoJulgador',
    ]));
    const assuntos = parseAssuntos(payload);
    const sistemaObj = asRecord(pickFirst(payload, ['sistema', 'dadosBasicos.sistema']));
    const tribunal = toText(pickFirst(payload, ['tribunal', 'dadosBasicos.tribunal'])) ?? input.tribunal ?? null;
    const classeNome = toText(classe?.nome) ?? toText(classe?.descricao);
    const assuntoPrincipalNome = assuntos[0]?.nome ?? null;
    const sistema = toText(sistemaObj?.sigla)
      ?? toText(sistemaObj?.nome)
      ?? toText(sistemaObj?.descricao)
      ?? toText(sistemaObj?.codigo)
      ?? input.sistema
      ?? null;

    return {
      numero_processo: toText(pickFirst(payload, [
        'numeroProcesso',
        'dadosBasicos.numeroProcesso',
        'processo.numeroProcesso',
      ])) ?? input.numeroProcesso,
      numero_cnj: toText(pickFirst(payload, ['numeroProcesso', 'dadosBasicos.numeroProcesso'])),
      tribunal,
      grau: normalizeGrau(pickFirst(payload, ['grau', 'dadosBasicos.grau'])) ?? normalizeGrau(input.grau),
      sistema,
      area: inferArea({ tribunal, classeNome, assuntoNome: assuntoPrincipalNome, payload }),
      classe_codigo: toNumber(classe?.codigo),
      classe_nome: classeNome,
      assunto_principal_codigo: assuntos[0]?.codigo ?? null,
      assunto_principal_nome: assuntoPrincipalNome,
      assuntos,
      orgao_julgador_codigo: toNumber(orgao?.codigo),
      orgao_julgador_nome: toText(orgao?.nome) ?? toText(orgao?.descricao),
      data_ajuizamento: toIsoDate(pickFirst(payload, ['dataAjuizamento', 'dadosBasicos.dataAjuizamento'])),
      data_distribuicao: toIsoDate(pickFirst(payload, ['dataDistribuicao', 'dadosBasicos.dataDistribuicao'])),
      data_ultima_movimentacao: toIsoDate(pickFirst(payload, [
        'dataHoraUltimaAtualizacao',
        'dataUltimaMovimentacao',
        'dadosBasicos.dataUltimaMovimentacao',
      ])),
      valor_causa: toNumber(pickFirst(payload, ['valorCausa', 'dadosBasicos.valorCausa'])),
      formato: (() => {
        const fmtObj = pickFirst(payload, ['formato', 'dadosBasicos.formato']);
        if (fmtObj && typeof fmtObj === 'object') {
          const rec = fmtObj as Record<string, unknown>;
          return toText(rec.nome) ?? null;
        }
        return toText(fmtObj) ?? null;
      })(),
      segredo_justica: toBool(pickFirst(payload, ['segredoJustica', 'dadosBasicos.segredoJustica'])),
      arquivado: toBool(pickFirst(payload, ['arquivado', 'dadosBasicos.arquivado'])),
      partes: parsePartes(payload),
      movimentos: parseMovimentos(payload),
      raw_origem: payload,
      parser_tribunal_schema: 'default',
      parser_grau: normalizeGrau(pickFirst(payload, ['grau', 'dadosBasicos.grau'])) ?? normalizeGrau(input.grau),
      parser_sistema: sistema,
    };
  },
};
