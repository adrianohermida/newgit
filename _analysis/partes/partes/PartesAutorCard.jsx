import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Plus, UserCheck, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';

export default function PartesAutorCard({ processo, onAddParte, onVerMais }) {
  const [clienteData, setClienteData] = useState(null);
  const [advogadosCliente, setAdvogadosCliente] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Filtrar autores
  const autores = processo.advogados?.filter(adv => adv.polo === 'autor' || adv.polo === 'ambos') || [];
  const clientePrincipal = processo.cliente_email;

  // Contar total de partes no polo ativo
  const totalPartesAtivo = (processo.partes_ids || []).filter(id => id === processo.polo_ativo_id).length;

  useEffect(() => {
    if (processo.polo_ativo_id) {
      carregarClienteEAdvogados();
    }
  }, [processo.polo_ativo_id]);

  const carregarClienteEAdvogados = async () => {
    setCarregando(true);
    try {
      const contatos = await base44.entities.Contact.filter({ id: processo.polo_ativo_id });
      if (contatos.length > 0) {
        const cliente = contatos[0];
        setClienteData(cliente);

        // Buscar advogados do cliente
        const advogados = [];
        if (processo.responsaveis && processo.responsaveis.length > 0) {
          const users = await base44.entities.User.list();
          const responsavel = users.find(u => u.email === processo.responsaveis[0]);
          if (responsavel) {
            advogados.push({
              nome: responsavel.full_name || responsavel.email,
              email: responsavel.email,
              tipo: 'responsavel'
            });
          }
        }

        // Buscar advogados cadastrados no contato (se houver campo)
        if (cliente.advogado_email || cliente.advogado_nome) {
          advogados.push({
            nome: cliente.advogado_nome || cliente.advogado_email,
            email: cliente.advogado_email,
            oab: cliente.advogado_oab,
            tipo: 'cliente'
          });
        }

        setAdvogadosCliente(advogados);
      }
    } catch (error) {
      console.error('Erro ao carregar cliente e advogados:', error);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Card className="bg-[#111916] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <User size={20} className="text-[#10b981]" />
          Polo Ativo
        </CardTitle>
        <div className="flex gap-2">
          {onVerMais && (
            <Button 
              onClick={() => onVerMais('ativo')}
              size="sm" 
              variant="ghost"
              className="h-7 gap-1 text-blue-400 hover:bg-blue-500/10 text-xs"
            >
              Ver todas
            </Button>
          )}
          <Button 
            onClick={() => onAddParte?.('autor')}
            size="sm" 
            variant="ghost"
            className="h-7 gap-1 text-[#10b981] hover:bg-[#10b981]/10"
          >
            <Plus size={14} />
            Nova Parte
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {autores.length === 0 && !processo.polo_ativo_nome && (
          <p className="text-sm text-white/40">Nenhuma parte do polo ativo cadastrada</p>
        )}

        {processo.polo_ativo_nome && (
          <div className="space-y-2">
            {/* Cliente Principal */}
            <div className="p-3 bg-[#10b981]/10 border border-[#10b981]/30 rounded">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => processo.polo_ativo_id && window.dispatchEvent(new CustomEvent('open-contact-detail', { detail: processo.polo_ativo_id }))}
                  className="w-8 h-8 rounded-full bg-[#10b981] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 hover:bg-[#0d9c6e] transition-colors cursor-pointer"
                  title="Ver detalhes do contato"
                >
                  {processo.polo_ativo_nome?.[0]?.toUpperCase()}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-white font-semibold">{processo.polo_ativo_nome}</p>
                    <Badge className="bg-[#10b981]/20 text-[#10b981] text-[10px] px-2 py-0">
                      CLIENTE
                    </Badge>
                  </div>
                  {clienteData?.email && (
                    <p className="text-xs text-white/60 mt-0.5">{clienteData.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Advogados do Cliente */}
            {advogadosCliente.length > 0 && (
              <div className="pl-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <ArrowDown size={12} />
                  <span>Representado por:</span>
                </div>
                {advogadosCliente.map((adv, idx) => (
                  <div key={idx} className="p-2 bg-blue-500/10 border border-blue-500/30 rounded ml-4">
                    <div className="flex items-start gap-2">
                      <User size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white font-medium">{adv.nome}</p>
                          {adv.tipo === 'responsavel' && (
                            <Badge className="bg-blue-500/20 text-blue-300 text-[9px] px-1.5 py-0">
                              RESPONSÁVEL
                            </Badge>
                          )}
                        </div>
                        {adv.oab && (
                          <p className="text-xs text-white/60">OAB: {adv.oab}</p>
                        )}
                        {adv.email && (
                          <p className="text-xs text-white/60">{adv.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {autores.map((adv, index) => (
          <div key={index} className="p-2 bg-white/5 rounded border border-white/10">
            <div className="flex items-start gap-2">
              <User size={14} className="text-white/60 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{adv.nome}</p>
                {adv.oab && (
                  <p className="text-xs text-white/60 mt-0.5">OAB: {adv.oab}</p>
                )}
                {adv.email && (
                  <p className="text-xs text-white/60">{adv.email}</p>
                )}
                {adv.polo === 'ambos' && (
                  <Badge className="bg-blue-500/20 text-blue-400 text-[10px] mt-1">
                    Ambos os polos
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}