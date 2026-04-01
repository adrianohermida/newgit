import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Play, Save, Zap } from 'lucide-react';
import { toast } from 'sonner';

/**
 * TPUAutomationBuilder - Cria workflows customizados baseados em padrões TPU
 * Permite regras para trigger notificações/atualizações com base em Classes/Assuntos/Movimentos
 */
export default function TPUAutomationBuilder() {
  const [workflows, setWorkflows] = useState([
    {
      id: 1,
      nome: 'Notificar em Assuntos Tributários',
      ativo: true,
      regras: [
        { tipo: 'assunto_ramo', operador: 'equals', valor: 'Direito Tributário' },
      ],
      acao: 'notificar_admin',
      acaoConfig: { canal: 'email' },
      created: new Date()
    }
  ]);

  const [editando, setEditando] = useState(false);
  const [novoWorkflow, setNovoWorkflow] = useState({
    nome: '',
    regras: [],
    acao: 'notificar_admin',
    acaoConfig: {}
  });

  const TIPOS_REGRA = [
    { id: 'classe_sigla', label: 'Classe (Sigla)' },
    { id: 'classe_natureza', label: 'Classe (Natureza)' },
    { id: 'assunto_ramo', label: 'Assunto (Ramo)' },
    { id: 'assunto_sigiloso', label: 'Assunto com Sigilo' },
    { id: 'movimento_categoria', label: 'Movimento (Categoria)' },
    { id: 'movimento_subcategoria', label: 'Movimento (Subcategoria)' },
    { id: 'eletronico', label: 'Suporte Eletrônico' },
    { id: 'visivelidade', label: 'Visibilidade Externa' }
  ];

  const ACOES = [
    { id: 'notificar_admin', label: '📧 Notificar Admin' },
    { id: 'criar_tarefa', label: '✓ Criar Tarefa' },
    { id: 'webhook', label: '🔗 Chamar Webhook' },
    { id: 'atualizar_campo', label: '🔄 Atualizar Campo' },
    { id: 'tag_processo', label: '🏷️ Adicionar Tag' },
  ];

  const handleAdicionarRegra = () => {
    setNovoWorkflow(prev => ({
      ...prev,
      regras: [...prev.regras, { tipo: '', operador: 'equals', valor: '' }]
    }));
  };

  const handleRemoverRegra = (idx) => {
    setNovoWorkflow(prev => ({
      ...prev,
      regras: prev.regras.filter((_, i) => i !== idx)
    }));
  };

  const handleSalvarWorkflow = () => {
    if (!novoWorkflow.nome.trim()) {
      toast.error('Nome do workflow é obrigatório');
      return;
    }

    if (novoWorkflow.regras.length === 0) {
      toast.error('Adicione pelo menos uma regra');
      return;
    }

    const workflow = {
      id: Date.now(),
      ...novoWorkflow,
      ativo: true,
      created: new Date()
    };

    setWorkflows(prev => [workflow, ...prev]);
    setNovoWorkflow({ nome: '', regras: [], acao: 'notificar_admin', acaoConfig: {} });
    setEditando(false);
    toast.success('Workflow criado com sucesso!');
  };

  const handleDeletarWorkflow = (id) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
    toast.success('Workflow deletado');
  };

  const handleToggleWorkflow = (id) => {
    setWorkflows(prev => prev.map(w => 
      w.id === id ? { ...w, ativo: !w.ativo } : w
    ));
  };

  const handleExecutarWorkflow = (id) => {
    const workflow = workflows.find(w => w.id === id);
    toast.success(`Workflow "${workflow.nome}" executado (preview)`);
  };

  return (
    <div className="space-y-6">
      {/* Header com Botão Nova Automação */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Automações TPU</h2>
          <p className="text-sm text-slate-500 mt-1">Crie workflows baseados em padrões de Classes, Assuntos e Movimentos</p>
        </div>
        {!editando && (
          <Button onClick={() => setEditando(true)} className="bg-[#212373] hover:bg-[#1a1b5e] gap-2">
            <Plus className="w-4 h-4" />
            Nova Automação
          </Button>
        )}
      </div>

      {/* Formulário Nova Automação */}
      {editando && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              Nova Automação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nome */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Nome da Automação</label>
              <Input
                placeholder="ex: Notificar em assuntos tributários"
                value={novoWorkflow.nome}
                onChange={(e) => setNovoWorkflow(prev => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            {/* Regras */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Regras de Acionamento</label>
              <div className="space-y-3">
                {novoWorkflow.regras.map((regra, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <Select 
                      value={regra.tipo}
                      onValueChange={(tipo) => {
                        const novas = [...novoWorkflow.regras];
                        novas[idx].tipo = tipo;
                        setNovoWorkflow(prev => ({ ...prev, regras: novas }));
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_REGRA.map(tipo => (
                          <SelectItem key={tipo.id} value={tipo.id}>{tipo.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select 
                      value={regra.operador}
                      onValueChange={(op) => {
                        const novas = [...novoWorkflow.regras];
                        novas[idx].operador = op;
                        setNovoWorkflow(prev => ({ ...prev, regras: novas }));
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">Igual</SelectItem>
                        <SelectItem value="contains">Contém</SelectItem>
                        <SelectItem value="is">É</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      placeholder="Valor"
                      value={regra.valor}
                      onChange={(e) => {
                        const novas = [...novoWorkflow.regras];
                        novas[idx].valor = e.target.value;
                        setNovoWorkflow(prev => ({ ...prev, regras: novas }));
                      }}
                      className="flex-1"
                    />

                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleRemoverRegra(idx)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}

                <Button 
                  variant="outline" 
                  onClick={handleAdicionarRegra}
                  className="w-full"
                >
                  + Adicionar Regra
                </Button>
              </div>
            </div>

            {/* Ação */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Ação ao Acionamento</label>
              <Select 
                value={novoWorkflow.acao}
                onValueChange={(acao) => setNovoWorkflow(prev => ({ ...prev, acao }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACOES.map(acao => (
                    <SelectItem key={acao.id} value={acao.id}>{acao.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Botões */}
            <div className="flex gap-2 pt-4">
              <Button 
                onClick={handleSalvarWorkflow}
                className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Automação
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setEditando(false);
                  setNovoWorkflow({ nome: '', regras: [], acao: 'notificar_admin', acaoConfig: {} });
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Workflows */}
      <div className="grid grid-cols-1 gap-4">
        {workflows.map(workflow => (
          <Card key={workflow.id} className={workflow.ativo ? 'border-green-200' : 'border-gray-200 opacity-70'}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {workflow.ativo ? <div className="w-2 h-2 bg-green-500 rounded-full" /> : <div className="w-2 h-2 bg-gray-400 rounded-full" />}
                    {workflow.nome}
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-2">Criado em {workflow.created.toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleWorkflow(workflow.id)}
                  >
                    {workflow.ativo ? '✓ Ativo' : '○ Inativo'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExecutarWorkflow(workflow.id)}
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeletarWorkflow(workflow.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Regras */}
              <div>
                <span className="text-xs font-medium text-slate-600 block mb-2">Regras:</span>
                <div className="flex flex-wrap gap-2">
                  {workflow.regras.map((regra, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {TIPOS_REGRA.find(t => t.id === regra.tipo)?.label} {regra.operador} "{regra.valor}"
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Ação */}
              <div>
                <span className="text-xs font-medium text-slate-600 block mb-1">Ação:</span>
                <Badge className="bg-purple-100 text-purple-800 text-xs">
                  {ACOES.find(a => a.id === workflow.acao)?.label}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Card */}
      <Card className="bg-amber-50 border-amber-200">
        <CardHeader>
          <CardTitle className="text-base">💡 Como Usar</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-slate-700">
          <p>
            <strong>Regras:</strong> Defina condições baseadas em Classes (sigla, natureza), Assuntos (ramo, sigilo) ou Movimentos (categoria, subcategoria).
          </p>
          <p>
            <strong>Ações:</strong> Escolha o que fazer quando a regra é acionada: notificar, criar tarefa, chamar webhook, atualizar campo ou adicionar tag.
          </p>
          <p>
            <strong>Exemplo:</strong> "Se assunto é Tributário → Notificar Admin por Email"
          </p>
        </CardContent>
      </Card>
    </div>
  );
}