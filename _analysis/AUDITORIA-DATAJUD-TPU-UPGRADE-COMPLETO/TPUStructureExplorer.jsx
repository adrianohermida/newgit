import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronRight, Info } from 'lucide-react';

/**
 * TPUStructureExplorer - Visualiza estrutura e hierarquia de Classes, Assuntos e Movimentos
 * Permite navegação entre entidades relacionadas
 */
export default function TPUStructureExplorer() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClasse, setSelectedClasse] = useState(null);
  const [selectedAssunto, setSelectedAssunto] = useState(null);

  // Buscar Classes
  const { data: classes = [] } = useQuery({
    queryKey: ['tpu_classes_explorer'],
    queryFn: async () => {
      try {
        const result = await base44.entities.TPUClasses.filter({}, '-created_date', 1000);
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    }
  });

  // Buscar Assuntos
  const { data: assuntos = [] } = useQuery({
    queryKey: ['tpu_assuntos_explorer'],
    queryFn: async () => {
      try {
        const result = await base44.entities.TPUAssuntos.filter({}, '-created_date', 1000);
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    }
  });

  // Buscar Movimentos
  const { data: movimentos = [] } = useQuery({
    queryKey: ['tpu_movimentos_explorer'],
    queryFn: async () => {
      try {
        const result = await base44.entities.TPUMovimentos.filter({}, '-created_date', 1000);
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    }
  });

  // Filtrar dados
  const classesFiltered = classes.filter(c => 
    c.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.sigla?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const assuntosFiltered = assuntos.filter(a => 
    a.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.ramo_direito?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const movimentosFiltered = movimentos.filter(m => 
    m.nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getJustícasAplicáveis = (item) => {
    const justiças = [];
    if (item.just_es_1grau === 'S') justiças.push('Estadual 1º');
    if (item.just_es_2grau === 'S') justiças.push('Estadual 2º');
    if (item.just_fed_1grau === 'S') justiças.push('Federal 1º');
    if (item.just_fed_2grau === 'S') justiças.push('Federal 2º');
    if (item.just_trab_1grau === 'S') justiças.push('Trabalho 1º');
    if (item.just_trab_2grau === 'S') justiças.push('Trabalho 2º');
    if (item.stf === 'S') justiças.push('STF');
    if (item.stj === 'S') justiças.push('STJ');
    return justiças;
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nome, sigla ou ramo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="classes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="classes">📋 Classes ({classesFiltered.length})</TabsTrigger>
          <TabsTrigger value="assuntos">📚 Assuntos ({assuntosFiltered.length})</TabsTrigger>
          <TabsTrigger value="movimentos">⚙️ Movimentos ({movimentosFiltered.length})</TabsTrigger>
        </TabsList>

        {/* Classes */}
        <TabsContent value="classes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classesFiltered.map(classe => (
              <Card key={classe.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{classe.nome}</CardTitle>
                      <p className="text-sm text-slate-500 mt-1">{classe.sigla}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{classe.tipo_item}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {classe.glossario && (
                    <p className="text-xs text-slate-600">{classe.glossario}</p>
                  )}
                  
                  {classe.natureza && (
                    <div>
                      <span className="text-xs font-medium text-slate-600">Natureza:</span>
                      <p className="text-sm">{classe.natureza}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {getJustícasAplicáveis(classe).map(j => (
                      <Badge key={j} className="text-xs bg-blue-100 text-blue-800">{j}</Badge>
                    ))}
                  </div>

                  <div className="text-xs text-slate-500 pt-2 border-t">
                    <p>Polos: {classe.polo_ativo} (ativo) / {classe.polo_passivo} (passivo)</p>
                    <p>Numeração própria: {classe.numeracao_propria === 'S' ? '✓' : '✗'}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Assuntos */}
        <TabsContent value="assuntos" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assuntosFiltered.map(assunto => (
              <Card key={assunto.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{assunto.nome}</CardTitle>
                      <p className="text-sm text-slate-500 mt-1">{assunto.ramo_direito}</p>
                    </div>
                    <div className="flex gap-1">
                      {assunto.sigiloso === 'S' && <Badge className="text-xs bg-red-100 text-red-800">Sigilo</Badge>}
                      {assunto.assunto_secundario === 'S' && <Badge className="text-xs bg-yellow-100 text-yellow-800">Secundário</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assunto.glossario && (
                    <p className="text-xs text-slate-600">{assunto.glossario}</p>
                  )}

                  {assunto.dispositivo_legal && (
                    <div>
                      <span className="text-xs font-medium text-slate-600">Dispositivo Legal:</span>
                      <p className="text-sm font-mono text-slate-700">{assunto.dispositivo_legal}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {getJustícasAplicáveis(assunto).map(j => (
                      <Badge key={j} className="text-xs bg-green-100 text-green-800">{j}</Badge>
                    ))}
                  </div>

                  {assunto.crime_antecedente === 'S' && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-2">
                      <p className="text-xs text-orange-800">⚠️ Crime antecedente</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Movimentos */}
        <TabsContent value="movimentos" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {movimentosFiltered.map(movimento => (
              <Card key={movimento.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{movimento.nome}</CardTitle>
                      <p className="text-sm text-slate-500 mt-1">{movimento.categoria}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{movimento.subcategoria}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {movimento.glossario && (
                    <p className="text-xs text-slate-600">{movimento.glossario}</p>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {movimento.flg_eletronico === 'S' && <Badge className="text-xs bg-purple-100 text-purple-800">Eletrônico</Badge>}
                    {movimento.flg_papel === 'S' && <Badge className="text-xs bg-gray-100 text-gray-800">Papel</Badge>}
                    {movimento.visibilidade_externa === 'S' && <Badge className="text-xs bg-cyan-100 text-cyan-800">Público</Badge>}
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {getJustícasAplicáveis(movimento).map(j => (
                      <Badge key={j} className="text-xs bg-indigo-100 text-indigo-800">{j}</Badge>
                    ))}
                  </div>

                  {movimento.dispositivo_legal && (
                    <div className="text-xs text-slate-500 pt-2 border-t">
                      <p><strong>Dispositivo:</strong> {movimento.dispositivo_legal}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-5 h-5" />
            Sobre a Estrutura TPU
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-slate-700">
          <p>
            <strong>Classes Processuais:</strong> Categorias de ações judiciais (p.ex., Ação Civil Originária, Recurso Ordinário). Cada classe tem numeração e aplicabilidade em tipos de justiça.
          </p>
          <p>
            <strong>Assuntos:</strong> Temas jurídicos das ações (p.ex., Direito Penal, Tributário). Podem ter sigilo e relate-se a crime antecedente.
          </p>
          <p>
            <strong>Movimentos:</strong> Eventos processuais (p.ex., Sentença, Despacho). Podem ser eletrônicos ou em papel, e visíveis ou sigilosos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}