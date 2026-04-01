import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Plus, Shield, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';

export default function PartesReuCard({ processo, onAddParte, onVerMais }) {
  const [reuData, setReuData] = useState(null);
  const [advogadosReu, setAdvogadosReu] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Filtrar réus
  const reus = processo.advogados?.filter(adv => adv.polo === 'reu' || adv.polo === 'ambos') || [];

  // Contar total de partes no polo passivo
  const totalPartesPassivo = (processo.partes_ids || []).filter(id => id === processo.polo_passivo_id).length;

  useEffect(() => {
    if (processo.polo_passivo_id) {
      carregarReuEAdvogados();
    }
  }, [processo.polo_passivo_id]);

  const carregarReuEAdvogados = async () => {
    setCarregando(true);
    try {
      const contatos = await base44.entities.Contact.filter({ id: processo.polo_passivo_id });
      if (contatos.length > 0) {
        const reu = contatos[0];
        setReuData(reu);

        // Buscar advogados da parte adversa cadastrados no contato
        const advogados = [];
        if (reu.advogado_adverso_nome || reu.advogado_adverso_email) {
          advogados.push({
            nome: reu.advogado_adverso_nome || reu.advogado_adverso_email,
            email: reu.advogado_adverso_email,
            oab: reu.advogado_adverso_oab,
            tipo: 'adverso'
          });
        }

        setAdvogadosReu(advogados);
      }
    } catch (error) {
      console.error('Erro ao carregar réu e advogados:', error);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Card className="bg-[#111916] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-white flex items-center gap-2">
          <Shield size={20} className="text-red-400" />
          Polo Passivo
        </CardTitle>
        <div className="flex gap-2">
          {onVerMais && (
            <Button 
              onClick={() => onVerMais('passivo')}
              size="sm" 
              variant="ghost"
              className="h-7 gap-1 text-blue-400 hover:bg-blue-500/10 text-xs"
            >
              Ver todas
            </Button>
          )}
          <Button 
            onClick={() => onAddParte?.('reu')}
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
        {reus.length === 0 && !processo.polo_passivo_nome && (
          <p className="text-sm text-white/40">Nenhuma parte do polo passivo cadastrada</p>
        )}

        {processo.polo_passivo_nome && (
          <div className="space-y-2">
            {/* Parte Adversa Principal */}
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => processo.polo_passivo_id && window.dispatchEvent(new CustomEvent('open-contact-detail', { detail: processo.polo_passivo_id }))}
                  className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 hover:bg-red-600 transition-colors cursor-pointer"
                  title="Ver detalhes do contato"
                >
                  {processo.polo_passivo_nome?.[0]?.toUpperCase()}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-white font-semibold">{processo.polo_passivo_nome}</p>
                    <Badge className="bg-red-500/20 text-red-300 text-[10px] px-2 py-0">
                      RÉU
                    </Badge>
                  </div>
                  {reuData?.email && (
                    <p className="text-xs text-white/60 mt-0.5">{reuData.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Advogados do Réu */}
            {advogadosReu.length > 0 && (
              <div className="pl-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <ArrowDown size={12} />
                  <span>Representado por:</span>
                </div>
                {advogadosReu.map((adv, idx) => (
                  <div key={idx} className="p-2 bg-orange-500/10 border border-orange-500/30 rounded ml-4">
                    <div className="flex items-start gap-2">
                      <User size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white font-medium">{adv.nome}</p>
                          <Badge className="bg-orange-500/20 text-orange-300 text-[9px] px-1.5 py-0">
                            PARTE ADVERSA
                          </Badge>
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

        {reus.map((adv, index) => (
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
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}