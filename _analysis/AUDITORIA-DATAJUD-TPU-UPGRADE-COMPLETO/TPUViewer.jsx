import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const TABELAS = [
  // TPU Core
  { id: 'TPUClasses', nome: 'Classes', ícone: '📋' },
  { id: 'TPUAssuntos', nome: 'Assuntos', ícone: '📚' },
  { id: 'TPUMovimentos', nome: 'Movimentos', ícone: '⚙️' },
  { id: 'TPUDocumentos', nome: 'Documentos', ícone: '📄' },
  // CNJ & Institucional
  { id: 'JuizoCNJ', nome: 'Juízos CNJ', ícone: '⚖️' },
  { id: 'Serventia', nome: 'Serventias', ícone: '🏛️' },
  { id: 'CodigoForoTJSP', nome: 'Foro TJSP', ícone: '📍' }
];

export default function TPUViewer() {
  const [tabelaSelecionada, setTabelaSelecionada] = useState('TPUClasses');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [limite] = useState(50);
  const [registroSelecionado, setRegistroSelecionado] = useState(null);

  const { data: resultado, isLoading, error } = useQuery({
    queryKey: [tabelaSelecionada, pagina, busca, limite],
    queryFn: async () => {
      const offset = (pagina - 1) * limite;
      const query = busca.trim() ? { nome: { $regex: busca.trim(), $options: 'i' } } : {};
      
      const registros = await base44.entities[tabelaSelecionada].filter(query, '-created_date', limite, offset);
      
      // Total real: buscar count separado (sem limite) para paginação correta
      let total = 0;
      if (!busca.trim()) {
        // Contar até 5000 registros para exibir total correto
        const todos = await base44.entities[tabelaSelecionada].list('-created_date', 5000);
        total = Array.isArray(todos) ? todos.length : 0;
      } else {
        total = Array.isArray(registros) ? registros.length : 0;
      }
      
      return {
        registros: Array.isArray(registros) ? registros : [],
        total,
        totalPaginas: Math.max(1, Math.ceil(total / limite))
      };
    },
    keepPreviousData: true,
  });

  const handleBusca = (e) => {
    setBusca(e.target.value);
    setPagina(1);
  };

  const renderizarColuna = (registro, tabela) => {
    switch (tabela) {
      case 'TPUClasses':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">{registro.nome}</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">Sigla: {registro.sigla}</span>
              <Badge variant="outline" className="text-xs">
                {registro.situacao === 'A' ? '✓ Ativo' : '✗ Inativo'}
              </Badge>
            </div>
          </div>
        );
      case 'TPUAssuntos':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">{registro.nome}</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">Ramo: {registro.ramo_direito}</span>
              <Badge variant="outline" className="text-xs">
                {registro.situacao === 'A' ? '✓ Ativo' : '✗ Inativo'}
              </Badge>
            </div>
          </div>
        );
      case 'TPUMovimentos':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">{registro.nome}</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">Categoria: {registro.categoria}</span>
              <Badge variant="outline" className="text-xs">
                {registro.situacao === 'A' ? '✓ Ativo' : '✗ Inativo'}
              </Badge>
            </div>
          </div>
        );
      case 'TPUDocumentos':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">Doc #{registro.cod_documento_processual}</div>
            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
              {registro.txt_glossario || 'Sem descrição'}
            </div>
          </div>
        );
      case 'JuizoCNJ':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">{registro.nome}</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">{registro.tribunal} • {registro.municipio}</span>
              <Badge variant="outline" className="text-xs">
                {registro.ativo ? '✓ Ativo' : '✗ Inativo'}
              </Badge>
            </div>
          </div>
        );
      case 'Serventia':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">{registro.nome}</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">{registro.tribunal} • {registro.cartorio_tipo}</span>
              <Badge variant="outline" className="text-xs">
                {registro.ativo ? '✓ Ativo' : '✗ Inativo'}
              </Badge>
            </div>
          </div>
        );
      case 'CodigoForoTJSP':
        return (
          <div key={registro.id} className="border-b py-3 hover:bg-slate-50 cursor-pointer"
            onClick={() => setRegistroSelecionado(registro)}>
            <div className="font-medium text-sm">{registro.nome_foro}</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">Código: {registro.codigo_tjsp}</span>
              <Badge variant="outline" className="text-xs">
                {registro.ativo ? '✓ Ativo' : '✗ Inativo'}
              </Badge>
            </div>
          </div>
        );
       default:
         return null;
    }
  };

  const renderizarDetalhes = () => {
    if (!registroSelecionado) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Detalhes do Registro</CardTitle>
            <button 
              onClick={() => setRegistroSelecionado(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(registroSelecionado).map(([chave, valor]) => (
              <div key={chave} className="border-b pb-2">
                <p className="text-xs font-medium text-gray-500 uppercase">{chave}</p>
                <p className="text-sm mt-1 break-words">
                  {typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <Tabs value={tabelaSelecionada} onValueChange={(v) => {
        setTabelaSelecionada(v);
        setPagina(1);
        setBusca('');
      }}>
        <TabsList className="grid w-full grid-cols-7 overflow-x-auto">
          {TABELAS.map(tabela => (
            <TabsTrigger key={tabela.id} value={tabela.id}>
              <span className="mr-1">{tabela.ícone}</span>
              {tabela.nome}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABELAS.map(tabela => (
          <TabsContent key={tabela.id} value={tabela.id} className="space-y-4">
            {/* Barra de Busca */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder={`Buscar em ${tabela.nome}...`}
                      value={busca}
                      onChange={handleBusca}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando...
                </div>
              ) : (
                <>
                  <span>Total: <span className="font-bold">{resultado?.total || 0}</span> registros</span>
                  {resultado?.total >= 5000 && (
                    <span className="flex items-center gap-1 text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                      <AlertCircle className="w-3 h-3" /> Pode haver mais (limite de contagem: 5000)
                    </span>
                  )}
                  {busca && <span className="ml-2">| Exibindo: {resultado?.registros?.length || 0}</span>}
                </>
              )}
            </div>

            {/* Lista */}
            <Card>
              <CardContent className="pt-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-sm">
                    Erro ao carregar dados: {error.message}
                  </div>
                )}
                
                {isLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : resultado?.registros?.length > 0 ? (
                  <div className="space-y-0">
                    {resultado.registros.map(reg => renderizarColuna(reg, tabela.id))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    Nenhum registro encontrado
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Paginação */}
            {resultado && resultado.totalPaginas > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Página <span className="font-bold">{pagina}</span> de <span className="font-bold">{resultado.totalPaginas}</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                    disabled={pagina === 1 || isLoading}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagina(p => (p < resultado.totalPaginas ? p + 1 : p))}
                    disabled={pagina >= resultado.totalPaginas || isLoading}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {renderizarDetalhes()}
    </div>
  );
}