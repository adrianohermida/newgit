import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import KPICard from '@/components/dashboard/KPICard';
import TimelineMovimentos from '@/components/dashboard/TimelineMovimentos';
import AlertasPrazos from '@/components/dashboard/AlertasPrazos';
import AlertasInteligentes from '@/components/dashboard/AlertasInteligentes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Scale, Clock, AlertCircle, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  // Fetch all data (disabled auto-fetch to prevent rate limit violations)
  const { data: intimacoes = [] } = useQuery({
    queryKey: ['intimacoes-dashboard'],
    queryFn: () => base44.entities.IntimacaoAdvise.filter({}, '-dataSincronizacao', 100),
    enabled: false,
    staleTime: Infinity
  });

  const { data: processos = [] } = useQuery({
    queryKey: ['processos-dashboard'],
    queryFn: () => base44.entities.ProcessoAdvise.filter({}, '-dataSincronizacao', 100),
    enabled: false,
    staleTime: Infinity
  });

  const { data: movimentos = [] } = useQuery({
    queryKey: ['movimentos-dashboard'],
    queryFn: () => base44.entities.MovimentoProcesso.filter({}, '-dataMovimento', 20),
    enabled: false,
    staleTime: Infinity
  });

  const { data: tarefas = [] } = useQuery({
    queryKey: ['tarefas-dashboard'],
    queryFn: () => base44.entities.TarefaAgendada.filter({}, '-dataPrazo', 50),
    enabled: false,
    staleTime: Infinity
  });

  // Calculate metrics
  const metricas = useMemo(() => {
    const intimacoesNaoLidas = intimacoes.filter(i => !i.lido).length;
    const processosAtivos = processos.filter(p => p.statusProcesso === 'ativo').length;
    const tarefasAtrasadas = tarefas.filter(t => {
      const hoje = new Date();
      const prazo = new Date(t.dataPrazo);
      return prazo < hoje;
    }).length;
    const movimentosTotais = movimentos.length;

    return {
      intimacoesNaoLidas,
      processosAtivos,
      tarefasAtrasadas,
      movimentosTotais,
      totalIntimacoes: intimacoes.length,
      totalProcessos: processos.length,
      totalTarefas: tarefas.length
    };
  }, [intimacoes, processos, tarefas, movimentos]);

  const calcularTendencia = (valor, total) => {
    if (total === 0) return 0;
    return Math.round((valor / total) * 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Dashboard
          </h1>
          <p className="text-gray-600">
            Visão geral de intimações, processos e prazos
          </p>
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            titulo="Intimações"
            valor={metricas.totalIntimacoes}
            subtitulo={`${metricas.intimacoesNaoLidas} não lidas`}
            icone={FileText}
            cor="blue"
            tendencia={calcularTendencia(metricas.intimacoesNaoLidas, metricas.totalIntimacoes)}
          />

          <KPICard
            titulo="Processos Ativos"
            valor={metricas.processosAtivos}
            subtitulo={`de ${metricas.totalProcessos}`}
            icone={Scale}
            cor="green"
            tendencia={calcularTendencia(metricas.processosAtivos, metricas.totalProcessos)}
          />

          <KPICard
            titulo="Tarefas Atrasadas"
            valor={metricas.tarefasAtrasadas}
            subtitulo={`de ${metricas.totalTarefas}`}
            icone={AlertCircle}
            cor="red"
            tendencia={calcularTendencia(metricas.tarefasAtrasadas, metricas.totalTarefas)}
          />

          <KPICard
            titulo="Movimentos"
            valor={metricas.movimentosTotais}
            subtitulo="últimas 20"
            icone={TrendingUp}
            cor="purple"
          />
        </div>

        {/* Main Content - Tabs */}
        <Tabs defaultValue="timeline" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="timeline">Andamentos</TabsTrigger>
            <TabsTrigger value="alertas">Alertas Inteligentes</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <TimelineMovimentos movimentos={movimentos} />
              </div>
              <div>
                <AlertasPrazos tarefas={tarefas} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="alertas">
            <AlertasInteligentes />
          </TabsContent>
        </Tabs>

        {/* Additional Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Tribunais */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Tribunais</h3>
            <div className="space-y-2">
              {Array.from(new Set(processos.map(p => p.tribunal)))
                .slice(0, 5)
                .map(tribunal => (
                  <div key={tribunal} className="flex justify-between text-sm">
                    <span className="text-gray-600">{tribunal}</span>
                    <span className="font-medium text-gray-900">
                      {processos.filter(p => p.tribunal === tribunal).length}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Status Processos</h3>
            <div className="space-y-2">
              {['ativo', 'suspenso', 'arquivado'].map(status => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="text-gray-600 capitalize">{status}</span>
                  <span className="font-medium text-gray-900">
                    {processos.filter(p => p.statusProcesso === status).length}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Intimations */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Intimações</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Não lidas</span>
                <span className="font-medium text-yellow-600">
                  {metricas.intimacoesNaoLidas}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Lidas</span>
                <span className="font-medium text-green-600">
                  {intimacoes.filter(i => i.lido).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total</span>
                <span className="font-medium text-gray-900">
                  {metricas.totalIntimacoes}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}