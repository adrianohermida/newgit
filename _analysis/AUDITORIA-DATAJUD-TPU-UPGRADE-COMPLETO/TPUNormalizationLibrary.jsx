import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { Table, FileText, GitBranch, Search, Database } from 'lucide-react';

export default function TPUNormalizationLibrary() {
  const [searchClasse, setSearchClasse] = useState('');
  const [searchMov, setSearchMov] = useState('');
  const [searchAssunto, setSearchAssunto] = useState('');

  const { data: classes = [] } = useQuery({
    queryKey: ['tpu-classes'],
    queryFn: () => base44.entities.TPUClasse.list('codigo', 500)
  });

  const { data: movimentos = [] } = useQuery({
    queryKey: ['tpu-movimentos'],
    queryFn: () => base44.entities.TPUMovimento.list('codigo', 500)
  });

  const { data: assuntos = [] } = useQuery({
    queryKey: ['tpu-assuntos'],
    queryFn: () => base44.entities.TPUAssunto.list('codigo', 500)
  });

  const filteredClasses = classes.filter(c => 
    !searchClasse || 
    c.codigo?.toString().includes(searchClasse) ||
    c.nome?.toLowerCase().includes(searchClasse.toLowerCase())
  );

  const filteredMovimentos = movimentos.filter(m => 
    !searchMov || 
    m.codigo?.toString().includes(searchMov) ||
    m.nome?.toLowerCase().includes(searchMov.toLowerCase())
  );

  const filteredAssuntos = assuntos.filter(a => 
    !searchAssunto || 
    a.codigo?.toString().includes(searchAssunto) ||
    a.nome?.toLowerCase().includes(searchAssunto.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-[#00a2ff]" />
          Biblioteca de Normalização TPU
        </CardTitle>
        <p className="text-xs text-slate-600 mt-1">
          Códigos extraídos do DataJud para normalização
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="classes" className="space-y-4">
          <TabsList className="w-full">
            <TabsTrigger value="classes" className="flex-1 gap-2">
              <Table className="w-4 h-4" />
              Classes ({classes.length})
            </TabsTrigger>
            <TabsTrigger value="movimentos" className="flex-1 gap-2">
              <GitBranch className="w-4 h-4" />
              Movimentos ({movimentos.length})
            </TabsTrigger>
            <TabsTrigger value="assuntos" className="flex-1 gap-2">
              <FileText className="w-4 h-4" />
              Assuntos ({assuntos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="classes" className="space-y-3">
            <Input
              placeholder="Buscar classe..."
              value={searchClasse}
              onChange={(e) => setSearchClasse(e.target.value)}
              className="w-full"
            />
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredClasses.map(classe => (
                <div key={classe.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-blue-100 text-blue-800 font-mono">
                          {classe.codigo}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {classe.fonte}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{classe.nome}</p>
                      {classe.glossario && (
                        <p className="text-xs text-slate-600 mt-1">{classe.glossario}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="movimentos" className="space-y-3">
            <Input
              placeholder="Buscar movimento..."
              value={searchMov}
              onChange={(e) => setSearchMov(e.target.value)}
            />
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredMovimentos.map(mov => (
                <div key={mov.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-green-100 text-green-800 font-mono">
                          {mov.codigo}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {mov.fonte}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{mov.nome}</p>
                      {mov.tipo_responsavel && (
                        <p className="text-xs text-slate-600 mt-1">
                          Responsável: {mov.tipo_responsavel}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="assuntos" className="space-y-3">
            <Input
              placeholder="Buscar assunto..."
              value={searchAssunto}
              onChange={(e) => setSearchAssunto(e.target.value)}
            />
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredAssuntos.map(assunto => (
                <div key={assunto.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-purple-100 text-purple-800 font-mono">
                          {assunto.codigo}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {assunto.fonte}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{assunto.nome}</p>
                      {assunto.pai && (
                        <p className="text-xs text-slate-600 mt-1">
                          Pai: {assunto.pai}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}