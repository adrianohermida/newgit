import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PartesOmniLayout from './PartesOmniLayout';
import LoadingState from '@/components/common/LoadingState';

export default function PartesTab({ escritorioId }) {
  const [filtros, setFiltros] = useState({ tipo: 'todos', tipoPessoa: 'todos', vinculado: 'todos' });
  const [parteSelecionada, setParteSelecionada] = useState(null);

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
    if (filtros.tipoPessoa !== 'todos' && p.tipo_pessoa !== filtros.tipoPessoa) return false;
    if (filtros.vinculado === 'sim' && !p.cliente_vinculado_id) return false;
    if (filtros.vinculado === 'nao' && p.cliente_vinculado_id) return false;
    return true;
  });

  if (isLoading) return <LoadingState message="Carregando partes..." />;

  return (
    <div className="h-[calc(100vh-300px)]">
      <PartesOmniLayout
        partes={partesArray}
        filtros={filtros}
        onFiltrosChange={setFiltros}
        parteSelecionada={parteSelecionada}
        onSelectParte={setParteSelecionada}
      />
    </div>
  );
}