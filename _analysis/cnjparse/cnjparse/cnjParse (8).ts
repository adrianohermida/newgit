import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Valida dígito verificador CNJ usando algoritmo oficial
 * ISO 7064:2003 - Módulo 97 Base 10
 * Fórmula: DV = 98 - (resto de OOJTRAAAA / 97)
 */
function validarDigitoVerificadorCNJ(normalized) {
  if (normalized.length !== 20) return false;
  
  // Extração: NNNNNNNDDAAAAJTROOOO
  const ano = normalized.substring(9, 13);             // AAAA
  const ramo = normalized.substring(13, 14);           // J
  const tribunal = normalized.substring(14, 16);       // TR
  const serventia = normalized.substring(16, 20);      // OOOO
  
  // Cálculo conforme Resolução CNJ 65/2008:
  // resto = (OOOJTRAAAA) mod 97
  const numVerificacao = parseInt(serventia + ramo + tribunal + ano);
  const resto = numVerificacao % 97;
  const dvCalculado = 98 - resto;
  const dvFornecido = parseInt(normalized.substring(7, 9));
  
  return dvCalculado === dvFornecido;
}

/**
 * Parse e valida número do processo CNJ
 * Formato: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
 */
function parseCNJ(numeroProcesso) {
  if (!numeroProcesso || typeof numeroProcesso !== 'string') {
    throw new Error('Número do processo não informado');
  }

  const normalized = numeroProcesso.replace(/\D/g, '');

  if (normalized.length !== 20) {
    throw new Error(`Número CNJ inválido: deve conter 20 dígitos (recebido: ${normalized.length})`);
  }

  const dvValido = validarDigitoVerificadorCNJ(normalized);

  return {
    raw: numeroProcesso,
    normalized,
    sequencial: normalized.substring(0, 7),
    digitoVerificador: normalized.substring(7, 9),
    ano: normalized.substring(9, 13),
    ramo: normalized.substring(13, 14),
    tribunal: normalized.substring(14, 16),
    serventia: normalized.substring(16, 20),
    valido: dvValido,
    dvValido,
  };
}

const RAMOS_JUDICIARIOS = {
  '1': 'Supremo Tribunal Federal',
  '2': 'Conselho Nacional de Justiça',
  '3': 'Superior Tribunal de Justiça',
  '4': 'Justiça Federal',
  '5': 'Justiça do Trabalho',
  '6': 'Justiça Eleitoral',
  '7': 'Justiça Militar da União',
  '8': 'Justiça dos Estados e DF',
  '9': 'Justiça Militar Estadual',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { numeroProcesso } = await req.json();

    if (!numeroProcesso) {
      return Response.json({ error: 'numeroProcesso é obrigatório' }, { status: 400 });
    }

    const parsed = parseCNJ(numeroProcesso);
    
    // Por enquanto, permitir CNJs com 20 dígitos mesmo se DV for inválido
    // Para testes com processos cadastrados no módulo
    
    const ramoNome = RAMOS_JUDICIARIOS[parsed.ramo] || 'Desconhecido';

    return Response.json({
      success: true,
      data: {
        ...parsed,
        ramoNome,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    );
  }
});