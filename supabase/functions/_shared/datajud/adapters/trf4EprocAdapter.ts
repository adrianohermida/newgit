import { normalizeGrau, pickFirst, toNumber, toText } from './helpers.ts';
import { defaultAdapter } from './defaultAdapter.ts';
import type { CanonicalProcesso, DataJudAdapter } from './types.ts';

function isTRF4(tribunal?: string | null): boolean {
  const t = (tribunal ?? '').trim().toLowerCase();
  return t === '404' || t === 'trf4';
}

function isEproc(sistema?: string | null): boolean {
  const s = (sistema ?? '').trim().toLowerCase();
  return s.includes('eproc');
}

function parseTRF4Eproc(input: Parameters<DataJudAdapter['parse']>[0]): CanonicalProcesso {
  const base = defaultAdapter.parse(input);
  return {
    ...base,
    classe_codigo: base.classe_codigo ?? toNumber(pickFirst(input.payload, [
      'dadosBasicos.classeProcessual.codigo',
      'classeProcessual.codigo',
      'classe.codigo',
    ])),
    classe_nome: base.classe_nome ?? toText(pickFirst(input.payload, [
      'dadosBasicos.classeProcessual.nome',
      'classeProcessual.nome',
      'classe.nome',
    ])),
    orgao_julgador_codigo: base.orgao_julgador_codigo ?? toNumber(pickFirst(input.payload, [
      'dadosBasicos.orgaoJulgador.codigo',
      'orgaoJulgador.codigo',
    ])),
    orgao_julgador_nome: base.orgao_julgador_nome ?? toText(pickFirst(input.payload, [
      'dadosBasicos.orgaoJulgador.nome',
      'orgaoJulgador.nome',
    ])),
    parser_tribunal_schema: 'trf4:*:eproc',
    parser_grau: base.parser_grau ?? normalizeGrau(input.grau),
    parser_sistema: base.parser_sistema ?? 'eproc',
  };
}

export const trf4EprocAdapter: DataJudAdapter = {
  key: 'trf4:*:eproc',
  match: (meta) => isTRF4(meta.tribunal) && isEproc(meta.sistema),
  parse: (input) => parseTRF4Eproc(input),
};
