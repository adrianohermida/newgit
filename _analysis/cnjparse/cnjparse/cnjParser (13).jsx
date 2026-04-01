/**
 * Utilitário para normalização de números CNJ
 * Formato API: 00000000000000000000 (20 dígitos)
 * Formato Display: 0000000-00.0000.0.00.0000
 */

export function normalizarCNJ(valor) {
  if (!valor) return null;
  
  // Remove tudo exceto dígitos
  const digitos = String(valor).replace(/\D/g, '');
  
  // Valida se tem 20 dígitos
  if (digitos.length !== 20) return null;
  
  return digitos;
}

export function formatarCNJDisplay(cnj) {
  const digitos = normalizarCNJ(cnj);
  if (!digitos) return cnj;
  
  // 0000000-00.0000.0.00.0000
  return `${digitos.slice(0, 7)}-${digitos.slice(7, 9)}.${digitos.slice(9, 13)}.${digitos.slice(13, 14)}.${digitos.slice(14, 16)}.${digitos.slice(16, 20)}`;
}

export function extrairCNJDeCampo(objeto) {
  // Expansão de campos possíveis (case-insensitive)
  const camposPossiveis = [
    'numero_cnj', 'numeroCnj', 'cnj', 'numero', 'processo',
    'Numero CNJ', 'Número CNJ', 'N° CNJ', 'NUMERO_CNJ',
    'NumeroProcesso', 'numero_processo', 'Processo',
    'CNJ', 'Nº Processo', 'Nº CNJ'
  ];
  
  // Tenta extrair de campos conhecidos (case-insensitive)
  for (const campo of camposPossiveis) {
    const valorExato = objeto[campo];
    if (valorExato) {
      const normalizado = normalizarCNJ(valorExato);
      if (normalizado) return normalizado;
    }
    
    // Busca case-insensitive
    const campoLower = campo.toLowerCase();
    for (const key of Object.keys(objeto)) {
      if (key.toLowerCase() === campoLower && objeto[key]) {
        const normalizado = normalizarCNJ(objeto[key]);
        if (normalizado) return normalizado;
      }
    }
  }
  
  // Tenta extrair do primeiro campo que parece ser CNJ
  for (const key of Object.keys(objeto)) {
    const valor = objeto[key];
    if (valor && typeof valor === 'string') {
      const digitos = valor.replace(/\D/g, '');
      if (digitos.length === 20) {
        return digitos;
      }
    }
  }
  
  return null;
}