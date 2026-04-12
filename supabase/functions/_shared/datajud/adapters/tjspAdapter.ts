import { normalizeGrau, pickFirst, toNumber, toText } from './helpers.ts';
import { defaultAdapter } from './defaultAdapter.ts';
import type { CanonicalProcesso, DataJudAdapter } from './types.ts';

function isTJSP(tribunal?: string | null): boolean {
  const t = (tribunal ?? '').trim().toLowerCase();
  return t === '826' || t === 'tjsp' || t === 'tjsp';
}

function parseTJSP(input: Parameters<DataJudAdapter['parse']>[0], key: string): CanonicalProcesso {
  const base = defaultAdapter.parse(input);
  return {
    ...base,
    classe_codigo: base.classe_codigo ?? toNumber(pickFirst(input.payload, [
      'dadosBasicos.classeProcessual.codigo',
      'dadosBasicos.classe.codigo',
      'classe.codigo',
    ])),
    classe_nome: base.classe_nome ?? toText(pickFirst(input.payload, [
      'dadosBasicos.classeProcessual.nome',
      'dadosBasicos.classeProcessual.descricao',
      'dadosBasicos.classe.nome',
      'classe.nome',
    ])),
    orgao_julgador_codigo: base.orgao_julgador_codigo ?? toNumber(pickFirst(input.payload, [
      'dadosBasicos.orgaoJulgador.codigo',
      'orgaoJulgador.codigo',
      'orgaoJulgador.codigoOrgao',
    ])),
    orgao_julgador_nome: base.orgao_julgador_nome ?? toText(pickFirst(input.payload, [
      'dadosBasicos.orgaoJulgador.nome',
      'dadosBasicos.orgaoJulgador.nomeOrgao',
      'orgaoJulgador.nome',
      'orgaoJulgador.nomeOrgao',
    ])),
    parser_tribunal_schema: key,
    parser_grau: base.parser_grau ?? normalizeGrau(input.grau),
    parser_sistema: base.parser_sistema ?? toText(input.sistema),
  };
}

export const tjsp1grauAdapter: DataJudAdapter = {
  key: 'tjsp:1:*',
  match: (meta) => isTJSP(meta.tribunal) && normalizeGrau(meta.grau) === '1',
  parse: (input) => parseTJSP(input, 'tjsp:1:*'),
};

export const tjsp2grauAdapter: DataJudAdapter = {
  key: 'tjsp:2:*',
  match: (meta) => isTJSP(meta.tribunal) && normalizeGrau(meta.grau) === '2',
  parse: (input) => parseTJSP(input, 'tjsp:2:*'),
};

export const tjspGenericAdapter: DataJudAdapter = {
  key: 'tjsp:*:*',
  match: (meta) => isTJSP(meta.tribunal),
  parse: (input) => parseTJSP(input, 'tjsp:*:*'),
};
