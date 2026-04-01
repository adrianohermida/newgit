/**
 * TPUInterpreter - Interpretador de Tabelas Processuais Unificadas
 * Baseado no Manual Oficial CNJ (Março 2014)
 * 
 * Valida, enriquece e padroniza dados de processos judiciais
 * conforme estrutura oficial das tabelas TPU
 */

const TPU_ASSUNTOS_NIVEL1 = [
  'Direito Administrativo e Outras Matérias de Direito Público',
  'Direito Civil',
  'Direito da Criança e do Adolescente',
  'Direito do Consumidor',
  'Direito do Trabalho',
  'Direito Eleitoral',
  'Direito Eleitoral e Processo Eleitoral do STF',
  'Direito Internacional',
  'Direito Marítimo',
  'Direito Penal',
  'Direito Penal Militar',
  'Direito Previdenciário',
  'Direito Processual Civil e do Trabalho',
  'Direito Processual Penal',
  'Direito Processual Penal Militar',
  'Direito Tributário',
  'Registros Públicos'
];

const TPU_CLASSES_NIVEL1 = [
  'Juizados da Infância e da Juventude',
  'Procedimentos Administrativos',
  'Processo Cível e do Trabalho',
  'Processo Criminal',
  'Processo Eleitoral',
  'Processo Militar',
  'Superior Tribunal de Justiça',
  'Supremo Tribunal Federal'
];

const MOVIMENTO_CATEGORIAS = {
  'Magistrado': ['Decisão', 'Despacho', 'Julgamento'],
  'Serventuário': ['Arquivista', 'Contador', 'Distribuidor', 'Escrivão', 'Oficial de Justiça']
};

const COMPLEMENTO_TIPOS = {
  'Livre': 'Complemento livre, não predefinido',
  'Identificador': 'Disponível no sistema, sem valores pré-determinados',
  'Tabelado': 'Valores pré-determinados nas Tabelas Nacionais'
};

class TPUInterpreter {
  /**
   * Valida assunto conforme hierarquia TPU
   * Regra 4.2.1: assunto principal deve ser identificado na petição
   */
  validarAssunto(assunto) {
    if (!assunto || typeof assunto !== 'object') {
      return { valido: false, erro: 'Assunto inválido' };
    }

    const { nivel, codigo, descricao, ramo } = assunto;

    // Verificar nível (1-5)
    if (!nivel || nivel < 1 || nivel > 5) {
      return { valido: false, erro: 'Nível deve estar entre 1 e 5' };
    }

    // Verificar ramo (nível 1)
    if (nivel === 1 && !TPU_ASSUNTOS_NIVEL1.includes(ramo)) {
      return { 
        valido: false, 
        erro: `Ramo inválido. Deve ser um dos 17 ramos definidos`,
        ramosValidos: TPU_ASSUNTOS_NIVEL1
      };
    }

    return { 
      valido: true, 
      mensagem: `Assunto validado em nível ${nivel}`,
      assunto: { nivel, codigo, descricao, ramo }
    };
  }

  /**
   * Valida classe processual conforme hierarquia TPU
   * Regra 5.2.1: tabela é nacional e exaustiva
   */
  validarClasse(classe) {
    if (!classe || typeof classe !== 'object') {
      return { valido: false, erro: 'Classe inválida' };
    }

    const { nivel, codigo, descricao, categoria } = classe;

    if (!nivel || nivel < 1 || nivel > 4) {
      return { valido: false, erro: 'Nível de classe deve estar entre 1 e 4' };
    }

    if (nivel === 1 && !TPU_CLASSES_NIVEL1.includes(categoria)) {
      return {
        valido: false,
        erro: `Categoria inválida. Deve ser uma das 8 categorias definidas`,
        categoriasValidas: TPU_CLASSES_NIVEL1
      };
    }

    return {
      valido: true,
      mensagem: `Classe validada em nível ${nivel}`,
      classe: { nivel, codigo, descricao, categoria }
    };
  }

  /**
   * Valida movimento processual e complementos
   * Regra 6.1: estrutura em categorias (Magistrado/Serventuário)
   */
  validarMovimento(movimento) {
    if (!movimento || typeof movimento !== 'object') {
      return { valido: false, erro: 'Movimento inválido' };
    }

    const { nivel, codigo, descricao, categoria, tipoComplemento, complementos } = movimento;

    // Validar categoria
    if (!categoria || !MOVIMENTO_CATEGORIAS[categoria]) {
      return {
        valido: false,
        erro: 'Categoria deve ser Magistrado ou Serventuário',
        categoriasValidas: Object.keys(MOVIMENTO_CATEGORIAS)
      };
    }

    // Validar tipo de complemento
    if (tipoComplemento && !COMPLEMENTO_TIPOS[tipoComplemento]) {
      return {
        valido: false,
        erro: 'Tipo de complemento inválido',
        tiposValidos: Object.keys(COMPLEMENTO_TIPOS)
      };
    }

    // Validar complementos se existirem
    if (complementos && Array.isArray(complementos)) {
      for (const comp of complementos) {
        if (!comp.tipo || !COMPLEMENTO_TIPOS[comp.tipo]) {
          return {
            valido: false,
            erro: `Complemento com tipo inválido: ${comp.tipo}`
          };
        }
      }
    }

    return {
      valido: true,
      mensagem: 'Movimento validado',
      movimento: { nivel, codigo, descricao, categoria, tipoComplemento, complementos }
    };
  }

  /**
   * Enriquece processo com interpretação TPU completa
   * Implementa regras de padronização conforme manual
   */
  enriquecerProcesso(processo) {
    const enriquecido = { ...processo };
    const validacoes = [];
    const avisos = [];

    // 1. Validar e enriquecer assuntos
    if (processo.assuntos && Array.isArray(processo.assuntos)) {
      enriquecido.assuntos_validados = [];
      
      for (let i = 0; i < processo.assuntos.length; i++) {
        const resultado = this.validarAssunto(processo.assuntos[i]);
        
        if (!resultado.valido) {
          avisos.push({
            tipo: 'Assunto',
            indice: i,
            mensagem: resultado.erro
          });
        } else {
          enriquecido.assuntos_validados.push({
            ...resultado.assunto,
            posicao: i === 0 ? 'principal' : 'complementar',
            validado_em: new Date().toISOString()
          });
        }
      }

      // Regra 4.2.1: primeiro assunto é o principal
      if (enriquecido.assuntos_validados.length > 0) {
        enriquecido.assunto_principal = enriquecido.assuntos_validados[0];
      }
    }

    // 2. Validar e enriquecer classe
    if (processo.classe) {
      const resultado = this.validarClasse(processo.classe);
      
      if (!resultado.valido) {
        avisos.push({
          tipo: 'Classe',
          mensagem: resultado.erro
        });
      } else {
        enriquecido.classe_validada = resultado.classe;
      }
    }

    // 3. Validar e enriquecer movimentos
    if (processo.movimentos && Array.isArray(processo.movimentos)) {
      enriquecido.movimentos_validados = [];
      
      for (let i = 0; i < processo.movimentos.length; i++) {
        const resultado = this.validarMovimento(processo.movimentos[i]);
        
        if (!resultado.valido) {
          avisos.push({
            tipo: 'Movimento',
            indice: i,
            mensagem: resultado.erro
          });
        } else {
          enriquecido.movimentos_validados.push({
            ...resultado.movimento,
            sequencia: i + 1,
            validado_em: new Date().toISOString()
          });
        }
      }
    }

    // 4. Enriquecer com recomendações
    enriquecido.tpu_enriquecimento = {
      data_processamento: new Date().toISOString(),
      assuntos_validados: enriquecido.assuntos_validados?.length || 0,
      classe_validada: !!enriquecido.classe_validada,
      movimentos_validados: enriquecido.movimentos_validados?.length || 0,
      avisos: avisos,
      conformidade: avisos.length === 0 ? 'Total' : 'Parcial'
    };

    return enriquecido;
  }

  /**
   * Gera relatório de conformidade TPU
   */
  gerarRelatorioConformidade(processo) {
    const validacaoAssuntos = processo.assuntos_validados ? 
      `${processo.assuntos_validados.length} assunto(s)` : 'Não validado';
    
    const validacaoClasse = processo.classe_validada ? 
      `${processo.classe_validada.categoria}` : 'Não validada';
    
    const validacaoMovimentos = processo.movimentos_validados ?
      `${processo.movimentos_validados.length} movimento(s)` : 'Não validados';

    return {
      titulo: 'Conformidade com Tabelas Processuais Unificadas (TPU)',
      data: new Date().toLocaleDateString('pt-BR'),
      conformidade: processo.tpu_enriquecimento?.conformidade,
      detalhes: {
        assuntos: validacaoAssuntos,
        classe: validacaoClasse,
        movimentos: validacaoMovimentos,
        assunto_principal: processo.assunto_principal?.descricao,
        ramo_direito: processo.assunto_principal?.ramo
      },
      avisos: processo.tpu_enriquecimento?.avisos || [],
      recomendacoes: this.gerarRecomendacoes(processo)
    };
  }

  /**
   * Gera recomendações baseadas em regras TPU
   */
  gerarRecomendacoes(processo) {
    const recomendacoes = [];

    // Regra 4.2.1: Assunto principal deve ser o primeiro
    if (processo.assuntos_validados?.length > 1) {
      recomendacoes.push({
        regra: '4.2.1',
        tipo: 'Info',
        mensagem: `Processo tem ${processo.assuntos_validados.length} assunto(s). O primeiro é principal.`
      });
    }

    // Regra 4.2.14: Crimes devem ser cadastrados por potencial ofensivo
    if (processo.tipo_processo === 'criminal' && processo.assuntos_validados) {
      const contemCrimes = processo.assuntos_validados.some(a => 
        a.ramo === 'Direito Penal'
      );
      
      if (contemCrimes) {
        recomendacoes.push({
          regra: '4.2.14',
          tipo: 'Atenção',
          mensagem: 'Crimes devem ser classificados por potencial ofensivo (maior pena em abstrato primeiro)'
        });
      }
    }

    // Regra 5.2.2: Autuação e cadastramento próprios
    if (processo.classe_validada) {
      recomendacoes.push({
        regra: '5.2.2',
        tipo: 'Info',
        mensagem: `Classe ${processo.classe_validada.categoria} requer autuação própria (exceto Cumprimento de Sentença)`
      });
    }

    // Regra 6.3.1: Movimentos especificados
    if (processo.movimentos_validados?.length === 0) {
      recomendacoes.push({
        regra: '6.3.1',
        tipo: 'Aviso',
        mensagem: 'Nenhum movimento registrado. Adicione movimentos para rastrear andamento.'
      });
    }

    return recomendacoes;
  }

  /**
   * Valida inconsistências comuns entre tabelas
   * Regra 4.2.6: Termos idênticos em ramos diferentes
   */
  validarInvonsistenciasTPU(processo) {
    const inconsistencias = [];

    if (!processo.assunto_principal) {
      return inconsistencias;
    }

    // Exemplo: "Indenização por Dano Ambiental" pode estar em Administrativo ou Civil
    const termosPotenciaiDuplicados = {
      'Indenização por Dano Ambiental': ['Direito Administrativo', 'Direito Civil'],
      'Anistia': ['Direito Administrativo', 'Direito Tributário', 'Direito do Trabalho'],
      'Violência Doméstica': ['Direito Penal', 'Direito Civil']
    };

    const descricaoAssunto = processo.assunto_principal.descricao;
    
    if (termosPotenciaiDuplicados[descricaoAssunto]) {
      inconsistencias.push({
        aviso: 'Termo pode ter múltiplas classificações',
        termo: descricaoAssunto,
        ramosValidos: termosPotenciaiDuplicados[descricaoAssunto],
        ramoSelecionado: processo.assunto_principal.ramo,
        regra: '4.2.6'
      });
    }

    return inconsistencias;
  }
}

export default TPUInterpreter;