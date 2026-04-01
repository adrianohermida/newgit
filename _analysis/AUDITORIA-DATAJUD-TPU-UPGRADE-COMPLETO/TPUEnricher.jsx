/**
 * TPUEnricher.js
 * Enriquece dados DataJud com informações TPU (tabelas unificadas)
 * Valida schema TPU: assuntos, classes, movimentos
 */
import { base44 } from "@/api/base44Client";

export class TPUEnricher {
  /**
   * Cache em memória de TPU data (válido por sessão)
   */
  static tpuCache = {
    classes: null,
    assuntos: null,
    movimentos: null,
  };

  /**
   * Carrega tabelas TPU da base
   */
  static async carregarTPU() {
    if (this.tpuCache.classes && this.tpuCache.assuntos && this.tpuCache.movimentos) {
      return this.tpuCache;
    }

    try {
      const [classes, assuntos, movimentos] = await Promise.all([
        base44.entities.TPUClasses.list(),
        base44.entities.TPUAssuntos.list(),
        base44.entities.TPUMovimentos.list(),
      ]);

      this.tpuCache = {
        classes: new Map(classes.map(c => [c.cod_classe, c])),
        assuntos: new Map(assuntos.map(a => [a.cod_assunto, a])),
        movimentos: new Map(movimentos.map(m => [m.cod_movimento, m])),
      };

      return this.tpuCache;
    } catch (err) {
      console.warn('[TPUEnricher] Falha ao carregar TPU:', err.message);
      return { classes: new Map(), assuntos: new Map(), movimentos: new Map() };
    }
  }

  /**
   * Valida e enriquece assuntos contra TPU
   */
  static async validarAssuntos(assuntos) {
    const tpu = await this.carregarTPU();
    
    return (assuntos || []).map(a => {
      const tpuAssunto = tpu.assuntos.get(a.codigo);
      return {
        codigo: a.codigo,
        nome: a.nome,
        tpuValido: !!tpuAssunto,
        ramoDireito: tpuAssunto?.ramo_direito || null,
      };
    });
  }

  /**
   * Valida e enriquece classe contra TPU
   */
  static async validarClasse(codClasse) {
    const tpu = await this.carregarTPU();
    const tpuClasse = tpu.classes.get(codClasse);
    
    return {
      codigo: codClasse,
      tpuValido: !!tpuClasse,
      nome: tpuClasse?.nome || null,
      sigla: tpuClasse?.sigla || null,
    };
  }

  /**
   * Valida e enriquece movimentos contra TPU
   */
  static async validarMovimentos(movimentos) {
    const tpu = await this.carregarTPU();
    
    return (movimentos || []).map(m => {
      const tpuMov = tpu.movimentos.get(m.codigo);
      return {
        codigo: m.codigo,
        nome: m.nome,
        dataHora: m.dataHora,
        tpuValido: !!tpuMov,
        categoria: tpuMov?.categoria || null,
        subcategoria: tpuMov?.subcategoria || null,
      };
    });
  }

  /**
   * Enriquece processo completo com validações TPU
   */
  static async enriquecerProcesso(processo) {
    try {
      const [assuntos, classe, movimentos] = await Promise.all([
        this.validarAssuntos(processo.assuntos || []),
        this.validarClasse(processo.classe_judicial),
        this.validarMovimentos(processo.movimentos || []),
      ]);

      return {
        ...processo,
        assuntos,
        classe,
        movimentos,
        sync_status: {
          ...(processo.sync_status || {}),
          tpu: {
            status: 'ok',
            ultima_sincronizacao: new Date().toISOString(),
            assuntosValidos: assuntos.filter(a => a.tpuValido).length,
            movimentosValidos: movimentos.filter(m => m.tpuValido).length,
          },
        },
      };
    } catch (err) {
      console.warn('[TPUEnricher] Erro ao enriquecer:', err.message);
      return processo;
    }
  }
}