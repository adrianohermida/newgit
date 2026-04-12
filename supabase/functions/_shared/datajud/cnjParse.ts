export const RAMOS_JUDICIARIOS: Record<string, string> = {
  '1': 'Supremo Tribunal Federal',
  '2': 'Conselho Nacional de Justica',
  '3': 'Superior Tribunal de Justica',
  '4': 'Justica Federal',
  '5': 'Justica do Trabalho',
  '6': 'Justica Eleitoral',
  '7': 'Justica Militar da Uniao',
  '8': 'Justica dos Estados e DF',
  '9': 'Justica Militar Estadual',
};

export const TRIBUNAL_ALIASES: Record<string, string> = {
  '801': 'TJAC', '802': 'TJAL', '803': 'TJAM', '804': 'TJAP', '805': 'TJBA',
  '806': 'TJCE', '807': 'TJDFT', '808': 'TJES', '809': 'TJGO', '810': 'TJMA',
  '811': 'TJMG', '812': 'TJMS', '813': 'TJMT', '814': 'TJPA', '815': 'TJPB',
  '816': 'TJPE', '817': 'TJPI', '818': 'TJPR', '819': 'TJRJ', '820': 'TJRN',
  '821': 'TJRO', '822': 'TJRR', '823': 'TJRS', '824': 'TJSC', '825': 'TJSE',
  '826': 'TJSP', '827': 'TJTO',
  '401': 'TRF1', '402': 'TRF2', '403': 'TRF3', '404': 'TRF4', '405': 'TRF5', '406': 'TRF6',
  '501': 'TRT1', '502': 'TRT2', '503': 'TRT3', '504': 'TRT4', '505': 'TRT5',
  '506': 'TRT6', '507': 'TRT7', '508': 'TRT8', '509': 'TRT9', '510': 'TRT10',
  '511': 'TRT11', '512': 'TRT12', '513': 'TRT13', '514': 'TRT14', '515': 'TRT15',
  '516': 'TRT16', '517': 'TRT17', '518': 'TRT18', '519': 'TRT19', '520': 'TRT20',
  '521': 'TRT21', '522': 'TRT22', '523': 'TRT23', '524': 'TRT24',
  '601': 'TRE-AC', '602': 'TRE-AL', '603': 'TRE-AM', '604': 'TRE-AP', '605': 'TRE-BA',
  '606': 'TRE-CE', '607': 'TRE-DF', '608': 'TRE-ES', '609': 'TRE-GO', '610': 'TRE-MA',
  '611': 'TRE-MG', '612': 'TRE-MS', '613': 'TRE-MT', '614': 'TRE-PA', '615': 'TRE-PB',
  '616': 'TRE-PE', '617': 'TRE-PI', '618': 'TRE-PR', '619': 'TRE-RJ', '620': 'TRE-RN',
  '621': 'TRE-RO', '622': 'TRE-RR', '623': 'TRE-RS', '624': 'TRE-SC', '625': 'TRE-SE',
  '626': 'TRE-SP', '627': 'TRE-TO',
  '913': 'TJMMG', '923': 'TJMRS', '926': 'TJMSP',
  '100': 'STF', '200': 'STJ', '300': 'TST',
};

export type CNJParseResult = {
  raw: string;
  normalized: string;
  sequencial: string;
  digitoVerificador: string;
  ano: string;
  ramo: string;
  ramoNome: string | null;
  tribunal: string;
  tribunalAlias: string | null;
  serventia: string;
  chaveTribunal: string;
  valido: boolean;
};

export function validarDigitoVerificadorCNJ(normalized: string): boolean {
  if (normalized.length !== 20) return false;

  const ano = normalized.substring(9, 13);
  const ramo = normalized.substring(13, 14);
  const tribunal = normalized.substring(14, 16);
  const serventia = normalized.substring(16, 20);
  const dvFornecido = Number(normalized.substring(7, 9));

  const numVerificacao = Number(serventia + ramo + tribunal + ano);
  if (!Number.isFinite(numVerificacao)) return false;

  const resto = numVerificacao % 97;
  const dvCalculado = 98 - resto;
  return dvCalculado === dvFornecido;
}

export function parseCNJ(numeroProcesso: string): CNJParseResult {
  if (!numeroProcesso || typeof numeroProcesso !== 'string') {
    throw new Error('Numero do processo nao informado');
  }

  const normalized = numeroProcesso.replace(/\D/g, '');
  if (normalized.length !== 20) {
    throw new Error(`Numero CNJ invalido: deve conter 20 digitos (recebido: ${normalized.length})`);
  }

  const ramo = normalized.substring(13, 14);
  const tribunal = normalized.substring(14, 16);
  const chaveTribunal = ramo + tribunal;

  return {
    raw: numeroProcesso,
    normalized,
    sequencial: normalized.substring(0, 7),
    digitoVerificador: normalized.substring(7, 9),
    ano: normalized.substring(9, 13),
    ramo,
    ramoNome: RAMOS_JUDICIARIOS[ramo] ?? null,
    tribunal,
    tribunalAlias: TRIBUNAL_ALIASES[chaveTribunal] ?? null,
    serventia: normalized.substring(16, 20),
    chaveTribunal,
    valido: validarDigitoVerificadorCNJ(normalized),
  };
}
