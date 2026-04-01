import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, PlayCircle, Wrench, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import ExecutionLogger from './ExecutionLogger';

export default function PartesProcessoTest() {
  const [analise, setAnalise] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (tipo, mensagem, detalhes = null, stack = null) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { timestamp, tipo, mensagem, detalhes, stack }]);
  };

  const analisarMutation = useMutation({
    mutationFn: async () => {
      setLogs([]);
      addLog('info', '🔍 Analisando partes dos processos...');
      
      const processos = await base44.entities.Processo.list('-created_date', 50);
      addLog('info', `${processos.length} processos carregados`);
      
      const processoIds = processos.map(p => p.id);
      const partes = await base44.entities.ProcessoParte.filter({ 
        processo_id: { $in: processoIds } 
      });
      
      const partesPorProcesso = {};
      partes.forEach(p => {
        if (!partesPorProcesso[p.processo_id]) partesPorProcesso[p.processo_id] = [];
        partesPorProcesso[p.processo_id].push(p);
      });

      const resultados = {
        total: 0,
        esperado_api: 0,
        criado_db: 0,
        com_divergencia: 0,
        divergencias: []
      };

      for (const p of processos) {
        const api = p.dados_completos_api;
        if (!api?.fontes) continue;

        let totalPartesAPI = 0;
        api.fontes.forEach(fonte => {
          totalPartesAPI += fonte.envolvidos?.length || 0;
        });

        const totalPartesDB = partesPorProcesso[p.id]?.length || 0;

        resultados.total++;
        resultados.esperado_api += totalPartesAPI;
        resultados.criado_db += totalPartesDB;

        if (totalPartesAPI > 0 && totalPartesDB !== totalPartesAPI) {
          resultados.com_divergencia++;
          
          // Extrair nomes das partes faltantes da API
          const nomesAPI = [];
          api.fontes.forEach(fonte => {
            fonte.envolvidos?.forEach(e => nomesAPI.push(e.nome));
          });
          const nomesDB = partesPorProcesso[p.id]?.map(pt => pt.nome) || [];
          const nomesFaltantes = nomesAPI.filter(n => !nomesDB.includes(n));
          
          resultados.divergencias.push({
            id: p.id,
            numero_cnj: p.numero_cnj,
            esperado_api: totalPartesAPI,
            criado_db: totalPartesDB,
            faltam: totalPartesAPI - totalPartesDB,
            exemplo_faltantes: nomesFaltantes.slice(0, 3)
          });
          
          // Log primeiro problema
          if (resultados.com_divergencia === 1) {
            addLog('warning', `Exemplo: ${p.numero_cnj}`, {
              esperado: totalPartesAPI,
              criado: totalPartesDB,
              faltantes_exemplo: nomesFaltantes.slice(0, 2)
            });
          }
        }
      }

      addLog('success', `Análise concluída: ${resultados.com_divergencia} divergências`);
      return resultados;
    },
    onSuccess: (data) => {
      setAnalise(data);
      if (data.com_divergencia === 0) {
        toast.success('✅ Todas partes corretas!');
      } else {
        toast.warning(`⚠️ ${data.com_divergencia} processos com divergências`);
      }
    },
    onError: (error) => {
      addLog('error', 'Erro na análise', { message: error.message }, error.stack);
      toast.error('Erro: ' + error.message);
    }
  });

  const corrigirMutation = useMutation({
    mutationFn: async () => {
      addLog('info', '🔧 Corrigindo partes...');
      
      const response = await base44.functions.invoke('corrigirPartes', {
        processoIds: analise.divergencias.map(d => d.id)
      });
      
      return response.data;
    },
    onSuccess: (data) => {
      addLog('success', `✅ ${data.sucesso}/${data.total} corrigidos`);
      toast.success(`Criadas ${data.partes_criadas} partes e ${data.advogados_criados} advogados`);
      setTimeout(() => analisarMutation.mutate(), 1500);
    },
    onError: (error) => {
      addLog('error', 'Erro ao corrigir', { message: error.message }, error.stack);
      toast.error('Erro: ' + error.message);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Teste E2E: Partes do Processo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={() => analisarMutation.mutate()} disabled={analisarMutation.isPending}>
            {analisarMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Executar Teste
          </Button>
          <Button 
            onClick={() => corrigirMutation.mutate()} 
            disabled={!analise || analise.com_divergencia === 0 || corrigirMutation.isPending} 
            className="bg-green-600 hover:bg-green-700"
          >
            {corrigirMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
            Corrigir {analise?.com_divergencia || 0}
          </Button>
        </div>

        {analise && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-semibold text-blue-900">Processos</p>
                <p className="text-2xl font-bold text-blue-700">{analise.total}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm font-semibold text-purple-900">API (esperado)</p>
                <p className="text-2xl font-bold text-purple-700">{analise.esperado_api}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-green-900">DB (criado)</p>
                <p className="text-2xl font-bold text-green-700">{analise.criado_db}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-semibold text-red-900">Divergências</p>
                <p className="text-2xl font-bold text-red-700">{analise.com_divergencia}</p>
              </div>
            </div>

            {analise.divergencias.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Processos com Divergências</h4>
                <ScrollArea className="h-64 border rounded-lg p-3">
                  <div className="space-y-2">
                    {analise.divergencias.map((d) => (
                      <div key={d.id} className="text-xs border-b pb-2">
                        <p className="font-mono font-semibold">{d.numero_cnj}</p>
                        <div className="flex gap-3 ml-2 mt-1">
                          <Badge variant="outline" className="text-xs">API: {d.esperado_api}</Badge>
                          <Badge variant="outline" className="text-xs">DB: {d.criado_db}</Badge>
                          <Badge variant="destructive" className="text-xs">Faltam: {d.faltam}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-4">
            <ExecutionLogger logs={logs} titulo="Log - Partes" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}