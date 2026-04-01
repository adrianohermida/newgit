import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit, Zap, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EnriquecimentoModal from './EnriquecimentoModal';

export default function PartesManagerAdvanced({ processo, userRole }) {
  const [showForm, setShowForm] = useState(false);
  const [editingParte, setEditingParte] = useState(null);
  const [showEnrichment, setShowEnrichment] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const queryClient = useQueryClient();

  const isAdmin = userRole === 'admin';
  const isConsultor = userRole === 'consultor' || userRole === 'consultant';

  // Busca partes do processo
  const { data: partes = [], isLoading } = useQuery({
    queryKey: ['partes', processo?.id],
    queryFn: () => base44.entities.Partes.filter({ processo_id: processo?.id }),
    enabled: !!processo?.id,
  });

  // Busca bancos e credores para o select
  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos'],
    queryFn: () => base44.entities.Banco.list(),
  });

  const { data: credores = [] } = useQuery({
    queryKey: ['credores'],
    queryFn: () => base44.entities.Credor.list(),
  });

  // Mutations
  const createParteMutation = useMutation({
    mutationFn: (data) => base44.entities.Partes.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partes', processo?.id] });
      setShowForm(false);
      setEditingParte(null);
      toast.success('Parte adicionada com sucesso');
    },
    onError: (err) => toast.error('Erro ao adicionar parte: ' + err.message),
  });

  const updateParteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Partes.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partes', processo?.id] });
      setEditingParte(null);
      toast.success('Parte atualizada com sucesso');
    },
    onError: (err) => toast.error('Erro ao atualizar: ' + err.message),
  });

  const deleteParteMutation = useMutation({
    mutationFn: (id) => base44.entities.Partes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partes', processo?.id] });
      toast.success('Parte removida');
    },
    onError: (err) => toast.error('Erro ao remover: ' + err.message),
  });

  const handleSaveParte = (formData) => {
    const data = {
      ...formData,
      processo_id: processo.id,
      processo_numero: processo.numero_processo,
    };

    if (editingParte) {
      updateParteMutation.mutate({ id: editingParte.id, data });
    } else {
      createParteMutation.mutate(data);
    }
  };

  const partesFiltered = filtro === 'todos' ? partes : partes.filter(p => p.polo === filtro);

  if (!processo) return <p className="text-slate-500">Selecione um processo primeiro</p>;
  if (!isAdmin && !isConsultor) return <p className="text-red-500">Acesso negado</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Partes Envolvidas ({partes.length})</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus className="w-4 h-4" /> Adicionar Parte
        </Button>
      </div>

      {/* Filtro por Polo */}
      <Select value={filtro} onValueChange={setFiltro}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todas as Partes</SelectItem>
          <SelectItem value="ativo">Polo Ativo</SelectItem>
          <SelectItem value="passivo">Polo Passivo</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : partesFiltered.length === 0 ? (
        <Card className="bg-slate-50">
          <CardContent className="py-6 text-center text-slate-500">
            Nenhuma parte adicionada para este processo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {partesFiltered.map((parte) => (
            <Card key={parte.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-slate-800">{parte.nome}</h4>
                      <Badge variant="outline" className="text-xs">
                        {parte.polo === 'ativo' ? '🔴 Ativo' : '🔵 Passivo'}
                      </Badge>
                      <Badge className={`text-xs ${parte.tipo === 'pessoa_fisica' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {parte.tipo === 'pessoa_fisica' ? 'PF' : 'PJ'}
                      </Badge>
                    </div>
                    {parte.cpf_cnpj && <p className="text-xs text-slate-600">CPF/CNPJ: {parte.cpf_cnpj}</p>}
                    {parte.qualificacao && <p className="text-xs text-slate-600">Qualificação: {parte.qualificacao}</p>}
                    {parte.representante && <p className="text-xs text-slate-600">Representante: {parte.representante}</p>}
                    {parte.dados_enriquecidos && (
                      <Badge variant="outline" className="mt-2 text-xs bg-green-50">
                        ✓ Enriquecido
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {parte.tipo && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setShowEnrichment(parte)}
                        className="hover:bg-yellow-50 text-yellow-600"
                        title="Enriquecer dados via Directdata"
                      >
                        <Zap className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingParte(parte);
                        setShowForm(true);
                      }}
                      className="hover:bg-blue-50"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteParteMutation.mutate(parte.id)}
                      className="hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Adicionar/Editar Parte */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingParte ? 'Editar Parte' : 'Adicionar Nova Parte'}</DialogTitle>
          </DialogHeader>
          <PartesForm
            parte={editingParte}
            bancos={bancos}
            credores={credores}
            onSubmit={handleSaveParte}
            onCancel={() => {
              setShowForm(false);
              setEditingParte(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Modal de Enriquecimento */}
      {showEnrichment && (
        <EnriquecimentoModal
          parte={showEnrichment}
          processo={processo}
          onClose={() => setShowEnrichment(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['partes', processo.id] });
            setShowEnrichment(null);
          }}
        />
      )}
    </div>
  );
}

// Componente de Formulário Parte
function PartesForm({ parte, bancos, credores, onSubmit, onCancel }) {
  const [form, setForm] = useState(
    parte || {
      polo: 'ativo',
      tipo: 'pessoa_fisica',
      nome: '',
      cpf_cnpj: '',
      qualificacao: '',
      representante: '',
      representante_oab: '',
      banco_id: '',
      credor_id: '',
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Polo *</label>
          <Select value={form.polo} onValueChange={(v) => setForm({ ...form, polo: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="passivo">Passivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Tipo *</label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
              <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600 mb-1 block">Nome *</label>
        <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome da parte" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">CPF/CNPJ</label>
          <Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Qualificação</label>
          <Input value={form.qualificacao} onChange={(e) => setForm({ ...form, qualificacao: e.target.value })} placeholder="Autor, Réu, etc" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Representante</label>
          <Input value={form.representante} onChange={(e) => setForm({ ...form, representante: e.target.value })} placeholder="Nome do advogado" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">OAB</label>
          <Input value={form.representante_oab} onChange={(e) => setForm({ ...form, representante_oab: e.target.value })} placeholder="OAB/UF/XXXXX" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Banco</label>
          <Select value={form.banco_id || ''} onValueChange={(v) => setForm({ ...form, banco_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um banco..." />
            </SelectTrigger>
            <SelectContent>
              {bancos.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1 block">Credor</label>
          <Select value={form.credor_id || ''} onValueChange={(v) => setForm({ ...form, credor_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um credor..." />
            </SelectTrigger>
            <SelectContent>
              {credores.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Salvar Parte</Button>
      </div>
    </form>
  );
}