/**
 * Função auxiliar compartilhada: Parse CNJ
 * Formato: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
 * Uso: import { parseCNJ, RAMOS_JUDICIARIOS } from './_cnjParseShared.js'
 */

export function parseCNJ(numeroProcesso) {
  if (!numeroProcesso || typeof numeroProcesso !== 'string') {
    throw new Error('Número do processo não informado');
  }

  const normalized = numeroProcesso.replace(/\D/g, '');

  if (normalized.length !== 20) {
    throw new Error(`Número CNJ inválido: deve conter 20 dígitos (recebido: ${normalized.length})`);
  }

  return {
    raw: numeroProcesso,
    normalized,
    sequencial: normalized.substring(0, 7),
    digitoVerificador: normalized.substring(7, 9),
    ano: normalized.substring(9, 13),
    ramo: normalized.substring(13, 14),
    tribunal: normalized.substring(14, 16),
    serventia: normalized.substring(16, 20),
    valido: true,
  };
}

export const RAMOS_JUDICIARIOS = {
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