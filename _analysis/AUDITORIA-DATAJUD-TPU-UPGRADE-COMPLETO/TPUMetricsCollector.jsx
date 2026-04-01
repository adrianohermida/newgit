import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Target, Database, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const TABELAS_TPU = [
  { key: 'classes', label: 'Classes Processuais', icon: '📋' },
  { key: 'assuntos', label: 'Assuntos Processuais', icon: '📚' },
  { key: 'movimentos', label: 'Movimentos Processuais', icon: '⚙️' },
  { key: 'documentos', label: 'Documentos Processuais', icon: '📄' }
];

export default function TPUMetricsCollector({ onMetricasCarregadas }) {
  const [metricas, setMetricas] = useState(null);
  const [metas, setMetas] = useState({
    classes: 0,
    assuntos: 0,
    movimentos: 0,
    documentos: 0
  });
  const [showMetas, setShowMetas] = useState(false);

  const fetchMetricsMutation = useMutation({
    mutationFn: async () => {
      try {
        // Buscar estrutura de cada tabela via CNJ SGT
        const classesRes = await base44.functions.invoke('buscarTPU', {
          tipo: 'classes',
          buscarMetricas: true
        });
        
        const assuntosRes = await base44.functions.invoke('buscarTPU', {
          tipo: 'assuntos',
          buscarMetricas: true
        });
        
        const movimentosRes = await base44.functions.invoke('buscarTPU', {
          tipo: 'movimentos',
          buscarMetricas: true
        });
        
        const documentosRes = await base44.functions.invoke('buscarTPU', {
          tipo: 'documentos',
          buscarMetricas: true
        });

        const dados = {
          classes: classesRes.data?.metricas || {},
          assuntos: assuntosRes.data?.metricas || {},
          movimentos: movimentosRes.data?.metricas || {},
          documentos: documentosRes.data?.metricas || {},
          timestamp: new Date().toISOString(),
          total: (classesRes.data?.metricas?.total || 0) +
                 (assuntosRes.data?.metricas?.total || 0) +
                 (movimentosRes.data?.metricas?.total || 0) +
                 (documentosRes.data?.metricas?.total || 0)
        };

        // Definir metas automáticas (100% dos registros)
        setMetas({
          classes: dados.classes.total || 0,
          assuntos: dados.assuntos.total || 0,
          movimentos: dados.movimentos.total || 0,
          documentos: dados.documentos.total || 0
        });

        setMetricas(dados);
        onMetricasCarregadas?.(dados);
        toast.success('Métricas carregadas com sucesso');
        return dados;
      } catch (err) {
        toast.error('Erro ao buscar métricas: ' + err.message);
        throw err;
      }
    }
  });

  const handleUpdateMeta = (tabela, valor) => {
    setMetas(prev => ({
      ...prev,
      [tabela]: Number(valor) || 0
    }));
  };

  const calcularProgresso = (tabela, localCount) => {
    const meta = metas[tabela] || 0;
    if (meta === 0) return 0;
    return Math.min(100, Math.round((localCount / meta) * 100));
  };

  return (
    <div className="space-y-4">
      {/* Botão para buscar métricas */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            Buscar Métricas de Importação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-blue-700">
            Recupera a quantidade total de registros de cada tabela TPU no CNJ SGT para estabelecer metas de importação
          </p>
          <Button
            onClick={() => fetchMetricsMutation.mutate()}
            disabled={fetchMetricsMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {fetchMetricsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Consultando CNJ...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Buscar Métricas de Todas as Tabelas
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Métricas Carregadas */}
      {metricas && (
        <>
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                Estrutura de Tabelas (CNJ SGT)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-white rounded p-2">
                  <p className="text-slate-600 font-medium">Total de Registros</p>
                  <p className="text-2xl font-bold text-green-600">{metricas.total?.toLocaleString('pt-BR') || 0}</p>
                </div>
                <div className="bg-white rounded p-2">
                  <p className="text-slate-600 font-medium">Tabelas Ativas</p>
                  <p className="text-2xl font-bold text-blue-600">4</p>
                </div>
                <div className="bg-white rounded p-2">
                  <p className="text-slate-600 font-medium">Data Captura</p>
                  <p className="text-xs text-slate-700 mt-1">{new Date(metricas.timestamp).toLocaleString('pt-BR')}</p>
                </div>
                <div className="bg-white rounded p-2">
                  <p className="text-slate-600 font-medium">Status</p>
                  <Badge className="mt-1 bg-green-100 text-green-800">✓ Pronto</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metas por Tabela */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TABELAS_TPU.map(tabela => {
              const metrica = metricas[tabela.key] || {};
              const meta = metas[tabela.key] || 0;
              const localCount = metrica.local_count || 0;
              const progresso = calcularProgresso(tabela.key, localCount);
              const faltam = Math.max(0, meta - localCount);

              return (
                <Card key={tabela.key} className="border-slate-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{tabela.icon}</span>
                      {tabela.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Métricas da Tabela */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-blue-50 rounded p-2">
                        <p className="text-slate-600">CNJ (Total)</p>
                        <p className="font-bold text-lg text-blue-600">
                          {(metrica.total || 0).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="bg-amber-50 rounded p-2">
                        <p className="text-slate-600">Locais</p>
                        <p className="font-bold text-lg text-amber-600">
                          {localCount.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    {/* Meta Editável */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 flex items-center gap-1 mb-1">
                        <Target className="w-3 h-3" />
                        Meta de Importação
                      </label>
                      <Input
                        type="number"
                        value={meta}
                        onChange={(e) => handleUpdateMeta(tabela.key, e.target.value)}
                        className="text-sm"
                      />
                    </div>

                    {/* Barra de Progresso */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">Progresso</span>
                        <span className="text-slate-600">{progresso}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            progresso === 100 ? 'bg-green-500' : progresso >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${progresso}%` }}
                        />
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        {faltam > 0 ? (
                          <span className="flex items-center gap-1 text-amber-700">
                            <AlertCircle className="w-3 h-3" />
                            Faltam {faltam.toLocaleString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-green-700 font-medium">✓ Meta atingida</span>
                        )}
                      </span>
                      <Badge variant={progresso === 100 ? 'default' : 'outline'}>
                        {progresso}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Resumo Geral */}
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumo de Metas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Meta Total:</span>
                  <span className="font-bold">{Object.values(metas).reduce((a, b) => a + b, 0).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Importados:</span>
                  <span className="font-bold">{Object.values(metricas).filter(m => m.local_count).reduce((a, b) => a + (b.local_count || 0), 0).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-slate-600">Progresso Geral:</span>
                  <span className="font-bold text-blue-600">
                    {Math.round(
                      (Object.values(metricas).filter(m => m.local_count).reduce((a, b) => a + (b.local_count || 0), 0) / 
                       Object.values(metas).reduce((a, b) => a + b, 0) || 0) * 100
                    )}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}