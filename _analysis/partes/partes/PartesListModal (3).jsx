import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, UserPlus, X, User, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function PartesListModal({ isOpen, onClose, processo, polo, onUpdate }) {
  const [partesData, setPartesData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [buscaContato, setBuscaContato] = useState('');
  const [contatosEncontrados, setContatosEncontrados] = useState([]);
  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      carregarPartes();
    }
  }, [isOpen, processo]);

  const carregarPartes = async () => {
    setCarregando(true);
    try {
      const partesIds = processo.partes_ids || [];
      if (partesIds.length > 0) {
        const contatos = await base44.entities.Contact.filter({
          id: { $in: partesIds }
        });
        
        // Filtrar por polo
        const partesFiltradas = contatos.filter(c => {
          if (polo === 'ativo') return c.id === processo.polo_ativo_id;
          if (polo === 'passivo') return c.id === processo.polo_passivo_id;
          return true;
        });

        setPartesData(partesFiltradas);
      }
    } catch (error) {
      console.error('Erro ao carregar partes:', error);
    } finally {
      setCarregando(false);
    }
  };

  const buscarContatos = async () => {
    if (!buscaContato.trim()) {
      toast.error('Digite um termo de busca');
      return;
    }

    try {
      const contatos = await base44.entities.Contact.list();
      const resultados = contatos.filter(c => 
        c.nome?.toLowerCase().includes(buscaContato.toLowerCase()) ||
        c.email?.toLowerCase().includes(buscaContato.toLowerCase()) ||
        c.cpf_cnpj?.includes(buscaContato)
      );

      setContatosEncontrados(resultados);
      if (resultados.length === 0) {
        toast.error('Nenhum contato encontrado');
      }
    } catch (error) {
      toast.error('Erro ao buscar');
    }
  };

  const adicionarParte = async () => {
    if (!contatoSelecionado) return;

    try {
      const partesIds = processo.partes_ids || [];
      const updates = {
        partes_ids: [...new Set([...partesIds, contatoSelecionado.id])]
      };

      if (polo === 'ativo') {
        updates.polo_ativo_nome = contatoSelecionado.nome;
        updates.polo_ativo_id = contatoSelecionado.id;
      } else if (polo === 'passivo') {
        updates.polo_passivo_nome = contatoSelecionado.nome;
        updates.polo_passivo_id = contatoSelecionado.id;
      }

      await base44.entities.Processo.update(processo.id, updates);

      toast.success('Parte adicionada');
      setShowAddModal(false);
      setBuscaContato('');
      setContatosEncontrados([]);
      setContatoSelecionado(null);
      carregarPartes();
      onUpdate?.();
    } catch (error) {
      toast.error('Erro ao adicionar parte');
    }
  };

  const removerParte = async (parteId) => {
    try {
      const partesIds = processo.partes_ids || [];
      const updates = {
        partes_ids: partesIds.filter(id => id !== parteId)
      };

      // Limpar se for polo principal
      if (processo.polo_ativo_id === parteId) {
        updates.polo_ativo_id = null;
        updates.polo_ativo_nome = null;
      }
      if (processo.polo_passivo_id === parteId) {
        updates.polo_passivo_id = null;
        updates.polo_passivo_nome = null;
      }

      await base44.entities.Processo.update(processo.id, updates);
      toast.success('Parte removida');
      carregarPartes();
      onUpdate?.();
    } catch (error) {
      toast.error('Erro ao remover parte');
    }
  };

  const partesFiltradas = partesData.filter(p =>
    !searchTerm || 
    p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Dialog open={isOpen && !showAddModal} onOpenChange={onClose}>
        <DialogContent className="bg-[#111916] border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center justify-between">
              <span>Partes do Polo {polo === 'ativo' ? 'Ativo' : 'Passivo'}</span>
              <Button
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="bg-[#10b981] hover:bg-[#0d9c6e] text-white gap-2"
              >
                <UserPlus size={14} />
                Adicionar Parte
              </Button>
            </DialogTitle>
          </DialogHeader>

          {partesData.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou email..."
                className="pl-9 bg-[#0a0f0d] border-white/10"
              />
            </div>
          )}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {carregando ? (
              <p className="text-center text-white/60 py-4">Carregando...</p>
            ) : partesFiltradas.length === 0 ? (
              <p className="text-center text-white/60 py-4">
                {searchTerm ? 'Nenhum resultado' : 'Nenhuma parte cadastrada'}
              </p>
            ) : (
              partesFiltradas.map(parte => (
                <div key={parte.id} className="p-4 bg-white/5 border border-white/10 rounded hover:bg-white/10 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open-contact-detail', { detail: parte.id }))}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer ${
                          polo === 'ativo' ? 'bg-[#10b981]' : 'bg-red-500'
                        }`}
                      >
                        {(parte.nome || parte.email)?.[0]?.toUpperCase()}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-semibold">{parte.nome || parte.email}</p>
                        <p className="text-xs text-white/60 truncate">{parte.email}</p>
                        {parte.cpf_cnpj && (
                          <p className="text-xs text-white/40 mt-1">CPF/CNPJ: {parte.cpf_cnpj}</p>
                        )}
                        {((polo === 'ativo' && parte.id === processo.polo_ativo_id) ||
                          (polo === 'passivo' && parte.id === processo.polo_passivo_id)) && (
                          <Badge className={`mt-2 text-[9px] ${
                            polo === 'ativo' 
                              ? 'bg-[#10b981]/20 text-[#10b981]' 
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            PARTE PRINCIPAL
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removerParte(parte.id)}
                      className="p-2 hover:bg-red-500/20 rounded transition-colors"
                      title="Remover parte"
                    >
                      <X size={16} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Adicionar Parte */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#111916] border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">
              Adicionar Parte ao Polo {polo === 'ativo' ? 'Ativo' : 'Passivo'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/80 mb-2 block">
                Buscar contato por nome, email ou CPF/CNPJ
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Digite para buscar..."
                  value={buscaContato}
                  onChange={(e) => setBuscaContato(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarContatos()}
                  className="flex-1 bg-[#0a0f0d] border-white/10"
                />
                <Button onClick={buscarContatos} className="bg-[#10b981] hover:bg-[#0d9c6e]">
                  <Search size={16} className="mr-2" />
                  Buscar
                </Button>
              </div>
            </div>

            {contatosEncontrados.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-2 border border-white/10 rounded p-2 bg-[#0a0f0d]">
                {contatosEncontrados.map(contato => (
                  <div
                    key={contato.id}
                    onClick={() => setContatoSelecionado(contato)}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      contatoSelecionado?.id === contato.id
                        ? 'bg-[#10b981]/20 border-[#10b981]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#10b981] flex items-center justify-center text-white font-bold">
                        {(contato.nome || contato.email)?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{contato.nome || 'Sem nome'}</p>
                        <p className="text-xs text-white/60">{contato.email}</p>
                      </div>
                      {contatoSelecionado?.id === contato.id && (
                        <div className="w-5 h-5 rounded-full bg-[#10b981] flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="border-white/10">
              Cancelar
            </Button>
            {contatoSelecionado && (
              <Button onClick={adicionarParte} className="bg-[#10b981] hover:bg-[#0d9c6e]">
                <UserPlus size={16} className="mr-2" />
                Confirmar
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}