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
  '826': { alias: 'api_publica_tjsp', name: 'TJSP', fullName: 'TJ São Paulo' },
  '819': { alias: 'api_publica_tjrj', name: 'TJRJ', fullName: 'TJ Rio de Janeiro' },
  '813': { alias: 'api_publica_tjmg', name: 'TJMG', fullName: 'TJ Minas Gerais' }
};

class CNJParser {
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
      tribunal_sigla: datajudInfo?.name
    };
  }

  static async enrichCNJData(cnj, base44Client) {
    const parsed = this.parseCNJ(cnj);
    
    if (!parsed.valido) return parsed;

    try {
      // 1. PRIORIDADE: CodigoForoTJSP (mais específico para TJSP)
      let codigoForo = null;
      if (parsed.tribunal_sigla === 'TJSP') {
        const foros = await base44Client.entities.CodigoForoTJSP.filter({
          codigo: parsed.orgao_origem
        });
        codigoForo = foros[0] || null;
      }

      // 2. Buscar Serventia CNJ (geral)
      const serventias = await base44Client.entities.ServentiaCNJ.filter({
        numero_serventia: parsed.orgao_origem,
        tribunal: parsed.tribunal_sigla
      });
      const serventia = serventias[0] || null;

      // 3. Buscar Juízo CNJ (mais detalhado)
      const juizos = await base44Client.entities.JuizoCNJ.filter({
        tribunal: parsed.tribunal_sigla,
        numero_serventia: parsed.orgao_origem
      });
      const juizo = juizos[0] || null;

      // PRIORIDADE: CodigoForo > Serventia > Juizo
      const comarca = codigoForo?.nome || serventia?.municipio || juizo?.uf || null;
      const vara = codigoForo?.nome || juizo?.nome_serventia || serventia?.nome_serventia || null;

      return {
        ...parsed,
        comarca,
        vara,
        serventia: serventia ? {
          nome: serventia.nome_serventia,
          municipio: serventia.municipio,
          uf: serventia.uf,
          tipo_orgao: serventia.tipo_orgao
        } : null,
        juizo: juizo ? {
          nome: juizo.nome_juizo || juizo.nome_serventia,
          digital_100: juizo.juizo_100_digital,
          tipo_unidade: juizo.tipo_unidade
        } : null,
        codigo_foro: codigoForo ? {
          codigo: codigoForo.codigo,
          nome: codigoForo.nome,
          tipo: codigoForo.tipo
        } : null,
        enriquecido: !!(serventia || juizo || codigoForo),
        fonte_enriquecimento: codigoForo ? 'CodigoForoTJSP' : serventia ? 'ServentiaCNJ' : juizo ? 'JuizoCNJ' : null
      };
    } catch (error) {
      console.error('Erro ao enriquecer CNJ:', error);
      return { ...parsed, enriquecido: false, erro_enriquecimento: error.message };
    }
  }
}

export default CNJParser;