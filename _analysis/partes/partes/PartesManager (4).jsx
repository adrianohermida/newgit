import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Edit2, Trash2, Briefcase, User, Building2, Search, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const QUALIFICACOES = [
  'Autor',
  'Réu',
  'Terceiro Interessado',
  'Interveniente',
  'Assistente',
  'Opoente',
  'Exequente',
  'Executado',
];

export default function PartesManager({ partes = [], onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showClienteSearch, setShowClienteSearch] = useState(false);
  const [showAdvogadoSearch, setShowAdvogadoSearch] = useState(false);
  const [clienteSearchTerm, setClienteSearchTerm] = useState('');
  const [advogadoSearchTerm, setAdvogadoSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    polo: 'ativo',
    nome: '',
    cpf_cnpj: '',
    tipo: 'pessoa_fisica',
    qualificacao: 'Autor',
    representante: '',
    representante_oab: '',
    ativa: true,
  });

  // Buscar clientes
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-select'],
    queryFn: () => base44.entities.Cliente.filter({}, 'nome_completo', 500),
  });

  // Buscar partes existentes
  const { data: partesRegistros = [] } = useQuery({
    queryKey: ['partes-select'],
    queryFn: () => base44.entities.Partes.filter({}, 'nome', 500),
  });

  // Buscar advogados
  const { data: advogados = [] } = useQuery({
    queryKey: ['advogados-select'],
    queryFn: () => base44.entities.Advogados.filter({ ativo: true }, 'nome_completo', 500),
  });

  // Filtrar resultados de busca
  const clientesFiltrados = useMemo(() => 
    clientes.filter(c => c.nome_completo?.toLowerCase().includes(clienteSearchTerm.toLowerCase())),
    [clientes, clienteSearchTerm]
  );

  const partesFiltradas = useMemo(() => 
    partesRegistros.filter(p => p.nome?.toLowerCase().includes(advogadoSearchTerm.toLowerCase())),
    [partesRegistros, advogadoSearchTerm]
  );

  const advogadosFiltrados = useMemo(() => 
    advogados.filter(a => a.nome_completo?.toLowerCase().includes(advogadoSearchTerm.toLowerCase())),
    [advogados, advogadoSearchTerm]
  );

  // Adicionar cliente como parte
  const handleAdicionarCliente = (cliente) => {
    setFormData({
      ...formData,
      nome: cliente.nome_completo,
      cpf_cnpj: cliente.cpf || cliente.cnpj || '',
      tipo: cliente.tipo_pessoa === 'PJ' ? 'pessoa_juridica' : 'pessoa_fisica',
    });
    setShowClienteSearch(false);
    setClienteSearchTerm('');
  };

  // Adicionar parte existente
  const handleAdicionarPartePre = (parte) => {
    setFormData({
      ...formData,
      nome: parte.nome,
      cpf_cnpj: parte.cpf_cnpj,
      tipo: parte.tipo,
      qualificacao: parte.qualificacao,
    });
    setShowClienteSearch(false);
  };

  // Selecionar advogado para representante
  const handleSelecionarAdvogado = (advogado) => {
    setFormData({
      ...formData,
      representante: advogado.nome_completo,
      representante_oab: `${advogado.numero_oab}/${advogado.uf_oab}`,
    });
    setShowAdvogadoSearch(false);
    setAdvogadoSearchTerm('');
  };

  const handleAdd = () => {
    const newParte = {
      id: editingId || `parte_${Date.now()}`,
      ...formData,
    };

    let updatedPartes;
    if (editingId) {
      updatedPartes = partes.map((p) => (p.id === editingId ? newParte : p));
    } else {
      updatedPartes = [...partes, newParte];
    }

    onChange(updatedPartes);
    resetForm();
  };

  const handleEdit = (parte) => {
    setEditingId(parte.id);
    setFormData(parte);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    onChange(partes.filter((p) => p.id !== id));
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      polo: 'ativo',
      nome: '',
      cpf_cnpj: '',
      tipo: 'pessoa_fisica',
      qualificacao: 'Autor',
      representante: '',
      representante_oab: '',
      ativa: true,
    });
  };

  const poloAtivo = partes.filter((p) => p.polo === 'ativo');
  const poloPassivo = partes.filter((p) => p.polo === 'passivo');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-600" />
            <CardTitle>Partes do Processo</CardTitle>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova Parte
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Formulário */}
        {showForm && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Polo</label>
                <select
                  value={formData.polo}
                  onChange={(e) => setFormData({ ...formData, polo: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md mt-1"
                >
                  <option value="ativo">Ativo (Autor/Reclamante)</option>
                  <option value="passivo">Passivo (Réu/Reclamado)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Tipo</label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md mt-1"
                >
                  <option value="pessoa_fisica">Pessoa Física</option>
                  <option value="pessoa_juridica">Pessoa Jurídica</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Nome</label>
              <div className="relative">
                <Input
                  placeholder="Nome completo ou razão social"
                  value={formData.nome}
                  onChange={(e) => {
                    setFormData({ ...formData, nome: e.target.value });
                    setClienteSearchTerm(e.target.value);
                    setShowClienteSearch(true);
                  }}
                  onFocus={() => {
                    if (formData.nome) setShowClienteSearch(true);
                  }}
                  className="mt-1"
                />
                {showClienteSearch && (formData.nome || clienteSearchTerm) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                    {/* Clientes */}
                    {clientesFiltrados.length > 0 && (
                      <>
                        <div className="px-3 py-2 bg-slate-100 sticky top-0 text-xs font-semibold text-slate-700 border-b">
                          👤 Clientes Existentes
                        </div>
                        {clientesFiltrados.slice(0, 5).map(cliente => (
                          <button
                            key={cliente.id}
                            type="button"
                            onClick={() => handleAdicionarCliente(cliente)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b last:border-b-0"
                          >
                            <div className="font-semibold">{cliente.nome_completo}</div>
                            <div className="text-slate-600">{cliente.cpf || cliente.cnpj}</div>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Partes Registradas */}
                    {partesFiltradas.length > 0 && (
                      <>
                        <div className="px-3 py-2 bg-slate-100 sticky top-0 text-xs font-semibold text-slate-700 border-t border-b">
                          📋 Partes Registradas
                        </div>
                        {partesFiltradas.slice(0, 5).map(parte => (
                          <button
                            key={parte.id}
                            type="button"
                            onClick={() => handleAdicionarPartePre(parte)}
                            className="w-full text-left px-3 py-2 hover:bg-green-50 text-xs border-b last:border-b-0"
                          >
                            <div className="font-semibold">{parte.nome}</div>
                            <div className="text-slate-600">{parte.cpf_cnpj || 'S/N'}</div>
                          </button>
                        ))}
                      </>
                    )}

                    {clientesFiltrados.length === 0 && partesFiltradas.length === 0 && (
                      <div className="p-3 text-xs text-slate-500 text-center">
                        Nenhum cliente ou parte encontrado
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">CPF / CNPJ</label>
              <Input
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={formData.cpf_cnpj}
                onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                className="mt-1 font-mono"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Qualificação</label>
                <select
                  value={formData.qualificacao}
                  onChange={(e) => setFormData({ ...formData, qualificacao: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md mt-1"
                >
                  {QUALIFICACOES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Ativa?</label>
                <select
                  value={formData.ativa ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, ativa: e.target.value === 'true' })}
                  className="w-full px-2 py-1 text-sm border border-slate-300 rounded-md mt-1"
                >
                  <option value="true">Sim</option>
                  <option value="false">Não (Substituída/Removida)</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-slate-600 mb-2">Representante (Advogado/Procurador)</h4>
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="Nome do representante"
                    value={formData.representante}
                    onChange={(e) => setFormData({ ...formData, representante: e.target.value })}
                    onFocus={() => setShowAdvogadoSearch(true)}
                    className="text-sm"
                  />
                  {showAdvogadoSearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      <div className="p-2 border-b sticky top-0 bg-white">
                        <Input
                          placeholder="Buscar advogado..."
                          value={advogadoSearchTerm}
                          onChange={(e) => setAdvogadoSearchTerm(e.target.value)}
                          className="text-xs h-8"
                          autoFocus
                        />
                      </div>
                      {advogadosFiltrados.length > 0 ? (
                        advogadosFiltrados.map(adv => (
                          <button
                            key={adv.id}
                            onClick={() => handleSelecionarAdvogado(adv)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-100 text-xs border-b last:border-b-0"
                          >
                            <div className="font-semibold">{adv.nome_completo}</div>
                            <div className="text-slate-600">{adv.numero_oab}/{adv.uf_oab}</div>
                          </button>
                        ))
                      ) : (
                        <div className="p-2 text-xs text-slate-500 text-center">Nenhum advogado encontrado</div>
                      )}
                    </div>
                  )}
                </div>
                <Input
                  placeholder="OAB / INPI"
                  value={formData.representante_oab}
                  onChange={(e) => setFormData({ ...formData, representante_oab: e.target.value })}
                  className="text-sm font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!formData.nome}>
                {editingId ? 'Atualizar' : 'Adicionar'} Parte
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Polos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Polo Ativo */}
          <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Badge className="bg-blue-600">Polo Ativo</Badge>
              {poloAtivo.length}
            </h3>
            <div className="space-y-2">
              {poloAtivo.length === 0 ? (
                <p className="text-xs text-blue-700">Nenhuma parte ativa</p>
              ) : (
                poloAtivo.map((parte) => (
                  <ParteCard
                    key={parte.id}
                    parte={parte}
                    onEdit={() => handleEdit(parte)}
                    onDelete={() => handleDelete(parte.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Polo Passivo */}
          <div className="border border-red-200 rounded-lg p-3 bg-red-50">
            <h3 className="text-sm font-semibold text-red-900 mb-2 flex items-center gap-2">
              <Badge className="bg-red-600">Polo Passivo</Badge>
              {poloPassivo.length}
            </h3>
            <div className="space-y-2">
              {poloPassivo.length === 0 ? (
                <p className="text-xs text-red-700">Nenhuma parte passiva</p>
              ) : (
                poloPassivo.map((parte) => (
                  <ParteCard
                    key={parte.id}
                    parte={parte}
                    onEdit={() => handleEdit(parte)}
                    onDelete={() => handleDelete(parte.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ParteCard({ parte, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded border border-slate-200 p-2 space-y-1 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {parte.tipo === 'pessoa_fisica' ? (
              <User className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
            )}
            <p className="font-semibold text-xs text-slate-900 truncate">{parte.nome}</p>
          </div>
          <p className="text-xs text-slate-600">{parte.qualificacao}</p>
          {parte.cpf_cnpj && <p className="text-xs font-mono text-slate-500">{parte.cpf_cnpj}</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1 hover:bg-slate-100 rounded">
            <Edit2 className="w-3 h-3 text-slate-500" />
          </button>
          <button onClick={onDelete} className="p-1 hover:bg-red-100 rounded">
            <Trash2 className="w-3 h-3 text-red-500" />
          </button>
        </div>
      </div>
      {parte.representante && (
        <div className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
          <p className="font-semibold">👨‍⚖️ {parte.representante}</p>
          {parte.representante_oab && <p className="text-slate-500">{parte.representante_oab}</p>}
        </div>
      )}
      {!parte.ativa && (
        <Badge variant="outline" className="text-xs bg-amber-50">
          Inativa
        </Badge>
      )}
    </div>
  );
}