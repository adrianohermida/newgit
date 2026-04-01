import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight, Edit2, Save, X, Loader2, Filter } from 'lucide-react';

const TABELAS = [
  { id: 'TPUClasses', nome: 'Classes', ícone: '📋', colunas: ['nome', 'sigla', 'natureza', 'situacao'] },
  { id: 'TPUAssuntos', nome: 'Assuntos', ícone: '📚', colunas: ['nome', 'ramo_direito', 'sigiloso', 'situacao'] },
  { id: 'TPUMovimentos', nome: 'Movimentos', ícone: '⚙️', colunas: ['nome', 'categoria', 'subcategoria', 'visibilidade_externa'] },
  { id: 'TPUDocumentos', nome: 'Documentos', ícone: '📄', colunas: ['cod_documento_processual', 'txt_glossario', 'situacao'] },
  { id: 'JuizoCNJ', nome: 'Juízos CNJ', ícone: '⚖️', colunas: ['nome', 'tribunal', 'municipio', 'grau', 'ativo'] },
  { id: 'Serventia', nome: 'Serventias', ícone: '🏛️', colunas: ['nome', 'tribunal', 'municipio', 'cartorio_tipo', 'ativo'] },
  { id: 'CodigoForoTJSP', nome: 'Foro TJSP', ícone: '📍', colunas: ['nome_foro', 'codigo_tjsp', 'comarca', 'grau', 'ativo'] }
];

function EditModal({ registro, tabela, isOpen, onClose, onSave }) {
   const [editData, setEditData] = useState(registro || {});
   const [saving, setSaving] = useState(false);
   const queryClient = useQueryClient();

   const handleSave = async () => {
     setSaving(true);
     try {
       await base44.entities[tabela].update(registro.id, editData);
       queryClient.invalidateQueries({ queryKey: [tabela] });
       onClose();
     } catch (err) {
       console.error('Erro ao salvar:', err);
     } finally {
       setSaving(false);
     }
   };

   if (!isOpen || !registro) return null;

   return (
     <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
       <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
         <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-white border-b">
           <CardTitle>Editar Registro</CardTitle>
           <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
             <X className="w-5 h-5" />
           </button>
         </CardHeader>
         <CardContent className="space-y-4 p-6">
           {editData && Object.entries(editData).map(([chave, valor]) => {
            if (chave === 'id' || chave === 'created_date' || chave === 'updated_date' || chave === 'created_by') return null;
            return (
              <div key={chave}>
                <label className="text-xs font-medium text-gray-600 uppercase">{chave}</label>
                {typeof valor === 'boolean' ? (
                  <Select value={String(valor)} onValueChange={(v) => setEditData({ ...editData, [chave]: v === 'true' })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sim</SelectItem>
                      <SelectItem value="false">Não</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={valor?.toString() || ''}
                    onChange={(e) => setEditData({ ...editData, [chave]: e.target.value })}
                    className="mt-1"
                  />
                )}
              </div>
            );
          })}
        </CardContent>
        <div className="flex gap-2 p-6 border-t bg-gray-50 sticky bottom-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar</>}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function TPUViewerTable() {
  const [tabelaSelecionada, setTabelaSelecionada] = useState('TPUClasses');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(50);
  const [editModal, setEditModal] = useState({ isOpen: false, registro: null });
  const [filtrosAvancados, setFiltrosAvancados] = useState({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const tabelaAtual = TABELAS.find(t => t.id === tabelaSelecionada);

  const { data: resultado, isLoading, error } = useQuery({
    queryKey: [tabelaSelecionada, pagina, busca, limite, filtrosAvancados],
    queryFn: async () => {
      const offset = (pagina - 1) * limite;
      const query = busca.trim() ? { $text: { $search: busca.trim() } } : {};
      
      // Aplicar filtros avançados
      Object.entries(filtrosAvancados).forEach(([chave, valor]) => {
        if (valor !== '' && valor !== null) {
          query[chave] = { $regex: valor, $options: 'i' };
        }
      });

      const registros = await base44.entities[tabelaSelecionada].filter(query, '-created_date', limite, offset);
      return {
        registros: Array.isArray(registros) ? registros : [],
        total: Array.isArray(registros) ? registros.length : 0,
        totalPaginas: Math.ceil((Array.isArray(registros) ? registros.length : 0) / limite)
      };
    },
    keepPreviousData: true,
  });

  const colunas = tabelaAtual?.colunas || [];

  return (
    <div className="space-y-6 p-6">
      <Tabs value={tabelaSelecionada} onValueChange={(v) => {
        setTabelaSelecionada(v);
        setPagina(1);
        setBusca('');
        setFiltrosAvancados({});
      }}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 overflow-x-auto">
          {TABELAS.map(tabela => (
            <TabsTrigger key={tabela.id} value={tabela.id} className="text-xs">
              <span className="mr-1">{tabela.ícone}</span>
              {tabela.nome}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABELAS.map(tabela => (
          <TabsContent key={tabela.id} value={tabela.id} className="space-y-4">
            {/* Barra de Busca e Controles */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex gap-2 flex-wrap items-end">
                  <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder={`Buscar em ${tabela.nome}...`}
                      value={busca}
                      onChange={(e) => {
                        setBusca(e.target.value);
                        setPagina(1);
                      }}
                      className="pl-10"
                    />
                  </div>
                  <Button
                    variant={mostrarFiltros ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMostrarFiltros(!mostrarFiltros)}
                    className="gap-1"
                  >
                    <Filter className="w-4 h-4" /> Filtros
                  </Button>
                  <Select value={String(limite)} onValueChange={(v) => {
                    setLimite(Number(v));
                    setPagina(1);
                  }}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 registros</SelectItem>
                      <SelectItem value="25">25 registros</SelectItem>
                      <SelectItem value="50">50 registros</SelectItem>
                      <SelectItem value="100">100 registros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Filtros Avançados */}
                {mostrarFiltros && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t">
                    {colunas.map(col => (
                      <div key={col}>
                        <label className="text-xs font-medium text-gray-600">{col}</label>
                        <Input
                          placeholder={`Filtrar ${col}...`}
                          value={filtrosAvancados[col] || ''}
                          onChange={(e) => {
                            setFiltrosAvancados({ ...filtrosAvancados, [col]: e.target.value });
                            setPagina(1);
                          }}
                          className="mt-1 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info */}
            <div className="text-sm text-gray-600 flex items-center gap-2">
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</>
              ) : (
                <>
                  <span>Total: <span className="font-bold">{resultado?.total || 0}</span> registros</span>
                  {busca && <span>| Resultados: {resultado?.registros?.length || 0}</span>}
                </>
              )}
            </div>

            {/* Tabela */}
            <Card className="overflow-x-auto">
              <div className="min-w-full">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {colunas.map(col => (
                        <th key={col} className="px-4 py-3 text-left font-semibold text-gray-700">
                          {col}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resultado?.registros?.length > 0 ? (
                      resultado.registros.map(reg => (
                        <tr key={reg.id} className="hover:bg-gray-50">
                          {colunas.map(col => (
                            <td key={col} className="px-4 py-3 text-gray-700">
                              {typeof reg[col] === 'boolean' ? (
                                <Badge variant={reg[col] ? 'default' : 'outline'}>
                                  {reg[col] ? '✓ Sim' : '✗ Não'}
                                </Badge>
                              ) : (
                                <span className="truncate block max-w-[200px]">{String(reg[col] || '')}</span>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditModal({ isOpen: true, registro: reg })}
                              className="gap-1"
                            >
                              <Edit2 className="w-4 h-4" /> Editar
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={colunas.length + 1} className="px-4 py-10 text-center text-gray-500">
                          Nenhum registro encontrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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

      {/* Modal de Edição */}
      <EditModal
        registro={editModal.registro}
        tabela={tabelaSelecionada}
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, registro: null })}
      />
    </div>
  );
}