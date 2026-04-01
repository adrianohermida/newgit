import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { User, Building2, ExternalLink, Users as UsersIcon, Search, Grid3x3, List, Trash2, UserPlus, GitMerge } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LoadingState from '@/components/common/LoadingState';
import MesclarPartesModal from '@/components/clientes/MesclarPartesModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function PartesTab({ escritorioId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tipoPessoa, setTipoPessoa] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('cards');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showMesclarModal, setShowMesclarModal] = useState(false);

  const { data: partes = [], isLoading } = useQuery({
    queryKey: ['partes-cadastradas', escritorioId],
    queryFn: () => base44.entities.ProcessoParte.filter({ escritorio_id: escritorioId }),
    enabled: !!escritorioId
  });

  // Agrupar partes únicas por nome e CPF/CNPJ - NORMALIZADO
  const partesUnicas = partes.reduce((acc, parte) => {
    const nomeNorm = parte.nome?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
    const docNorm = parte.cpf_cnpj?.replace(/\D/g, '') || '';
    const key = `${nomeNorm}-${docNorm || 'sem-doc'}`;
    
    if (!acc[key]) {
      acc[key] = {
        ...parte,
        processos: [parte.processo_id],
        registros_ids: [parte.id],
        count: 1
      };
    } else {
      acc[key].processos.push(parte.processo_id);
      acc[key].registros_ids.push(parte.id);
      acc[key].count++;
      
      // Manter dados mais completos
      if (parte.cpf_cnpj && !acc[key].cpf_cnpj) acc[key].cpf_cnpj = parte.cpf_cnpj;
      if (parte.cliente_id && !acc[key].cliente_id) acc[key].cliente_id = parte.cliente_id;
      if (parte.e_cliente_escritorio) acc[key].e_cliente_escritorio = true;
      if (parte.advogados?.length > 0 && (!acc[key].advogados || acc[key].advogados.length === 0)) {
        acc[key].advogados = parte.advogados;
      }
    }
    return acc;
  }, {});

  const partesArray = Object.values(partesUnicas).filter(p => {
    const matchTipo = tipoPessoa === 'todos' || p.tipo_pessoa === tipoPessoa;
    if (!searchTerm) return matchTipo;
    
    const termo = searchTerm.toLowerCase().trim().replace(/\s+/g, ' ');
    const nomeNorm = p.nome?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
    const docNorm = p.cpf_cnpj?.replace(/\D/g, '') || '';
    const termoNorm = searchTerm.replace(/\D/g, '');
    
    const matchNome = nomeNorm.includes(termo);
    const matchDoc = termoNorm && docNorm.includes(termoNorm);
    const matchQualificacao = p.qualificacao?.toLowerCase().includes(termo);
    
    return matchTipo && (matchNome || matchDoc || matchQualificacao);
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === partesArray.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(partesArray.map((_, idx) => idx));
    }
  };

  const toggleSelect = (idx) => {
    setSelectedIds(s => s.includes(idx) ? s.filter(x => x !== idx) : [...s, idx]);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Tem certeza que deseja remover ${selectedIds.length} parte(s)?`)) return;

    try {
      for (const idx of selectedIds) {
        const parte = partesArray[idx];
        const ids = parte.registros_ids || [parte.id];
        for (const id of ids) {
          await base44.entities.ProcessoParte.delete(id);
        }
      }
      
      toast.success(`${selectedIds.length} parte(s) removida(s)`);
      queryClient.invalidateQueries(['partes-cadastradas']);
      setSelectedIds([]);
    } catch (error) {
      toast.error('Erro ao remover: ' + error.message);
    }
  };

  const handleBulkConvert = async () => {
    const partesSelecionadas = selectedIds.map(idx => {
      const parte = partesArray[idx];
      return parte.registros_ids?.[0] || parte.id;
    });

    try {
      const { data } = await base44.functions.invoke('marcarPartesComoClientes', {
        parte_ids: partesSelecionadas,
        criar_cliente: true
      });

      toast.success(`${data.clientes_criados} cliente(s) criado(s), ${data.total} parte(s) sincronizada(s)`);
      queryClient.invalidateQueries(['partes-cadastradas']);
      queryClient.invalidateQueries(['all-clientes']);
      setSelectedIds([]);
    } catch (error) {
      toast.error('Erro ao converter: ' + error.message);
    }
  };

  const handleMesclar = () => {
    const partesSelecionadas = selectedIds.map(idx => partesArray[idx]);
    if (partesSelecionadas.length < 2) {
      toast.error('Selecione ao menos 2 partes para mesclar');
      return;
    }
    
    // Expandir todas as IDs dos registros duplicados
    const todasPartes = partesSelecionadas.flatMap(parte => {
      if (parte.registros_ids && parte.registros_ids.length > 0) {
        return parte.registros_ids.map(id => ({
          ...parte,
          id,
          _grupo: parte.nome + parte.cpf_cnpj
        }));
      }
      return [parte];
    });
    
    setShowMesclarModal(todasPartes);
  };

  if (isLoading) return <LoadingState message="Carregando partes..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou qualificação..."
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode('cards')}
            className={viewMode === 'cards' ? 'bg-[var(--bg-secondary)]' : ''}
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode('list')}
            className={viewMode === 'list' ? 'bg-[var(--bg-secondary)]' : ''}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button 
          variant={tipoPessoa === 'todos' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setTipoPessoa('todos')}
        >
          Todos ({Object.keys(partesUnicas).length})
        </Button>
        <Button 
          variant={tipoPessoa === 'fisica' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setTipoPessoa('fisica')}
        >
          <User className="w-4 h-4 mr-2" />
          Pessoa Física
        </Button>
        <Button 
          variant={tipoPessoa === 'juridica' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setTipoPessoa('juridica')}
        >
          <Building2 className="w-4 h-4 mr-2" />
          Pessoa Jurídica
        </Button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[var(--brand-primary-50)] border border-[var(--brand-primary-200)] rounded-lg flex-wrap">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {selectedIds.length} selecionado(s)
          </span>
          {selectedIds.length >= 2 && (
            <Button size="sm" variant="outline" onClick={handleMesclar}>
              <GitMerge className="w-4 h-4 mr-2" />
              Mesclar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleBulkConvert}>
            <UserPlus className="w-4 h-4 mr-2" />
            Converter para Cliente
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Remover
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Cancelar
          </Button>
        </div>
      )}

      {partesArray.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <UsersIcon className="w-12 h-12 mx-auto mb-4 text-[var(--text-tertiary)]" />
          <p className="text-lg font-medium mb-2">Nenhuma parte cadastrada</p>
          <p className="text-sm">Partes serão exibidas aqui quando adicionadas aos processos</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-3">
          {partesArray.map((parte, idx) => (
            <Card key={idx}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.includes(idx)}
                      onCheckedChange={() => toggleSelect(idx)}
                    />
                    <div className="w-10 h-10 rounded-full bg-[var(--brand-primary-100)] flex items-center justify-center shrink-0">
                      {parte.tipo_pessoa === 'fisica' ? 
                        <User className="w-5 h-5 text-[var(--brand-primary-700)]" /> : 
                        <Building2 className="w-5 h-5 text-[var(--brand-primary-700)]" />
                      }
                    </div>
                  </div>
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`${createPageUrl('ParteDetalhes')}?id=${parte.id}`)}
                  >
                    <h4 className="font-semibold text-[var(--text-primary)] truncate hover:text-[var(--brand-primary)]">{parte.nome}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline">
                        {parte.tipo_pessoa === 'fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                      </Badge>
                      {parte.cpf_cnpj && (
                        <span className="text-sm text-[var(--text-secondary)]">{parte.cpf_cnpj}</span>
                      )}
                      {parte.qualificacao && (
                        <Badge className="bg-[var(--brand-primary)] text-white">
                          {parte.qualificacao}
                        </Badge>
                      )}
                      {parte.count > 1 && (
                        <Badge variant="secondary">
                          {parte.count} processo(s)
                        </Badge>
                      )}
                      {parte.e_cliente_escritorio && (
                        <Badge className="bg-green-100 text-green-800">Cliente</Badge>
                      )}
                    </div>
                  </div>
                  {parte.cliente_id && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => navigate(`${createPageUrl('ClienteDetalhes')}?id=${parte.cliente_id}`)}
                      title="Ver cliente"
                    >
                      <ExternalLink className="w-4 h-4 text-[var(--brand-primary)]" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
          <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedIds.length === partesArray.length && partesArray.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Nome
              </span>
            </div>
          </div>
          <div className="divide-y divide-[var(--border-primary)]">
            {partesArray.map((parte, idx) => (
              <div key={idx} className="p-3 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
                onClick={() => navigate(`${createPageUrl('ParteDetalhes')}?id=${parte.id}`)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedIds.includes(idx)}
                    onCheckedChange={() => toggleSelect(idx)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="w-8 h-8 rounded-full bg-[var(--brand-primary-100)] flex items-center justify-center shrink-0">
                    {parte.tipo_pessoa === 'fisica' ? 
                      <User className="w-4 h-4 text-[var(--brand-primary-700)]" /> : 
                      <Building2 className="w-4 h-4 text-[var(--brand-primary-700)]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[var(--text-primary)]">{parte.nome}</span>
                      {parte.cpf_cnpj && (
                        <span className="text-sm text-[var(--text-secondary)]">{parte.cpf_cnpj}</span>
                      )}
                      {parte.qualificacao && (
                        <Badge className="bg-[var(--brand-primary)] text-white text-xs">
                          {parte.qualificacao}
                        </Badge>
                      )}
                      {parte.count > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          {parte.count} processo(s)
                        </Badge>
                      )}
                      {parte.e_cliente_escritorio && (
                        <Badge className="bg-green-100 text-green-800 text-xs">Cliente</Badge>
                      )}
                    </div>
                  </div>
                  {parte.cliente_id && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => navigate(`${createPageUrl('ClienteDetalhes')}?id=${parte.cliente_id}`)}
                      title="Ver cliente"
                    >
                      <ExternalLink className="w-4 h-4 text-[var(--brand-primary)]" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMesclarModal && Array.isArray(showMesclarModal) && showMesclarModal.length > 0 && (
        <MesclarPartesModal
          open={true}
          onClose={() => {
            setShowMesclarModal(false);
            setSelectedIds([]);
          }}
          partes={showMesclarModal}
        />
      )}
    </div>
  );
}