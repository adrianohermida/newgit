import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, CreditCard, Trash2, Search, Sliders, TrendingUp, Clock } from "lucide-react";
import usePlanoFilters from "../components/plano/hooks/usePlanoFilters";
import { usePlanoMutations } from "../components/plano/hooks/usePlanoMutations";
import { calculatePlanoKPIs, groupPlanosByCliente } from "../components/plano/services/planoKPIService";
import PlanoForm from "../components/plano/PlanoForm";
import ClienteSelector from "../components/shared/ClienteSelector";
import BulkActionsBar from "../components/shared/BulkActionsBar";
import PlanoListView from "../components/plano/PlanoListView";
import PlanoGridView from "../components/plano/PlanoGridView";
import PlanoMultiTenantView from "../components/plano/PlanoMultiTenantView";
import ModuleHeader from "@/components/modules/ModuleHeader";

export default function PlanoPagamento() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [selectedPlanos, setSelectedPlanos] = useState(new Set());
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('planoViewMode') || 'list';
    }
    return 'list';
  });

  const { data: authData } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const user = await base44.auth.me();
      return { user };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });

  const isClient = authData?.user?.role === "client";

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const result = await base44.entities.Cliente.list();
      return result;
    },
    enabled: !isClient,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });

  const { data: consultores = [] } = useQuery({
    queryKey: ["consultores"],
    queryFn: async () => {
      const result = await base44.entities.Consultor.list();
      return result;
    },
    enabled: authData?.user?.role === "admin",
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });

  useEffect(() => {
    if (authData?.user && clientes.length > 0 && !selectedCliente) {
      const meu = clientes.find(c => c.email === authData.user.email);
      if (meu) setSelectedCliente(meu);
    }
  }, [authData, clientes, selectedCliente]);

  const { data: allPlanos = [], isLoading } = useQuery({
    queryKey: ["planos"],
    queryFn: async () => base44.entities.PlanoPagamento.list(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });

  const {
    searchTerm,
    setSearchTerm,
    selectedClientesFilter,
    setSelectedClientesFilter,
    selectedConsultoresFilter,
    setSelectedConsultoresFilter,
    getFilteredPlanos
  } = usePlanoFilters(allPlanos);

  const planos = getFilteredPlanos(clientes, consultores, isClient, selectedCliente);

  useEffect(() => {
    const unsub = base44.entities.PlanoPagamento.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["planos"] });
    });
    return unsub;
  }, [queryClient]);

  const { taxaMedia, valorTotal, taxaSucesso, planosConcluidos } = calculatePlanoKPIs(allPlanos);
  const planosGrouped = groupPlanosByCliente(allPlanos);
  const filteredPlanos = planos.filter(p => 
    p.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.status?.includes(searchTerm.toLowerCase())
  );

  const { deleteMutation } = usePlanoMutations();

  const handleToggleSelect = useCallback((planoId) => {
    setSelectedPlanos(prev => {
      const next = new Set(prev);
      if (next.has(planoId)) next.delete(planoId);
      else next.add(planoId);
      return next;
    });
  }, []);

  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
    try { localStorage.setItem('planoViewMode', mode); } catch {}
  }, []);

  const handleDeletePlano = useCallback(async (planoId) => {
    if (confirm('Deletar este plano?')) {
      await deleteMutation.mutateAsync(planoId);
      setSelectedPlanos(prev => { const next = new Set(prev); next.delete(planoId); return next; });
    }
  }, [deleteMutation]);

  const handleBulkDelete = useCallback(async () => {
    if (confirm(`Deletar ${selectedPlanos.size} plano(s)?`)) {
      for (const id of selectedPlanos) {
        await deleteMutation.mutateAsync(id);
      }
      setSelectedPlanos(new Set());
    }
  }, [selectedPlanos, deleteMutation]);

  const clientesMap = clientes.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["planos"] });
  }, [queryClient]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
        {/* Header */}
        <ModuleHeader 
          title="Plano de Pagamento"
          subtitle="Gerencie planos de renegociação"
          stats={[
            { label: 'Total', value: allPlanos.length, icon: CreditCard },
            { label: 'Ativos', value: planos.filter(p => p.status === "ativo").length, icon: TrendingUp },
            { label: 'Concluídos', value: planosConcluidos, icon: Clock }
          ]}
          backTo="Dashboard"
        />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-4 mt-6 space-y-6 pb-8">
            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-white">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">Taxa Média</p>
                    <p className="text-2xl font-bold text-slate-900">{taxaMedia}%</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">Valor Total</p>
                    <p className="text-2xl font-bold text-slate-900">R$ {valorTotal}k</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">Taxa Sucesso</p>
                    <p className="text-2xl font-bold text-slate-900">{taxaSucesso}%</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search Bar */}
            {/* Search Bar */}
            <div className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por título ou status..."
                className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400"
              />
            </div>

            {/* Filtros Colapsados */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">Filtros Avançados</span>
                  {(selectedClientesFilter.length > 0 || selectedConsultoresFilter.length > 0) && (
                    <span className="ml-2 text-[#00d9a3] font-bold">
                      ({selectedClientesFilter.length + selectedConsultoresFilter.length})
                    </span>
                  )}
                </div>
                <span className={`text-xs text-slate-500 transition ${showFiltersPanel ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {showFiltersPanel && (
                <div className="border-t border-slate-200 p-4 space-y-4">
                  {/* Clientes */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Clientes</label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {clientes.map(cliente => (
                        <label key={cliente.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selectedClientesFilter.includes(cliente.id)}
                            onChange={() => {
                              const newSelected = selectedClientesFilter.includes(cliente.id)
                                ? selectedClientesFilter.filter(id => id !== cliente.id)
                                : [...selectedClientesFilter, cliente.id];
                              setSelectedClientesFilter(newSelected);
                            }}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-slate-700">{cliente.nome_completo}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Consultores - Admin Only */}
                  {authData?.user?.role === "admin" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-2">Consultores</label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {consultores.map(consultor => (
                          <label key={consultor.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={selectedConsultoresFilter.includes(consultor.id)}
                              onChange={() => {
                                const newSelected = selectedConsultoresFilter.includes(consultor.id)
                                  ? selectedConsultoresFilter.filter(id => id !== consultor.id)
                                  : [...selectedConsultoresFilter, consultor.id];
                                setSelectedConsultoresFilter(newSelected);
                              }}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-slate-700">{consultor.nome_completo}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clear Button */}
                  {(selectedClientesFilter.length > 0 || selectedConsultoresFilter.length > 0) && (
                    <Button
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => {
                        setSelectedClientesFilter([]);
                        setSelectedConsultoresFilter([]);
                      }}
                    >
                      Limpar Filtros
                    </Button>
                  )}
                </div>
              )}
            </div>

            {showForm && selectedCliente && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <PlanoForm
                  clienteId={selectedCliente.id}
                  onSave={() => {
                    setShowForm(false);
                    queryClient.invalidateQueries({ queryKey: ["planos"] });
                  }}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            )}

            {!isClient && (
              <ClienteSelector
                clientes={clientes}
                selectedCliente={selectedCliente}
                onSelectCliente={setSelectedCliente}
              />
            )}

            {selectedCliente && (
              <Button 
                onClick={() => setShowForm(!showForm)}
                className="w-full bg-[#212373] hover:bg-[#1a1a5c] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Plano
              </Button>
            )}

            {/* Views */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00d9a3]"></div>
              </div>
            ) : filteredPlanos.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center">
                <p className="text-slate-600">Nenhum plano encontrado</p>
              </div>
            ) : viewMode === 'list' ? (
              <PlanoListView
                planos={filteredPlanos}
                onToggleSelect={handleToggleSelect}
                selectedPlanos={selectedPlanos}
                onDeletePlano={handleDeletePlano}
              />
            ) : viewMode === 'grid' ? (
              <PlanoGridView
                planos={filteredPlanos}
                onToggleSelect={handleToggleSelect}
                selectedPlanos={selectedPlanos}
                onDeletePlano={handleDeletePlano}
              />
            ) : (
              <PlanoMultiTenantView
                planos={planosGrouped}
                clientes={clientesMap}
                onToggleSelect={handleToggleSelect}
                selectedPlanos={selectedPlanos}
                onDeletePlano={handleDeletePlano}
              />
            )}

            {selectedPlanos.size > 0 && (
              <BulkActionsBar
                selectedCount={selectedPlanos.size}
                onCancel={() => setSelectedPlanos(new Set())}
                actions={[
                  {
                    label: "Deletar",
                    icon: Trash2,
                    action: "delete",
                    variant: "destructive",
                    onClick: handleBulkDelete
                  }
                ]}
              />
            )}
            </div>
            </div>
            </div>
            );
            }