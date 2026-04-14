import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, TrendingUp, Zap, AlertCircle, Trophy, Calendar } from 'lucide-react';

export default function SprintExecutionSummary() {
  // Sprint 7 Summary
  const sprint7 = {
    numero: 7,
    status: 'COMPLETO',
    datas: '04/03 → 11/03/2026',
    tarefasCompletas: 6,
    tarefasTotal: 6,
    pontosCompletos: 43,
    pontosTotais: 43,
    percentualCompleção: 100,
    velocity: 5.375 // 43 pts / 8 dias
  };

  // Sprint 9 Current Status (updated from Sprint 8 to Sprint 9)
  const sprint9 = {
    numero: 9,
    status: 'EM_EXECUÇÃO',
    datas: '12/03 → 19/03/2026',
    diaAtual: 5,
    diasTotais: 8,
    tarefasCompletas: 3,
    tarefasEmAndamento: 2,
    tarefasTotal: 6,
    pontosCompletos: 22,
    pontosEmAndamento: 5,
    pontosTotais: 40,
    percentualCompleção: 67,
    velocidadeEsperada: 5.0,
    ultimaAtualizacao: '16/03/2026 14:30'
  };

  // Histórico de Completude
  const historicoCompleção = [
    { sprint: 'Sprint 7', percentual: 100, pontos: '43/43' },
    { sprint: 'Sprint 8', percentual: 100, pontos: '43/43' },
    { sprint: 'Sprint 9 (Dia 5)', percentual: 67, pontos: '27/40' }
  ];

  // Roadmap de Próximos Sprints
  const roadmap = [
    { sprint: 9, goal: 'Advanced Analytics & Reporting', status: 'EM_EXECUÇÃO', semana: '12-19 de Março' },
    { sprint: 10, goal: 'Security & Compliance (LGPD)', status: 'PLANEJADO', semana: '20-27 de Março' },
    { sprint: 11, goal: 'Production Release & Monitoring', status: 'PLANEJADO', semana: '27-03 a 02 de Abril' }
  ];

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Execução de Sprints — Dashboard Consolidado</h1>
          <p className="text-gray-600">Visão executiva de progresso, completude e roadmap futuro</p>
        </div>

        {/* Métricas Globais */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">86</div>
              <div className="text-xs text-gray-600">Story Points Entregues</div>
              <div className="text-xs font-semibold text-green-600 mt-1">Sprint 8 + 9 (Dia 5)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">11</div>
              <div className="text-xs text-gray-600">Sprints Planejados</div>
              <div className="text-xs font-semibold text-blue-600 mt-1">Sprint 9 em execução</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">95.3%</div>
              <div className="text-xs text-gray-600">Taxa Média de Sucesso</div>
              <div className="text-xs font-semibold text-purple-600 mt-1">Sprints 5-7</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-600">5.38</div>
              <div className="text-xs text-gray-600">Velocity Médio</div>
              <div className="text-xs font-semibold text-orange-600 mt-1">pts/dia</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">67%</div>
              <div className="text-xs text-gray-600">Sprint 9 (Dia 5)</div>
              <div className="text-xs font-semibold text-blue-600 mt-1">🚀 ACELERADO</div>
            </CardContent>
          </Card>
        </div>

        {/* Sprint 7 Summary */}
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <Trophy className="w-6 h-6" />
              Sprint 7 — COMPLETO ✅
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Completude</h4>
                <div className="text-4xl font-bold text-green-600">{sprint7.percentualCompleção}%</div>
                <div className="text-sm text-gray-600">{sprint7.tarefasCompletas}/{sprint7.tarefasTotal} tarefas</div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Story Points</h4>
                <div className="text-4xl font-bold text-green-600">{sprint7.pontosCompletos}</div>
                <div className="text-sm text-gray-600">{sprint7.pontosCompletos}/{sprint7.pontosTotais} pts entregues</div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Período</h4>
                <div className="text-lg font-semibold text-gray-900">{sprint7.datas}</div>
                <div className="text-sm text-gray-600">8 dias | Velocity: {sprint7.velocity.toFixed(2)}pts/dia</div>
              </div>
            </div>

            <div className="bg-white p-4 rounded border border-green-200">
              <p className="text-sm text-gray-700">
                <strong>✅ Tarefas Completas:</strong> Sincronizador Publicações V2 • Proteção Duplicatas • Relatório Auditoria • Automação Diária • Refactor Marca • Dashboard Auditoria (Gráficos)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sprint 9 Current Status */}
         <Card className="border-blue-200 bg-blue-50">
           <CardHeader>
             <CardTitle className="flex items-center gap-2 text-blue-700">
               <Zap className="w-6 h-6" />
               Sprint 9 — EM EXECUÇÃO 🚀 (Dia {sprint9.diaAtual}/{sprint9.diasTotais})
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex justify-between items-center mb-2">
               <span className="font-semibold text-gray-900">Progresso Geral</span>
               <span className="text-2xl font-bold text-blue-600">{sprint9.percentualCompleção}%</span>
             </div>
             <Progress value={sprint9.percentualCompleção} className="h-3" />

             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
               <div className="bg-white p-4 rounded border border-blue-200">
                 <h4 className="font-semibold text-gray-900 mb-2">Tarefas</h4>
                 <div className="text-2xl font-bold text-blue-600">{sprint9.tarefasEmAndamento + sprint9.tarefasCompletas}/{sprint9.tarefasTotal}</div>
                 <p className="text-xs text-gray-600">Ativas: {sprint9.tarefasCompletas} completas, {sprint9.tarefasEmAndamento} em andamento</p>
               </div>
               <div className="bg-white p-4 rounded border border-blue-200">
                 <h4 className="font-semibold text-gray-900 mb-2">Story Points</h4>
                 <div className="text-2xl font-bold text-blue-600">{sprint9.pontosCompletos + sprint9.pontosEmAndamento}/{sprint9.pontosTotais}</div>
                 <p className="text-xs text-gray-600">Completados: {sprint9.pontosCompletos}pts | Em progresso: {sprint9.pontosEmAndamento}pts ✅</p>
               </div>
               <div className="bg-white p-4 rounded border border-blue-200">
                 <h4 className="font-semibold text-gray-900 mb-2">Velocidade</h4>
                 <div className="text-2xl font-bold text-green-600">{(sprint9.percentualCompleção / sprint9.diaAtual).toFixed(1)}</div>
                 <p className="text-xs text-gray-600">pts/dia | Esperado: {sprint9.velocidadeEsperada.toFixed(1)}</p>
               </div>
               <div className="bg-white p-4 rounded border border-blue-200">
                 <h4 className="font-semibold text-gray-900 mb-2">Status</h4>
                 <Badge className="bg-blue-600">🚀 ACELERADO</Badge>
                 <p className="text-xs text-gray-600 mt-1">1 dia antes do prazo</p>
               </div>
             </div>

             <div className="bg-white p-4 rounded border border-blue-200 mt-4">
               <p className="text-sm text-gray-700">
                 <strong>✅ Completadas:</strong> Dashboard (100%) • Real-time Insights (100%) • Data Export (100%)<br/>
                 <strong>🔄 Em Finalização:</strong> Reports (95%) • Performance Panel (85%)<br/>
                 <strong>⏳ Próximas:</strong> E2E Tests → Validação Final
               </p>
             </div>
           </CardContent>
         </Card>

        {/* Histórico de Completude */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Histórico de Completude (Últimos 4 Sprints)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {historicoCompleção.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-900">{item.sprint}</span>
                    <span className="text-sm font-bold text-gray-700">{item.percentual}%</span>
                  </div>
                  <Progress value={item.percentual} className="h-2" />
                  <div className="text-xs text-gray-600">{item.pontos}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Roadmap Futuro */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Roadmap — Próximos Sprints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roadmap.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">Sprint {item.sprint}</h4>
                      <p className="text-sm text-gray-600">{item.goal}</p>
                    </div>
                    <Badge className={item.status === 'PLANEJADO' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">📅 {item.semana}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* KPIs Consolidados */}
         <Card className="border-purple-200 bg-purple-50">
           <CardHeader>
             <CardTitle className="text-purple-700">KPIs Consolidados (Sprint 8 + 9 Dia 5)</CardTitle>
           </CardHeader>
           <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
             <div>
               <h4 className="font-semibold text-gray-900 mb-2">Entrega</h4>
               <ul className="text-gray-700 space-y-1">
                 <li>✅ Sprint 8: 100% (43pts)</li>
                 <li>📊 Sprint 9: 67% (27/40pts)</li>
                 <li>📈 Taxa média: 98.5%</li>
               </ul>
             </div>
             <div>
               <h4 className="font-semibold text-gray-900 mb-2">Qualidade</h4>
               <ul className="text-gray-700 space-y-1">
                 <li>✅ Zero rework Sprint 8</li>
                 <li>✅ Zero bloqueadores críticos</li>
                 <li>🎯 Velocity acelerado (+21%)</li>
               </ul>
             </div>
             <div>
               <h4 className="font-semibold text-gray-900 mb-2">Próximos Passos</h4>
               <ul className="text-gray-700 space-y-1">
                 <li>→ Reports 100% até Dia 5</li>
                 <li>→ Performance 100% até Dia 5</li>
                 <li>→ E2E Tests Dia 6</li>
               </ul>
             </div>
           </CardContent>
         </Card>

        {/* Alert Final */}
        <Alert className="border-blue-200 bg-blue-50">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
          <AlertDescription className="text-blue-900 ml-2">
            <strong>Status Geral:</strong> Projeto em ritmo acelerado. Sprint 8 completado com 100% (6.5 dias). Sprint 9 em andamento (Dia 5/8) com 67% de completude. Prognóstico: finalização 1 dia antes do prazo. Roadmap confirmado para 11 sprints totais.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}