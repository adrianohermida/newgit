/**
 * CNJParser — Parser CNJ com integração completa DataJud
 * Resolução nº 65/2008 CNJ
 * Suporta todos os 91 endpoints DataJud
 */

const JUSTICE_SEGMENTS = {
  '1': { nome: 'Supremo Tribunal Federal', tipo: 'Superior' },
  '2': { nome: 'Conselho Nacional de Justiça', tipo: 'CNJ' },
  '3': { nome: 'Superior Tribunal de Justiça', tipo: 'Superior' },
  '4': { nome: 'Justiça Federal', tipo: 'Federal' },
  '5': { nome: 'Justiça do Trabalho', tipo: 'Trabalho' },
  '6': { nome: 'Justiça Eleitoral', tipo: 'Eleitoral' },
  '7': { nome: 'Justiça Militar da União', tipo: 'Militar' },
  '8': { nome: 'Justiça dos Estados e DF', tipo: 'Estadual' },
  '9': { nome: 'Justiça Militar Estadual', tipo: 'Militar Estadual' },
};

// Mapa completo: chave = segmento+tribunal (ex: "800" = J8+TR00 = STJ, "815" = J8+TR15 = TJPB)
const DATAJUD_ENDPOINTS = {
  // Superiores
  '100': { alias: 'api_publica_stf',  name: 'STF',  fullName: 'Supremo Tribunal Federal',          justice: 'Superior'  },
  '200': { alias: 'api_publica_cnj',  name: 'CNJ',  fullName: 'Conselho Nacional de Justiça',       justice: 'CNJ'       },
  '300': { alias: 'api_publica_stj',  name: 'STJ',  fullName: 'Superior Tribunal de Justiça',       justice: 'Superior'  },

  // Justiça Federal (J4)
  '400': { alias: 'api_publica_cjf',  name: 'CJF',  fullName: 'Conselho da Justiça Federal',        justice: 'Federal'   },
  '401': { alias: 'api_publica_trf1', name: 'TRF1', fullName: 'Tribunal Regional Federal 1ª Região', justice: 'Federal'  },
  '402': { alias: 'api_publica_trf2', name: 'TRF2', fullName: 'Tribunal Regional Federal 2ª Região', justice: 'Federal'  },
  '403': { alias: 'api_publica_trf3', name: 'TRF3', fullName: 'Tribunal Regional Federal 3ª Região', justice: 'Federal'  },
  '404': { alias: 'api_publica_trf4', name: 'TRF4', fullName: 'Tribunal Regional Federal 4ª Região', justice: 'Federal'  },
  '405': { alias: 'api_publica_trf5', name: 'TRF5', fullName: 'Tribunal Regional Federal 5ª Região', justice: 'Federal'  },
  '406': { alias: 'api_publica_trf6', name: 'TRF6', fullName: 'Tribunal Regional Federal 6ª Região', justice: 'Federal'  },

  // Justiça do Trabalho (J5)
  '500': { alias: 'api_publica_tst',  name: 'TST',  fullName: 'Tribunal Superior do Trabalho',      justice: 'Trabalho'  },
  '501': { alias: 'api_publica_trt1', name: 'TRT1', fullName: 'TRT 1ª Região (RJ)',                 justice: 'Trabalho'  },
  '502': { alias: 'api_publica_trt2', name: 'TRT2', fullName: 'TRT 2ª Região (SP)',                 justice: 'Trabalho'  },
  '503': { alias: 'api_publica_trt3', name: 'TRT3', fullName: 'TRT 3ª Região (MG)',                 justice: 'Trabalho'  },
  '504': { alias: 'api_publica_trt4', name: 'TRT4', fullName: 'TRT 4ª Região (RS)',                 justice: 'Trabalho'  },
  '505': { alias: 'api_publica_trt5', name: 'TRT5', fullName: 'TRT 5ª Região (BA)',                 justice: 'Trabalho'  },
  '506': { alias: 'api_publica_trt6', name: 'TRT6', fullName: 'TRT 6ª Região (PE)',                 justice: 'Trabalho'  },
  '507': { alias: 'api_publica_trt7', name: 'TRT7', fullName: 'TRT 7ª Região (CE)',                 justice: 'Trabalho'  },
  '508': { alias: 'api_publica_trt8', name: 'TRT8', fullName: 'TRT 8ª Região (PA/AP)',              justice: 'Trabalho'  },
  '509': { alias: 'api_publica_trt9', name: 'TRT9', fullName: 'TRT 9ª Região (PR)',                 justice: 'Trabalho'  },
  '510': { alias: 'api_publica_trt10',name: 'TRT10',fullName: 'TRT 10ª Região (DF/TO)',             justice: 'Trabalho'  },
  '511': { alias: 'api_publica_trt11',name: 'TRT11',fullName: 'TRT 11ª Região (AM/RR)',             justice: 'Trabalho'  },
  '512': { alias: 'api_publica_trt12',name: 'TRT12',fullName: 'TRT 12ª Região (SC)',                justice: 'Trabalho'  },
  '513': { alias: 'api_publica_trt13',name: 'TRT13',fullName: 'TRT 13ª Região (PB)',                justice: 'Trabalho'  },
  '514': { alias: 'api_publica_trt14',name: 'TRT14',fullName: 'TRT 14ª Região (RO/AC)',             justice: 'Trabalho'  },
  '515': { alias: 'api_publica_trt15',name: 'TRT15',fullName: 'TRT 15ª Região (Campinas)',          justice: 'Trabalho'  },
  '516': { alias: 'api_publica_trt16',name: 'TRT16',fullName: 'TRT 16ª Região (MA)',                justice: 'Trabalho'  },
  '517': { alias: 'api_publica_trt17',name: 'TRT17',fullName: 'TRT 17ª Região (ES)',                justice: 'Trabalho'  },
  '518': { alias: 'api_publica_trt18',name: 'TRT18',fullName: 'TRT 18ª Região (GO)',                justice: 'Trabalho'  },
  '519': { alias: 'api_publica_trt19',name: 'TRT19',fullName: 'TRT 19ª Região (AL)',                justice: 'Trabalho'  },
  '520': { alias: 'api_publica_trt20',name: 'TRT20',fullName: 'TRT 20ª Região (SE)',                justice: 'Trabalho'  },
  '521': { alias: 'api_publica_trt21',name: 'TRT21',fullName: 'TRT 21ª Região (RN)',                justice: 'Trabalho'  },
  '522': { alias: 'api_publica_trt22',name: 'TRT22',fullName: 'TRT 22ª Região (PI)',                justice: 'Trabalho'  },
  '523': { alias: 'api_publica_trt23',name: 'TRT23',fullName: 'TRT 23ª Região (MT)',                justice: 'Trabalho'  },
  '524': { alias: 'api_publica_trt24',name: 'TRT24',fullName: 'TRT 24ª Região (MS)',                justice: 'Trabalho'  },

  // Justiça Eleitoral (J6)
  '600': { alias: 'api_publica_tse',  name: 'TSE',  fullName: 'Tribunal Superior Eleitoral',        justice: 'Eleitoral' },
  '601': { alias: 'api_publica_tre_ac',name:'TRE-AC',fullName:'TRE do Acre',                        justice: 'Eleitoral' },
  '602': { alias: 'api_publica_tre_al',name:'TRE-AL',fullName:'TRE de Alagoas',                     justice: 'Eleitoral' },
  '603': { alias: 'api_publica_tre_am',name:'TRE-AM',fullName:'TRE do Amazonas',                    justice: 'Eleitoral' },
  '604': { alias: 'api_publica_tre_ap',name:'TRE-AP',fullName:'TRE do Amapá',                       justice: 'Eleitoral' },
  '605': { alias: 'api_publica_tre_ba',name:'TRE-BA',fullName:'TRE da Bahia',                       justice: 'Eleitoral' },
  '606': { alias: 'api_publica_tre_ce',name:'TRE-CE',fullName:'TRE do Ceará',                       justice: 'Eleitoral' },
  '607': { alias: 'api_publica_tre_df',name:'TRE-DF',fullName:'TRE do Distrito Federal',            justice: 'Eleitoral' },
  '608': { alias: 'api_publica_tre_es',name:'TRE-ES',fullName:'TRE do Espírito Santo',              justice: 'Eleitoral' },
  '609': { alias: 'api_publica_tre_go',name:'TRE-GO',fullName:'TRE de Goiás',                       justice: 'Eleitoral' },
  '610': { alias: 'api_publica_tre_ma',name:'TRE-MA',fullName:'TRE do Maranhão',                    justice: 'Eleitoral' },
  '611': { alias: 'api_publica_tre_mg',name:'TRE-MG',fullName:'TRE de Minas Gerais',                justice: 'Eleitoral' },
  '612': { alias: 'api_publica_tre_ms',name:'TRE-MS',fullName:'TRE do Mato Grosso do Sul',          justice: 'Eleitoral' },
  '613': { alias: 'api_publica_tre_mt',name:'TRE-MT',fullName:'TRE do Mato Grosso',                 justice: 'Eleitoral' },
  '614': { alias: 'api_publica_tre_pa',name:'TRE-PA',fullName:'TRE do Pará',                        justice: 'Eleitoral' },
  '615': { alias: 'api_publica_tre_pb',name:'TRE-PB',fullName:'TRE da Paraíba',                     justice: 'Eleitoral' },
  '616': { alias: 'api_publica_tre_pe',name:'TRE-PE',fullName:'TRE de Pernambuco',                  justice: 'Eleitoral' },
  '617': { alias: 'api_publica_tre_pi',name:'TRE-PI',fullName:'TRE do Piauí',                       justice: 'Eleitoral' },
  '618': { alias: 'api_publica_tre_pr',name:'TRE-PR',fullName:'TRE do Paraná',                      justice: 'Eleitoral' },
  '619': { alias: 'api_publica_tre_rj',name:'TRE-RJ',fullName:'TRE do Rio de Janeiro',              justice: 'Eleitoral' },
  '620': { alias: 'api_publica_tre_rn',name:'TRE-RN',fullName:'TRE do Rio Grande do Norte',         justice: 'Eleitoral' },
  '621': { alias: 'api_publica_tre_ro',name:'TRE-RO',fullName:'TRE de Rondônia',                    justice: 'Eleitoral' },
  '622': { alias: 'api_publica_tre_rr',name:'TRE-RR',fullName:'TRE de Roraima',                     justice: 'Eleitoral' },
  '623': { alias: 'api_publica_tre_rs',name:'TRE-RS',fullName:'TRE do Rio Grande do Sul',           justice: 'Eleitoral' },
  '624': { alias: 'api_publica_tre_sc',name:'TRE-SC',fullName:'TRE de Santa Catarina',              justice: 'Eleitoral' },
  '625': { alias: 'api_publica_tre_se',name:'TRE-SE',fullName:'TRE de Sergipe',                     justice: 'Eleitoral' },
  '626': { alias: 'api_publica_tre_sp',name:'TRE-SP',fullName:'TRE de São Paulo',                   justice: 'Eleitoral' },
  '627': { alias: 'api_publica_tre_to',name:'TRE-TO',fullName:'TRE do Tocantins',                   justice: 'Eleitoral' },

  // Justiça Militar da União (J7)
  '700': { alias: 'api_publica_stm',  name: 'STM',  fullName: 'Superior Tribunal Militar',          justice: 'Militar'   },

  // Justiça Estadual (J8) — TJs
  '801': { alias: 'api_publica_tjac', name: 'TJAC', fullName: 'Tribunal de Justiça do Acre',        justice: 'Estadual'  },
  '802': { alias: 'api_publica_tjal', name: 'TJAL', fullName: 'Tribunal de Justiça de Alagoas',     justice: 'Estadual'  },
  '803': { alias: 'api_publica_tjam', name: 'TJAM', fullName: 'Tribunal de Justiça do Amazonas',    justice: 'Estadual'  },
  '804': { alias: 'api_publica_tjap', name: 'TJAP', fullName: 'Tribunal de Justiça do Amapá',       justice: 'Estadual'  },
  '805': { alias: 'api_publica_tjba', name: 'TJBA', fullName: 'Tribunal de Justiça da Bahia',       justice: 'Estadual'  },
  '806': { alias: 'api_publica_tjce', name: 'TJCE', fullName: 'Tribunal de Justiça do Ceará',       justice: 'Estadual'  },
  '807': { alias: 'api_publica_tjdft',name: 'TJDFT',fullName: 'TJDFT',                              justice: 'Estadual'  },
  '808': { alias: 'api_publica_tjes', name: 'TJES', fullName: 'Tribunal de Justiça do ES',          justice: 'Estadual'  },
  '809': { alias: 'api_publica_tjgo', name: 'TJGO', fullName: 'Tribunal de Justiça de Goiás',       justice: 'Estadual'  },
  '810': { alias: 'api_publica_tjma', name: 'TJMA', fullName: 'Tribunal de Justiça do Maranhão',    justice: 'Estadual'  },
  '811': { alias: 'api_publica_tjmg', name: 'TJMG', fullName: 'Tribunal de Justiça de MG',          justice: 'Estadual'  },
  '812': { alias: 'api_publica_tjms', name: 'TJMS', fullName: 'Tribunal de Justiça do MS',          justice: 'Estadual'  },
  '813': { alias: 'api_publica_tjmt', name: 'TJMT', fullName: 'Tribunal de Justiça do MT',          justice: 'Estadual'  },
  '814': { alias: 'api_publica_tjpa', name: 'TJPA', fullName: 'Tribunal de Justiça do Pará',        justice: 'Estadual'  },
  '815': { alias: 'api_publica_tjpb', name: 'TJPB', fullName: 'Tribunal de Justiça da Paraíba',     justice: 'Estadual'  },
  '816': { alias: 'api_publica_tjpe', name: 'TJPE', fullName: 'Tribunal de Justiça de PE',          justice: 'Estadual'  },
  '817': { alias: 'api_publica_tjpi', name: 'TJPI', fullName: 'Tribunal de Justiça do Piauí',       justice: 'Estadual'  },
  '818': { alias: 'api_publica_tjpr', name: 'TJPR', fullName: 'Tribunal de Justiça do Paraná',      justice: 'Estadual'  },
  '819': { alias: 'api_publica_tjrj', name: 'TJRJ', fullName: 'Tribunal de Justiça do RJ',          justice: 'Estadual'  },
  '820': { alias: 'api_publica_tjrn', name: 'TJRN', fullName: 'Tribunal de Justiça do RN',          justice: 'Estadual'  },
  '821': { alias: 'api_publica_tjro', name: 'TJRO', fullName: 'Tribunal de Justiça de Rondônia',    justice: 'Estadual'  },
  '822': { alias: 'api_publica_tjrr', name: 'TJRR', fullName: 'Tribunal de Justiça de Roraima',     justice: 'Estadual'  },
  '823': { alias: 'api_publica_tjrs', name: 'TJRS', fullName: 'Tribunal de Justiça do RS',          justice: 'Estadual'  },
  '824': { alias: 'api_publica_tjsc', name: 'TJSC', fullName: 'Tribunal de Justiça de SC',          justice: 'Estadual'  },
  '825': { alias: 'api_publica_tjse', name: 'TJSE', fullName: 'Tribunal de Justiça de Sergipe',     justice: 'Estadual'  },
  '826': { alias: 'api_publica_tjsp', name: 'TJSP', fullName: 'Tribunal de Justiça de SP',          justice: 'Estadual'  },
  '827': { alias: 'api_publica_tjto', name: 'TJTO', fullName: 'Tribunal de Justiça do Tocantins',   justice: 'Estadual'  },
};

// UF → código estadual (TR dentro do segmento 8)
const UF_TO_TR = {
  AC:'01', AL:'02', AM:'03', AP:'04', BA:'05', CE:'06', DF:'07', ES:'08',
  GO:'09', MA:'10', MG:'11', MS:'12', MT:'13', PA:'14', PB:'15', PE:'16',
  PI:'17', PR:'18', RJ:'19', RN:'20', RO:'21', RR:'22', RS:'23', SC:'24',
  SE:'25', SP:'26', TO:'27',
};

/**
 * Remove formatação e retorna apenas os 20 dígitos do CNJ
 */
export function limparCNJ(cnj) {
  if (!cnj) return '';
  return String(cnj).replace(/\D/g, '').slice(0, 20);
}

/**
 * Formata número CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
 */
export function formatarCNJ(cnj) {
  const d = limparCNJ(cnj);
  if (d.length !== 20) return cnj || '';
  return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16,20)}`;
}

/**
 * Valida se o CNJ tem 20 dígitos (validação básica)
 */
export function validarCNJ(cnj) {
  return limparCNJ(cnj).length === 20;
}

/**
 * Parseia um número CNJ e retorna todas as informações do processo
 * @param {string} cnj - Número CNJ (com ou sem formatação)
 * @returns {object|null}
 */
export function parsearCNJ(cnj) {
  const digitos = limparCNJ(cnj);
  if (digitos.length !== 20) return null;

  // Estrutura: NNNNNNN DD AAAA J TT OOOO
  const nnnnnnn = digitos.slice(0, 7);   // número do processo
  const dd      = digitos.slice(7, 9);   // dígito verificador
  const aaaa    = digitos.slice(9, 13);  // ano
  const j       = digitos.slice(13, 14); // segmento de justiça
  const tt      = digitos.slice(14, 16); // tribunal
  const oooo    = digitos.slice(16, 20); // origem (vara/juízo)

  const chaveEndpoint = `${j}${tt}`;
  // Normaliza para 3 dígitos: J + TT (padded)
  const chave3 = `${j}${tt.padStart(2, '0')}`;
  const endpoint = DATAJUD_ENDPOINTS[chave3] || DATAJUD_ENDPOINTS[`${j}00`] || null;
  const segmento = JUSTICE_SEGMENTS[j] || null;

  return {
    raw: digitos,
    formatado: formatarCNJ(digitos),
    numero: nnnnnnn,
    digitoVerificador: dd,
    ano: aaaa,
    segmentoJustica: j,
    segmentoInfo: segmento,
    tribunal: tt,
    origem: oooo,
    endpoint,
    endpointAlias: endpoint?.alias || null,
    tribunalNome: endpoint?.name || null,
    tribunalNomeCompleto: endpoint?.fullName || null,
    tipoJustica: endpoint?.justice || segmento?.tipo || null,
  };
}

/**
 * Detecta o endpoint DataJud correto a partir de um número CNJ ou UF
 * @param {string} cnj - Número CNJ
 * @param {string} uf - UF fallback (ex: 'SP', 'PB')
 * @returns {{ alias: string, name: string, fullName: string } | null}
 */
export function detectarEndpoint(cnj, uf) {
  // Tenta pelo CNJ primeiro
  const parsed = parsearCNJ(cnj);
  if (parsed?.endpoint) return parsed.endpoint;

  // Fallback por UF (assume Justiça Estadual J8)
  if (uf) {
    const tr = UF_TO_TR[uf.toUpperCase()];
    if (tr) {
      const chave = `8${tr}`;
      return DATAJUD_ENDPOINTS[chave] || null;
    }
  }

  return null;
}

/**
 * Retorna todos os endpoints agrupados por tipo de justiça
 */
export function listarEndpoints() {
  const grupos = {};
  for (const [chave, ep] of Object.entries(DATAJUD_ENDPOINTS)) {
    if (!grupos[ep.justice]) grupos[ep.justice] = [];
    grupos[ep.justice].push({ chave, ...ep });
  }
  return grupos;
}

/**
 * Retorna lista flat de todos os endpoints
 */
export function todosEndpoints() {
  return Object.entries(DATAJUD_ENDPOINTS).map(([chave, ep]) => ({ chave, ...ep }));
}

export default { parsearCNJ, limparCNJ, formatarCNJ, validarCNJ, detectarEndpoint, listarEndpoints, todosEndpoints };