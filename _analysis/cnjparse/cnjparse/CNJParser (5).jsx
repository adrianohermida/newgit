// CNJParser - Validador e Parser de números CNJ
// Padrão CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO

const SEGMENTOS = {
  1: { sigla: 'STF', nome: 'Supremo Tribunal Federal', tipo: 'Superior', datajud_code: '100' },
  2: { sigla: 'CNJ', nome: 'Conselho Nacional de Justiça', tipo: 'Superior', datajud_code: null },
  3: { sigla: 'STJ', nome: 'Superior Tribunal de Justiça', tipo: 'Superior', datajud_code: '300' },
  4: { sigla: 'JF', nome: 'Justiça Federal', tipo: 'Federal', datajud_code: '4XX' },
  5: { sigla: 'JT', nome: 'Justiça do Trabalho', tipo: 'Trabalho', datajud_code: '5XX' },
  6: { sigla: 'JE', nome: 'Justiça Eleitoral', tipo: 'Eleitoral', datajud_code: '6XX' },
  7: { sigla: 'JM', nome: 'Justiça Militar da União', tipo: 'Militar', datajud_code: null },
  8: { sigla: 'JE', nome: 'Justiça dos Estados', tipo: 'Estadual', datajud_code: '8XX' },
  9: { sigla: 'JM', nome: 'Justiça Militar Estadual', tipo: 'Militar', datajud_code: '9XX' }
};

const TRIBUNAIS_FEDERAIS = {
  '401': 'TRF1', '402': 'TRF2', '403': 'TRF3', '404': 'TRF4', '405': 'TRF5', '406': 'TRF6'
};

const TRIBUNAIS_ESTADUAIS = {
  '801': 'TJAC', '802': 'TJAL', '803': 'TJAP', '804': 'TJAM', '805': 'TJBA',
  '806': 'TJCE', '807': 'TJDFT', '808': 'TJES', '809': 'TJGO', '810': 'TJMA',
  '811': 'TJMT', '812': 'TJMS', '813': 'TJMG', '814': 'TJPA', '815': 'TJPB',
  '816': 'TJPR', '817': 'TJPE', '818': 'TJPI', '819': 'TJRJ', '820': 'TJRN',
  '821': 'TJRS', '822': 'TJRO', '823': 'TJRR', '824': 'TJSC', '825': 'TJSE',
  '826': 'TJSP', '827': 'TJTO'
};

// DataJud Endpoints Mapping (base URL patterns)
const DATAJUD_ENDPOINTS = {
  estaduais: Object.entries(TRIBUNAIS_ESTADUAIS).map(([code, sigla]) => ({
    tribunal_code: code,
    name: sigla,
    tribunal_name: `Tribunal de Justiça - ${sigla.replace('TJ', '')}`,
    justice_type: 'Estadual',
    path: `/api_publica_${sigla.toLowerCase()}/_search`,
    full_url: `https://api-publica.datajud.cnj.jus.br/api_publica_${sigla.toLowerCase()}/_search`,
    graus: ['G1', 'G2']
  })),
  federais: Object.entries(TRIBUNAIS_FEDERAIS).map(([code, sigla]) => ({
    tribunal_code: code,
    name: sigla,
    tribunal_name: `Tribunal Regional Federal ${code.slice(-1)}ª Região`,
    justice_type: 'Federal',
    path: `/api_publica_${sigla.toLowerCase()}/_search`,
    full_url: `https://api-publica.datajud.cnj.jus.br/api_publica_${sigla.toLowerCase()}/_search`,
    graus: ['G1', 'G2', 'JE', 'TR']
  }))
};

const CNJParser = {
  parse(cnj) {
    const digits = cnj.replace(/\D/g, '');
    
    if (digits.length !== 20) {
      throw new Error('CNJ deve ter 20 dígitos');
    }

    const numero = digits.substring(0, 7);
    const dd = digits.substring(7, 9);
    const ano = digits.substring(9, 13);
    const segmento = digits.substring(13, 14);
    const tribunal = digits.substring(14, 16);
    const origem = digits.substring(16, 20);

    const expectedDD = this.calculateCheckDigit(numero + ano + segmento + tribunal + origem);
    const isValid = dd === expectedDD;

    const segmentoInfo = SEGMENTOS[parseInt(segmento)] || { sigla: '?', nome: 'Desconhecido', tipo: 'Desconhecido' };
    
    const tribunalCode = segmento + tribunal;
    let tribunalNome = '?';
    
    if (segmento === '4') {
      tribunalNome = TRIBUNAIS_FEDERAIS[tribunalCode] || `TRF${tribunal}`;
    } else if (segmento === '8') {
      tribunalNome = TRIBUNAIS_ESTADUAIS[tribunalCode] || `TJ${tribunal}`;
    }

    const datajudEndpoint = this.getDatajudEndpoint(tribunalCode);

    return {
      original: digits,
      formatted: this.formatCNJ(digits),
      isValid,
      actualDD: dd,
      expectedDD,
      numero,
      ano,
      segmento,
      tribunalCode: tribunal,
      origem,
      segmentoNome: segmentoInfo.nome,
      segmentoTipo: segmentoInfo.tipo,
      segmentoSigla: segmentoInfo.sigla,
      tribunalNome,
      datajudEndpoint
    };
  },

  formatCNJ(cnj) {
    const digits = cnj.replace(/\D/g, '');
    if (digits.length !== 20) return cnj;
    return `${digits.substring(0, 7)}-${digits.substring(7, 9)}.${digits.substring(9, 13)}.${digits.substring(13, 14)}.${digits.substring(14, 16)}.${digits.substring(16, 20)}`;
  },

  calculateCheckDigit(cnj) {
    const r = cnj.padStart(18, '0').split('').map(Number).reduce((acc, d, i) => acc + d * (18 - i), 0) % 97;
    return String(98 - r).padStart(2, '0');
  },

  correctCheckDigit(cnj) {
    const digits = cnj.replace(/\D/g, '');
    if (digits.length !== 20) return null;
    const base = digits.substring(0, 7) + digits.substring(9, 20);
    const correctDD = this.calculateCheckDigit(base);
    return this.formatCNJ(digits.substring(0, 7) + correctDD + digits.substring(9, 20));
  },

  getDatajudEndpoint(tribunalCode) {
    const allEndpoints = this.getAllDatajudEndpoints();
    return allEndpoints.find(ep => ep.tribunal_code === tribunalCode) || null;
  },

  getAllDatajudEndpoints() {
    return [
      ...DATAJUD_ENDPOINTS.estaduais,
      ...DATAJUD_ENDPOINTS.federais
    ];
  }
};

export default CNJParser;