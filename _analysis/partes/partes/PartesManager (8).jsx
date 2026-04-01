import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Users, Plus, X, Star, Briefcase, UserCheck } from 'lucide-react';

export default function PartesManager({ workspaceId, partes, onChange, cnj }) {
  const [poloAtivo, setPoloAtivo] = useState(partes?.filter(p => p.tipo_parte === 'autor') || []);
  const [poloPassivo, setPoloPassivo] = useState(partes?.filter(p => p.tipo_parte === 'reu') || []);
  const [showAddModal, setShowAddModal] = useState(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ['workspace-contacts', workspaceId],
    queryFn: () => base44.entities.Contact.filter({ workspace_id: workspaceId }),
    enabled: !!workspaceId
  });

  const addParte = (tipo, parteData) => {
    const novaParte = {
      ...parteData,
      tipo_parte: tipo === 'autor' ? 'autor' : 'reu',
      polo: tipo === 'autor' ? 'ativo' : 'passivo',
      cnj,
      workspace_id: workspaceId
    };

    if (tipo === 'autor') {
      const updated = [...poloAtivo, novaParte];
      setPoloAtivo(updated);
      onChange([...updated, ...poloPassivo]);
    } else {
      const updated = [...poloPassivo, novaParte];
      setPoloPassivo(updated);
      onChange([...poloAtivo, ...updated]);
    }
    setShowAddModal(null);
  };

  const removeParte = (tipo, index) => {
    if (tipo === 'autor') {
      const updated = poloAtivo.filter((_, i) => i !== index);
      setPoloAtivo(updated);
      onChange([...updated, ...poloPassivo]);
    } else {
      const updated = poloPassivo.filter((_, i) => i !== index);
      setPoloPassivo(updated);
      onChange([...poloAtivo, ...updated]);
    }
  };

  const toggleCliente = (tipo, index) => {
    if (tipo === 'autor') {
      const updated = poloAtivo.map((p, i) => 
        i === index ? { ...p, nosso_cliente: !p.nosso_cliente } : p
      );
      setPoloAtivo(updated);
      onChange([...updated, ...poloPassivo]);
    } else {
      const updated = poloPassivo.map((p, i) => 
        i === index ? { ...p, nosso_cliente: !p.nosso_cliente } : p
      );
      setPoloPassivo(updated);
      onChange([...poloAtivo, ...updated]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Polo Ativo */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              Polo Ativo (Autores)
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddModal('autor')}
              className="gap-1"
            >
              <Plus className="w-3 h-3" />
              Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {poloAtivo.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              Nenhuma parte no polo ativo
            </p>
          ) : (
            poloAtivo.map((parte, idx) => (
              <div key={idx} className="p-2 bg-green-50 rounded-lg border border-green-200 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{parte.nome_parte}</p>
                    {parte.nosso_cliente && (
                      <Badge className="bg-[#00a2ff] text-white text-xs">
                        <Star className="w-3 h-3 mr-1" />
                        Cliente
                      </Badge>
                    )}
                  </div>
                  {parte.cpf_cnpj && (
                    <p className="text-xs text-slate-600">Doc: {parte.cpf_cnpj}</p>
                  )}
                  {parte.advogados && parte.advogados.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {parte.advogados.map((adv, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <Briefcase className="w-3 h-3 mr-1" />
                          {adv.nome}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleCliente('autor', idx)}
                    title="Marcar como cliente"
                  >
                    <Star className={`w-4 h-4 ${parte.nosso_cliente ? 'text-[#00a2ff] fill-current' : 'text-slate-400'}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeParte('autor', idx)}
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Polo Passivo */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-red-600" />
              Polo Passivo (Réus)
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddModal('reu')}
              className="gap-1"
            >
              <Plus className="w-3 h-3" />
              Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {poloPassivo.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              Nenhuma parte no polo passivo
            </p>
          ) : (
            poloPassivo.map((parte, idx) => (
              <div key={idx} className="p-2 bg-red-50 rounded-lg border border-red-200 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{parte.nome_parte}</p>
                    {parte.nosso_cliente && (
                      <Badge className="bg-[#00a2ff] text-white text-xs">
                        <Star className="w-3 h-3 mr-1" />
                        Cliente
                      </Badge>
                    )}
                  </div>
                  {parte.cpf_cnpj && (
                    <p className="text-xs text-slate-600">Doc: {parte.cpf_cnpj}</p>
                  )}
                  {parte.advogados && parte.advogados.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {parte.advogados.map((adv, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <Briefcase className="w-3 h-3 mr-1" />
                          {adv.nome}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleCliente('reu', idx)}
                    title="Marcar como cliente"
                  >
                    <Star className={`w-4 h-4 ${parte.nosso_cliente ? 'text-[#00a2ff] fill-current' : 'text-slate-400'}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeParte('reu', idx)}
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add Parte Modal */}
      {showAddModal && (
        <AddParteModal
          tipo={showAddModal}
          contacts={contacts}
          workspaceId={workspaceId}
          onAdd={(parte) => addParte(showAddModal, parte)}
          onCancel={() => setShowAddModal(null)}
        />
      )}
    </div>
  );
}

function AddParteModal({ tipo, contacts, workspaceId, onAdd, onCancel }) {
  const [mode, setMode] = useState('nova'); // nova ou existente
  const [selectedContact, setSelectedContact] = useState(null);
  const [novoNome, setNovoNome] = useState('');
  const [novoDocumento, setNovoDocumento] = useState('');
  const [advogados, setAdvogados] = useState([]);

  const handleAdd = () => {
    if (mode === 'existente' && selectedContact) {
      onAdd({
        nome_parte: selectedContact.full_name,
        cpf_cnpj: selectedContact.document,
        contato_id: selectedContact.id,
        advogados,
        nosso_cliente: false
      });
    } else if (mode === 'nova' && novoNome) {
      onAdd({
        nome_parte: novoNome,
        cpf_cnpj: novoDocumento,
        advogados,
        nosso_cliente: false
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-base">
            Adicionar Parte - {tipo === 'autor' ? 'Polo Ativo' : 'Polo Passivo'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Selector */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'nova' ? 'default' : 'outline'}
              onClick={() => setMode('nova')}
              className={mode === 'nova' ? 'bg-[#00a2ff]' : ''}
            >
              Nova Parte
            </Button>
            <Button
              size="sm"
              variant={mode === 'existente' ? 'default' : 'outline'}
              onClick={() => setMode('existente')}
              className={mode === 'existente' ? 'bg-[#00a2ff]' : ''}
            >
              Contato Existente
            </Button>
          </div>

          {mode === 'nova' ? (
            <>
              <Input
                label="Nome Completo"
                placeholder="Nome da parte"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
              <Input
                label="CPF/CNPJ (opcional)"
                placeholder="000.000.000-00"
                value={novoDocumento}
                onChange={(e) => setNovoDocumento(e.target.value)}
              />
            </>
          ) : (
            <div>
              <label className="text-sm font-medium mb-2 block">Selecionar Contato</label>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {contacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-2 rounded-lg border text-left text-sm ${
                      selectedContact?.id === contact.id
                        ? 'border-[#00a2ff] bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {contact.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={(mode === 'nova' && !novoNome) || (mode === 'existente' && !selectedContact)}
              className="flex-1 bg-[#00a2ff] hover:bg-[#0088cc]"
            >
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}