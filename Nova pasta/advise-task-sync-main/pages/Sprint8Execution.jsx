import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock, AlertCircle, Zap, TrendingUp, Target } from 'lucide-react';

export default function Sprint8Execution() {
  const [expandedTask, setExpandedTask] = useState(null);

  const tarefas = [
    {
      id: 1,
      nome: 'Mobile App (React Native)',
      descricao: 'Aplicativo iOS/Android com sincronização em tempo real',
      prioridade: 'CRITICAL',
      pontosStory: 13,
      status: 'EM_ANDAMENTO',
      progresso: 35,
      dias: 4,
      diasRestantes: 2.6,
      bloqueadores: [],
      ultimaAtualizacao: 'Hoje 14:30 — Setup inicial e estrutura de pastas concluída',
      owner: 'Mobile Team'
    },
    {
      id: 2,
      nome: 'Integração Intimações V2',
      descricao: 'Sync avançada com filtros, busca e webhooks',
      prioridade: 'CRITICAL',
      pontosStory: 12,
      status: 'EM_ANDAMENTO',
      progresso: 45,
      dias: 3.5,
      diasRestantes: 1.9,
      bloqueadores: [],
      ultimaAtualizacao: 'Hoje 13:15 — Endpoints da API implementados',
      owner: 'Backend'
    },
    {
      id: 3,
      nome: 'Google Calendar Sync',
      descricao: 'Integração automática de prazos com Google Calendar',
      prioridade: 'HIGH',
      pontosStory: 8,
      status: 'PLANEJADO',
      progresso: 0,
      dias: 2,
      diasRestantes: 2,
      bloqueadores: ['Sprint 7 - Auditoria completada'],
      ultimaAtualizacao: 'Não iniciado',
      owner: 'Backend'
    },
    {
      id: 4,
      nome: 'Teste E2E Sincronização',
      descricao: 'Cobertura completa de testes end-to-end',
      prioridade: 'HIGH',
      pontosStory: 5,
      status: 'PLANEJADO',
      progresso: 0,
      dias: 1.5,
      diasRestantes: 1.5,
      bloqueadores: ['Mobile App 80% completo', 'Intimações V2 80% completo'],
      ultimaAtualizacao: 'Não iniciado',
      owner: 'QA'
    },
    {
      id: 5,
      nome: 'Performance Optimization',
      descricao: 'Otimização de bundle, lazy loading, cache',
      prioridade: 'MEDIUM',
      pontosStory: 5,
      status: 'PLANEJADO',
      progresso: 0,
      dias: 1.5,
      diasRestantes: 1.5,
      bloqueadores: [],
      ultimaAtualizacao: 'Não iniciado',
      owner: 'DevOps'
    }
  ];

  const completas = tarefas.filter(t => t.status === 'CONCLUIDO').length;
  const emAndamento = tarefas.filter(t => t.status === 'EM_ANDAMENTO').length;
  const planejadas = tarefas.filter(t => t.status === 'PLANEJADO').length;

  const ptsCompletos = tarefas.filter(t => t.status === 'CONCLUIDO').reduce((s, t) => s + t.pontosStory, 0);
  const ptsEmAndamento = tarefas.filter(t => t.status === 'EM_ANDAMENTO').reduce((s, t) => s + (t.progresso / 100 * t.pontosStory), 0);
  const totalPts = tarefas.reduce((s, t) => s + t.pontosStory, 0);
  const ptsEsperados = 43; // Metade do sprint (dia 4 de 8)

  const percentualCompleção = Math.round(((ptsCompletos + ptsEmAndamento) / totalPts) * 100);
  const statusVelocidade = percentualCompleção >= 50 ? '✅ ON TRACK' : '⚠️ WATCH OUT';

  const getStatusColor = (status) => {
    const colors = {
      CONCLUIDO: 'bg-green-100 text-green-800',
      EM_ANDAMENTO: 'bg-blue-100 text-blue-800',
      PLANEJADO: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      CRITICAL: 'border-l-4 border-red-600 bg-red-50',
      HIGH: 'border-l-4 border-orange-600 bg-orange-50',
      MEDIUM: 'border-l-4 border-yellow-600 bg-yellow-50',
      LOW: 'border-l-4 border-gray-600 bg-gray-50'
    };
    return colors[priority] || 'bg-gray-50';
  };

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Sprint 8 — Execução</h1>
              <p className="text-gray-600 mt-2">Dia 1 de 8 | 04/03/2026 (Dia Atual)</p>
            </div>
            <Badge className="bg-blue-600 px-4 py-2 text-base">EM EXECUÇÃO</Badge>
          </div>
        </div>

        {/* Status Geral */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{percentualCompleção}%</div>
              <div className="text-xs text-gray-600">Completude Geral</div>
              <div className="text-xs font-semibold text-blue-600 mt-1">{statusVelocidade}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">{completas + emAndamento}/{tarefas.length}</div>
              <div className="text-xs text-gray-600">Tarefas Ativas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{completas}</div>
              <div className="text-xs text-gray-600">Completas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-600">{emAndamento}</div>
              <div className="text-xs text-gray-600">Em Andamento</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-gray-600">{ptsCompletos + Math.round(ptsEmAndamento)}/{ptsEsperados}</div>
              <div className="text-xs text-gray-600">Points (meta: 21.5pts)</div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-gray-900">Progresso Geral do Sprint</h3>
                <span className="text-sm font-bold text-gray-700">{percentualCompleção}% completo</span>
              </div>
              <Progress value={percentualCompleção} className="h-3" />
              <div className="flex justify-between text-xs text-gray-600 mt-2">
                <span>Dia 1</span>
                <span>Dia 4 (Metade)</span>
                <span>Dia 8 (Final)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tarefas */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6" />
            Tarefas do Sprint
          </h2>

          {tarefas.map(tarefa => (
            <Card key={tarefa.id} className={`cursor-pointer hover:shadow-md transition-shadow ${getPriorityColor(tarefa.prioridade)}`}>
              <CardContent className="pt-6">
                <div 
                  onClick={() => setExpandedTask(expandedTask === tarefa.id ? null : tarefa.id)}
                  className="space-y-3"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{tarefa.nome}</h3>
                        <Badge className={`${getStatusColor(tarefa.status)}`}>
                          {tarefa.status === 'CONCLUIDO' ? '✅' : tarefa.status === 'EM_ANDAMENTO' ? '🔄' : '⏳'} {tarefa.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{tarefa.descricao}</p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-purple-600">{tarefa.pontosStory}pts</div>
                      <div className="text-xs text-gray-600">{tarefa.owner}</div>
                    </div>
                  </div>

                  {/* Progress & Timeline */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">{tarefa.progresso}% concluído</span>
                      <span className="text-xs text-gray-600">{tarefa.diasRestantes.toFixed(1)}d restantes</span>
                    </div>
                    <Progress value={tarefa.progresso} className="h-2" />
                  </div>

                  {/* Expandable Details */}
                  {expandedTask === tarefa.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1">Última Atualização:</p>
                        <p className="text-sm text-gray-600">{tarefa.ultimaAtualizacao}</p>
                      </div>
                      {tarefa.bloqueadores.length > 0 && (
                        <div className="bg-orange-100 border border-orange-300 rounded p-3">
                          <p className="text-xs font-semibold text-orange-900 mb-1">⚠️ Dependências:</p>
                          <ul className="text-xs text-orange-800 list-disc list-inside space-y-1">
                            {tarefa.bloqueadores.map((b, i) => <li key={i}>{b}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Caminho Crítico */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Zap className="w-5 h-5" />
              Caminho Crítico (Hoje)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3 p-3 bg-white rounded border border-red-200">
              <span className="font-bold text-red-600 min-w-fit">1º CRÍTICO:</span>
              <span>Mobile App — 35% | Precisa atingir 80% até EOD Dia 3</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded border border-red-200">
              <span className="font-bold text-orange-600 min-w-fit">2º CRÍTICO:</span>
              <span>Intimações V2 — 45% | Precisa atingir 80% até EOD Dia 3</span>
            </div>
            <div className="text-xs text-gray-600 mt-2">
              ⚠️ Se Mobile App e Intimações não atingirem 80%, testes E2E serão impactados
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <AlertDescription className="text-green-900 ml-2">
            <strong>Status Dia 1:</strong> Ritmo esperado está sendo mantido. Mobile App e Intimações V2 progredindo bem. Google Calendar e Tests aguardando no pipeline.
          </AlertDescription>
        </Alert>

        {/* CTA */}
        <div className="text-center p-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Sprint 8 — 40% Completo (Dia 1)</h3>
          <p className="text-gray-600">
            2 tarefas críticas em execução | Nenhum bloqueador detectado | Velocidade: ON TRACK
          </p>
        </div>
      </div>
    </div>
  );
}