import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Wrench, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import ExecutionLogger from './ExecutionLogger';

export default function PartesClientesDuplicadosTest() {
  const [analise, setAnalise] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (tipo, mensagem, detalhes = null) => {
    setLogs(prev => [...prev, { 
      timestamp: new Date().toLocaleTimeString('pt-BR'), 
      tipo, 
      mensagem, 
      detalhes 
    }]);
  };

  const analisarMutation = useMutation({
    mutationFn: async () => {
      setLogs([]);
      addLog('info', '🔍 Analisando duplicação Cliente/Parte...');
      
      const processos = await base44.entities.Processo.list('-created_date', 200);
      addLog('info', `${processos.length} processos carregados`);

      const duplicados = [];

      for (const p of processos) {
        const partes = await base44.entities.ProcessoParte.filter({ processo_id: p.id });
        const clientes = await base44.entities.Cliente.list();

        for (const parte of partes) {
          const nomeNormalizado = parte.nome?.toLowerCase().trim();
          
          const clienteCorrespondente = clientes.find(c => 
            c.nome_completo?.toLowerCase().trim() === nomeNormalizado
          );

          if (clienteCorrespondente) {
            duplicados.push({
              processo_id: p.id,
              processo_cnj: p.numero_cnj,
              parte_id: parte.id,
              parte_nome: parte.nome,
              cliente_id: clienteCorrespondente.id,
              cliente_nome: clienteCorrespondente.nome_completo
            });
          }
        }
      }

      addLog('success', `${duplicados.length} duplicações encontradas`);
      
      return { total: processos.length, duplicados };
    },
    onSuccess: (data) => {
      setAnalise(data);
      if (data.duplicados.length === 0) {
        toast.success('✅ Nenhuma duplicação encontrada!');
      } else {
        toast.warning(`⚠️ ${data.duplicados.length} duplicações Cliente/Parte`);
      }
    },
    onError: (error) => {
      addLog('error', 'Erro na análise', { message: error.message });
      toast.error('Erro: ' + error.message);
    }
  });

  const corrigirMutation = useMutation({
    mutationFn: async () => {
      addLog('info', '🔧 Corrigindo duplicações...');
      
      const response = await base44.functions.invoke('corrigirPartesClientesDuplicados', {
        duplicados: analise.duplicados
      });
      
      addLog('success', 'Resposta recebida', response.data);
      return response.data;
    },
    onSuccess: async (data) => {
      addLog('success', `✅ ${data.corrigidos} duplicações resolvidas`);
      toast.success(`${data.corrigidos} duplicações corrigidas`);
      setTimeout(() => analisarMutation.mutate(), 2000);
    },
    onError: (error) => {
      addLog('error', 'Erro ao corrigir', { message: error.message });
      toast.error('Erro: ' + error.message);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          Teste E2E: Duplicação Cliente/Parte
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={() => analisarMutation.mutate()} 
            disabled={analisarMutation.isPending}
          >
            {analisarMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-2" />
            )}
            Executar Teste
          </Button>
          <Button 
            onClick={() => corrigirMutation.mutate()} 
            disabled={!analise || analise.duplicados.length === 0 || corrigirMutation.isPending} 
            className="bg-green-600 hover:bg-green-700"
          >
            {corrigirMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="w-4 h-4 mr-2" />
            )}
            Corrigir {analise?.duplicados.length || 0}
          </Button>
        </div>

        {analise && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-semibold text-blue-900">Processos</p>
                <p className="text-2xl font-bold text-blue-700">{analise.total}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-semibold text-red-900">Duplicações</p>
                <p className="text-2xl font-bold text-red-700">{analise.duplicados.length}</p>
              </div>
            </div>

            {analise.duplicados.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Duplicações Encontradas</h4>
                <ScrollArea className="h-64 border rounded-lg p-3">
                  <div className="space-y-2">
                    {analise.duplicados.slice(0, 50).map((d, i) => (
                      <div key={i} className="text-xs border-b pb-2">
                        <p className="font-mono font-semibold">{d.processo_cnj}</p>
                        <div className="ml-2 mt-1 space-y-1">
                          <p className="text-[var(--text-secondary)]">
                            <Badge variant="destructive" className="text-[10px] mr-1">PARTE</Badge>
                            {d.parte_nome}
                          </p>
                          <p className="text-[var(--text-secondary)]">
                            <Badge className="text-[10px] mr-1 bg-green-600">CLIENTE</Badge>
                            {d.cliente_nome}
                          </p>
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
            <ExecutionLogger logs={logs} titulo="Log - Duplicação" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}