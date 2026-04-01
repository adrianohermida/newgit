import { base44 } from '@/api/base44Client';

export async function criarPartesSemDuplicar(partes, processoId, escritorioId, clienteId) {
  const partesIds = [];
  for (const parte of partes) {
    const filtro = {
      processo_id: processoId,
      nome: parte.nome
    };

    if (parte.cpf_cnpj) {
      filtro.cpf_cnpj = parte.cpf_cnpj;
    }

    const existentes = await base44.entities.ProcessoParte.filter(filtro);

    if (existentes.length === 0) {
      const novaParte = await base44.entities.ProcessoParte.create({
        ...parte,
        escritorio_id: escritorioId,
        processo_id: processoId,
        cliente_id: parte.e_cliente_escritorio ? clienteId : null
      });
      partesIds.push(novaParte.id);
    } else {
      partesIds.push(existentes[0].id);
    }
  }
  
  return partesIds;
}