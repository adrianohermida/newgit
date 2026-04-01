import { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ParteAutocomplete from '../ParteAutocomplete';
import AdvogadoAutocomplete from '../AdvogadoAutocomplete';

export default function ParteFormModal({ processo, editingItem, open, onClose }) {
  const queryClient = useQueryClient();
  const initialFormData = {
    nome: '',
    tipo_pessoa: 'fisica',
    polo: 'ativo',
    tipo_participacao: 'autor',
    cpf_cnpj: '',
    advogado: '',
    contact_id: null,
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        nome: editingItem.nome || '',
        tipo_pessoa: editingItem.tipo_pessoa || 'fisica',
        polo: editingItem.polo || 'ativo',
        tipo_participacao: editingItem.tipo_participacao || 'autor',
        cpf_cnpj: editingItem.cpf_cnpj || '',
        advogado: editingItem.advogado || ''
      });
    } else {
      setFormData(initialFormData);
    }
  }, [editingItem, open]);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (editingItem) {
        return await base44.entities.ParteProcesso.update(editingItem.id, data);
      }
      return await base44.entities.ParteProcesso.create({
        workspace_id: processo.workspace_id,
        processo_id: processo.id,
        ...data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['processo-partes', processo.id]);
      toast.success(editingItem ? 'Parte atualizada com sucesso' : 'Parte adicionada com sucesso');
      onClose();
    },
    onError: (error) => {
      toast.error(`Erro ao ${editingItem ? 'atualizar' : 'adicionar'} parte: ` + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome) {
      toast.error('Preencha o nome da parte');
      return;
    }
    createMutation.mutate(formData);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#00a2ff]/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-[#00a2ff]" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {editingItem ? 'Editar Parte' : 'Adicionar Parte'}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="nome">Nome da Parte *</Label>
            <ParteAutocomplete
              value={formData}
              onChange={(data) => setFormData({ ...formData, ...data })}
              placeholder="Buscar contato existente ou digite para criar novo"
              processoId={processo.id}
            />
            {formData.contact_id && (
              <p className="text-xs text-emerald-600 mt-1">
                ✓ Vinculado a contato existente
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tipo_pessoa">Tipo de Pessoa</Label>
              <Select value={formData.tipo_pessoa} onValueChange={(value) => setFormData({ ...formData, tipo_pessoa: value })}>
                <SelectTrigger id="tipo_pessoa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Pessoa Física</SelectItem>
                  <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
              <Input
                id="cpf_cnpj"
                placeholder={formData.tipo_pessoa === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'}
                value={formData.cpf_cnpj}
                onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="polo">Polo</Label>
              <Select value={formData.polo} onValueChange={(value) => setFormData({ ...formData, polo: value })}>
                <SelectTrigger id="polo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Polo Ativo</SelectItem>
                  <SelectItem value="passivo">Polo Passivo</SelectItem>
                  <SelectItem value="terceiro">Terceiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tipo_participacao">Participação</Label>
              <Select value={formData.tipo_participacao} onValueChange={(value) => setFormData({ ...formData, tipo_participacao: value })}>
                <SelectTrigger id="tipo_participacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="autor">Autor</SelectItem>
                  <SelectItem value="reu">Réu</SelectItem>
                  <SelectItem value="testemunha">Testemunha</SelectItem>
                  <SelectItem value="perito">Perito</SelectItem>
                  <SelectItem value="advogado">Advogado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advogado (se tipo_participacao = advogado ou autor) */}
          {(formData.tipo_participacao === 'advogado' || formData.polo === 'ativo') && (
            <div>
              <Label htmlFor="advogado">Advogado do Escritório</Label>
              <AdvogadoAutocomplete
                value={formData.advogado}
                onChange={(email) => setFormData({ ...formData, advogado: email })}
                placeholder="Selecione advogado do escritório"
              />
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-[#00a2ff] hover:bg-[#0088cc]" disabled={createMutation.isPending}>
              {createMutation.isPending 
                ? (editingItem ? 'Atualizando...' : 'Adicionando...') 
                : (editingItem ? 'Atualizar' : 'Adicionar Parte')
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}