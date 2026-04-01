/**
 * Utilitário: Parse CNJ
 * Extrai informações do número CNJ
 * Formato: NNNNNNN-DD.AAAA.J.TT.OOOO
 */

const JUSTICA_MAP = {
  '1': 'Justiça Federal',
  '2': 'Justiça do Trabalho',
  '3': 'Justiça Eleitoral',
  '4': 'Justiça Militar',
  '5': 'STJ',
  '6': 'STF',
  '7': 'TST',
  '8': 'Justiça Estadual',
  '9': 'TSE'
};

const TRIBUNAL_MAP = {
  '01': 'TRF 1ª Região',
  '02': 'TRF 2ª Região',
  '03': 'TRF 3ª Região',
  '04': 'TRF 4ª Região',
  '05': 'TRF 5ª Região',
  '06': 'TRF 6ª Região',
  '07': 'TJAC',
  '08': 'TJAL',
  '09': 'TJAP',
  '10': 'TJAM',
  '11': 'TJBA',
  '12': 'TJCE',
  '13': 'TJDF',
  '14': 'TJES',
  '15': 'TJGO',
  '16': 'TJMA',
  '17': 'TJMT',
  '18': 'TJMS',
  '19': 'TJMG',
  '20': 'TJPA',
  '21': 'TJPB',
  '22': 'TJPR',
  '23': 'TJPE',
  '24': 'TJPI',
  '25': 'TJRJ',
  '26': 'TJSP',
  '27': 'TJRN',
  '28': 'TJRS',
  '29': 'TJRO',
  '30': 'TJRR',
  '31': 'TJSC',
  '32': 'TJSE',
  '33': 'TJTO'
};

export function parseCNJ(cnj) {
  if (!cnj) return null;
  
  // Remover pontuação e validar formato
  const cnjLimpo = cnj.replace(/\D/g, '');
  
  if (cnjLimpo.length !== 20) {
    return { error: 'CNJ deve ter 20 dígitos' };
  }
  
  // Regex: NNNNNNN-DD.AAAA.J.TT.OOOO
  const regex = /(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/;
  const match = cnjLimpo.match(regex);
  
  if (!match) {
    return { error: 'Formato CNJ inválido' };
  }
  
  const [_, sequencial, dv, ano, justica, tribunal, comarca] = match;
  
  // Determinar instância
  let instancia = 'primeira';
  if (justica === '8' && parseInt(tribunal) > 0) {
    // Justiça Estadual - verificar se é tribunal (2ª instância)
    instancia = tribunal === '26' ? 'primeira' : 'segunda';
  } else if (['5', '6', '7', '9'].includes(justica)) {
    instancia = 'tribunal_superior';
  }
  
  return {
    sequencial,
    digitos_verificadores: dv,
    ano: parseInt(ano),
    justica_codigo: justica,
    justica: JUSTICA_MAP[justica] || `Justiça ${justica}`,
    tribunal_codigo: tribunal,
    tribunal: TRIBUNAL_MAP[tribunal] || `Tribunal ${tribunal}`,
    comarca_codigo: comarca,
    instancia,
    cnj_formatado: `${sequencial}-${dv}.${ano}.${justica}.${tribunal}.${comarca}`,
    cnj_limpo: cnjLimpo,
  };
}

/**
 * Validar dígitos verificadores do CNJ
 */
export function validarDigitosCNJ(cnj) {
  const cnjLimpo = cnj.replace(/\D/g, '');
  
  if (cnjLimpo.length !== 20) return false;
  
  const sequencial = cnjLimpo.substring(0, 7);
  const dv = cnjLimpo.substring(7, 9);
  const resto = cnjLimpo.substring(9);
  
  // Cálculo módulo 97
  const numero = parseInt(sequencial + resto);
  const calculado = 98 - (numero % 97);
  const dvCalculado = calculado.toString().padStart(2, '0');
  
  return dv === dvCalculado;
}

/**
 * Formatar CNJ para exibição
 */
export function formatarCNJ(cnj) {
  if (!cnj) return '';
  
  const cnjLimpo = cnj.replace(/\D/g, '');
  
  if (cnjLimpo.length !== 20) return cnj;
  
  return `${cnjLimpo.substring(0, 7)}-${cnjLimpo.substring(7, 9)}.${cnjLimpo.substring(9, 13)}.${cnjLimpo.substring(13, 14)}.${cnjLimpo.substring(14, 16)}.${cnjLimpo.substring(16, 20)}`;
}

/**
 * Extrair CNJ de texto
 */
export function extrairCNJ(texto) {
  if (!texto) return null;
  
  // Regex para CNJ com ou sem pontuação
  const regex = /(\d{7})[-\s]?(\d{2})\.?(\d{4})\.?(\d{1})\.?(\d{2})\.?(\d{4})/g;
  const matches = texto.match(regex);
  
  if (!matches) return null;
  
  return matches.map(match => {
    const limpo = match.replace(/\D/g, '');
    return formatarCNJ(limpo);
  });
}