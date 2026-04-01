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
  // Superiores - STF usa código 1.00 (segmento 1, tribunal 00)
  '100': { alias: 'api_publica_stf', name: 'STF', fullName: 'Supremo Tribunal Federal', justice: 'Superior', graus: ['SUP'] },
  '200': { alias: 'api_publica_cnj', name: 'CNJ', fullName: 'Conselho Nacional de Justiça', justice: 'CNJ', graus: ['SUP'] },
  '300': { alias: 'api_publica_stj', name: 'STJ', fullName: 'Superior Tribunal de Justiça', justice: 'Superior', graus: ['SUP'] },
  '500': { alias: 'api_publica_tst', name: 'TST', fullName: 'Tribunal Superior do Trabalho', justice: 'Trabalho', graus: ['SUP'] },
  '600': { alias: 'api_publica_tse', name: 'TSE', fullName: 'Tribunal Superior Eleitoral', justice: 'Eleitoral', graus: ['SUP'] },
  '700': { alias: 'api_publica_stm', name: 'STM', fullName: 'Superior Tribunal Militar', justice: 'Militar', graus: ['SUP'] },
  
  // TRFs
  '401': { alias: 'api_publica_trf1', name: 'TRF1', fullName: 'TRF 1ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '402': { alias: 'api_publica_trf2', name: 'TRF2', fullName: 'TRF 2ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '403': { alias: 'api_publica_trf3', name: 'TRF3', fullName: 'TRF 3ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '404': { alias: 'api_publica_trf4', name: 'TRF4', fullName: 'TRF 4ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '405': { alias: 'api_publica_trf5', name: 'TRF5', fullName: 'TRF 5ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  '406': { alias: 'api_publica_trf6', name: 'TRF6', fullName: 'TRF 6ª Região', justice: 'Federal', graus: ['G1', 'G2'] },
  
  // TJs
  '801': { alias: 'api_publica_tjac', name: 'TJAC', fullName: 'TJ Acre', justice: 'Estadual', graus: ['G1', 'G2'] },
  '802': { alias: 'api_publica_tjal', name: 'TJAL', fullName: 'TJ Alagoas', justice: 'Estadual', graus: ['G1', 'G2'] },
  '803': { alias: 'api_publica_tjap', name: 'TJAP', fullName: 'TJ Amapá', justice: 'Estadual', graus: ['G1', 'G2'] },
  '804': { alias: 'api_publica_tjam', name: 'TJAM', fullName: 'TJ Amazonas', justice: 'Estadual', graus: ['G1', 'G2'] },
  '805': { alias: 'api_publica_tjba', name: 'TJBA', fullName: 'TJ Bahia', justice: 'Estadual', graus: ['G1', 'G2'] },
  '806': { alias: 'api_publica_tjce', name: 'TJCE', fullName: 'TJ Ceará', justice: 'Estadual', graus: ['G1', 'G2'] },
  '807': { alias: 'api_publica_tjdft', name: 'TJDFT', fullName: 'TJ Distrito Federal', justice: 'Estadual', graus: ['G1', 'G2'] },
  '808': { alias: 'api_publica_tjes', name: 'TJES', fullName: 'TJ Espírito Santo', justice: 'Estadual', graus: ['G1', 'G2'] },
  '809': { alias: 'api_publica_tjgo', name: 'TJGO', fullName: 'TJ Goiás', justice: 'Estadual', graus: ['G1', 'G2'] },
  '810': { alias: 'api_publica_tjma', name: 'TJMA', fullName: 'TJ Maranhão', justice: 'Estadual', graus: ['G1', 'G2'] },
  '811': { alias: 'api_publica_tjmt', name: 'TJMT', fullName: 'TJ Mato Grosso', justice: 'Estadual', graus: ['G1', 'G2'] },
  '812': { alias: 'api_publica_tjms', name: 'TJMS', fullName: 'TJ Mato Grosso do Sul', justice: 'Estadual', graus: ['G1', 'G2'] },
  '813': { alias: 'api_publica_tjmg', name: 'TJMG', fullName: 'TJ Minas Gerais', justice: 'Estadual', graus: ['G1', 'G2'] },
  '814': { alias: 'api_publica_tjpa', name: 'TJPA', fullName: 'TJ Pará', justice: 'Estadual', graus: ['G1', 'G2'] },
  '815': { alias: 'api_publica_tjpb', name: 'TJPB', fullName: 'TJ Paraíba', justice: 'Estadual', graus: ['G1', 'G2'] },
  '816': { alias: 'api_publica_tjpr', name: 'TJPR', fullName: 'TJ Paraná', justice: 'Estadual', graus: ['G1', 'G2'] },
  '817': { alias: 'api_publica_tjpe', name: 'TJPE', fullName: 'TJ Pernambuco', justice: 'Estadual', graus: ['G1', 'G2'] },
  '818': { alias: 'api_publica_tjpi', name: 'TJPI', fullName: 'TJ Piauí', justice: 'Estadual', graus: ['G1', 'G2'] },
  '819': { alias: 'api_publica_tjrj', name: 'TJRJ', fullName: 'TJ Rio de Janeiro', justice: 'Estadual', graus: ['G1', 'G2'] },
  '820': { alias: 'api_publica_tjrn', name: 'TJRN', fullName: 'TJ Rio Grande do Norte', justice: 'Estadual', graus: ['G1', 'G2'] },
  '821': { alias: 'api_publica_tjrs', name: 'TJRS', fullName: 'TJ Rio Grande do Sul', justice: 'Estadual', graus: ['G1', 'G2'] },
  '822': { alias: 'api_publica_tjro', name: 'TJRO', fullName: 'TJ Rondônia', justice: 'Estadual', graus: ['G1', 'G2'] },
  '823': { alias: 'api_publica_tjrr', name: 'TJRR', fullName: 'TJ Roraima', justice: 'Estadual', graus: ['G1', 'G2'] },
  '824': { alias: 'api_publica_tjsc', name: 'TJSC', fullName: 'TJ Santa Catarina', justice: 'Estadual', graus: ['G1', 'G2'] },
  '825': { alias: 'api_publica_tjse', name: 'TJSE', fullName: 'TJ Sergipe', justice: 'Estadual', graus: ['G1', 'G2'] },
  '826': { alias: 'api_publica_tjsp', name: 'TJSP', fullName: 'TJ São Paulo', justice: 'Estadual', graus: ['G1', 'G2'] },
  '827': { alias: 'api_publica_tjto', name: 'TJTO', fullName: 'TJ Tocantins', justice: 'Estadual', graus: ['G1', 'G2'] },
  
  // TRTs (5XX)
  '501': { alias: 'api_publica_trt1', name: 'TRT1', fullName: 'TRT 1ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '502': { alias: 'api_publica_trt2', name: 'TRT2', fullName: 'TRT 2ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '503': { alias: 'api_publica_trt3', name: 'TRT3', fullName: 'TRT 3ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '504': { alias: 'api_publica_trt4', name: 'TRT4', fullName: 'TRT 4ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '505': { alias: 'api_publica_trt5', name: 'TRT5', fullName: 'TRT 5ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '506': { alias: 'api_publica_trt6', name: 'TRT6', fullName: 'TRT 6ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '507': { alias: 'api_publica_trt7', name: 'TRT7', fullName: 'TRT 7ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '508': { alias: 'api_publica_trt8', name: 'TRT8', fullName: 'TRT 8ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '509': { alias: 'api_publica_trt9', name: 'TRT9', fullName: 'TRT 9ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '510': { alias: 'api_publica_trt10', name: 'TRT10', fullName: 'TRT 10ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '511': { alias: 'api_publica_trt11', name: 'TRT11', fullName: 'TRT 11ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '512': { alias: 'api_publica_trt12', name: 'TRT12', fullName: 'TRT 12ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '513': { alias: 'api_publica_trt13', name: 'TRT13', fullName: 'TRT 13ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '514': { alias: 'api_publica_trt14', name: 'TRT14', fullName: 'TRT 14ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '515': { alias: 'api_publica_trt15', name: 'TRT15', fullName: 'TRT 15ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '516': { alias: 'api_publica_trt16', name: 'TRT16', fullName: 'TRT 16ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '517': { alias: 'api_publica_trt17', name: 'TRT17', fullName: 'TRT 17ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '518': { alias: 'api_publica_trt18', name: 'TRT18', fullName: 'TRT 18ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '519': { alias: 'api_publica_trt19', name: 'TRT19', fullName: 'TRT 19ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '520': { alias: 'api_publica_trt20', name: 'TRT20', fullName: 'TRT 20ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '521': { alias: 'api_publica_trt21', name: 'TRT21', fullName: 'TRT 21ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '522': { alias: 'api_publica_trt22', name: 'TRT22', fullName: 'TRT 22ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '523': { alias: 'api_publica_trt23', name: 'TRT23', fullName: 'TRT 23ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  '524': { alias: 'api_publica_trt24', name: 'TRT24', fullName: 'TRT 24ª Região', justice: 'Trabalho', graus: ['G1', 'G2'] },
  
  // TREs (6XX) - Note: TRE-DFT usa hífen no endpoint
  '601': { alias: 'api_publica_tre-ac', name: 'TRE-AC', fullName: 'TRE Acre', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '602': { alias: 'api_publica_tre-al', name: 'TRE-AL', fullName: 'TRE Alagoas', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '603': { alias: 'api_publica_tre-ap', name: 'TRE-AP', fullName: 'TRE Amapá', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '604': { alias: 'api_publica_tre-am', name: 'TRE-AM', fullName: 'TRE Amazonas', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '605': { alias: 'api_publica_tre-ba', name: 'TRE-BA', fullName: 'TRE Bahia', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '606': { alias: 'api_publica_tre-ce', name: 'TRE-CE', fullName: 'TRE Ceará', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '607': { alias: 'api_publica_tre-df', name: 'TRE-DF', fullName: 'TRE Distrito Federal', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '608': { alias: 'api_publica_tre-es', name: 'TRE-ES', fullName: 'TRE Espírito Santo', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '609': { alias: 'api_publica_tre-go', name: 'TRE-GO', fullName: 'TRE Goiás', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '610': { alias: 'api_publica_tre-ma', name: 'TRE-MA', fullName: 'TRE Maranhão', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '611': { alias: 'api_publica_tre-mt', name: 'TRE-MT', fullName: 'TRE Mato Grosso', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '612': { alias: 'api_publica_tre-ms', name: 'TRE-MS', fullName: 'TRE Mato Grosso do Sul', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '613': { alias: 'api_publica_tre-mg', name: 'TRE-MG', fullName: 'TRE Minas Gerais', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '614': { alias: 'api_publica_tre-pa', name: 'TRE-PA', fullName: 'TRE Pará', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '615': { alias: 'api_publica_tre-pb', name: 'TRE-PB', fullName: 'TRE Paraíba', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '616': { alias: 'api_publica_tre-pr', name: 'TRE-PR', fullName: 'TRE Paraná', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '617': { alias: 'api_publica_tre-pe', name: 'TRE-PE', fullName: 'TRE Pernambuco', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '618': { alias: 'api_publica_tre-pi', name: 'TRE-PI', fullName: 'TRE Piauí', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '619': { alias: 'api_publica_tre-rj', name: 'TRE-RJ', fullName: 'TRE Rio de Janeiro', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '620': { alias: 'api_publica_tre-rn', name: 'TRE-RN', fullName: 'TRE Rio Grande do Norte', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '621': { alias: 'api_publica_tre-rs', name: 'TRE-RS', fullName: 'TRE Rio Grande do Sul', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '622': { alias: 'api_publica_tre-ro', name: 'TRE-RO', fullName: 'TRE Rondônia', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '623': { alias: 'api_publica_tre-rr', name: 'TRE-RR', fullName: 'TRE Roraima', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '624': { alias: 'api_publica_tre-sc', name: 'TRE-SC', fullName: 'TRE Santa Catarina', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '625': { alias: 'api_publica_tre-se', name: 'TRE-SE', fullName: 'TRE Sergipe', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '626': { alias: 'api_publica_tre-sp', name: 'TRE-SP', fullName: 'TRE São Paulo', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  '627': { alias: 'api_publica_tre-to', name: 'TRE-TO', fullName: 'TRE Tocantins', justice: 'Eleitoral', graus: ['G1', 'G2'] },
  
  // Justiça Militar Estadual (9XX)
  '913': { alias: 'api_publica_tjmmg', name: 'TJMMG', fullName: 'TJ Militar de Minas Gerais', justice: 'Militar Estadual', graus: ['G1', 'G2'] },
  '921': { alias: 'api_publica_tjmrs', name: 'TJMRS', fullName: 'TJ Militar do Rio Grande do Sul', justice: 'Militar Estadual', graus: ['G1', 'G2'] },
  '926': { alias: 'api_publica_tjmsp', name: 'TJMSP', fullName: 'TJ Militar de São Paulo', justice: 'Militar Estadual', graus: ['G1', 'G2'] },
};

class CNJParser {
  static parse(cnj) {
    if (!cnj) throw new Error('Número CNJ é obrigatório');
    
    const digits = String(cnj).replace(/\D/g, '');
    
    if (digits.length !== 20) {
      throw new Error(`CNJ deve ter 20 dígitos (recebido: ${digits.length})`);
    }
    
    const nnnnnnn = digits.slice(0, 7);
    const dd = digits.slice(7, 9);
    const aaaa = digits.slice(9, 13);
    const j = digits.slice(13, 14);
    const tt = digits.slice(14, 16);
    const oooo = digits.slice(16, 20);
    
    // Validar dígito verificador
    const remainder = BigInt(nnnnnnn + aaaa + j + tt + oooo + '00') % 97n;
    const expectedDD = String(98 - Number(remainder)).padStart(2, '0');
    const isValid = dd === expectedDD;
    
    const formatted = `${nnnnnnn}-${dd}.${aaaa}.${j}.${tt}.${oooo}`;
    const tribunalCode = j + tt;
    const segment = JUSTICE_SEGMENTS[j] || { nome: 'Desconhecido', tipo: 'Desconhecido' };
    const tribunal = DATAJUD_ENDPOINTS[tribunalCode];
    
    return {
      original: cnj,
      formatted,
      isValid,
      expectedDD,
      actualDD: dd,
      numero: nnnnnnn,
      ano: parseInt(aaaa),
      segmento: j,
      segmentoNome: segment.nome,
      segmentoTipo: segment.tipo,
      tribunalCode,
      tribunal: tt,
      origem: oooo,
      datajudEndpoint: tribunal ? {
        url: `https://api-publica.datajud.cnj.jus.br/${tribunal.alias}/_search`,
        alias: tribunal.alias,
        tribunalName: tribunal.fullName,
        tribunalCode,
        justiceType: tribunal.justice
      } : null
    };
  }
  
  static validate(cnj) {
    try {
      const parsed = this.parse(cnj);
      return { valid: parsed.isValid, parsed };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  static getAllDatajudEndpoints() {
    return Object.entries(DATAJUD_ENDPOINTS).map(([code, info]) => ({
      name: info.name,
      tribunal_code: code,
      tribunal_name: info.fullName,
      justice_type: info.justice,
      path: `/${info.alias}/_search`,
      full_url: `https://api-publica.datajud.cnj.jus.br/${info.alias}/_search`,
      method: 'POST',
      description: `Consulta de processos no ${info.fullName}`,
      required_parameters: [
        {
          name: 'numeroProcesso',
          type: 'numero_processo',
          description: 'Número do processo (20 dígitos sem formatação)',
          required: true
        }
      ],
      request_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'object',
            oneOf: [
              { properties: { match: { type: 'object', properties: { numeroProcesso: { type: 'string' } } } } },
              { properties: { bool: { type: 'object', properties: { must: { type: 'array' } } } } }
            ]
          },
          size: { type: 'number', default: 10, maximum: 10000 },
          sort: { type: 'array', items: { type: 'object' } },
          search_after: { type: 'array', description: 'Para paginação com grandes volumes' }
        }
      },
      response_schema: {
        type: 'object',
        properties: {
          took: { type: 'number', description: 'Tempo de execução em ms' },
          timed_out: { type: 'boolean' },
          hits: {
            type: 'object',
            properties: {
              total: { type: 'object', properties: { value: { type: 'number' }, relation: { type: 'string' } } },
              max_score: { type: 'number' },
              hits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _index: { type: 'string' },
                    _id: { type: 'string', description: 'Tribunal_Classe_Grau_OrgaoJulgador_NumeroProcesso' },
                    _score: { type: 'number' },
                    sort: { type: 'array', description: 'Usado para search_after' },
                    _source: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        tribunal: { type: 'string' },
                        numeroProcesso: { type: 'string' },
                        dataAjuizamento: { type: 'string', format: 'date-time' },
                        grau: { type: 'string', enum: ['G1', 'G2', 'JE', 'TR', 'TRU'] },
                        nivelSigilo: { type: 'number' },
                        formato: { type: 'object', properties: { codigo: { type: 'number' }, nome: { type: 'string' } } },
                        sistema: { type: 'object', properties: { codigo: { type: 'number' }, nome: { type: 'string' } } },
                        classe: { type: 'object', properties: { codigo: { type: 'number' }, nome: { type: 'string' } } },
                        assuntos: { type: 'array', items: { type: 'object', properties: { codigo: { type: 'number' }, nome: { type: 'string' } } } },
                        orgaoJulgador: { type: 'object', properties: { codigo: { type: 'number' }, nome: { type: 'string' }, codigoMunicipioIBGE: { type: 'number' } } },
                        movimentos: { type: 'array', items: { type: 'object', properties: { codigo: { type: 'number' }, nome: { type: 'string' }, dataHora: { type: 'string' }, complementosTabelados: { type: 'array' } } } },
                        dataHoraUltimaAtualizacao: { type: 'string', format: 'date-time' },
                        '@timestamp': { type: 'string', format: 'date-time' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }));
  }

  // DataJud Glossary
  static getDatajudGlossary() {
    return {
      id: { type: 'text/keyword', description: 'Identificador: Tribunal_Classe_Grau_OrgaoJulgador_NumeroProcesso' },
      tribunal: { type: 'text/keyword', description: 'Sigla do tribunal' },
      numeroProcesso: { type: 'text/keyword', description: 'CNJ sem formatação (20 dígitos)' },
      dataAjuizamento: { type: 'datetime', description: 'Data de ajuizamento' },
      grau: { type: 'text/keyword', description: 'G1, G2, JE, TR, TRU' },
      nivelSigilo: { type: 'long', description: '0=público, 1-5=níveis de sigilo' },
      formato: { type: 'object', description: 'Físico ou Eletrônico', properties: { codigo: 'long', nome: 'keyword' } },
      sistema: { type: 'object', description: 'Sistema processual (PJe, eSAJ, etc)', properties: { codigo: 'long', nome: 'keyword' } },
      classe: { type: 'object', description: 'Classe processual conforme TPU', properties: { codigo: 'long', nome: 'keyword' } },
      assuntos: { type: 'array', description: 'Assuntos conforme TPU' },
      orgaoJulgador: { type: 'object', description: 'Vara/Serventia', properties: { codigo: 'long', nome: 'keyword', codigoMunicipioIBGE: 'long' } },
      movimentos: { type: 'array', description: 'Histórico de movimentações' },
      dataHoraUltimaAtualizacao: { type: 'datetime', description: 'Última atualização do tribunal' },
      '@timestamp': { type: 'datetime', description: 'Timestamp de indexação no DataJud' }
    };
  }

  // Build query for DataJud
  static buildQuery(options = {}) {
    const { numeroProcesso, classCodigo, orgaoJulgadorCodigo, size = 10, searchAfter = null } = options;
    
    const query = { size };
    
    if (numeroProcesso) {
      query.query = { match: { numeroProcesso: numeroProcesso.replace(/\D/g, '') } };
    } else if (classCodigo || orgaoJulgadorCodigo) {
      const must = [];
      if (classCodigo) must.push({ match: { 'classe.codigo': classCodigo } });
      if (orgaoJulgadorCodigo) must.push({ match: { 'orgaoJulgador.codigo': orgaoJulgadorCodigo } });
      query.query = { bool: { must } };
    }
    
    if (searchAfter) {
      query.sort = [{ '@timestamp': { order: 'asc' } }];
      query.search_after = Array.isArray(searchAfter) ? searchAfter : [searchAfter];
    }
    
    return query;
  }
  
  static formatCNJ(digits) {
    if (!digits || digits.length !== 20) return digits;
    return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9,13)}.${digits.slice(13,14)}.${digits.slice(14,16)}.${digits.slice(16,20)}`;
  }

  // Correct check digit
  static correctCheckDigit(cnj) {
    const digits = String(cnj).replace(/\D/g, '');
    if (digits.length !== 20) return null;
    
    const nnnnnnn = digits.slice(0, 7);
    const aaaa = digits.slice(9, 13);
    const j = digits.slice(13, 14);
    const tt = digits.slice(14, 16);
    const oooo = digits.slice(16, 20);
    
    const remainder = BigInt(nnnnnnn + aaaa + j + tt + oooo + '00') % 97n;
    const correctDD = String(98 - Number(remainder)).padStart(2, '0');
    
    return this.formatCNJ(nnnnnnn + correctDD + aaaa + j + tt + oooo);
  }

  // Get tribunal info by code
  static getTribunalInfo(tribunalCode) {
    return DATAJUD_ENDPOINTS[tribunalCode] || null;
  }

  // Get all tribunals by justice type
  static getTribunalsByJustice(justiceType) {
    return Object.entries(DATAJUD_ENDPOINTS)
      .filter(([, info]) => info.justice === justiceType)
      .map(([code, info]) => ({ code, ...info }));
  }

  // Extract tribunal code from CNJ
  static extractTribunalCode(cnj) {
    const digits = String(cnj).replace(/\D/g, '');
    if (digits.length !== 20) return null;
    return digits.slice(13, 14) + digits.slice(14, 16);
  }
}

export default CNJParser;