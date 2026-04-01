import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Loader2, FileText, BookOpen, Scale, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TPUManagementPanel() {
  const [activeTab, setActiveTab] = useState('movimentos');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(null);
  const queryClient = useQueryClient();

  const { data: movimentos = [], isLoading: loadingMov } = useQuery({
    queryKey: ['tpu-movimentos'],
    queryFn: () => base44.entities.TPUMovimento.list('-codigo_movimento', 1000)
  });

  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['tpu-classes'],
    queryFn: () => base44.entities.TPUClasse.list('-codigo_classe', 500)
  });

  const { data: assuntos = [], isLoading: loadingAssuntos } = useQuery({
    queryKey: ['tpu-assuntos'],
    queryFn: () => base44.entities.TPUAssunto.list('-codigo_assunto', 1000)
  });

  const syncMutation = useMutation({
    mutationFn: async (tipo) => {
      const { data } = await base44.functions.invoke('syncTPUTabelas', { tipo });
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.criados} criados, ${data.atualizados} atualizados`);
      queryClient.invalidateQueries([`tpu-${data.tipo}`]);
      setSyncing(null);
    },
    onError: (error) => {
      toast.error('Erro ao sincronizar: ' + error.message);
      setSyncing(null);
    }
  });

  const handleSync = (tipo) => {
    setSyncing(tipo);
    syncMutation.mutate(tipo);
  };

  const filteredMovimentos = movimentos.filter(m =>
    !search ||
    m.nome_movimento?.toLowerCase().includes(search.toLowerCase()) ||
    String(m.codigo_movimento).includes(search)
  );

  const filteredClasses = classes.filter(c =>
    !search ||
    c.nome_classe?.toLowerCase().includes(search.toLowerCase()) ||
    String(c.codigo_classe).includes(search)
  );

  const filteredAssuntos = assuntos.filter(a =>
    !search ||
    a.nome_assunto?.toLowerCase().includes(search.toLowerCase()) ||
    String(a.codigo_assunto).includes(search)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-[#00a2ff]" />
          Tabelas TPU (Processuais Unificadas CNJ)
        </CardTitle>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex gap-2">
            <Badge variant="outline">
              {movimentos.length} Movimentos
            </Badge>
            <Badge variant="outline">
              {classes.length} Classes
            </Badge>
            <Badge variant="outline">
              {assuntos.length} Assuntos
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <Input
          placeholder="Buscar por código ou nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="movimentos">
              <FileText className="w-4 h-4 mr-2" />
              Movimentos
            </TabsTrigger>
            <TabsTrigger value="classes">
              <Scale className="w-4 h-4 mr-2" />
              Classes
            </TabsTrigger>
            <TabsTrigger value="assuntos">
              <BookOpen className="w-4 h-4 mr-2" />
              Assuntos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="movimentos" className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-600">
                {filteredMovimentos.length} de {movimentos.length} movimentos
              </p>
              <Button
                size="sm"
                onClick={() => handleSync('movimentos')}
                disabled={syncing === 'movimentos'}
                className="bg-[#00a2ff] hover:bg-[#0088cc]"
              >
                {syncing === 'movimentos' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sincronizar
              </Button>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredMovimentos.map((mov) => (
                  <div key={mov.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono">
                            {mov.codigo_movimento}
                          </Badge>
                          {mov.gera_prazo && (
                            <Badge className="bg-orange-100 text-orange-800 text-xs">
                              Gera Prazo
                            </Badge>
                          )}
                          {mov.nivel_importancia && (
                            <Badge className={
                              mov.nivel_importancia === 'critica' ? 'bg-red-100 text-red-800' :
                              mov.nivel_importancia === 'alta' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-slate-100 text-slate-800'
                            }>
                              {mov.nivel_importancia}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          {mov.nome_movimento}
                        </p>
                        {mov.descricao && (
                          <p className="text-xs text-slate-600 mt-1">
                            {mov.descricao}
                          </p>
                        )}
                        {mov.prazo_dias && (
                          <p className="text-xs text-slate-500 mt-1">
                            Prazo: {mov.prazo_dias} dias {mov.tipo_prazo === 'util' ? 'úteis' : 'corridos'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="classes" className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-600">
                {filteredClasses.length} de {classes.length} classes
              </p>
              <Button
                size="sm"
                onClick={() => handleSync('classes')}
                disabled={syncing === 'classes'}
                className="bg-[#00a2ff] hover:bg-[#0088cc]"
              >
                {syncing === 'classes' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sincronizar
              </Button>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredClasses.map((classe) => (
                  <div key={classe.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono">
                        {classe.codigo_classe}
                      </Badge>
                      {classe.sigla_classe && (
                        <Badge className="bg-purple-100 text-purple-800">
                          {classe.sigla_classe}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      {classe.nome_classe}
                    </p>
                    {classe.tipo_procedimento && (
                      <p className="text-xs text-slate-600 mt-1">
                        {classe.tipo_procedimento} • {classe.competencia}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="assuntos" className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-600">
                {filteredAssuntos.length} de {assuntos.length} assuntos
              </p>
              <Button
                size="sm"
                onClick={() => handleSync('assuntos')}
                disabled={syncing === 'assuntos'}
                className="bg-[#00a2ff] hover:bg-[#0088cc]"
              >
                {syncing === 'assuntos' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sincronizar
              </Button>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredAssuntos.map((assunto) => (
                  <div key={assunto.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono">
                        {assunto.codigo_assunto}
                      </Badge>
                      {assunto.nivel_hierarquia && (
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          Nível {assunto.nivel_hierarquia}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900">
                      {assunto.nome_assunto}
                    </p>
                    {assunto.competencia && (
                      <p className="text-xs text-slate-600 mt-1">
                        {assunto.competencia}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}