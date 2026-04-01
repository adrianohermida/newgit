import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, Scale, CheckCircle2, Gavel, User, Search } from 'lucide-react';
import ContactSearchInput from '@/components/common/ContactSearchInput';

const EMPTY_PARTE = {
  nome_parte: '',
  tipo_parte: 'autor',
  polo: 'ativo',
  qualificacao_parte: 'pessoa_fisica',
  cpf_cnpj: '',
  advogado_parte: '',
  oab_advogado: '',
  observacoes: '',
  nosso_cliente: false,
  somos_advogado: false,
  email: '',
  telefone: '',
  contato_id: ''
};

export default function ParteFormDialog({ processId, workspaceId, cnj, parte, onClose, onSaved }) {
  const [form, setForm] = useState(parte ? { ...parte } : { ...EMPTY_PARTE });
  const [contactLinked, setContactLinked] = useState(null);

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => base44.entities.WorkspaceMember.filter({ 
      workspace_id: workspaceId, 
      active: true 
    }),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const data = { ...form, workspace_id: workspaceId, processo_id: processId, cnj };
      
      if (contactLinked) {
        data.contato_id = contactLinked.id;
        data.nome_parte = data.nome_parte || contactLinked.full_name;
        data.cpf_cnpj = data.cpf_cnpj || contactLinked.document || '';
        data.email = data.email || contactLinked.email || '';
        data.telefone = data.telefone || contactLinked.phone || '';
        data.qualificacao_parte = contactLinked.contact_category === 'pj' ? 'pessoa_juridica' : 'pessoa_fisica';
      }

      // Se marcado como nosso cliente, atualizar ProcessoWorkspace
      if (data.nosso_cliente && data.contato_id && workspaceId && processId) {
        const links = await base44.entities.ProcessoWorkspace.filter({ 
          workspace_id: workspaceId, 
          processo_id: processId 
        });
        if (links[0]) {
          await base44.entities.ProcessoWorkspace.update(links[0].id, { 
            cliente_id: data.contato_id 
          });
        }

        // Se somos advogado, atualizar advogado_responsavel_email
        if (data.somos_advogado && form.advogado_responsavel_email && links[0]) {
          await base44.entities.ProcessoWorkspace.update(links[0].id, { 
            advogado_responsavel_email: form.advogado_responsavel_email 
          });
        }
      }

      return parte 
        ? base44.entities.ParteProcesso.update(parte.id, data) 
        : base44.entities.ParteProcesso.create(data);
    },
    onSuccess: () => {
      toast.success(parte ? 'Parte atualizada' : 'Parte adicionada');
      onSaved();
    },
    onError: (error) => {
      toast.error('Erro ao salvar parte: ' + error.message);
    }
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleContactSelect = (contact) => {
    setContactLinked(contact);
    setForm(f => ({
      ...f,
      nome_parte: contact.full_name,
      cpf_cnpj: contact.document || f.cpf_cnpj,
      email: contact.email || f.email,
      telefone: contact.phone || f.telefone,
      qualificacao_parte: contact.contact_category === 'pj' ? 'pessoa_juridica' : 'pessoa_fisica',
      contato_id: contact.id,
    }));
  };

  const isAdvogado = form.tipo_parte === 'advogado_parte';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="parte-form-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAdvogado ? (
              <Scale className="w-4 h-4 text-[#00a2ff]" />
            ) : (
              <Users className="w-4 h-4 text-[#00a2ff]" />
            )}
            {parte ? 'Editar Parte' : 'Adicionar Parte'}
          </DialogTitle>
          <p id="parte-form-description" className="sr-only">
            Formulário para adicionar ou editar informações de uma parte do processo
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo da parte */}
          <div>
            <Label className="mb-2">Tipo de Parte</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'autor', label: 'Autor', polo: 'ativo' },
                { value: 'reu', label: 'Réu', polo: 'passivo' },
                { value: 'litisconsorte', label: 'Litisconsorte' },
                { value: 'terceiro', label: 'Terceiro' },
                { value: 'advogado_parte', label: 'Advogado' },
                { value: 'outro', label: 'Outro' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    set('tipo_parte', opt.value);
                    if (opt.polo) set('polo', opt.polo);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    form.tipo_parte === opt.value
                      ? 'bg-[#00a2ff] text-white border-[#00a2ff]'
                      : 'border-slate-200 text-slate-600 hover:border-[#00a2ff]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Buscar contato */}
          <div>
            <Label className="mb-1 flex items-center gap-1">
              <Search className="w-3 h-3" />
              Buscar no Cadastro de Contatos
            </Label>
            <ContactSearchInput
              workspaceId={workspaceId}
              value={form.nome_parte}
              onChange={(v) => set('nome_parte', v)}
              onSelect={handleContactSelect}
              placeholder="Buscar por nome, email ou CPF/CNPJ..."
            />
            {contactLinked && (
              <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3 h-3" />
                Vinculado: {contactLinked.full_name}
              </p>
            )}
          </div>

          {/* Nome manual */}
          <div>
            <Label>Nome *</Label>
            <Input
              value={form.nome_parte}
              onChange={e => set('nome_parte', e.target.value)}
              placeholder="Nome completo ou razão social"
              className="h-9"
              required
            />
          </div>

          {/* Polo + Qualificação */}
          {!isAdvogado && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Polo</Label>
                <Select value={form.polo} onValueChange={v => set('polo', v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="passivo">Passivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qualificação</Label>
                <Select value={form.qualificacao_parte} onValueChange={v => set('qualificacao_parte', v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* CPF/CNPJ */}
          <div>
            <Label>CPF/CNPJ</Label>
            <Input
              value={form.cpf_cnpj}
              onChange={e => set('cpf_cnpj', e.target.value)}
              placeholder="Opcional"
              className="h-9"
            />
          </div>

          {/* Advogado da parte */}
          {!isAdvogado && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1">
                  <Scale className="w-3 h-3" />
                  Advogado da Parte
                </Label>
                <Input
                  value={form.advogado_parte}
                  onChange={e => set('advogado_parte', e.target.value)}
                  placeholder="Nome do advogado"
                  className="h-9"
                />
              </div>
              <div>
                <Label>OAB</Label>
                <Input
                  value={form.oab_advogado}
                  onChange={e => set('oab_advogado', e.target.value)}
                  placeholder="Ex: SP 123456"
                  className="h-9"
                />
              </div>
            </div>
          )}

          {/* Para advogados - OAB */}
          {isAdvogado && (
            <div>
              <Label>OAB</Label>
              <Input
                value={form.oab_advogado}
                onChange={e => set('oab_advogado', e.target.value)}
                placeholder="Ex: SP 123456"
                className="h-9"
              />
            </div>
          )}

          {/* Marcar como nosso cliente */}
          {!isAdvogado && (
            <div
              className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                form.nosso_cliente
                  ? 'border-green-400 bg-green-50'
                  : 'border-slate-200 hover:border-green-300'
              }`}
              onClick={() => set('nosso_cliente', !form.nosso_cliente)}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={`w-4 h-4 ${
                    form.nosso_cliente ? 'text-green-600' : 'text-slate-300'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Marcar como nosso cliente</p>
                  <p className="text-xs text-slate-500">Vincula este contato como cliente do processo</p>
                </div>
              </div>
            </div>
          )}

          {/* Somos advogado desta parte */}
          {!isAdvogado && (
            <>
              <div
                className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
                  form.somos_advogado
                    ? 'border-[#00a2ff] bg-blue-50'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
                onClick={() => set('somos_advogado', !form.somos_advogado)}
              >
                <div className="flex items-center gap-2">
                  <Gavel
                    className={`w-4 h-4 ${
                      form.somos_advogado ? 'text-[#00a2ff]' : 'text-slate-300'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Somos o advogado desta parte</p>
                    <p className="text-xs text-slate-500">Identifica quem é nosso cliente no processo</p>
                  </div>
                </div>
              </div>

              {/* Advogado responsável (se somos_advogado) */}
              {form.somos_advogado && (
                <div>
                  <Label className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    Advogado Responsável (nosso escritório)
                  </Label>
                  <Select
                    value={form.advogado_responsavel_email || ''}
                    onValueChange={v => set('advogado_responsavel_email', v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecionar membro..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>— Nenhum —</SelectItem>
                      {members.map(m => (
                        <SelectItem key={m.id} value={m.user_email}>
                          {m.user_email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* Observações */}
          <div>
            <Label>Observações</Label>
            <textarea
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="Notas sobre esta parte..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a2ff] resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.nome_parte || mutation.isPending}
            className="flex-1 bg-[#00a2ff] hover:bg-[#0088cc]"
          >
            {mutation.isPending ? 'Salvando...' : parte ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}