import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, UserPlus } from 'lucide-react';

export default function PartesManager({ isOpen, onClose, processo, polo, onUpdate }) {
  const [buscaTermo, setBuscaTermo] = useState('');
  const [contatosEncontrados, setContatosEncontrados] = useState([]);
  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const buscarContatos = async () => {
    if (!buscaTermo.trim()) {
      toast.error('Digite um termo de busca');
      return;
    }

    setBuscando(true);
    try {
      const contatos = await base44.entities.Contact.list();
      const resultados = contatos.filter(c => 
        c.nome?.toLowerCase().includes(buscaTermo.toLowerCase()) ||
        c.email?.toLowerCase().includes(buscaTermo.toLowerCase()) ||
        c.cpf_cnpj?.includes(buscaTermo)
      );

      if (resultados.length === 0) {
        toast.error('Nenhum contato encontrado');
      } else {
        toast.success(`${resultados.length} contato(s) encontrado(s)`);
      }

      setContatosEncontrados(resultados);
    } catch (error) {
      toast.error('Erro ao buscar contatos');
      console.error(error);
    } finally {
      setBuscando(false);
    }
  };

  const vincularParte = async () => {
    if (!contatoSelecionado) {
      toast.error('Selecione um contato');
      return;
    }

    setSalvando(true);
    try {
      const updates = {};
      
      if (polo === 'ativo') {
        updates.polo_ativo_nome = contatoSelecionado.nome;
        updates.polo_ativo_id = contatoSelecionado.id;
        
        // Adicionar aos partes_ids se não estiver
        const partesIds = processo.partes_ids || [];
        if (!partesIds.includes(contatoSelecionado.id)) {
          updates.partes_ids = [...partesIds, contatoSelecionado.id];
        }
      } else if (polo === 'passivo') {
        updates.polo_passivo_nome = contatoSelecionado.nome;
        updates.polo_passivo_id = contatoSelecionado.id;
      }

      await base44.entities.Processo.update(processo.id, updates);

      // Tentar extrair publicações associadas automaticamente
      try {
        await base44.functions.invoke('extrairPartesDePublicacoes', {
          processo_id: processo.id
        });
      } catch (e) {
        console.log('Aviso: extração de publicações falhou', e);
      }

      toast.success(`Parte vinculada ao polo ${polo === 'ativo' ? 'ativo' : 'passivo'}`);
      onUpdate?.();
      onClose();
    } catch (error) {
      toast.error('Erro ao vincular parte');
      console.error(error);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#111916] border-white/10 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">
            Adicionar Parte ao Polo {polo === 'ativo' ? 'Ativo' : 'Passivo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca */}
          <div>
            <label className="text-sm text-white/80 mb-2 block">
              Buscar contato por nome, email ou CPF/CNPJ
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="Digite para buscar..."
                value={buscaTermo}
                onChange={(e) => setBuscaTermo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarContatos()}
                className="flex-1 bg-[#0a0f0d] border-white/10"
                autoFocus
              />
              <Button
                onClick={buscarContatos}
                disabled={buscando}
                className="bg-[#10b981] hover:bg-[#0d9c6e]"
              >
                <Search size={16} className="mr-2" />
                {buscando ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
            <p className="text-xs text-white/40 mt-2">
              Os contatos devem estar cadastrados no módulo de CRM/Contatos
            </p>
          </div>

          {/* Resultados */}
          {contatosEncontrados.length > 0 && (
            <div>
              <label className="text-sm text-white/80 mb-2 block">
                Selecione o contato ({contatosEncontrados.length} encontrado{contatosEncontrados.length > 1 ? 's' : ''})
              </label>
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
                        <p className="text-sm text-white font-medium truncate">
                          {contato.nome || 'Sem nome'}
                        </p>
                        <p className="text-xs text-white/60 truncate">{contato.email}</p>
                        {contato.cpf_cnpj && (
                          <p className="text-xs text-white/40">CPF/CNPJ: {contato.cpf_cnpj}</p>
                        )}
                      </div>
                      {contatoSelecionado?.id === contato.id && (
                        <div className="w-5 h-5 rounded-full bg-[#10b981] flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contatoSelecionado && (
            <div className="bg-green-500/10 border border-green-500/30 rounded p-4">
              <p className="text-sm text-green-300 font-semibold mb-2">
                ✓ Contato selecionado
              </p>
              <div className="space-y-1">
                <p className="text-sm text-white">{contatoSelecionado.nome}</p>
                <p className="text-xs text-white/60">{contatoSelecionado.email}</p>
                {contatoSelecionado.cpf_cnpj && (
                  <p className="text-xs text-white/60">CPF/CNPJ: {contatoSelecionado.cpf_cnpj}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10">
            Cancelar
          </Button>
          {contatoSelecionado && (
            <Button
              onClick={vincularParte}
              disabled={salvando}
              className="bg-[#10b981] hover:bg-[#0d9c6e]"
            >
              <UserPlus size={16} className="mr-2" />
              {salvando ? 'Vinculando...' : 'Confirmar Vínculo'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}