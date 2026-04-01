import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search, Loader2, Users, Scale, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ParteModule() {
  const [partes, setPartes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParte, setSelectedParte] = useState(null);
  const [processos, setProcessos] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    tipo: 'pessoa_fisica',
    nome: '',
    documento: '',
    email: '',
    telefone: '',
    endereco: '',
    tipo_parte: 'ativa',
  });

  useEffect(() => {
    loadPartes();
  }, []);

  const loadPartes = async () => {
    try {
      setLoading(true);
      const data = await base44.entities.Parte.list('-created_date', 500);
      setPartes(data || []);
    } catch (error) {
      console.error('Erro ao carregar partes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProcessosByParte = async (parteId) => {
    try {
      const parte = partes.find(p => p.id === parteId);
      if (parte?.processos_ids?.length > 0) {
        const allProcessos = await base44.entities.Processo.list('', 10000);
        const relatedProcessos = allProcessos.filter(p => 
          parte.processos_ids.includes(p.id)
        );
        setProcessos(relatedProcessos);
      } else {
        setProcessos([]);
      }
    } catch (error) {
      console.error('Erro ao carregar processos:', error);
      setProcessos([]);
    }
  };

  const handleOpenDialog = () => {
    setFormData({
      tipo: 'pessoa_fisica',
      nome: '',
      documento: '',
      email: '',
      telefone: '',
      endereco: '',
      tipo_parte: 'ativa',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.nome) {
        alert('Nome é obrigatório');
        return;
      }
      await base44.entities.Parte.create(formData);
      setShowDialog(false);
      loadPartes();
    } catch (error) {
      alert('Erro ao salvar: ' + error.message);
    }
  };

  const filteredPartes = partes.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.documento?.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-[#10b981] animate-spin" />
      </div>
    );
  }

  if (selectedParte) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => {
                setSelectedParte(null);
                setProcessos([]);
              }}
              className="text-[#10b981] hover:text-[#0d9c6e] font-medium flex items-center gap-2 mb-4"
            >
              ← Voltar
            </button>
            <h1 className="text-3xl font-bold text-white mb-2">{selectedParte.nome}</h1>
            <p className="text-gray-400">{selectedParte.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
          </div>
        </div>

        <Tabs defaultValue="detalhes" className="space-y-4">
          <TabsList className="bg-[#111916] border-white/10">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="processos">
              Processos ({selectedParte.processos_count || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes">
            <Card className="bg-[#111916] border-white/10">
              <CardHeader>
                <CardTitle>Informações da Parte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Nome</p>
                    <p className="text-white font-medium">{selectedParte.nome}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Tipo</p>
                    <p className="text-white font-medium">
                      {selectedParte.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                    </p>
                  </div>
                  {selectedParte.documento && (
                    <div>
                      <p className="text-sm text-gray-400 mb-1">
                        {selectedParte.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}
                      </p>
                      <p className="text-white font-medium">{selectedParte.documento}</p>
                    </div>
                  )}
                  {selectedParte.email && (
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Email</p>
                      <p className="text-white font-medium">{selectedParte.email}</p>
                    </div>
                  )}
                  {selectedParte.telefone && (
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Telefone</p>
                      <p className="text-white font-medium">{selectedParte.telefone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Posição nos Processos</p>
                    <p className="text-white font-medium capitalize">
                      {selectedParte.tipo_parte}
                    </p>
                  </div>
                </div>
                {selectedParte.endereco && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-gray-400 mb-1">Endereço</p>
                    <p className="text-white font-medium">{selectedParte.endereco}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="processos">
            <div className="space-y-4">
              {processos.length === 0 ? (
                <Card className="bg-[#111916] border-white/10">
                  <CardContent className="p-8 text-center">
                    <Scale className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">Nenhum processo associado</p>
                  </CardContent>
                </Card>
              ) : (
                processos.map(processo => (
                  <Card key={processo.id} className="bg-[#111916] border-white/10">
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-gray-400 mb-1">Número CNJ</p>
                          <p className="text-white font-bold">{processo.numero_cnj}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400 mb-1">Título</p>
                          <p className="text-white">{processo.titulo}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-400 mb-1">Tribunal</p>
                            <p className="text-white">{processo.tribunal}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 mb-1">Área</p>
                            <p className="text-white capitalize">{processo.area}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 mb-1">Status</p>
                            <p className="text-white capitalize">{processo.status_juridico}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Partes Processuais</h1>
          <p className="text-gray-400">Gerencie pessoas físicas e jurídicas envolvidas em processos</p>
        </div>
        <Button onClick={handleOpenDialog} className="bg-[#11ba82] hover:bg-[#0d9c6e]">
          <Plus className="w-4 h-4 mr-2" />
          Nova Parte
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome ou documento..."
          className="pl-10 bg-[#111916] border-white/10 text-white"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#111916] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-[#10b981]" />
              <div>
                <p className="text-2xl font-bold text-white">{partes.length}</p>
                <p className="text-sm text-gray-400">Total de Partes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111916] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Scale className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {partes.filter(p => p.tipo === 'pessoa_fisica').length}
                </p>
                <p className="text-sm text-gray-400">Pessoas Físicas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111916] border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-2xl font-bold text-white">
                  {partes.filter(p => p.tipo === 'pessoa_juridica').length}
                </p>
                <p className="text-sm text-gray-400">Pessoas Jurídicas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredPartes.length === 0 ? (
          <Card className="bg-[#111916] border-white/10">
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Nenhuma parte encontrada</p>
            </CardContent>
          </Card>
        ) : (
          filteredPartes.map(parte => (
            <Card
              key={parte.id}
              className="bg-[#111916] border-white/10 hover:border-[#10b981]/30 transition-all cursor-pointer"
              onClick={() => {
                setSelectedParte(parte);
                loadProcessosByParte(parte.id);
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-white">{parte.nome}</h3>
                      <span className={`text-xs px-3 py-1 rounded-full ${
                        parte.tipo === 'pessoa_fisica' 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {parte.tipo === 'pessoa_fisica' ? 'PF' : 'PJ'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      {parte.documento && <span>Doc: {parte.documento}</span>}
                      {parte.email && <span>Email: {parte.email}</span>}
                      <span className="text-[#10b981]">
                        {parte.processos_count || 0} processo{(parte.processos_count || 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <Eye className="w-5 h-5 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#111916] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Nova Parte Processual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                <SelectTrigger className="bg-[#0a0f0d] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                  <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome Completo / Razão Social *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Insira o nome"
                className="bg-[#0a0f0d] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>{formData.tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
              <Input
                value={formData.documento}
                onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                placeholder={formData.tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'}
                className="bg-[#0a0f0d] border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  type="email"
                  placeholder="email@example.com"
                  className="bg-[#0a0f0d] border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="bg-[#0a0f0d] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Posição nos Processos</Label>
              <Select value={formData.tipo_parte} onValueChange={(v) => setFormData({ ...formData, tipo_parte: v })}>
                <SelectTrigger className="bg-[#0a0f0d] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa (Autor)</SelectItem>
                  <SelectItem value="passiva">Passiva (Réu)</SelectItem>
                  <SelectItem value="assistente">Assistente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Rua, número, complemento..."
                className="bg-[#0a0f0d] border-white/10 text-white"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="white" onClick={() => setShowDialog(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleSave} className="flex-1 bg-[#11ba82] hover:bg-[#0d9c6e]">
                Criar Parte
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}