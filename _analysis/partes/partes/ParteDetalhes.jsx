import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { ArrowLeft, Plus, UserPlus } from 'lucide-react';
import Breadcrumb from '@/components/seo/Breadcrumb';
import { Button } from '@/components/ui/button';
import LoadingState from '@/components/common/LoadingState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProcessoCreateModal from '@/components/processos/ProcessoCreateModal';
import BuscarNoTribunalButton from '@/components/processos/detail/BuscarNoTribunalButton';

export default function ParteDetalhes() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showProcessoModal, setShowProcessoModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  const { data: escritorio } = useQuery({
    queryKey: ['escritorio'],
    queryFn: async () => {
      const list = await base44.entities.Escritorio.list();
      return list[0];
    }
  });

  const { data: parte, isLoading } = useQuery({
    queryKey: ['parte', id],
    queryFn: () => base44.entities.ProcessoParte.filter({ id }),
    enabled: !!id,
    select: (data) => data[0]
  });

  const { data: processos = [] } = useQuery({
    queryKey: ['processos-parte', id],
    queryFn: async () => {
      // Buscar por CPF/CNPJ e nome
      const criterios = [];
      if (parte.cpf_cnpj) {
        criterios.push({ cpf_cnpj: parte.cpf_cnpj, escritorio_id: escritorio.id });
      }
      if (parte.nome) {
        criterios.push({ nome: parte.nome, escritorio_id: escritorio.id });
      }
      
      const todasPartes = [];
      for (const criterio of criterios) {
        const encontradas = await base44.entities.ProcessoParte.filter(criterio);
        encontradas.forEach(p => {
          if (!todasPartes.find(tp => tp.id === p.id)) {
            todasPartes.push(p);
          }
        });
      }
      
      const processoIds = [...new Set(todasPartes.map(p => p.processo_id))];
      if (processoIds.length === 0) return [];
      
      const procs = await Promise.all(
        processoIds.map(pid => base44.entities.Processo.filter({ id: pid }))
      );
      return procs.flat().filter(Boolean);
    },
    enabled: !!parte && !!escritorio
  });

  const converterClienteMutation = useMutation({
    mutationFn: async () => {
      const clienteData = {
        escritorio_id: escritorio?.id,
        nome_completo: parte.nome,
        cpf_cnpj: parte.cpf_cnpj,
        tipo_pessoa: parte.tipo_pessoa,
        email: parte.email,
        telefone: parte.telefone,
        origem: 'processo'
      };
      
      const cliente = await base44.entities.Cliente.create(clienteData);
      
      // Atualizar parte para marcar como cliente
      await base44.entities.ProcessoParte.update(id, {
        e_cliente_escritorio: true,
        cliente_id: cliente.id
      });
      
      return cliente;
    },
    onSuccess: (cliente) => {
      queryClient.invalidateQueries(['parte']);
      toast.success('Convertido para cliente');
      navigate(`${createPageUrl('ClienteDetalhes')}?id=${cliente.id}`);
    }
  });

  const createProcessoMutation = useMutation({
    mutationFn: (data) => base44.entities.Processo.create({
      ...data,
      escritorio_id: escritorio?.id
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['processos-parte']);
      setShowProcessoModal(false);
      toast.success('Processo criado com sucesso');
    }
  });

  if (isLoading) return <LoadingState message="Carregando dados..." />;
  if (!parte) return <div className="p-6 text-[var(--text-secondary)]">Parte não encontrada</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <Breadcrumb items={[
            { label: 'Pessoas', url: createPageUrl('Pessoas') },
            { label: parte?.nome || 'Detalhes' }
          ]} />
        </div>
      </div>

      <div className="bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate(createPageUrl('Pessoas'))}
            className="mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{parte.nome}</CardTitle>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline">
                        {parte.tipo_parte === 'polo_ativo' ? 'Polo Ativo' : 
                         parte.tipo_parte === 'polo_passivo' ? 'Polo Passivo' : 'Terceiro'}
                      </Badge>
                      {parte.qualificacao && (
                        <Badge>{parte.qualificacao}</Badge>
                      )}
                      {parte.e_cliente_escritorio && (
                        <Badge className="bg-green-600">Cliente do Escritório</Badge>
                      )}
                    </div>
                  </div>
                  {!parte.e_cliente_escritorio && (
                    <Button
                      onClick={() => converterClienteMutation.mutate()}
                      disabled={converterClienteMutation.isPending}
                      className="bg-[var(--brand-primary)]"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Converter em Cliente
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {parte.cpf_cnpj && (
                  <div>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      {parte.tipo_pessoa === 'fisica' ? 'CPF' : 'CNPJ'}:
                    </span>
                    <p className="text-base">{parte.cpf_cnpj}</p>
                  </div>
                )}
                {parte.email && (
                  <div>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">Email:</span>
                    <p className="text-base">{parte.email}</p>
                  </div>
                )}
                {parte.telefone && (
                  <div>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">Telefone:</span>
                    <p className="text-base">{parte.telefone}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Processos Relacionados ({processos.length})</CardTitle>
                  <div className="flex gap-2">
                    {parte.cpf_cnpj && (
                      <BuscarNoTribunalButton
                        nome={parte.nome}
                        cpf_cnpj={parte.cpf_cnpj}
                        escritorio_id={parte.escritorio_id}
                        quantidade_processos={1}
                        compact
                      />
                    )}
                    <Button 
                      size="sm"
                      onClick={() => setShowProcessoModal(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Novo Processo
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {processos.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Nenhum processo encontrado</p>
                ) : (
                  <div className="space-y-2">
                    {processos.map((proc) => (
                      <div
                        key={proc.id}
                        className="p-3 border rounded-lg hover:bg-[var(--bg-secondary)] cursor-pointer"
                        onClick={() => navigate(`${createPageUrl('ProcessoDetails')}?id=${proc.id}`)}
                      >
                        <div className="font-medium">{proc.numero_cnj}</div>
                        {proc.titulo && (
                          <div className="text-sm text-[var(--text-secondary)]">{proc.titulo}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-4 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Estatísticas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm text-[var(--text-secondary)]">Processos</span>
                    <p className="text-2xl font-bold">{processos.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ProcessoCreateModal
        open={showProcessoModal}
        onClose={() => setShowProcessoModal(false)}
        onSubmit={(data) => createProcessoMutation.mutate(data)}
      />
    </div>
  );
}