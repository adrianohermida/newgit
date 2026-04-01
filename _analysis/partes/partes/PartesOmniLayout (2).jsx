import React, { useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ParteFiltros({ filtros, onFiltrosChange }) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Tipo
        </label>
        <Select value={filtros.tipo} onValueChange={(v) => onFiltrosChange({ ...filtros, tipo: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Polo Ativo</SelectItem>
            <SelectItem value="passivo">Polo Passivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Tipo Pessoa
        </label>
        <Select value={filtros.tipoPessoa} onValueChange={(v) => onFiltrosChange({ ...filtros, tipoPessoa: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="fisica">Pessoa Física</SelectItem>
            <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          Com Cliente Vinculado
        </label>
        <Select value={filtros.vinculado} onValueChange={(v) => onFiltrosChange({ ...filtros, vinculado: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sim">Sim</SelectItem>
            <SelectItem value="nao">Não</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ParteListItem({ parte, isSelected, onClick }) {
  return (
    <div 
      className={`p-3 border rounded-lg cursor-pointer transition-all ${
        isSelected 
          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-50)]' 
          : 'border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)]'
      }`}
      onClick={() => onClick(parte)}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{parte.nome}</span>
        {parte.cliente_vinculado_id && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Vinculado</span>
        )}
      </div>
      <div className="text-xs text-[var(--text-secondary)] mt-1">
        {parte.tipo_polo && <span className="mr-2">{parte.tipo_polo}</span>}
        {parte.cpf_cnpj && <span>{parte.cpf_cnpj}</span>}
      </div>
    </div>
  );
}

function ParteDetailsPanel({ parte }) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold mb-2">{parte.nome}</h3>
        <div className="space-y-2 text-sm">
          {parte.cpf_cnpj && (
            <div><span className="text-[var(--text-secondary)]">CPF/CNPJ:</span> {parte.cpf_cnpj}</div>
          )}
          {parte.tipo_polo && (
            <div><span className="text-[var(--text-secondary)]">Tipo:</span> {parte.tipo_polo}</div>
          )}
          {parte.cliente_vinculado_id ? (
            <div className="bg-green-50 border border-green-200 rounded p-2 mt-2">
              <span className="text-green-800 text-xs font-medium">✓ Cliente Vinculado</span>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
              <span className="text-yellow-800 text-xs">⚠ Sem cliente vinculado</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PartesOmniLayout({ partes, filtros, onFiltrosChange, parteSelecionada, onSelectParte }) {
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {!filtersCollapsed && (
        <>
          <ResizablePanel defaultSize={18} minSize={15} maxSize={25}>
            <div className="h-full flex flex-col border-r border-[var(--border-primary)] bg-[var(--bg-elevated)]">
              <div className="p-4 border-b border-[var(--border-primary)] flex items-center justify-between">
                <h3 className="font-semibold text-sm">Filtros</h3>
                <Button variant="ghost" size="icon" onClick={() => setFiltersCollapsed(true)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
              <ParteFiltros filtros={filtros} onFiltrosChange={onFiltrosChange} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
        </>
      )}

      {filtersCollapsed && (
        <div className="w-12 border-r border-[var(--border-primary)] bg-[var(--bg-elevated)] flex items-start justify-center pt-4">
          <Button variant="ghost" size="icon" onClick={() => setFiltersCollapsed(false)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <ResizablePanel defaultSize={filtersCollapsed ? 50 : 40} minSize={30}>
        <ScrollArea className="h-full">
          <div className="space-y-2 p-2">
            {partes.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">Nenhuma parte encontrada</div>
            ) : (
              partes.map(parte => (
                <ParteListItem
                  key={parte.id}
                  parte={parte}
                  isSelected={parteSelecionada?.id === parte.id}
                  onClick={onSelectParte}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {!detailsCollapsed && (
        <ResizablePanel defaultSize={filtersCollapsed ? 50 : 42} minSize={30}>
          <div className="h-full bg-[var(--bg-elevated)] flex flex-col">
            <div className="p-4 border-b border-[var(--border-primary)] flex items-center justify-between">
              <h3 className="font-semibold text-sm">Detalhes</h3>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setDetailsCollapsed(true)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {parteSelecionada && (
                  <Button variant="ghost" size="icon" onClick={() => onSelectParte(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {parteSelecionada ? (
                <ParteDetailsPanel parte={parteSelecionada} />
              ) : (
                <div className="flex items-center justify-center h-full p-8 text-center">
                  <p className="text-sm text-gray-500">Selecione uma parte para ver detalhes</p>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      )}

      {detailsCollapsed && (
        <div className="w-12 border-l border-[var(--border-primary)] bg-[var(--bg-elevated)] flex items-start justify-center pt-4">
          <Button variant="ghost" size="icon" onClick={() => setDetailsCollapsed(false)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      )}
    </ResizablePanelGroup>
  );
}