/**
 * Parser CNJ com integração completa DataJud
 * Resolução nº 65/2008 CNJ
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
  '9': { nome: 'Justiça Militar Estadual', tipo: 'Militar Estadual' }
};

const DATAJUD_ENDPOINTS = {
  '100': { alias: 'api_publica_stf', name: 'STF', fullName: 'Supremo Tribunal Federal', justice: 'Superior', graus: ['SUP'] },
  '300': { alias: 'api_publica_stj', name: 'STJ', fullName: 'Superior Tribunal de Justiça', justice: 'Superior', graus: ['SUP'] },
  '401': { alias: 'api_publica_trf1', name: 'TRF1', fullName: 'TRF 1ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '402': { alias: 'api_publica_trf2', name: 'TRF2', fullName: 'TRF 2ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '403': { alias: 'api_publica_trf3', name: 'TRF3', fullName: 'TRF 3ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '404': { alias: 'api_publica_trf4', name: 'TRF4', fullName: 'TRF 4ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '405': { alias: 'api_publica_trf5', name: 'TRF5', fullName: 'TRF 5ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '406': { alias: 'api_publica_trf6', name: 'TRF6', fullName: 'TRF 6ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '807': { alias: 'api_publica_tjdft', name: 'TJDFT', fullName: 'TJ Distrito Federal', justice: 'Estadual', graus: ['G1', 'G2'] },
  '826': { alias: 'api_publica_tjsp', name: 'TJSP', fullName: 'TJ São Paulo', justice: 'Estadual', graus: ['G1', 'G2'] },
  '819': { alias: 'api_publica_tjrj', name: 'TJRJ', fullName: 'TJ Rio de Janeiro', justice: 'Estadual', graus: ['G1', 'G2'] },
  '813': { alias: 'api_publica_tjmg', name: 'TJMG', fullName: 'TJ Minas Gerais', justice: 'Estadual', graus: ['G1', 'G2'] },
  '821': { alias: 'api_publica_tjrs', name: 'TJRS', fullName: 'TJ Rio Grande do Sul', justice: 'Estadual', graus: ['G1', 'G2'] },
};

class CNJParser {
  static parse(cnj) {
    return this.parseCNJ(cnj);
  }

  static format(cnj) {
    const digits = cnj?.replace(/\D/g, '') || '';
    if (digits.length !== 20) return cnj;
    return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9,13)}.${digits.slice(13,14)}.${digits.slice(14,16)}.${digits.slice(16,20)}`;
  }

  static parseCNJ(cnj) {
    const digits = cnj.replace(/\D/g, '');
    if (digits.length !== 20) {
      return { valido: false, erro: 'CNJ deve ter 20 dígitos' };
    }

    const nnnnnnn = digits.slice(0, 7);
    const dd = digits.slice(7, 9);
    const aaaa = digits.slice(9, 13);
    const j = digits.slice(13, 14);
    const tr = digits.slice(14, 16);
    const oooo = digits.slice(16, 20);

    const segmento = JUSTICE_SEGMENTS[j];
    const tribunalCode = j + tr;
    const datajudInfo = DATAJUD_ENDPOINTS[tribunalCode];

    return {
      valido: true,
      numero_sequencial: nnnnnnn,
      digito_verificador: dd,
      ano: aaaa,
      segmento_justica: j,
      tribunal: tr,
      orgao_origem: oooo,
      formatado: `${nnnnnnn}-${dd}.${aaaa}.${j}.${tr}.${oooo}`,
      limpo: digits,
      info_segmento: segmento,
      tribunal_code: tribunalCode,
      datajud: datajudInfo,
      endpoint_datajud: datajudInfo?.alias,
      tribunal_sigla: datajudInfo?.name
    };
  }

  static getAllDatajudEndpoints() {
    return Object.entries(DATAJUD_ENDPOINTS).map(([code, info]) => ({
      tribunal_code: code,
      ...info,
      full_url: `https://api-publica.datajud.cnj.jus.br/${info.alias}/_search`
    }));
  }

  static getTribunalFromCNJ(cnj) {
    const parsed = this.parseCNJ(cnj);
    return parsed.tribunal_sigla || null;
  }

  /**
   * Enriquece dados CNJ com informações de Serventia e Juízo (database-driven)
   * @param {string} cnj - Número CNJ formatado ou limpo
   * @param {object} base44Client - Cliente base44 para queries
   * @returns {Promise<object>} Dados enriquecidos
   */
  static async enrichCNJData(cnj, base44Client) {
    const parsed = this.parseCNJ(cnj);
    
    if (!parsed.valido) return parsed;

    try {
      let codigoForo = null;
      let serventia = null;
      let juizo = null;

      // 1. PRIORIDADE: Buscar código foro TJSP (mais específico e confiável)
      if (parsed.tribunal_sigla === 'TJSP') {
        const foros = await base44Client.entities.CodigoForoTJSP.filter({
          codigo: parsed.orgao_origem
        });
        codigoForo = foros[0] || null;
      }

      // 2. Buscar serventia na tabela CNJ (fallback)
      if (!codigoForo) {
        const serventias = await base44Client.entities.ServentiaCNJ.filter({
          numero_serventia: parsed.orgao_origem,
          tribunal: parsed.tribunal_sigla
        });
        serventia = serventias[0] || null;
      }

      // 3. Buscar juízo na tabela CNJ
      const juizos = await base44Client.entities.JuizoCNJ.filter({
        tribunal: parsed.tribunal_sigla,
        numero_serventia: parsed.orgao_origem
      });
      juizo = juizos[0] || null;

      // 4. Retornar dados enriquecidos (priorizar CodigoForoTJSP)
      return {
        ...parsed,
        comarca: codigoForo?.nome || serventia?.municipio || null,
        vara: codigoForo?.nome || juizo?.nome_serventia || serventia?.nome_serventia || null,
        vara_tipo: codigoForo?.tipo || juizo?.tipo_unidade || serventia?.tipo_orgao || null,
        serventia: serventia ? {
          nome: serventia.nome_serventia,
          municipio: serventia.municipio,
          uf: serventia.uf,
          tipo_orgao: serventia.tipo_orgao,
          competencia: serventia.competencia,
          telefone: serventia.telefone,
          email: serventia.email,
          endereco: serventia.endereco,
          geolocalizacao: serventia.geolocalizacao
        } : null,
        juizo: juizo ? {
          nome: juizo.nome_juizo || juizo.nome_serventia,
          digital_100: juizo.juizo_100_digital,
          tipo_unidade: juizo.tipo_unidade,
          sistema_processual: juizo.sistema_processual,
          grau: juizo.grau,
          classificacao: juizo.classificacao
        } : null,
        codigo_foro: codigoForo ? {
          codigo: codigoForo.codigo,
          nome: codigoForo.nome,
          tipo: codigoForo.tipo,
          ativo: codigoForo.ativo
        } : null,
        enriquecido: !!(codigoForo || serventia || juizo),
        fonte_enriquecimento: codigoForo ? 'CodigoForoTJSP' : serventia ? 'ServentiaCNJ' : juizo ? 'JuizoCNJ' : null
      };
    } catch (error) {
      console.error('Erro ao enriquecer CNJ:', error);
      return { ...parsed, enriquecido: false, erro_enriquecimento: error.message };
    }
  }

  /**
   * Busca serventia por código (fallback para hardcoded se não encontrar em DB)
   * @param {string} codigoServentia - Código de 4 dígitos
   * @param {string} tribunalCode - Código do tribunal (ex: '826')
   * @param {object} base44Client - Cliente base44
   * @returns {Promise<object|null>}
   */
  static async getServentiaInfo(codigoServentia, tribunalCode, base44Client) {
    try {
      const serventias = await base44Client.entities.ServentiaCNJ.filter({
        numero_serventia: codigoServentia,
        tribunal: DATAJUD_ENDPOINTS[tribunalCode]?.name
      });

      return serventias[0] || null;
    } catch (error) {
      console.error('Erro ao buscar serventia:', error);
      return null;
    }
  }
}

export default CNJParser;