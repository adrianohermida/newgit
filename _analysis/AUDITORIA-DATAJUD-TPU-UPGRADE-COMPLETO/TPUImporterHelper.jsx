/**
 * Helper para diagnosticar problemas de import SQL
 */
export const diagnosticTpuImport = {
  // Validar arquivo antes de enviar
  validateFile: (file) => {
    const issues = [];
    
    if (!file) issues.push('Arquivo não selecionado');
    if (file?.size === 0) issues.push('Arquivo vazio');
    if (file?.size > 100 * 1024 * 1024) issues.push('Arquivo > 100MB');
    if (!file?.name.endsWith('.sql') && !file?.name.endsWith('.txt')) {
      issues.push('Formato inválido (esperado .sql ou .txt)');
    }
    
    return { valid: issues.length === 0, issues };
  },

  // Esperado no arquivo
  expectedPatterns: [
    'INSERT INTO tpu_classe',
    'INSERT INTO tpu_assunto',
    'INSERT INTO tpu_movimento',
    'INSERT INTO tpu_documento'
  ],

  // Monitoramento de progresso
  trackProgress: (totalSize) => {
    return {
      start: Date.now(),
      totalSize,
      trackChunk: (chunkSize) => {
        const elapsed = Date.now() - this.start;
        const percentage = Math.round((chunkSize / totalSize) * 100);
        const estimatedTotal = Math.round(elapsed / (chunkSize / totalSize));
        return {
          percentage,
          elapsed,
          estimated: estimatedTotal,
          remaining: estimatedTotal - elapsed
        };
      }
    };
  },

  // Erros comuns
  commonErrors: {
    'No such file': 'Arquivo não encontrado no servidor',
    'Format error': 'Formato SQL inválido',
    'Duplicate entry': 'Registros duplicados detectados',
    'Connection timeout': 'Timeout ao conectar com banco',
    'Invalid encoding': 'Encoding do arquivo não é UTF-8'
  }
};

export default diagnosticTpuImport;