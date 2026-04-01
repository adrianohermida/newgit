import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, RefreshCw, Loader2, BookOpen, Scale, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TPUBuscaWidget() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('movimentos');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  const { data: movimentos = [], isLoading: loadingMov, refetch: refetchMov } = useQuery({
    queryKey: ['tpu-movimentos'],
    queryFn: () => base44.entities.TabelaMovimentoCNJ.list('', 500)
  });

  const { data: assuntos = [], isLoading: loadingAss, refetch: refetchAss } = useQuery({
    queryKey: ['tpu-assuntos'],
    queryFn: () => base44.entities.TabelaAssuntoCNJ.list('', 500)
  });

  const { data: classes = [], isLoading: loadingCla, refetch: refetchCla } = useQuery({
    queryKey: ['tpu-classes'],
    queryFn: () => base44.entities.TabelaClasseCNJ.list('', 500)
  });

  const { data: documentos = [], isLoading: loadingDoc, refetch: refetchDoc } = useQuery({
    queryKey: ['tpu-documentos'],
    queryFn: () => base44.entities.DocumentoPublico.list('', 500)
  });

  const handleSync = async (tipo) => {
    setSyncing(true);
    setSyncProgress({ tipo, status: 'Baixando dados da API CNJ...' });
    
    try {
      const response = await base44.functions.invoke('syncTPUTabelasCompletas', { tipo });
      
      if (response.data.sucesso) {
        setSyncProgress({ 
          tipo, 
          status: 'Concluído', 
          criados: response.data.criados,
          atualizados: response.data.atualizados,
          total: response.data.total_final
        });
        toast.success(`✅ ${response.data.criados} registros novos, ${response.data.atualizados} atualizados`);
        
        if (tipo === 'movimentos') refetchMov();
        if (tipo === 'assuntos') refetchAss();
        if (tipo === 'classes') refetchCla();
      } else {
        throw new Error('Sincronização falhou');
      }
    } catch (error) {
      setSyncProgress({ tipo, status: 'Erro', error: error.message });
      toast.error(`Erro ao sincronizar: ${error.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncProgress(null), 5000);
    }
  };

  const filteredMovimentos = movimentos.filter(m =>
    !search ||
    m.glossario?.toLowerCase().includes(search.toLowerCase()) ||
    m.codigo?.includes(search) ||
    m.nivel1?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAssuntos = assuntos.filter(a =>
    !search ||
    a.glossario?.toLowerCase().includes(search.toLowerCase()) ||
    a.codigo?.includes(search) ||
    a.nivel1?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredClasses = classes.filter(c =>
    !search ||
    c.glossario?.toLowerCase().includes(search.toLowerCase()) ||
    c.codigo?.includes(search) ||
    c.nivel1?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDocumentos = documentos.filter(d =>
    !search ||
    d.txt_glossario?.toLowerCase().includes(search.toLowerCase()) ||
    d.cod_documento_processual?.includes(search) ||
    d.nome?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tabelas Processuais Unificadas - CNJ</CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleSync('movimentos')}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Movimentos
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleSync('assuntos')}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Assuntos
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleSync('classes')}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Classes
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por código, glossário ou categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {syncProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                {syncProgress.status === 'Concluído' ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : syncProgress.status === 'Erro' ? (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {syncProgress.tipo}: {syncProgress.status}
                  </p>
                  {syncProgress.criados !== undefined && (
                    <p className="text-xs text-slate-600">
                      {syncProgress.criados} novos | {syncProgress.atualizados} atualizados | Total: {syncProgress.total}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="movimentos" className="gap-2">
              <FileText className="w-4 h-4" />
              Movimentos
              <Badge variant="outline" className="ml-1">{movimentos.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="assuntos" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Assuntos
              <Badge variant="outline" className="ml-1">{assuntos.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="classes" className="gap-2">
              <Scale className="w-4 h-4" />
              Classes
              <Badge variant="outline" className="ml-1">{classes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="documentos" className="gap-2">
              <FileText className="w-4 h-4" />
              Documentos
              <Badge variant="outline" className="ml-1">{documentos.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="movimentos" className="mt-4">
            {loadingMov ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredMovimentos.map((mov) => (
                    <div key={mov.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono">{mov.codigo}</Badge>
                            {mov.nivel1 && (
                              <Badge className="bg-blue-100 text-blue-800">{mov.nivel1}</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-900">
                            {mov.nivel2 || mov.nivel3 || mov.nivel4 || mov.nivel5 || mov.nivel6}
                          </p>
                          {mov.glossario && (
                            <p className="text-xs text-slate-600 mt-1">{mov.glossario}</p>
                          )}
                          {mov.dispositivo_legal && (
                            <p className="text-xs text-slate-500 mt-1">
                              Base legal: {mov.dispositivo_legal} {mov.artigo && `art. ${mov.artigo}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="assuntos" className="mt-4">
            {loadingAss ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : assuntos.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Nenhum assunto sincronizado ainda</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredAssuntos.map((ass) => (
                    <div key={ass.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">{ass.codigo}</Badge>
                      </div>
                      <p className="text-sm font-medium">{ass.nivel1} {ass.nivel2 && `> ${ass.nivel2}`}</p>
                      {ass.glossario && <p className="text-xs text-slate-600 mt-1">{ass.glossario}</p>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="classes" className="mt-4">
            {loadingCla ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : classes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Scale className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Nenhuma classe sincronizada ainda</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredClasses.map((cla) => (
                    <div key={cla.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">{cla.codigo}</Badge>
                      </div>
                      <p className="text-sm font-medium">{cla.nivel1} {cla.nivel2 && `> ${cla.nivel2}`}</p>
                      {cla.glossario && <p className="text-xs text-slate-600 mt-1">{cla.glossario}</p>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="documentos" className="mt-4">
            {loadingDoc ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : documentos.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Nenhum documento sincronizado ainda</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {filteredDocumentos.map((doc) => (
                    <div key={doc.id} className="border rounded-lg p-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">{doc.cod_documento_processual}</Badge>
                        {doc.tipo_item && (
                          <Badge className="bg-purple-100 text-purple-800">{doc.tipo_item}</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{doc.nome}</p>
                      {doc.txt_glossario && (
                        <p className="text-xs text-slate-600 mt-1">{doc.txt_glossario}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}