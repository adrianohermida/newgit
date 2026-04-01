/**
 * ⚠️ DEPRECATED - 27/fev/2026
 * 
 * Este componente foi deprecado em favor de:
 * - sincronizarTpuViaSgt() para sincronização real de dados
 * - coletarSchemaTPU() para métricas e schema
 * - TPUAnalyticsDashboard para visualizações
 * 
 * Motivo: função de coleta de métricas foi integrada ao sincronizador
 * que agora coleta TODOS os dados disponíveis com paginação inteligente.
 */
export default function TPUMetricsCollector() {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded">
      <h3 className="text-red-800 font-bold">⚠️ Componente Deprecado</h3>
      <p className="text-red-700 text-sm mt-2">
        TPUMetricsCollector foi deprecado. Use sincronizarTpuViaSgt() para sincronizar dados.
      </p>
    </div>
  );
}